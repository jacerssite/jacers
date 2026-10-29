import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { GridFSBucket, MongoClient, MongoNetworkError, MongoServerSelectionError, ObjectId } from "mongodb";
import { attachDatabasePool } from "@vercel/functions";
import { put } from "@vercel/blob";
import argon2 from "argon2";
import { getMongoDatabaseConfigurationError, getMongoDatabaseConnectionString } from "./database-config.mjs";
import { dropLegacyRecoveryIndex } from "./database-setup.mjs";
import { getSuspiciousPlayerMutation, hasCurrencyConflict, initializePlayerProgress, sanitizeInitialPlayerProgress } from "./player-progress.mjs";
import {
  ALLOWED_ABILITIES,
  isValidPassword,
  isValidGameConfig,
  isValidRun,
  normalizeUsername,
  normalizeRecoveryCode,
  formatRecoveryCode,
  parseGoldenTimeLimit,
  DEFAULT_GAME_CONFIG,
  PROFILE_TITLE_MILESTONES,
  USER_ROLES,
  validateCodeReward,
  validatePlayerProgress,
  validateRouletteTiers,
  validateProfileTitles,
  validateUpdateLog,
  validateWorkshopLevel,
  validateBuiltinLevelOverrides,
  validatePortalAssignments,
  validateHolidayEventSettings,
  hasRolePermission,
  isOwnerEquivalentRole,
} from "./game-data.mjs";

const app = express();
const ownerAccounts = [
  { username: "vslxped", password: process.env.OWNER_PASSWORD },
  { username: "riverwth", password: process.env.ADDITIONAL_OWNER_PASSWORD },
];
const developerUsername = "dayvidfrl";
const cookieName = "jacer_session";
const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;
const presenceActiveWindowMs = 30 * 1000;
const recoveryLockMs = 24 * 60 * 60 * 1000;
const humanChallengeTtlMs = 10 * 60 * 1000;
const humanChallengeMinAgeMs = 1200;
const humanChallengeSecret = process.env.HUMAN_CHALLENGE_SECRET || ownerAccounts.map(({ password }) => password ?? "").join("|");
// A signed challenge must also be single-use, otherwise one solved prompt can
// be replayed to create a batch of accounts.
const usedHumanChallenges = new Map();
const DEFAULT_MODERATION_SETTINGS = Object.freeze({
  networkAccountLimitEnabled: true,
  networkAccountLimit: 2,
  humanVerificationRequired: true,
  humanChallengeMode: "captcha",
  progressAntiCheatEnabled: true,
  newAccountProtectionEnabled: true,
  newAccountWindowMinutes: 3,
  newAccountAsteroidLimit: 1000,
  newAccountSpecialAsteroidLimit: 100,
  lowProgressProtectionEnabled: true,
  lowProgressRouteLimit: 3,
  lowProgressAsteroidLimit: 5000,
  lowProgressSpecialAsteroidLimit: 100,
  lowProgressPowerupLimit: 100,
});
let moderationSettingsCache = { ...DEFAULT_MODERATION_SETTINGS };

function annualDateParts(value) {
  const [month, day] = value.split("-").map(Number);
  return { month: month - 1, day };
}
function isInAnnualRange(start, end, now = new Date()) {
  const startParts = annualDateParts(start);
  const endParts = annualDateParts(end);
  const current = Date.UTC(2000, now.getUTCMonth(), now.getUTCDate());
  const startTime = Date.UTC(2000, startParts.month, startParts.day);
  const endTime = Date.UTC(2000, endParts.month, endParts.day);
  return startTime <= endTime ? current >= startTime && current <= endTime : current >= startTime || current <= endTime;
}
function resolveHolidayEventSettings(value, now = new Date()) {
  const stored = validateHolidayEventSettings(value) ?? { christmasEnabled: false, christmasAutoStart: false, christmasSeasonStart: "12-01", christmasSeasonEnd: "12-31", adventStart: "12-01", adventEnd: "12-25" };
  return {
    ...stored,
    christmasEnabled: stored.christmasEnabled || (stored.christmasAutoStart && isInAnnualRange(stored.christmasSeasonStart, stored.christmasSeasonEnd, now)),
    christmasAutoStart: stored.christmasAutoStart,
    christmasManualEnabled: stored.christmasEnabled,
  };
}

function validateModerationSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const booleanKeys = ["networkAccountLimitEnabled", "humanVerificationRequired", "progressAntiCheatEnabled", "newAccountProtectionEnabled", "lowProgressProtectionEnabled"];
  if (!booleanKeys.every((key) => typeof value[key] === "boolean")) return null;
  if (!["captcha", "math"].includes(value.humanChallengeMode)) return null;
  const within = (key, min, max) => Number.isSafeInteger(value[key]) && value[key] >= min && value[key] <= max;
  if (!within("networkAccountLimit", 1, 100)
    || !within("newAccountWindowMinutes", 1, 10)
    || !within("newAccountAsteroidLimit", 1, 100000)
    || !within("newAccountSpecialAsteroidLimit", 1, 10000)
    || !within("lowProgressRouteLimit", 0, 100)
    || !within("lowProgressAsteroidLimit", 1, 1000000)
    || !within("lowProgressSpecialAsteroidLimit", 1, 100000)
    || !within("lowProgressPowerupLimit", 1, 100000)) return null;
  return Object.fromEntries(Object.keys(DEFAULT_MODERATION_SETTINGS).map((key) => [key, value[key]]));
}

async function getModerationSettings(db) {
  const collection = db.collection("game_settings");
  if (typeof collection.findOne !== "function") return { ...moderationSettingsCache };
  const record = await collection.findOne({ _id: "moderation_settings" });
  const stored = record?.value && typeof record.value === "object" && !Array.isArray(record.value)
    ? { ...DEFAULT_MODERATION_SETTINGS, ...record.value }
    : DEFAULT_MODERATION_SETTINGS;
  moderationSettingsCache = validateModerationSettings(stored) ?? { ...DEFAULT_MODERATION_SETTINGS };
  return { ...moderationSettingsCache };
}
const defaultRouletteTiers = [
  { buyIn: 5, chances: { claims: 42, specialClaims: 15, color: 20, trail: 12, avatar: 8, title: 3 }, rewards: { claims: [50, 150], specialClaims: [1, 2] } },
  { buyIn: 10, chances: { claims: 24, specialClaims: 18, color: 22, trail: 18, avatar: 12, title: 6 }, rewards: { claims: [125, 350], specialClaims: [1, 3] } },
  { buyIn: 25, chances: { claims: 5, specialClaims: 20, color: 22, trail: 25, avatar: 18, title: 10 }, rewards: { claims: [300, 1000], specialClaims: [2, 5] } },
];
// Older installations saved the wheel before title prizes existed. Move a
// small part of the asteroid chance into titles when loading that legacy shape.
function includeRouletteTitleOdds(tiers) {
  const titleChances = [3, 6, 10];
  return tiers.map((tier, index) => {
    if ((tier.chances.title ?? 0) > 0) return tier;
    const title = titleChances[index] ?? 0;
    return { ...tier, chances: { ...tier.chances, claims: Math.max(0, tier.chances.claims - title), title } };
  });
}
const isVercel = Boolean(process.env.VERCEL);
const databaseUrl = getMongoDatabaseConnectionString();
const databaseConfigurationError = getMongoDatabaseConfigurationError(databaseUrl, { vercel: isVercel });
const mongoClient = databaseUrl && !databaseConfigurationError
  ? new MongoClient(databaseUrl, isVercel
    ? { maxPoolSize: 5, maxIdleTimeMS: 5000, serverSelectionTimeoutMS: 12000 }
    : { maxPoolSize: 10 })
  : null;
if (isVercel && mongoClient) attachDatabasePool(mongoClient);
let mongoClientPromise;
let databaseReady = false;
const dirname = path.dirname(fileURLToPath(import.meta.url));
const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

if (ownerAccounts.some(({ password }) => !password || !isValidPassword(password))) {
  throw new Error("Set valid OWNER_PASSWORD and ADDITIONAL_OWNER_PASSWORD deployment secrets (10-128 characters) before starting the API.");
}

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      mediaSrc: ["'self'", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-site" },
}));
app.use(express.json({ limit: "256kb", strict: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many account attempts. Wait a few minutes and try again." },
});
const registrationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 2,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many new accounts from this network today. Try again tomorrow." },
});
const humanChallengeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many human checks requested. Wait a few minutes and try again." },
});
const runSubmissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many run submissions. Wait a minute and try again." },
});
const runStartLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many level starts. Wait a moment and try again." },
});
const RUN_PROOF_TTL_MS = 30 * 60 * 1000;
const RUN_PROOF_MIN_TOLERANCE_MS = 250;
const progressWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many progress updates. Wait a moment and try again." },
});
let dummyPasswordHash = "";
let dummyRecoveryHash = "";
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many recovery attempts. Wait a few minutes and try again." },
});
const codeRedemptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many code attempts. Wait and try again." },
});
const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many email verification attempts. Wait a few minutes and try again." },
});
const friendRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many friend requests. Wait a few minutes and try again." },
});
const chatMessageLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "You are sending messages too quickly. Wait a moment." },
});
const chatUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attachments. Wait before uploading more files." },
});

// The built-in list is encoded so it never appears as an unmasked list in an
// owner panel, logs, or API response. Owners can add project-specific terms
// from the moderation panel; every displayed term is masked before returning.
const DEFAULT_CHAT_FILTER_TERMS = [
  { category: "Hate / race", values: ["bmlnZ2Vy", "bmlnZ2E", "bmVncm8", "Y29vbg", "c3BpYw", "Y2hpbms", "Z29vaw", "amFw", "d2V0YmFjaw", "YmVhbmVy", "a2lrZQ", "cGFraQ", "dG93ZWxoZWFk", "c2FuZG5pZ2dlcg", "cmFnaGVhZA", "cmVkc2tpbg", "aW5qdW4", "YWJv", "d29n", "a2FmZmly", "ZGFya2ll", "cG9yY2ggbW9ua2V5", "c3BlYXIgY2h1Y2tlcg", "Y2hpbmFtYW4", "c2FtYm8", "amlnYWJvbw", "emlwcGVyaGVhZA"] },
  { category: "Hate / identity", values: ["ZmFn", "ZmFnZ290", "ZHlrZQ", "dHJhbm55", "c2hlbWFsZQ", "cmV0YXJk", "cmV0YXJkZWQ", "c3Bheg", "Y3JpcHBsZQ", "aG9tbw"] },
  { category: "Abusive profanity", values: ["Y3VudA", "Yml0Y2g", "d2hvcmU", "c2x1dA", "c2thbms", "dHdhdA", "bW90aGVyZnVja2Vy", "ZnVjaw", "c2hpdA", "YmFzdGFyZA", "ZGlja2hlYWQ", "YXNzaG9sZQ", "YnVsbHNoaXQ"] },
];

function normalizeChatFilterTerm(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
    .replace(/[01345789@$]/g, (character) => ({ 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g", "@": "a", $: "s" }[character] ?? character))
    .split(/\s+/).map((word) => word.replace(/[^a-z0-9]/g, "")).filter(Boolean).join(" ").slice(0, 80);
}

function builtInChatFilterTerms() {
  return DEFAULT_CHAT_FILTER_TERMS.flatMap(({ category, values }) => values.map((encoded, index) => ({
    id: `builtin-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`,
    term: normalizeChatFilterTerm(Buffer.from(encoded, "base64url").toString("utf8")),
    category,
    builtIn: true,
  })));
}

function maskedChatFilterTerm(term) {
  return term.split(" ").map((word) => word.length <= 2 ? "**" : `${word[0]}${"*".repeat(Math.min(8, Math.max(2, word.length - 2)))}${word.at(-1)}`).join(" ");
}

function publicChatFilterTerm(term) {
  return { id: term.id, masked: maskedChatFilterTerm(term.term), category: term.category, builtIn: Boolean(term.builtIn) };
}

async function getStoredChatFilterTerms(db) {
  const settings = db.collection("game_settings");
  if (typeof settings.findOne !== "function") return [];
  const setting = await settings.findOne({ _id: "chat_filter" });
  const stored = setting?.value?.terms;
  if (!Array.isArray(stored)) return [];
  return stored.map((entry) => ({
    id: typeof entry.id === "string" ? entry.id : "",
    term: normalizeChatFilterTerm(entry.term),
    category: typeof entry.category === "string" && entry.category.trim() ? entry.category.trim().slice(0, 30) : "Custom",
    builtIn: false,
  })).filter((entry) => entry.id && entry.term);
}

async function getChatFilterTerms(db) {
  const seen = new Set();
  return [...builtInChatFilterTerms(), ...(await getStoredChatFilterTerms(db))].filter((entry) => {
    if (!entry.term || seen.has(entry.term)) return false;
    seen.add(entry.term);
    return true;
  });
}

function moderateChatText(text, terms) {
  const parts = text.split(/(\s+)/);
  const tokenPartIndexes = [];
  const tokens = [];
  parts.forEach((part, index) => {
    if (!/^\s+$/.test(part)) {
      tokenPartIndexes.push(index);
      tokens.push(normalizeChatFilterTerm(part));
    }
  });
  const blocked = new Set();
  terms.forEach((entry) => {
    const filterTokens = entry.term.split(" ").filter(Boolean);
    if (!filterTokens.length) return;
    for (let index = 0; index <= tokens.length - filterTokens.length; index++) {
      if (filterTokens.every((token, offset) => tokens[index + offset] === token)) {
        for (let offset = 0; offset < filterTokens.length; offset++) blocked.add(tokenPartIndexes[index + offset]);
      }
    }
  });
  return parts.map((part, index) => blocked.has(index) ? "**" : part).join("");
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
}

async function recordSecurityEvent(db, event) {
  try {
    await db.collection("security_events").insertOne({ ...event, createdAt: new Date() });
  } catch (error) {
    console.error("Could not record security event:", error);
  }
}

async function recordModerationLog(db, entry) {
  try {
    const collection = db.collection("moderation_log");
    if (typeof collection.insertOne !== "function") return;
    await collection.insertOne({ ...entry, createdAt: new Date() });
  } catch (error) {
    console.error("Could not record moderation log:", error);
  }
}

function moderationReason(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : fallback;
}

function hashRedemptionCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function recoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 16; index++) code += alphabet[crypto.randomInt(alphabet.length)];
  return formatRecoveryCode(code);
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let index = 0; index < 14; index++) password += alphabet[crypto.randomInt(alphabet.length)];
  return password;
}

function createHumanChallenge(settings = DEFAULT_MODERATION_SETTINGS) {
  const mode = settings.humanChallengeMode === "math" ? "math" : "captcha";
  const left = crypto.randomInt(2, 10);
  const right = crypto.randomInt(2, 10);
  const captchaAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const captcha = Array.from({ length: 6 }, () => captchaAlphabet[crypto.randomInt(captchaAlphabet.length)]).join("");
  const answer = mode === "math" ? String(left + right) : captcha;
  const issuedAt = Date.now();
  const payload = {
    version: 1,
    mode,
    question: mode === "math" ? `What is ${left} + ${right}?` : `Type this CAPTCHA code: ${captcha}`,
    answerHash: crypto.createHash("sha256").update(answer).digest("hex"),
    issuedAt,
    expiresAt: issuedAt + humanChallengeTtlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", humanChallengeSecret).update(encoded).digest("base64url");
  return { token: `${encoded}.${signature}`, mode, question: payload.question, issuedAt, expiresAt: payload.expiresAt };
}

function verifyHumanChallenge(value) {
  if (!value || typeof value !== "object" || typeof value.token !== "string" || typeof value.answer !== "string") return false;
  const [encoded, suppliedSignature] = value.token.split(".");
  if (!encoded || !suppliedSignature || encoded.length > 2048 || suppliedSignature.length > 128) return false;
  let expectedSignature;
  try { expectedSignature = crypto.createHmac("sha256", humanChallengeSecret).update(encoded).digest("base64url"); } catch { return false; }
  if (suppliedSignature !== expectedSignature) return false;
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { return false; }
  // Accept previously issued math challenges during a rolling deployment.
  const mode = payload?.mode === undefined ? "math" : payload.mode;
  if (payload?.version !== 1 || !["math", "captcha"].includes(mode) || typeof payload.answerHash !== "string" || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt)) return false;
  const now = Date.now();
  if (payload.issuedAt > now || now - payload.issuedAt < humanChallengeMinAgeMs || payload.expiresAt <= now) return false;
  const answer = value.answer.trim().replace(/\s+/g, "").toUpperCase();
  if (mode === "math" ? !/^\d{1,3}$/.test(answer) : !/^[A-Z2-9]{6}$/.test(answer)) return false;
  const answerHash = crypto.createHash("sha256").update(answer).digest("hex");
  return answerHash === payload.answerHash;
}

function consumeHumanChallenge(value) {
  if (!verifyHumanChallenge(value)) return false;
  const tokenHash = crypto.createHash("sha256").update(value.token).digest("hex");
  const now = Date.now();
  for (const [key, expiresAt] of usedHumanChallenges) if (expiresAt <= now) usedHumanChallenges.delete(key);
  if (usedHumanChallenges.has(tokenHash)) return false;
  usedHumanChallenges.set(tokenHash, now + humanChallengeTtlMs);
  return true;
}

function publicProfileFromProgress(username, role, progress = {}, profileTitles = PROFILE_TITLE_MILESTONES) {
  const readCount = (key) => {
    const value = progress[key];
    return typeof value === "string" && /^\d{1,10}$/.test(value) ? Math.min(Number(value), 100000000) : 0;
  };
  const completedRoutes = Object.keys(progress)
    .filter((key) => key.startsWith("orbit-level-complete-") && progress[key] === "1")
    .map((key) => key.slice("orbit-level-complete-".length))
    .filter((name) => name && name.length <= 120)
    .sort()
    .slice(0, 500);
  const equippedValue = (key) => {
    const value = progress[key];
    if (typeof value !== "string" || value.length > 60 || /[<>]/.test(value)) return null;
    return value;
  };
  const completedRouteCount = completedRoutes.length;
  const goldenRouteCount = Object.keys(progress).filter((key) => key.startsWith("orbit-golden-level-") && progress[key] === "1").length;
  const prestigeLevel = readCount("orbit-prestige");
  const selectedTitle = equippedValue("orbit-title");
  const allTitlesGranted = (isOwnerEquivalentRole(role) || role === "tester") && progress["orbit-all-titles"] === "1";
  const titleDefinition = profileTitles.find((candidate) => {
    if (candidate.id !== selectedTitle) return false;
    if (allTitlesGranted) return true;
    if (progress[`orbit-title-unlock-${candidate.id}`] === "1") return true;
    const requirement = candidate.requirement ?? { type: "routes", amount: candidate.routes };
    if (requirement.type === "locked") return false;
    if (requirement.type === "golden") return goldenRouteCount >= requirement.amount;
    if (requirement.type === "prestige") return prestigeLevel >= requirement.amount;
    if (requirement.type === "enemies") return readCount("orbit-enemies-killed") >= requirement.amount;
    if (requirement.type === "bosses") return readCount("orbit-bosses-killed") >= requirement.amount;
    if (requirement.type === "roulette") return false;
    return completedRouteCount >= requirement.amount;
  });
  const title = titleDefinition?.name ?? "";
  const titleStyleValue = titleDefinition && title
    ? {
      ...(titleDefinition.color ? { color: titleDefinition.color } : {}),
      ...(titleDefinition.animation ? { animation: titleDefinition.animation } : {}),
    }
    : {};
  const titleStyle = Object.keys(titleStyleValue).length ? titleStyleValue : null;
  const equippedIndex = (key) => {
    const value = equippedValue(key);
    const index = value === null ? 0 : Number(value);
    return Number.isSafeInteger(index) && index >= 0 && index <= 1000 ? index : 0;
  };
  return {
    username,
    role,
    roleBadge: role === "owner" ? "owner" : role === "admin" ? "admin" : role === "moderator" ? "moderator" : role === "level-maker" ? "level-maker" : role === "tester" ? "tester" : "player",
    asteroids: readCount("orbit-claims"),
    specialAsteroids: readCount("orbit-special-claims"),
    enemiesKilled: readCount("orbit-enemies-killed"),
    bossesKilled: readCount("orbit-bosses-killed"),
    prestige: prestigeLevel,
    routesCleared: completedRouteCount,
    shipColor: equippedValue("orbit-ship-color") ?? "#ed7657",
    avatar: equippedIndex("orbit-avatar"),
    skin: equippedIndex("orbit-skin"),
    trail: equippedIndex("orbit-trail"),
    title,
    titleStyle,
  };
}

function includeRouletteTitles(titles) {
  const ids = new Set(titles.map((title) => title.id));
  return [...titles, ...PROFILE_TITLE_MILESTONES.filter((title) => title.requirement?.type === "roulette" && !ids.has(title.id))];
}
async function getProfileTitles(db) {
  const setting = await db.collection("game_settings").findOne({ _id: "profile_titles" });
  return includeRouletteTitles(validateProfileTitles(setting?.value) ?? PROFILE_TITLE_MILESTONES);
}

function isValidDateString(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

async function getDatabase() {
  if (!mongoClient) throw new Error(databaseConfigurationError ?? "MongoDB is not configured.");
  if (!mongoClientPromise) {
    mongoClientPromise = mongoClient.connect().catch((error) => {
      mongoClientPromise = undefined;
      throw error;
    });
  }
  return (await mongoClientPromise).db();
}

async function writePlayerProgress(collection, userId, progress, baseProgress = null, replace = false, session = undefined, actorRole = "owner", progressAntiCheatEnabled = true) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await collection.findOne({ _id: userId }, session ? { session } : undefined);
    if (!replace && hasCurrencyConflict(existing?.data, progress, baseProgress)) return { progress: null, conflict: true };
    const mergedProgress = replace ? { ...progress } : { ...(existing?.data ?? {}) };
    if (!replace) {
      const baseline = baseProgress ?? {};
      const changedKeys = new Set([...Object.keys(progress), ...Object.keys(baseline)]);
      for (const key of changedKeys) {
        if (progress[key] === baseline[key]) continue;
        if (Object.hasOwn(progress, key)) mergedProgress[key] = progress[key];
        else delete mergedProgress[key];
      }
    }
    const suspiciousMutation = progressAntiCheatEnabled ? getSuspiciousPlayerMutation(existing?.data, mergedProgress, actorRole) : null;
    if (suspiciousMutation) return { progress: null, conflict: false, suspiciousMutation };
    const validatedProgress = validatePlayerProgress(mergedProgress);
    if (!validatedProgress) return { progress: null, conflict: false };
    const revisionFilter = existing
      ? Number.isSafeInteger(existing.revision) ? { revision: existing.revision } : { revision: { $exists: false } }
      : { revision: { $exists: false } };
    try {
      const result = await collection.updateOne(
        { _id: userId, ...revisionFilter },
        { $set: { data: validatedProgress, updatedAt: new Date() }, $inc: { revision: 1 } },
        { upsert: !existing, ...(session ? { session } : {}) },
      );
      if (result.matchedCount || result.upsertedCount) return { progress: validatedProgress, conflict: false };
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return { progress: null, conflict: true };
}

async function saveSetting(db, key, value, changedBy = null) {
  const settings = db.collection("game_settings");
  const existing = await settings.findOne({ _id: key });
  if (existing) {
    await db.collection("setting_history").insertOne({
      settingKey: key,
      previousValue: existing.value,
      nextValue: value,
      changedAt: new Date(),
      changedBy,
    });
  }
  await settings.updateOne(
    { _id: key },
    { $set: { value, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}

function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host") ?? req.get("host");
  if (!origin || !host) return res.status(403).json({ error: "A same-origin request is required." });
  try {
    if (new URL(origin).host !== host) return res.status(403).json({ error: "A same-origin request is required." });
  } catch {
    return res.status(403).json({ error: "A valid request origin is required." });
  }
  next();
}

function getCookie(req, name) {
  const cookies = req.get("cookie")?.split(";") ?? [];
  const cookie = cookies.map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return null;
  }
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeMs / 1000}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Store only a one-way fingerprint of a client IP.  This lets owners enforce
// network bans without exposing raw addresses in the owner panel or user data.
function normalizeClientIp(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
}

function hashClientIp(value) {
  const normalized = normalizeClientIp(value);
  return normalized ? crypto.createHash("sha256").update(normalized).digest("hex") : null;
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 5 || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return null;
  return normalized;
}

function hashEmail(value) {
  const normalized = normalizeEmail(value);
  return normalized ? crypto.createHash("sha256").update(normalized).digest("hex") : null;
}

const offlineOwnerEmailHash = hashEmail("vslxped@gmail.com");

function maskEmail(value) {
  const normalized = normalizeEmail(value);
  if (!normalized) return null;
  const at = normalized.lastIndexOf("@");
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local[0] ?? "*"}***` : `${local[0]}${"*".repeat(Math.min(8, Math.max(3, local.length - 2)))}${local.at(-1)}`;
  const domainParts = domain.split(".");
  const maskedDomain = `${domainParts[0]?.[0] ?? "*"}***.${domainParts.slice(1).join(".")}`;
  return `${maskedLocal}@${maskedDomain}`;
}

function emailVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashEmailVerificationCode(emailHash, code) {
  return crypto.createHash("sha256").update(`${emailHash}:${code}`).digest("hex");
}

async function sendEmailVerificationCode(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_VERIFICATION_FROM;
  if (!apiKey || !from) {
    throw Object.assign(new Error("Email verification is not configured yet. Ask the owner to set RESEND_API_KEY and EMAIL_VERIFICATION_FROM, or leave the optional email field blank."), { statusCode: 503 });
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Jacer email verification code",
      text: `Your Jacer verification code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`Could not send the verification email.${detail ? " Check the owner email settings." : ""}`), { statusCode: 502 });
  }
}

async function isIpBanned(db, ipHash) {
  if (!ipHash) return false;
  const bans = db.collection("ip_bans");
  if (typeof bans.findOne !== "function") return false;
  const ban = await bans.findOne({ _id: ipHash, active: { $ne: false } });
  return Boolean(ban);
}

async function isEmailBanned(db, emailHash) {
  if (!emailHash) return false;
  const bans = db.collection("email_bans");
  if (typeof bans.findOne !== "function") return false;
  const ban = await bans.findOne({ _id: emailHash, active: { $ne: false } });
  return Boolean(ban);
}

async function getAuthenticatedUser(req) {
  const token = getCookie(req, cookieName);
  if (!token || token.length > 100) return null;
  const db = await getDatabase();
  const ipHash = hashClientIp(req.ip);
  if (await isIpBanned(db, ipHash)) return null;
  const session = await db.collection("user_sessions").findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const user = await db.collection("users").findOne(
    { _id: session.userId },
    { projection: { username: 1, usernameNormalized: 1, role: 1, banned: 1, loginLocked: 1, mustChangePassword: 1, appearOffline: 1, leaderboardOptIn: 1, allowFriendRequests: 1, readReceipts: 1, typingIndicators: 1, chatMuted: 1, emailHash: 1, humanVerified: 1 } },
  );
  if (user?.emailHash && await isEmailBanned(db, user.emailHash)) return null;
  return user && !user.banned && !user.loginLocked && USER_ROLES.includes(user.role) && (user.role !== "developer" || user.usernameNormalized === developerUsername)
    ? { id: user._id, username: user.username, role: user.role, mustChangePassword: Boolean(user.mustChangePassword), appearOffline: Boolean(user.appearOffline), leaderboardOptIn: user.leaderboardOptIn !== false, allowFriendRequests: user.allowFriendRequests !== false, readReceipts: user.readReceipts !== false, typingIndicators: user.typingIndicators !== false, humanVerified: user.humanVerified !== false, chatMuted: Boolean(user.chatMuted), offlineOwnerEligible: user.role === "owner" && user.emailHash === offlineOwnerEmailHash }
    : null;
}

async function requireUser(req, res, next) {
  try {
    req.user = await getAuthenticatedUser(req);
    if (!req.user) return res.status(401).json({ error: "Log in to continue." });
    if (req.user.mustChangePassword
      && !(req.method === "POST" && req.path === "/api/account/password")
      && !(req.method === "GET" && req.path === "/api/account/profile")) {
      return res.status(403).json({ error: "Change your temporary password before continuing." });
    }
    next();
  } catch (error) {
    next(error);
  }
}

async function requireOwner(req, res, next) {
  try {
    req.user = await getAuthenticatedUser(req);
    if (!req.user) return res.status(401).json({ error: "Log in to continue." });
    if (req.user.mustChangePassword) return res.status(403).json({ error: "Change your temporary password before continuing." });
    if (!isOwnerEquivalentRole(req.user.role)) return res.status(403).json({ error: "Owner access is required." });
    next();
  } catch (error) {
    next(error);
  }
}

async function requireStaff(req, res, next) {
  try {
    req.user = await getAuthenticatedUser(req);
    if (!req.user) return res.status(401).json({ error: "Log in to continue." });
    if (req.user.mustChangePassword) return res.status(403).json({ error: "Change your temporary password before continuing." });
    if (!hasRolePermission(req.user.role, "tester-tools")) return res.status(403).json({ error: "Staff access is required." });
    next();
  } catch (error) {
    next(error);
  }
}

// Permission middleware is intentionally separate from the UI role checks. Any
// request made from a modified browser still has to pass this server-side gate.
function requirePermission(permission) {
  // Never trust a hidden button or a client-supplied role. Re-read the session
  // and check the permission on every protected request.
  return async (req, res, next) => {
    try {
      req.user = await getAuthenticatedUser(req);
      if (!req.user) return res.status(401).json({ error: "Log in to continue." });
      if (req.user.mustChangePassword) return res.status(403).json({ error: "Change your temporary password before continuing." });
      if (!hasRolePermission(req.user.role, permission)) return res.status(403).json({ error: "You do not have permission to use this tool." });
      next();
    } catch (error) {
      next(error);
    }
  };
}

async function createSession(userId, res, ipHash = null) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  const db = await getDatabase();
  await db.collection("user_sessions").deleteMany({ expiresAt: { $lte: new Date() } });
  await db.collection("user_sessions").insertOne({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
    ...(ipHash ? { ipHash } : {}),
  });
  setSessionCookie(res, token);
}

async function getActiveUserIds(db, userIds) {
  const now = new Date();
  const filter = {
    expiresAt: { $gt: now },
    lastSeenAt: { $gte: new Date(now.getTime() - presenceActiveWindowMs) },
  };
  if (userIds) filter.userId = { $in: userIds };
  const sessions = await db.collection("user_sessions")
    .find(filter, { projection: { userId: 1 } })
    .toArray();
  return new Set(sessions.map((session) => session.userId.toHexString()));
}

function userIdString(value) {
  return value instanceof ObjectId ? value.toHexString() : String(value);
}

function friendPairKey(first, second) {
  return [userIdString(first), userIdString(second)].sort().join(":");
}

function validObjectId(value) {
  return typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

async function countDocumentsSafe(collection, filter) {
  return typeof collection.countDocuments === "function" ? collection.countDocuments(filter) : 0;
}

async function isBlocked(db, first, second) {
  const blocks = db.collection("user_blocks");
  const [a, b] = await Promise.all([
    blocks.findOne({ blockerId: first, blockedId: second }),
    blocks.findOne({ blockerId: second, blockedId: first }),
  ]);
  return Boolean(a || b);
}

async function blockedUserIds(db, userId) {
  const blocks = db.collection("user_blocks");
  if (typeof blocks.find !== "function") return new Set();
  const rows = await blocks.find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).toArray();
  return new Set(rows.map((row) => userIdString(userIdString(row.blockerId) === userIdString(userId) ? row.blockedId : row.blockerId)));
}

async function getFriendship(db, first, second) {
  return db.collection("friendships").findOne({ pairKey: friendPairKey(first, second) });
}

async function ensureChatUser(db, id) {
  return db.collection("users").findOne(
    { _id: id, role: { $in: USER_ROLES }, banned: { $ne: true } },
    { projection: { username: 1, role: 1, banned: 1, chatMuted: 1, readReceipts: 1, typingIndicators: 1 } },
  );
}

function chatAttachmentIsValid(attachment) {
  if (attachment === undefined || attachment === null) return true;
  if (!attachment || typeof attachment !== "object") return false;
  const { kind, contentType, bytes, url } = attachment;
  if (!["image", "gif", "video"].includes(kind) || typeof contentType !== "string" || typeof url !== "string" || !Number.isSafeInteger(bytes) || bytes < 1) return false;
  const allowed = kind === "video" ? ["video/mp4", "video/webm"] : ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(contentType)) return false;
  const maxBytes = kind === "video" ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
  if (bytes > maxBytes) return false;
  const blobOrigin = process.env.VERCEL_BLOB_PUBLIC_URL || process.env.BLOB_PUBLIC_URL;
  const managedUpload = /^\/api\/chat\/uploads\/[a-f\d]{24}$/i.test(url);
  return managedUpload || Boolean(blobOrigin && url.startsWith(blobOrigin.replace(/\/$/, "") + "/"));
}

function sanitizeChatText(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()
    : "";
}

async function unreadChatCount(db, userId) {
  const conversations = db.collection("conversations");
  const rows = typeof conversations.find === "function" ? await conversations.find({ userIds: userId }).toArray() : [];
  const directUnread = rows.reduce((sum, row) => sum + (Number(row.unread?.[userIdString(userId)]) || 0), 0);
  const mentions = db.collection("chat_notifications");
  const mentionUnread = typeof mentions.countDocuments === "function"
    ? await mentions.countDocuments({ recipientId: userId, kind: "mention", readAt: { $exists: false } })
    : 0;
  return directUnread + mentionUnread;
}

async function latestChatNotification(db, userId) {
  const notifications = db.collection("chat_notifications");
  if (typeof notifications.findOne !== "function") return null;
  const row = await notifications.findOne({ recipientId: userId, readAt: { $exists: false } }, { sort: { createdAt: -1 } });
  if (!row) return null;
  const collection = row.kind === "mention" ? "global_chat_messages" : "chat_messages";
  const message = row.messageId && typeof db.collection(collection).findOne === "function"
    ? await db.collection(collection).findOne({ _id: row.messageId })
    : null;
  if (!message) return null;
  return {
    id: userIdString(row._id), kind: row.kind === "mention" ? "mention" : "direct",
    sender: message.sender ?? "Pilot", senderId: userIdString(message.senderId),
    text: message.deletedAt ? "Message deleted" : message.text || "Sent an attachment",
    ...(row.kind === "direct" && row.conversationUserId ? { conversationUserId: userIdString(row.conversationUserId) } : {}),
  };
}

function mentionedUsernames(text) {
  const names = new Set();
  for (const match of text.matchAll(/@([a-z0-9_]{3,24})/gi)) names.add(match[1].toLowerCase());
  return [...names];
}

async function accountHandler(req, res, next, mode) {
  try {
    const credentials = req.body;
    const honeypot = typeof credentials?.website === "string" ? credentials.website.trim() : "";
    if (honeypot) return res.status(400).json({ error: "The account request could not be verified." });
    const username = normalizeUsername(credentials?.username);
    const suppliedEmail = credentials?.email;
    const emailInput = typeof suppliedEmail === "string" ? suppliedEmail.trim() : suppliedEmail;
    const email = emailInput === undefined || emailInput === null || emailInput === ""
      ? null
      : normalizeEmail(emailInput);
    if (!username || !isValidPassword(credentials?.password)) {
      return res.status(400).json({ error: "Use a 3-20 character username (letters, numbers, underscore) and a 10-128 character password." });
    }
    if (emailInput !== undefined && emailInput !== null && emailInput !== "" && !email) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const db = await getDatabase();
    const ipHash = hashClientIp(req.ip);
    if (await isIpBanned(db, ipHash)) {
      return res.status(403).json({ error: "This device network has been banned. Contact the owner for help." });
    }

    if (mode === "register") {
      const moderationSettings = await getModerationSettings(db);
      if (moderationSettings.networkAccountLimitEnabled && ipHash && typeof db.collection("users").countDocuments === "function") {
        const recentRegistrations = await db.collection("users").countDocuments({
          lastSeenIpHash: ipHash,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        });
        if (recentRegistrations >= moderationSettings.networkAccountLimit) return res.status(429).json({ error: "Too many new accounts from this network today. Try again tomorrow." });
      }
      const humanVerified = moderationSettings.humanVerificationRequired ? consumeHumanChallenge(credentials?.humanChallenge) : true;
      if (!humanVerified) return res.status(400).json({ error: "Complete the current human check before creating an account." });
      const emailHash = hashEmail(email);
      if (emailHash && await isEmailBanned(db, emailHash)) {
        return res.status(403).json({ error: "This email address has been permanently banned. Contact the owner for help." });
      }
      if (emailHash) {
        const verificationToken = typeof credentials?.emailVerificationToken === "string" ? credentials.emailVerificationToken : "";
        const pending = await db.collection("pending_email_verifications").findOne({ _id: emailHash });
        if (!pending || !pending.verifiedAt || !(pending.expiresAt instanceof Date) || pending.expiresAt <= new Date()
          || !verificationToken || pending.verificationTokenHash !== hashSessionToken(verificationToken)) {
          return res.status(400).json({ error: "Verify this optional email address before creating the account, or clear the email field to continue without one." });
        }
      }
      const passwordHash = await argon2.hash(credentials.password, passwordHashOptions);
      const code = recoveryCode();
      const recoveryCodeCreatedAt = new Date();
      let user;
      try {
        const created = await db.collection("users").insertOne({
          username: username.display,
          usernameNormalized: username.normalized,
          passwordHash,
          recoveryCodeHash: await argon2.hash(normalizeRecoveryCode(code), passwordHashOptions),
          recoveryCodeCreatedAt,
          role: "player",
          banned: false,
          appearOffline: false,
          leaderboardOptIn: true,
          allowFriendRequests: true,
          readReceipts: true,
          typingIndicators: true,
          humanVerified,
          ...(ipHash ? { lastSeenIpHash: ipHash } : {}),
          ...(emailHash ? { emailHash, emailMasked: maskEmail(email) } : {}),
          createdAt: new Date(),
        });
        user = { _id: created.insertedId, username: username.display, role: "player" };
      } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: "That username is already taken." });
        throw error;
      }
      // Seed a new account with an empty cloud profile so a refresh or a
      // failed first sync can never import guest localStorage progression.
      await initializePlayerProgress(db.collection("player_progress"), user._id, {});
      if (emailHash) await db.collection("pending_email_verifications").deleteOne({ _id: emailHash });
      await recordModerationLog(db, {
        action: "Account created",
        reason: "New account registration completed.",
        actorId: user._id,
        actorUsername: user.username,
        targetUserId: user._id,
        targetUsername: user.username,
      });
      await createSession(user._id, res, ipHash);
      noStore(res);
      return res.status(201).json({
        user: { username: user.username, role: user.role, mustChangePassword: false, appearOffline: false, leaderboardOptIn: true, allowFriendRequests: true, readReceipts: true, typingIndicators: true, humanVerified },
        recoveryCode: code,
      });
    }

    const user = await db.collection("users").findOne({ usernameNormalized: username.normalized });
    const valid = await argon2.verify(user?.passwordHash ?? dummyPasswordHash, credentials.password);
    if (!valid || !user) return res.status(401).json({ error: "Username or password is incorrect." });
    if (user.banned) return res.status(403).json({ error: "This account has been banned. Contact the owner for help." });
    if (user.loginLocked) return res.status(403).json({ error: "This account has been locked. Contact the owner for help." });
    if (user.emailHash && await isEmailBanned(db, user.emailHash)) return res.status(403).json({ error: "This email address has been permanently banned. Contact the owner for help." });
    await db.collection("users").updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), ...(ipHash ? { lastSeenIpHash: ipHash } : {}) } });
    await createSession(user._id, res, ipHash);
    return res.json({
      user: {
        username: user.username,
        role: user.role,
        mustChangePassword: Boolean(user.mustChangePassword),
        appearOffline: Boolean(user.appearOffline),
        leaderboardOptIn: user.leaderboardOptIn !== false,
        allowFriendRequests: user.allowFriendRequests !== false,
        readReceipts: user.readReceipts !== false,
        typingIndicators: user.typingIndicators !== false,
        humanVerified: user.humanVerified !== false,
        ...(user.role === "owner" && user.emailHash === offlineOwnerEmailHash ? { offlineOwnerEligible: true } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/auth/human-challenge", humanChallengeLimiter, (_req, res) => {
  noStore(res);
  res.json({ ...createHumanChallenge(moderationSettingsCache), required: moderationSettingsCache.humanVerificationRequired });
});

app.use("/api", (_req, res, next) => {
  if (databaseReady) return next();
  res.set("Retry-After", "10");
  res.set("Cache-Control", "no-store");
  return res.status(503).json({ error: "The online service is temporarily unavailable. Please try again shortly." });
});

app.post("/api/auth/email-verification/request", requireSameOrigin, emailVerificationLimiter, async (req, res, next) => {
  noStore(res);
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "Enter a valid email address first." });
    const emailHash = hashEmail(email);
    const db = await getDatabase();
    if (await isEmailBanned(db, emailHash)) return res.status(403).json({ error: "This email address cannot be used." });
    const code = emailVerificationCode();
    const verificationToken = crypto.randomBytes(32).toString("base64url");
    const now = new Date();
    await db.collection("pending_email_verifications").updateOne(
      { _id: emailHash },
      { $set: { codeHash: hashEmailVerificationCode(emailHash, code), verificationTokenHash: hashSessionToken(verificationToken), expiresAt: new Date(Date.now() + 15 * 60 * 1000), attempts: 0, createdAt: now } },
      { upsert: true },
    );
    await sendEmailVerificationCode(email, code);
    res.json({ ok: true, verificationToken, expiresInSeconds: 900 });
  } catch (error) { next(error); }
});

app.post("/api/auth/email-verification/confirm", requireSameOrigin, emailVerificationLimiter, async (req, res, next) => {
  noStore(res);
  try {
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the email address and six-digit verification code." });
    const emailHash = hashEmail(email);
    const db = await getDatabase();
    const collection = db.collection("pending_email_verifications");
    const pending = await collection.findOne({ _id: emailHash });
    const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";
    if (!pending || !(pending.expiresAt instanceof Date) || pending.expiresAt <= new Date()) return res.status(400).json({ error: "That verification code expired. Send a new code and try again." });
    if (!verificationToken || pending.verificationTokenHash !== hashSessionToken(verificationToken)) return res.status(400).json({ error: "Send a new verification code and try again." });
    if ((pending.attempts ?? 0) >= 8) return res.status(429).json({ error: "Too many incorrect codes. Send a new verification code." });
    if (pending.codeHash !== hashEmailVerificationCode(emailHash, code)) {
      await collection.updateOne({ _id: emailHash }, { $inc: { attempts: 1 } });
      return res.status(400).json({ error: "That verification code is not correct." });
    }
    await collection.updateOne({ _id: emailHash }, { $set: { verifiedAt: new Date() } });
    res.json({ ok: true, verificationToken });
  } catch (error) { next(error); }
});

// The owner-panel moderation settings control network/day registration limits.
// A second hard-coded limiter here would make those settings ineffective.
app.post("/api/auth/register", requireSameOrigin, authLimiter, (req, res, next) => accountHandler(req, res, next, "register"));
app.post("/api/auth/login", requireSameOrigin, authLimiter, (req, res, next) => accountHandler(req, res, next, "login"));

app.post("/api/auth/recover", requireSameOrigin, recoveryLimiter, async (req, res, next) => {
  noStore(res);
  try {
    const username = normalizeUsername(req.body?.username);
    const password = req.body?.newPassword;
    if (!username || !isValidPassword(password)) {
      return res.status(400).json({ error: "Provide a valid username and a 10-128 character new password." });
    }
    const db = await getDatabase();
    if (await isIpBanned(db, hashClientIp(req.ip))) {
      return res.status(403).json({ error: "This device network has been banned. Contact the owner for help." });
    }
    const attempts = db.collection("account_recovery_attempts");
    const now = new Date();
    let lock = await attempts.findOne({ _id: username.normalized });
    const genericFailure = { error: "Recovery details are incorrect or unavailable." };
    if (lock?.lockedUntil && lock.lockedUntil > now) return res.status(401).json(genericFailure);
    const users = db.collection("users");
    const user = await users.findOne({ usernameNormalized: username.normalized });
    if (user?.emailHash && await isEmailBanned(db, user.emailHash)) {
      return res.status(403).json({ error: "This email address has been permanently banned. Contact the owner for help." });
    }
    const normalizedCode = normalizeRecoveryCode(req.body?.recoveryCode);
    let valid = false;
    if (user?.recoveryCodeHash) {
      if (normalizedCode) {
        try {
          valid = await argon2.verify(user.recoveryCodeHash, normalizedCode);
        } catch {
          valid = false;
        }
      } else {
        await argon2.verify(dummyRecoveryHash, String(req.body?.lastLevel ?? "").slice(0, 80));
      }
    } else {
      await argon2.verify(dummyRecoveryHash, normalizedCode ?? String(req.body?.lastLevel ?? "").slice(0, 80));
      if (user && !user.recoveryCodeHash && typeof req.body?.lastLevel === "string") {
        const progress = await db.collection("player_progress").findOne(
          { _id: user._id },
          { projection: { "data.orbit-last-level": 1 } },
        );
        const expected = user.legacyLastLevel ?? user.lastLevel ?? progress?.data?.["orbit-last-level"];
        const supplied = crypto.createHash("sha256").update(req.body.lastLevel.trim()).digest();
        const expectedHash = crypto.createHash("sha256").update(typeof expected === "string" ? expected : "").digest();
        valid = Boolean(expected) && crypto.timingSafeEqual(supplied, expectedHash);
      }
    }
    if (valid && user && user.role === "player" && !user.banned) {
      const passwordHash = await argon2.hash(password, passwordHashOptions);
      const newCode = recoveryCode();
      const recoveryCodeHash = await argon2.hash(normalizeRecoveryCode(newCode), passwordHashOptions);
      const recoveryFilter = user.recoveryCodeHash
        ? { _id: user._id, recoveryCodeHash: user.recoveryCodeHash, role: "player", banned: { $ne: true } }
        : { _id: user._id, recoveryCodeHash: { $exists: false }, role: "player", banned: { $ne: true } };
      const recoveryUpdate = {
        $set: {
          passwordHash,
          passwordChangedAt: now,
          recoveryCodeHash,
          recoveryCodeCreatedAt: now,
          mustChangePassword: false,
        },
        $unset: { legacyLastLevel: "", lastLevel: "" },
      };
      const result = await users.updateOne(recoveryFilter, recoveryUpdate);
      valid = Boolean(result.matchedCount);
      if (valid) {
        await db.collection("user_sessions").deleteMany({ userId: user._id });
        await attempts.deleteOne({ _id: username.normalized });
        clearSessionCookie(res);
        noStore(res);
        return res.json({ ok: true, recoveryCode: newCode });
      }
    }
    lock = await attempts.findOne({ _id: username.normalized });
    if (lock?.windowExpiresAt && lock.windowExpiresAt <= now) {
      const resetResult = await attempts.updateOne(
        {
          _id: username.normalized,
          windowExpiresAt: lock.windowExpiresAt,
          $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }],
        },
        {
          $set: {
            attempts: 0,
            windowStartedAt: now,
            windowExpiresAt: new Date(now.getTime() + recoveryLockMs),
          },
          $unset: { lockedUntil: "" },
        },
      );
      if (resetResult.matchedCount) lock = await attempts.findOne({ _id: username.normalized });
    }
    const canIncrement = {
      _id: username.normalized,
      $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }],
    };
    const incrementAttempt = {
      $inc: { attempts: 1 },
      $set: { updatedAt: now },
      $setOnInsert: {
        windowStartedAt: now,
        windowExpiresAt: new Date(now.getTime() + recoveryLockMs),
      },
    };
    try {
      await attempts.updateOne(canIncrement, incrementAttempt, { upsert: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await attempts.updateOne(canIncrement, incrementAttempt);
    }
    const currentAttempts = await attempts.findOne({ _id: username.normalized });
    if (currentAttempts?.attempts >= 5) {
      const lockedUntil = new Date(now.getTime() + recoveryLockMs);
      await attempts.updateOne(
        {
          _id: username.normalized,
          attempts: { $gte: 5 },
          $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }],
        },
        { $set: { lockedUntil, windowExpiresAt: lockedUntil } },
      );
    }
    return res.status(401).json(genericFailure);
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/session", async (req, res, next) => {
  try {
    noStore(res);
    const user = await getAuthenticatedUser(req);
    res.json({
      user: user
        ? { username: user.username, role: user.role, mustChangePassword: user.mustChangePassword, appearOffline: user.appearOffline, leaderboardOptIn: user.leaderboardOptIn !== false, allowFriendRequests: user.allowFriendRequests !== false, readReceipts: user.readReceipts !== false, typingIndicators: user.typingIndicators !== false, humanVerified: user.humanVerified !== false, ...(user.offlineOwnerEligible ? { offlineOwnerEligible: true } : {}) }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/presence/heartbeat", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const token = getCookie(req, cookieName);
    if (!token) return res.status(401).json({ error: "Log in to update your online status." });
    const now = new Date();
    const result = await (await getDatabase()).collection("user_sessions").updateOne({
      tokenHash: hashSessionToken(token),
      userId: req.user.id,
      expiresAt: { $gt: now },
    }, { $set: { lastSeenAt: now } });
    if (!result.matchedCount) return res.status(401).json({ error: "Your login session has expired." });
    const db = await getDatabase();
    const friendships = db.collection("friendships");
    const pendingRequests = await countDocumentsSafe(friendships, { userIds: req.user.id, status: "pending", requestedBy: { $ne: req.user.id } });
    const unreadMessages = await unreadChatCount(db, req.user.id);
    const chatNotification = await latestChatNotification(db, req.user.id);
    noStore(res);
    res.json({ pendingRequests, unreadMessages, chatNotification });
  } catch (error) {
    next(error);
  }
});

app.get("/api/presence", async (_req, res, next) => {
  try {
    noStore(res);
    const db = await getDatabase();
    const viewer = await getAuthenticatedUser(_req);
    const hiddenIds = viewer ? await blockedUserIds(db, viewer.id) : new Set();
    const activeUserIds = new Set([...await getActiveUserIds(db)].filter((id) => !hiddenIds.has(id)));
    if (!activeUserIds.size) return res.json({ users: [], truncated: false });
    const users = await db.collection("users")
      .find({
        _id: { $in: [...activeUserIds].map((id) => new ObjectId(id)) },
        role: { $in: USER_ROLES },
        banned: { $ne: true },
        appearOffline: { $ne: true },
      }, {
        projection: { username: 1, usernameNormalized: 1, role: 1 },
      })
      .sort({ usernameNormalized: 1 })
      .toArray();
    res.json({
      users: users.slice(0, 200).map((user) => ({ id: user._id.toHexString(), username: user.username, role: user.role })),
      truncated: users.length > 200,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", requireSameOrigin, async (req, res, next) => {
  try {
    const token = getCookie(req, cookieName);
    if (token) {
      const db = await getDatabase();
      await db.collection("user_sessions").deleteOne({ tokenHash: hashSessionToken(token) });
    }
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/account/progress", requireUser, async (req, res, next) => {
  try {
    noStore(res);
    const db = await getDatabase();
    const record = await db.collection("player_progress").findOne({ _id: req.user.id });
    const progress = record ? validatePlayerProgress(record.data) : null;
    if (record && !progress) return res.status(409).json({ error: "Saved player progress is invalid. Contact the owner for help." });
    res.json({
      progress,
      updatedAt: record?.updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    next(error);
  }
});

async function deleteAbusiveNewAccount(db, user, progress) {
  if (user.role !== "player") return null;
  const settings = await getModerationSettings(db);
  if (!settings.newAccountProtectionEnabled) return null;
  const account = await db.collection("users").findOne(
    { _id: user.id },
    { projection: { username: 1, createdAt: 1 } },
  );
  if (!account?.createdAt || Date.now() - new Date(account.createdAt).getTime() > settings.newAccountWindowMinutes * 60 * 1000) return null;
  const asteroids = Number(progress?.["orbit-claims"] ?? 0);
  const specialAsteroids = Number(progress?.["orbit-special-claims"] ?? 0);
  // A verified prestige reset is a strong signal that the account has already
  // completed a full planet. Give that account extra room for legitimate
  // post-prestige rewards, while still stopping truly extreme values.
  const prestiged = Number(progress?.["orbit-prestige"] ?? 0) > 0;
  const asteroidLimit = settings.newAccountAsteroidLimit * (prestiged ? 5 : 1);
  const specialAsteroidLimit = settings.newAccountSpecialAsteroidLimit * (prestiged ? 5 : 1);
  if (asteroids <= asteroidLimit && specialAsteroids <= specialAsteroidLimit) return null;
  const redemptions = db.collection("code_redemptions");
  const usedCode = typeof redemptions.countDocuments === "function"
    && await redemptions.countDocuments({ userId: user.id }, { limit: 1 }) > 0;
  if (usedCode) return null;

  const reason = asteroids > asteroidLimit
    ? `More than ${asteroidLimit.toLocaleString()} asteroids were received during the first ${settings.newAccountWindowMinutes} minutes without a reward code.`
    : `More than ${specialAsteroidLimit.toLocaleString()} special asteroids were received during the first ${settings.newAccountWindowMinutes} minutes without a reward code.`;
  await Promise.all([
    db.collection("user_sessions").deleteMany({ userId: user.id }),
    db.collection("player_progress").deleteOne({ _id: user.id }),
    db.collection("leaderboard_entries").deleteMany({ userId: user.id }),
    db.collection("code_redemptions").deleteMany({ userId: user.id }),
    db.collection("code_redemption_logs").deleteMany({ userId: user.id }),
    db.collection("users").deleteOne({ _id: user.id, role: "player" }),
  ]);
  await recordSecurityEvent(db, { type: "automatic-new-account-deletion", userId: user.id, reason, asteroids, specialAsteroids });
  await recordModerationLog(db, {
    action: "Automatic account deletion",
    reason,
    actorId: null,
    actorUsername: "Anti-cheat",
    targetUserId: user.id,
    targetUsername: account.username,
  });
  return reason;
}

async function hasRedeemedCode(db, userId) {
  const redemptions = db.collection("code_redemptions");
  return typeof redemptions.countDocuments === "function"
    && await redemptions.countDocuments({ userId }, { limit: 1 }) > 0;
}

function completedRouteCount(progress) {
  return Object.entries(progress ?? {}).filter(([key, value]) => /^orbit-level-complete-\d+$/.test(key) && value === "1").length;
}

function powerupInventoryTotal(progress) {
  try {
    const inventory = JSON.parse(progress?.["orbit-powerups"] ?? "{}");
    return ["shield", "boost", "rapid", "cannon", "star"].reduce((total, kind) => {
      const amount = inventory?.[kind];
      return total + (Number.isSafeInteger(amount) && amount > 0 ? amount : 0);
    }, 0);
  } catch {
    return 0;
  }
}

async function banLowProgressAbuse(db, user, progress) {
  if (user.role !== "player" || await hasRedeemedCode(db, user.id)) return null;
  const settings = await getModerationSettings(db);
  if (!settings.lowProgressProtectionEnabled) return null;
  const routes = completedRouteCount(progress);
  const asteroids = Number(progress?.["orbit-claims"] ?? 0);
  const specialAsteroids = Number(progress?.["orbit-special-claims"] ?? 0);
  const powerups = powerupInventoryTotal(progress);
  const prestiged = Number(progress?.["orbit-prestige"] ?? 0) > 0;
  const multiplier = prestiged ? 5 : 1;
  const asteroidLimit = settings.lowProgressAsteroidLimit * multiplier;
  const specialAsteroidLimit = settings.lowProgressSpecialAsteroidLimit * multiplier;
  const powerupLimit = settings.lowProgressPowerupLimit * multiplier;
  if (routes > settings.lowProgressRouteLimit || (asteroids < asteroidLimit && specialAsteroids < specialAsteroidLimit && powerups < powerupLimit)) return null;
  const account = await db.collection("users").findOne({ _id: user.id }, { projection: { username: 1 } });
  if (!account) return null;
  const reason = asteroids >= asteroidLimit
    ? `${asteroids.toLocaleString()} asteroids with only ${routes} completed route${routes === 1 ? "" : "s"} and no reward code.`
    : specialAsteroids >= specialAsteroidLimit
      ? `${specialAsteroids.toLocaleString()} special asteroids with only ${routes} completed route${routes === 1 ? "" : "s"} and no reward code.`
      : `${powerups.toLocaleString()} power-ups with only ${routes} completed route${routes === 1 ? "" : "s"} and no reward code.`;
  await Promise.all([
    db.collection("users").updateOne({ _id: user.id, role: "player" }, { $set: { banned: true } }),
    db.collection("user_sessions").deleteMany({ userId: user.id }),
  ]);
  await recordSecurityEvent(db, { type: "automatic-low-progress-ban", userId: user.id, reason, asteroids, specialAsteroids, powerups, routes });
  await recordModerationLog(db, {
    action: "Automatic account ban",
    reason,
    actorId: null,
    actorUsername: "Anti-cheat",
    targetUserId: user.id,
    targetUsername: account.username,
  });
  return reason;
}

app.put("/api/account/progress", requireSameOrigin, progressWriteLimiter, requireUser, async (req, res, next) => {
  try {
    const progress = validatePlayerProgress(req.body?.progress);
    const baseProgress = req.body?.baseProgress === null
      ? null
      : validatePlayerProgress(req.body?.baseProgress);
    if (!progress || (req.body?.baseProgress !== undefined && req.body?.baseProgress !== null && !baseProgress)) {
      return res.status(400).json({ error: "Player progress is invalid or exceeds the allowed size." });
    }
    const db = await getDatabase();
    const collection = db.collection("player_progress");
    const moderationSettings = await getModerationSettings(db);
    if (req.body?.initializeOnly === true) {
      if (req.body.baseProgress !== null) return res.status(400).json({ error: "Initial progress must have a null base." });
      const deletionReason = await deleteAbusiveNewAccount(db, req.user, progress);
      if (deletionReason) {
        return res.status(403).json({
          error: `Your account is being deleted: ${deletionReason}`,
          accountDeleted: true,
        });
      }
      const banReason = await banLowProgressAbuse(db, req.user, progress);
      if (banReason) return res.status(403).json({ error: `Your account has been automatically banned: ${banReason}`, accountBanned: true });
      const safeInitialProgress = moderationSettings.progressAntiCheatEnabled ? sanitizeInitialPlayerProgress(progress, req.user.role) : progress;
      if (moderationSettings.progressAntiCheatEnabled && req.user.role === "player" && JSON.stringify(safeInitialProgress) !== JSON.stringify(progress)) {
        await recordSecurityEvent(db, { type: "sanitized-initial-progress", userId: req.user.id, role: req.user.role });
      }
      const initialized = await initializePlayerProgress(collection, req.user.id, safeInitialProgress);
      if (!initialized) return res.status(409).json({ error: "Saved player progress is invalid. Contact the owner for help." });
      return res.json({ progress: initialized });
    }
    const result = await writePlayerProgress(collection, req.user.id, progress, baseProgress, false, undefined, req.user.role, moderationSettings.progressAntiCheatEnabled);
    if (result.suspiciousMutation) {
      await recordSecurityEvent(db, { type: "suspicious-progress-mutation", userId: req.user.id, role: req.user.role, reason: result.suspiciousMutation });
      const deletionReason = await deleteAbusiveNewAccount(db, req.user, progress);
      if (deletionReason) {
        return res.status(403).json({
          error: `Your account is being deleted: ${deletionReason}`,
          accountDeleted: true,
        });
      }
      const banReason = await banLowProgressAbuse(db, req.user, progress);
      if (banReason) return res.status(403).json({ error: `Your account has been automatically banned: ${banReason}`, accountBanned: true });
      return res.status(403).json({ error: "This progress update was blocked by server-side anti-cheat protection." });
    }
    if (!result.progress) return res.status(result.conflict ? 409 : 400).json({
      error: result.conflict ? "Progress changed on another device. Cloud saving is paused; signing in again will replace unsaved local changes with cloud progress." : "Player progress exceeds the allowed size.",
    });
    const deletionReason = await deleteAbusiveNewAccount(db, req.user, result.progress);
    if (deletionReason) {
      return res.status(403).json({
        error: `Your account is being deleted: ${deletionReason}`,
        accountDeleted: true,
      });
    }
    const banReason = await banLowProgressAbuse(db, req.user, result.progress);
    if (banReason) return res.status(403).json({ error: `Your account has been automatically banned: ${banReason}`, accountBanned: true });
    res.json({ progress: result.progress });
  } catch (error) {
    next(error);
  }
});

// Holiday spins are resolved on the server so the currency and any asteroid
// prizes are saved safely and cannot be created by editing browser storage.
app.post("/api/holiday/christmas-spin", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const holiday = await db.collection("game_settings").findOne({ _id: "holiday_event" });
    const eventEnabled = resolveHolidayEventSettings(holiday?.value).christmasEnabled;
    if (!eventEnabled && !["owner", "developer", "tester"].includes(req.user.role)) return res.status(403).json({ error: "The Christmas event is not active." });
    const collection = db.collection("player_progress");
    const record = await collection.findOne({ _id: req.user.id });
    const progress = validatePlayerProgress(record?.data ?? {});
    if (!progress) return res.status(409).json({ error: "Saved player progress is invalid. Contact the owner for help." });
    const presents = Number(progress["orbit-christmas-presents"] ?? 0);
    if (!Number.isSafeInteger(presents) || presents < 10) return res.status(400).json({ error: "You need 10 presents to open the wheel." });
    const cosmetics = [
      ["skin", 26, "Holly Comet"], ["skin", 27, "Snowglobe"], ["skin", 28, "Evergreen Blade"],
      ["trail", 21, "Present Parade"], ["trail", 22, "Snowfall Wake"], ["trail", 23, "Holly Ribbon"],
      ["avatar", 16, "North Star"], ["avatar", 17, "Sleigh"],
    ].filter(([group, index]) => progress[`orbit-christmas-unlock-${group}-${index}`] !== "1");
    const titles = ["winter-pilot", "gift-runner", "north-star", "snowglobe"]
      .filter((id) => progress[`orbit-christmas-title-unlock-${id}`] !== "1")
      .map((id) => ["title", id, id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")]);
    const options = [...cosmetics, ...titles, ["claims", null, "Normal asteroids"], ["specialClaims", null, "Special asteroids"]];
    const [kind, value, name] = options[crypto.randomInt(options.length)];
    const nextProgress = { ...progress, "orbit-christmas-presents": String(presents - 10) };
    let description;
    if (kind === "claims") {
      const amount = crypto.randomInt(1, 1001);
      nextProgress["orbit-claims"] = String(Math.min(100000000, Number(progress["orbit-claims"] ?? 0) + amount));
      description = `+${amount.toLocaleString()} normal asteroids`;
    } else if (kind === "specialClaims") {
      const amount = crypto.randomInt(1, 51);
      nextProgress["orbit-special-claims"] = String(Math.min(100000000, Number(progress["orbit-special-claims"] ?? 0) + amount));
      description = `+${amount} special asteroids`;
    } else if (kind === "title") {
      nextProgress[`orbit-christmas-title-unlock-${value}`] = "1";
      description = `Limited ${name} title unlocked.`;
    } else {
      nextProgress[`orbit-christmas-unlock-${kind}-${value}`] = "1";
      description = `Limited ${name} unlocked.`;
    }
    const result = await writePlayerProgress(collection, req.user.id, nextProgress, null, true);
    if (!result.progress) return res.status(409).json({ error: "Could not save this holiday reward. Try again." });
    res.json({ progress: result.progress, reward: { name, description } });
  } catch (error) { next(error); }
});

function christmasAdventDay(settings, now = new Date()) {
  const start = annualDateParts(settings.adventStart);
  const end = annualDateParts(settings.adventEnd);
  let startTime = Date.UTC(2000, start.month, start.day);
  let endTime = Date.UTC(2000, end.month, end.day);
  let current = Date.UTC(2000, now.getUTCMonth(), now.getUTCDate());
  if (endTime < startTime) { endTime = Date.UTC(2001, end.month, end.day); if (current < startTime) current = Date.UTC(2001, now.getUTCMonth(), now.getUTCDate()); }
  if (current < startTime || current > endTime) return 0;
  const day = Math.floor((current - startTime) / 86400000) + 1;
  return day <= 25 ? day : 0;
}

function applyChristmasAdventReward(progress, day) {
  const next = { ...progress, [`orbit-christmas-advent-${day}`]: "1" };
  if (day === 25) {
    next["orbit-christmas-unlock-avatar-17"] = "1";
    return { progress: next, reward: "Limited Sleigh avatar" };
  }
  if (day === 21) {
    next["orbit-christmas-title-unlock-north-star"] = "1";
    return { progress: next, reward: "Limited North Star title" };
  }
  if (day === 14) {
    next["orbit-christmas-unlock-skin-26"] = "1";
    return { progress: next, reward: "Limited Holly Comet ship color" };
  }
  if (day === 7) {
    next["orbit-christmas-unlock-trail-21"] = "1";
    return { progress: next, reward: "Limited Present Parade trail" };
  }
  if (day % 5 === 0) {
    const amount = Math.min(1000, day * 50);
    next["orbit-claims"] = String(Math.min(100000000, Number(progress["orbit-claims"] ?? 0) + amount));
    return { progress: next, reward: `+${amount} normal asteroids` };
  }
  const presents = 10 + day * 2;
  next["orbit-christmas-presents"] = String(Math.min(1000000, Number(progress["orbit-christmas-presents"] ?? 0) + presents));
  return { progress: next, reward: `+${presents} presents` };
}

app.get("/api/holiday/christmas-advent", requireUser, async (req, res, next) => {
  try {
    noStore(res);
    const db = await getDatabase();
    const holiday = await db.collection("game_settings").findOne({ _id: "holiday_event" });
    const settings = resolveHolidayEventSettings(holiday?.value);
    const record = await db.collection("player_progress").findOne({ _id: req.user.id });
    const progress = validatePlayerProgress(record?.data ?? {}) ?? {};
    const claimedDays = Array.from({ length: 25 }, (_, index) => index + 1)
      .filter((day) => progress[`orbit-christmas-advent-${day}`] === "1");
    res.json({ day: christmasAdventDay(settings), claimedDays, start: settings.adventStart, end: settings.adventEnd });
  } catch (error) { next(error); }
});

app.post("/api/holiday/christmas-advent/:day", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const day = Number(req.params.day);
    if (!Number.isInteger(day) || day < 1 || day > 25) return res.status(400).json({ error: "That Advent calendar day is invalid." });
    const db = await getDatabase();
    const holiday = await db.collection("game_settings").findOne({ _id: "holiday_event" });
    const settings = resolveHolidayEventSettings(holiday?.value);
    const currentDay = christmasAdventDay(settings);
    if (!currentDay || day > currentDay) return res.status(400).json({ error: "That Advent calendar day is not available yet." });
    if (!settings.christmasEnabled) return res.status(403).json({ error: "The Christmas event is not active." });
    const collection = db.collection("player_progress");
    const record = await collection.findOne({ _id: req.user.id });
    const progress = validatePlayerProgress(record?.data ?? {});
    if (!progress) return res.status(409).json({ error: "Saved player progress is invalid. Contact the owner for help." });
    if (progress[`orbit-christmas-advent-${day}`] === "1") return res.status(409).json({ error: "You already opened this Advent calendar day." });
    const reward = applyChristmasAdventReward(progress, day);
    const result = await writePlayerProgress(collection, req.user.id, reward.progress, null, true);
    if (!result.progress) return res.status(409).json({ error: "Could not save this Advent reward. Try again." });
    res.json({ progress: result.progress, reward: reward.reward });
  } catch (error) { next(error); }
});

app.get("/api/account/profile", requireUser, async (req, res, next) => {
  try {
    noStore(res);
    const db = await getDatabase();
    const user = await db.collection("users").findOne(
      { _id: req.user.id },
      { projection: { username: 1, usernameChangedAt: 1, createdAt: 1, role: 1, mustChangePassword: 1, recoveryCodeHash: 1, recoveryCodeCreatedAt: 1, emailMasked: 1, emailHash: 1 } },
    );
    if (!user) return res.status(404).json({ error: "Account not found." });
    res.json({
      username: user.username,
      role: user.role,
      mustChangePassword: Boolean(user.mustChangePassword),
      createdAt: user.createdAt,
      usernameChangedAt: user.usernameChangedAt ?? null,
      hasRecoveryCode: Boolean(user.recoveryCodeHash),
      emailMasked: user.emailMasked ?? null,
      emailSet: Boolean(user.emailHash),
      recoveryCodeCreatedAt: user.recoveryCodeCreatedAt ?? null,
      nextUsernameChangeAt: user.usernameChangedAt
        ? new Date(user.usernameChangedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/account/email", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim() : req.body?.email;
    const email = rawEmail === "" || rawEmail === null || rawEmail === undefined ? null : normalizeEmail(rawEmail);
    if (rawEmail !== "" && rawEmail !== null && rawEmail !== undefined && !email) return res.status(400).json({ error: "Enter a valid email address." });
    const db = await getDatabase();
    const emailHash = hashEmail(email);
    if (emailHash && await isEmailBanned(db, emailHash)) return res.status(403).json({ error: "This email address has been permanently banned. Contact the owner for help." });
    const result = await db.collection("users").updateOne(
      { _id: req.user.id, banned: { $ne: true } },
      emailHash ? { $set: { emailHash, emailMasked: maskEmail(email) } } : { $unset: { emailHash: "", emailMasked: "" } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Account not found." });
    noStore(res);
    res.json({ emailMasked: emailHash ? maskEmail(email) : null, emailSet: Boolean(emailHash) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/account/presence", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (typeof req.body?.appearOffline !== "boolean") {
      return res.status(400).json({ error: "Choose whether your profile should appear offline." });
    }
    const result = await (await getDatabase()).collection("users").updateOne(
      { _id: req.user.id, banned: { $ne: true } },
      { $set: { appearOffline: req.body.appearOffline } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Account not found." });
    noStore(res);
    res.json({ appearOffline: req.body.appearOffline });
  } catch (error) {
    next(error);
  }
});

app.put("/api/account/leaderboard-preference", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (typeof req.body?.leaderboardOptIn !== "boolean") {
      return res.status(400).json({ error: "Choose whether your runs should be submitted to the online leaderboard." });
    }
    const result = await (await getDatabase()).collection("users").updateOne(
      { _id: req.user.id, banned: { $ne: true } },
      { $set: { leaderboardOptIn: req.body.leaderboardOptIn } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Account not found." });
    noStore(res);
    res.json({ leaderboardOptIn: req.body.leaderboardOptIn });
  } catch (error) {
    next(error);
  }
});

app.put("/api/account/friend-requests", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (typeof req.body?.allowFriendRequests !== "boolean") return res.status(400).json({ error: "Choose whether your profile accepts friend requests." });
    const result = await (await getDatabase()).collection("users").updateOne(
      { _id: req.user.id, banned: { $ne: true } },
      { $set: { allowFriendRequests: req.body.allowFriendRequests } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Account not found." });
    noStore(res);
    res.json({ allowFriendRequests: req.body.allowFriendRequests });
  } catch (error) {
    next(error);
  }
});

app.put("/api/account/chat-preferences", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (typeof req.body?.readReceipts !== "boolean" || typeof req.body?.typingIndicators !== "boolean") {
      return res.status(400).json({ error: "Choose whether read receipts and typing indicators are enabled." });
    }
    const result = await (await getDatabase()).collection("users").updateOne(
      { _id: req.user.id, banned: { $ne: true } },
      { $set: { readReceipts: req.body.readReceipts, typingIndicators: req.body.typingIndicators } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Account not found." });
    noStore(res);
    res.json({ readReceipts: req.body.readReceipts, typingIndicators: req.body.typingIndicators });
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/human-verify", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const settings = await getModerationSettings(db);
    if (settings.humanVerificationRequired && !consumeHumanChallenge(req.body?.humanChallenge)) {
      return res.status(400).json({ error: "Complete the human check before playing online levels." });
    }
    const result = await db.collection("users").updateOne(
      { _id: req.user.id, banned: { $ne: true } },
      { $set: { humanVerified: true, humanVerifiedAt: new Date() } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Account not found." });
    noStore(res);
    res.json({ humanVerified: true });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/account/profile", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    if (!username) return res.status(400).json({ error: "Use a 3-20 character username (letters, numbers, underscore)." });
    const db = await getDatabase();
    const users = db.collection("users");
    const current = await users.findOne({ _id: req.user.id }, { projection: { username: 1, usernameChangedAt: 1, role: 1 } });
    if (!current) return res.status(404).json({ error: "Account not found." });
    if (current.username === username.display) return res.json({ user: { username: current.username }, usernameChangedAt: current.usernameChangedAt ?? null });
    if (isOwnerEquivalentRole(current.role)) return res.status(403).json({ error: "Owner usernames are managed through the deployment account settings." });
    const now = new Date();
    const cooldownStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (current.usernameChangedAt && current.usernameChangedAt > cooldownStart) {
      return res.status(429).json({ error: `You can change your username again on ${new Date(current.usernameChangedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { timeZone: "UTC" })} UTC.` });
    }
    try {
      const previousUsernameDate = current.usernameChangedAt === undefined
        ? { usernameChangedAt: { $exists: false } }
        : { usernameChangedAt: current.usernameChangedAt };
      const result = await users.updateOne(
        { _id: req.user.id, ...previousUsernameDate },
        { $set: { username: username.display, usernameNormalized: username.normalized, usernameChangedAt: now } },
      );
      if (!result.matchedCount) return res.status(409).json({ error: "Account profile changed. Refresh and try again." });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: "That username is already taken." });
      throw error;
    }
    res.json({ user: { username: username.display }, usernameChangedAt: now.toISOString() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/players/:id", async (req, res, next) => {
  try {
    noStore(res);
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid player id." });
    const db = await getDatabase();
    const viewer = await getAuthenticatedUser(req);
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(req.params.id), role: { $in: USER_ROLES }, banned: { $ne: true } },
      { projection: { username: 1, role: 1, appearOffline: 1 } },
    );
    if (!user) return res.status(404).json({ error: "Player not found." });
    const blocked = viewer ? await isBlocked(db, viewer.id, user._id) : false;
    const [activeUserIds, profileTitles] = await Promise.all([
      user.appearOffline ? Promise.resolve(new Set()) : getActiveUserIds(db, [user._id]),
      getProfileTitles(db),
    ]);
    const saved = await db.collection("player_progress").findOne(
      { _id: user._id },
      { projection: { data: 1 } },
    );
    res.json({
      player: {
        id: user._id.toHexString(),
        ...publicProfileFromProgress(user.username, user.role, saved?.data ?? {}, profileTitles),
        isOnline: !blocked && activeUserIds.has(user._id.toHexString()),
      },
    });
  } catch (error) {
    next(error);
  }
});

async function friendRowsForUser(db, userId) {
  const rows = typeof db.collection("friendships").find === "function"
    ? await db.collection("friendships").find({ userIds: userId }).sort({ createdAt: -1 }).toArray()
    : [];
  const hiddenIds = await blockedUserIds(db, userId);
  const otherIds = rows.map((row) => row.userIds?.find((id) => userIdString(id) !== userIdString(userId))).filter((id) => id && !hiddenIds.has(userIdString(id)));
  const users = otherIds.length && typeof db.collection("users").find === "function"
    ? await db.collection("users").find({ _id: { $in: otherIds } }, { projection: { username: 1, role: 1, banned: 1, appearOffline: 1 } }).toArray()
    : [];
  const usersById = new Map(users.map((user) => [userIdString(user._id), user]));
  const active = await getActiveUserIds(db, otherIds);
  const profileTitles = await getProfileTitles(db);
  const progressCollection = db.collection("player_progress");
  const result = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const otherId = row.userIds?.find((id) => userIdString(id) !== userIdString(userId));
    if (!otherId) continue;
    const id = userIdString(otherId);
    const other = usersById.get(id);
    if (!other || other.banned || hiddenIds.has(id)) continue;
    const progress = await progressCollection.findOne({ _id: otherId }, { projection: { data: 1 } });
    const profile = publicProfileFromProgress(other.username, other.role, progress?.data ?? {}, profileTitles);
    const base = { userId: id, username: other.username, role: other.role, title: profile.title, isOnline: !other.appearOffline && active.has(id), unread: 0, createdAt: row.createdAt?.toISOString?.() ?? row.createdAt ?? null };
    if (row.status === "accepted") {
      const conversation = await db.collection("conversations").findOne({ pairKey: row.pairKey });
      base.unread = Number(conversation?.unread?.[userIdString(userId)]) || 0;
      result.friends.push(base);
    } else if (row.status === "pending") {
      const request = { ...base, id: userIdString(row._id), direction: userIdString(row.requestedBy) === userIdString(userId) ? "outgoing" : "incoming" };
      (request.direction === "outgoing" ? result.outgoing : result.incoming).push(request);
    }
  }
  return result;
}

app.get("/api/friends", requireUser, async (req, res, next) => {
  try {
    noStore(res);
    res.json(await friendRowsForUser(await getDatabase(), req.user.id));
  } catch (error) {
    next(error);
  }
});

app.post("/api/friends/requests", requireSameOrigin, friendRequestLimiter, requireUser, async (req, res, next) => {
  try {
    const targetId = validObjectId(req.body?.userId);
    if (!targetId) return res.status(400).json({ error: "Choose a valid player." });
    if (targetId.equals(req.user.id)) return res.status(400).json({ error: "You cannot add yourself." });
    const db = await getDatabase();
    const target = await db.collection("users").findOne({ _id: targetId, role: { $in: USER_ROLES }, banned: { $ne: true } }, { projection: { username: 1, role: 1, allowFriendRequests: 1 } });
    if (!target) return res.status(404).json({ error: "Player not found." });
    if (await isBlocked(db, req.user.id, targetId)) return res.status(403).json({ error: "This player cannot receive a request from you." });
    const friendships = db.collection("friendships");
    const pairKey = friendPairKey(req.user.id, targetId);
    const existing = await friendships.findOne({ pairKey });
    if (existing?.status === "accepted") return res.json({ status: "accepted" });
    if (existing?.status === "pending") {
      if (userIdString(existing.requestedBy) !== userIdString(req.user.id)) {
        await friendships.updateOne({ _id: existing._id, status: "pending" }, { $set: { status: "accepted", respondedAt: new Date() } });
        return res.json({ status: "accepted" });
      }
      return res.json({ status: "pending" });
    }
    if (target.allowFriendRequests === false) return res.status(403).json({ error: "This player is not accepting friend requests." });
    if (existing?.status === "declined" && existing.respondedAt && existing.respondedAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
      return res.status(429).json({ error: "You must wait 7 days before sending another request to this player." });
    }
    const acceptedFriends = await countDocumentsSafe(friendships, { userIds: req.user.id, status: "accepted" });
    if (acceptedFriends >= 200) return res.status(429).json({ error: "You can have at most 200 friends." });
    const outgoing = await countDocumentsSafe(friendships, { requestedBy: req.user.id, status: "pending" });
    if (outgoing >= 25) return res.status(429).json({ error: "You can have at most 25 pending outgoing requests." });
    const incoming = await countDocumentsSafe(friendships, { userIds: targetId, status: "pending", requestedBy: { $ne: targetId } });
    if (incoming >= 100) return res.status(429).json({ error: "This player's request inbox is full." });
    const document = { pairKey, userIds: [req.user.id, targetId], requestedBy: req.user.id, status: "pending", createdAt: new Date() };
    try {
      if (existing) await friendships.updateOne({ _id: existing._id, status: "declined" }, { $set: document });
      else await friendships.insertOne(document);
    } catch (error) {
      if (error?.code === 11000) return res.json({ status: "pending" });
      throw error;
    }
    res.status(201).json({ status: "pending" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/friends/requests/:id/accept", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const id = validObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid request." });
    const db = await getDatabase();
    const row = await db.collection("friendships").findOne({ _id: id, status: "pending" });
    if (!row || !row.userIds?.some((value) => userIdString(value) === userIdString(req.user.id))) return res.status(404).json({ error: "Friend request not found." });
    if (userIdString(row.requestedBy) === userIdString(req.user.id)) return res.status(403).json({ error: "Only the recipient can accept this request." });
    await db.collection("friendships").updateOne({ _id: id, status: "pending" }, { $set: { status: "accepted", respondedAt: new Date() } });
    const conversations = db.collection("conversations");
    await conversations.updateOne({ pairKey: row.pairKey }, { $setOnInsert: { pairKey: row.pairKey, userIds: row.userIds, lastMessageAt: null, lastMessagePreview: "", readAt: {}, unread: {}, createdAt: new Date() } }, { upsert: true });
    res.json({ status: "accepted" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/friends/requests/:id/decline", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const id = validObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid request." });
    const db = await getDatabase();
    const row = await db.collection("friendships").findOne({ _id: id, status: "pending" });
    if (!row || !row.userIds?.some((value) => userIdString(value) === userIdString(req.user.id))) return res.status(404).json({ error: "Friend request not found." });
    if (userIdString(row.requestedBy) === userIdString(req.user.id)) return res.status(403).json({ error: "Only the recipient can decline this request." });
    await db.collection("friendships").updateOne({ _id: id, status: "pending" }, { $set: { status: "declined", respondedAt: new Date() } });
    res.json({ status: "declined" });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/friends/:userId", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const targetId = validObjectId(req.params.userId);
    if (!targetId) return res.status(400).json({ error: "Invalid player." });
    const db = await getDatabase();
    const pairKey = friendPairKey(req.user.id, targetId);
    const row = await db.collection("friendships").findOne({ pairKey });
    if (!row) return res.status(404).json({ error: "Friendship not found." });
    if (row.status === "pending" && userIdString(row.requestedBy) !== userIdString(req.user.id)) return res.status(403).json({ error: "Only the sender can cancel a request." });
    await db.collection("friendships").deleteOne({ _id: row._id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/blocks", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const targetId = validObjectId(req.body?.userId);
    if (!targetId || targetId.equals(req.user.id)) return res.status(400).json({ error: "Choose another player." });
    const db = await getDatabase();
    await db.collection("user_blocks").updateOne({ blockerId: req.user.id, blockedId: targetId }, { $setOnInsert: { blockerId: req.user.id, blockedId: targetId, createdAt: new Date() } }, { upsert: true });
    await db.collection("friendships").deleteOne({ pairKey: friendPairKey(req.user.id, targetId) });
    res.json({ blocked: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/blocks", requireUser, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = typeof db.collection("user_blocks").find === "function"
      ? await db.collection("user_blocks").find({ blockerId: req.user.id }).sort({ createdAt: -1 }).toArray()
      : [];
    const ids = rows.map((row) => row.blockedId);
    const users = ids.length && typeof db.collection("users").find === "function"
      ? await db.collection("users").find({ _id: { $in: ids } }, { projection: { username: 1, role: 1, banned: 1 } }).toArray()
      : [];
    const usersById = new Map(users.map((user) => [userIdString(user._id), user]));
    noStore(res);
    res.json({ blocked: rows.map((row) => ({ id: userIdString(row.blockedId), username: usersById.get(userIdString(row.blockedId))?.username ?? "Deleted player", role: usersById.get(userIdString(row.blockedId))?.role ?? "player", createdAt: row.createdAt?.toISOString?.() ?? row.createdAt ?? null })) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/blocks/:userId", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const targetId = validObjectId(req.params.userId);
    if (!targetId) return res.status(400).json({ error: "Invalid player." });
    const db = await getDatabase();
    await db.collection("user_blocks").deleteOne({ blockerId: req.user.id, blockedId: targetId });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

async function chatTargetAccess(db, userId, targetId) {
  const target = await ensureChatUser(db, targetId);
  if (!target || target.chatMuted) return { error: "Chat is unavailable for this account.", status: 403 };
  if (await isBlocked(db, userId, targetId)) return { error: "You cannot message this player.", status: 403 };
  const friendship = await getFriendship(db, userId, targetId);
  if (!friendship || friendship.status !== "accepted") return { error: "You can only message accepted friends.", status: 403 };
  return { target, friendship };
}

const CHAT_REACTION_EMOJIS = new Set(["😀", "😄", "😂", "🥹", "😎", "😭", "😡", "❤️", "👍", "👎", "👏", "🙌", "🎉", "🔥", "✨", "💯", "🚀", "⭐", "👀", "🤝", "💀", "😮", "🤔", "🫡", "😴", "🤖", "👽", "🪐"]);
function publicChatReactions(reactions, viewerId) {
  if (!reactions || typeof reactions !== "object" || Array.isArray(reactions)) return [];
  const viewer = userIdString(viewerId);
  return Object.entries(reactions)
    .filter(([emoji, userIds]) => CHAT_REACTION_EMOJIS.has(emoji) && Array.isArray(userIds) && userIds.length)
    .map(([emoji, userIds]) => ({ emoji, count: userIds.length, reacted: userIds.includes(viewer) }));
}
async function findChatMessage(db, id) {
  const objectId = new ObjectId(id);
  const direct = await db.collection("chat_messages").findOne({ _id: objectId });
  if (direct) return { message: direct, collection: "chat_messages", global: false };
  const global = await db.collection("global_chat_messages").findOne({ _id: objectId });
  return global ? { message: global, collection: "global_chat_messages", global: true } : null;
}
async function canAccessChatMessage(db, located, user) {
  if (located.global) return true;
  const conversation = await db.collection("conversations").findOne({ pairKey: located.message.conversationId, userIds: user.id });
  return Boolean(conversation);
}
async function getReplyPreview(db, replyToId, { global, conversationId }) {
  if (replyToId === undefined || replyToId === null || replyToId === "") return null;
  if (typeof replyToId !== "string" || !ObjectId.isValid(replyToId)) throw Object.assign(new Error("Reply target is invalid."), { statusCode: 400 });
  const located = await findChatMessage(db, replyToId);
  if (!located || located.global !== global || (!global && located.message.conversationId !== conversationId)) throw Object.assign(new Error("Reply target is unavailable."), { statusCode: 400 });
  return { id: userIdString(located.message._id), senderId: userIdString(located.message.senderId), sender: located.message.sender ?? "Pilot", text: located.message.deletedAt ? "Message deleted" : String(located.message.text ?? "").slice(0, 180) };
}

app.get("/api/chat/mentions", requireUser, async (req, res, next) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    if (!/^[a-z0-9_]{0,20}$/.test(query)) return res.status(400).json({ error: "Mention search is invalid." });
    const db = await getDatabase();
    const blockedIds = await blockedUserIds(db, req.user.id);
    const excludedIds = [req.user.id, ...[...blockedIds].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))];
    const users = typeof db.collection("users").find === "function"
      ? await db.collection("users").find({
        _id: { $nin: excludedIds },
        usernameNormalized: { $regex: `^${query}` },
        banned: { $ne: true },
      }, { projection: { username: 1, role: 1, usernameNormalized: 1 } }).sort({ usernameNormalized: 1 }).limit(8).toArray()
      : [];
    noStore(res);
    res.json({ users: users.map((user) => ({ id: userIdString(user._id), username: user.username, role: user.role })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat/global", requireUser, async (req, res, next) => {
  try {
    if (req.user.chatMuted) return res.status(403).json({ error: "Chat is unavailable for this account." });
    const db = await getDatabase();
    const limit = Math.max(1, Math.min(60, Number(req.query.limit) || 40));
    const filter = {};
    const hiddenIds = await blockedUserIds(db, req.user.id);
    if (hiddenIds.size) filter.senderId = { $nin: [...hiddenIds].map((id) => new ObjectId(id)) };
    if (req.query.after && ObjectId.isValid(req.query.after)) filter._id = { $gt: new ObjectId(req.query.after) };
    const messages = typeof db.collection("global_chat_messages").find === "function"
      ? await db.collection("global_chat_messages").find(filter).sort({ _id: -1 }).limit(limit).toArray()
      : [];
    noStore(res);
    res.json({ messages: messages.reverse().map((message) => ({
      id: userIdString(message._id), conversationId: "global", senderId: userIdString(message.senderId),
      sender: message.sender, role: message.role, text: message.deletedAt ? "Message deleted" : message.text,
      mentions: message.deletedAt ? [] : message.mentions ?? [], replyTo: message.replyTo ?? null,
      reactions: message.deletedAt ? [] : publicChatReactions(message.reactions, req.user.id),
      createdAt: message.createdAt?.toISOString?.() ?? message.createdAt, editedAt: message.editedAt?.toISOString?.() ?? message.editedAt ?? null, deletedAt: message.deletedAt?.toISOString?.() ?? message.deletedAt ?? null,
    })) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/global", requireSameOrigin, chatMessageLimiter, requireUser, async (req, res, next) => {
  try {
    if (req.user.chatMuted) return res.status(403).json({ error: "Chat is unavailable for this account." });
    const text = sanitizeChatText(req.body?.text);
    if (!text) return res.status(400).json({ error: "Write a message first." });
    if (text.length > 300) return res.status(400).json({ error: "Messages are limited to 300 characters." });
    const db = await getDatabase();
    const moderatedText = moderateChatText(text, await getChatFilterTerms(db));
    const messages = db.collection("global_chat_messages");
    const recent = typeof messages.find === "function"
      ? await messages.find({ senderId: req.user.id, deletedAt: { $exists: false } }).sort({ _id: -1 }).limit(3).toArray()
      : [];
    if (recent.length >= 3 && recent.every((message) => message.text === moderatedText)) return res.status(429).json({ error: "Please do not repeat the same message." });
    const now = new Date();
    const replyTo = await getReplyPreview(db, req.body?.replyToId, { global: true });
    const mentions = mentionedUsernames(moderatedText).filter((name) => name !== req.user.usernameNormalized);
    let mentionRecords = [];
    if (mentions.length && typeof db.collection("users").find === "function") {
      const targets = await db.collection("users").find({ usernameNormalized: { $in: mentions }, _id: { $ne: req.user.id }, banned: { $ne: true } }, { projection: { _id: 1, username: 1, role: 1 } }).toArray();
      mentionRecords = targets.map((target) => ({ id: userIdString(target._id), username: target.username, role: target.role }));
      const inserted = await messages.insertOne({ senderId: req.user.id, sender: req.user.username, role: req.user.role, text: moderatedText, ...(replyTo ? { replyTo } : {}), ...(mentionRecords.length ? { mentions: mentionRecords } : {}), createdAt: now });
      if (targets.length) await db.collection("chat_notifications").insertMany(targets.map((target) => ({ recipientId: target._id, senderId: req.user.id, messageId: inserted.insertedId, kind: "mention", createdAt: now })));
      return res.status(201).json({ message: { id: inserted.insertedId.toHexString(), conversationId: "global", senderId: userIdString(req.user.id), sender: req.user.username, role: req.user.role, text: moderatedText, mentions: mentionRecords, replyTo, createdAt: now.toISOString() } });
    }
    const inserted = await messages.insertOne({ senderId: req.user.id, sender: req.user.username, role: req.user.role, text: moderatedText, ...(replyTo ? { replyTo } : {}), createdAt: now });
    res.status(201).json({ message: { id: inserted.insertedId.toHexString(), conversationId: "global", senderId: userIdString(req.user.id), sender: req.user.username, role: req.user.role, text: moderatedText, replyTo, createdAt: now.toISOString() } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/mentions/read", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    await (await getDatabase()).collection("chat_notifications").updateMany(
      { recipientId: req.user.id, kind: "mention", readAt: { $exists: false } },
      { $set: { readAt: new Date() } },
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat/conversations", requireUser, async (req, res, next) => {
  try {
    if (req.user.chatMuted) return res.status(403).json({ error: "Chat is unavailable for this account." });
    const db = await getDatabase();
    const rows = typeof db.collection("friendships").find === "function"
      ? await db.collection("friendships").find({ userIds: req.user.id, status: "accepted" }).toArray()
      : [];
    const active = await getActiveUserIds(db, rows.flatMap((row) => row.userIds ?? []).filter((id) => userIdString(id) !== userIdString(req.user.id)));
    const users = rows.length && typeof db.collection("users").find === "function"
      ? await db.collection("users").find({ _id: { $in: rows.flatMap((row) => row.userIds ?? []).filter((id) => userIdString(id) !== userIdString(req.user.id)) } }, { projection: { username: 1, role: 1, appearOffline: 1, banned: 1 } }).toArray()
      : [];
    const byId = new Map(users.map((user) => [userIdString(user._id), user]));
    const conversations = [];
    for (const row of rows) {
      const otherId = row.userIds.find((id) => userIdString(id) !== userIdString(req.user.id));
      const other = byId.get(userIdString(otherId));
      if (!other || other.banned) continue;
      const conversation = await db.collection("conversations").findOne({ pairKey: row.pairKey });
      conversations.push({ id: row.pairKey, userId: userIdString(otherId), username: other.username, role: other.role, isOnline: !other.appearOffline && active.has(userIdString(otherId)), lastMessagePreview: conversation?.lastMessagePreview ?? "", lastMessageAt: conversation?.lastMessageAt?.toISOString?.() ?? conversation?.lastMessageAt ?? null, unread: Number(conversation?.unread?.[userIdString(req.user.id)]) || 0 });
    }
    conversations.sort((a, b) => String(b.lastMessageAt ?? "").localeCompare(String(a.lastMessageAt ?? "")));
    noStore(res);
    res.json({ conversations });
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat/conversations/:userId/messages", requireUser, async (req, res, next) => {
  try {
    const targetId = validObjectId(req.params.userId);
    if (!targetId) return res.status(400).json({ error: "Invalid player." });
    const db = await getDatabase();
    if (req.user.chatMuted) return res.status(403).json({ error: "Chat is unavailable for this account." });
    const access = await chatTargetAccess(db, req.user.id, targetId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const pairKey = friendPairKey(req.user.id, targetId);
    const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 30));
    const filter = { conversationId: pairKey };
    if (req.query.after && ObjectId.isValid(req.query.after)) filter._id = { $gt: new ObjectId(req.query.after) };
    if (req.query.before && ObjectId.isValid(req.query.before)) filter._id = { $lt: new ObjectId(req.query.before) };
    const [messages, conversation] = await Promise.all([
      typeof db.collection("chat_messages").find === "function"
        ? db.collection("chat_messages").find(filter).sort({ _id: -1 }).limit(limit).toArray()
        : [],
      db.collection("conversations").findOne({ pairKey }),
    ]);
    const targetIdString = userIdString(targetId);
    const readAtValue = access.target.readReceipts !== false ? conversation?.readAt?.[targetIdString] : null;
    const readAtDate = readAtValue ? new Date(readAtValue) : null;
    const now = Date.now();
    const typingRecord = conversation?.typing?.[targetIdString];
    const typing = req.user.typingIndicators !== false
      && access.target.typingIndicators !== false
      && Boolean(typingRecord?.active && typingRecord.updatedAt && now - new Date(typingRecord.updatedAt).getTime() <= 6000);
    const mapped = messages.reverse().map((message) => {
      const senderId = userIdString(message.senderId);
      const createdAt = message.createdAt?.toISOString?.() ?? message.createdAt;
      const messageTime = new Date(createdAt).getTime();
      const readAt = senderId === userIdString(req.user.id)
        && readAtDate && Number.isFinite(readAtDate.getTime()) && Number.isFinite(messageTime) && readAtDate.getTime() >= messageTime
        ? readAtDate.toISOString()
        : null;
      return {
        id: userIdString(message._id), conversationId: pairKey, senderId,
        sender: message.sender ?? (senderId === userIdString(req.user.id) ? req.user.username : access.target.username),
        role: message.role ?? (senderId === userIdString(req.user.id) ? req.user.role : access.target.role),
        text: message.deletedAt ? "Message deleted" : message.text,
        mentions: message.deletedAt ? [] : message.mentions ?? [], replyTo: message.replyTo ?? null,
        attachment: message.deletedAt ? undefined : message.attachment,
        reactions: message.deletedAt ? [] : publicChatReactions(message.reactions, req.user.id),
        createdAt, readAt, editedAt: message.editedAt?.toISOString?.() ?? message.editedAt ?? null, deletedAt: message.deletedAt?.toISOString?.() ?? message.deletedAt ?? null,
      };
    });
    res.json({ messages: mapped, hasMore: messages.length === limit, typing, readAt: readAtDate && Number.isFinite(readAtDate.getTime()) && access.target.readReceipts !== false ? readAtDate.toISOString() : null });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/conversations/:userId/messages", requireSameOrigin, chatMessageLimiter, requireUser, async (req, res, next) => {
  try {
    const targetId = validObjectId(req.params.userId);
    if (!targetId) return res.status(400).json({ error: "Invalid player." });
    const db = await getDatabase();
    if (req.user.chatMuted) return res.status(403).json({ error: "Chat is unavailable for this account." });
    const access = await chatTargetAccess(db, req.user.id, targetId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const text = sanitizeChatText(req.body?.text);
    const attachment = req.body?.attachment;
    if (!text && !attachment) return res.status(400).json({ error: "Write a message or attach an image/video." });
    if (text.length > 300) return res.status(400).json({ error: "Messages are limited to 300 characters." });
    if (!chatAttachmentIsValid(attachment)) return res.status(400).json({ error: "That attachment is not allowed or has not been uploaded." });
    const pairKey = friendPairKey(req.user.id, targetId);
    const moderatedText = moderateChatText(text, await getChatFilterTerms(db));
    const messages = db.collection("chat_messages");
    const recent = typeof messages.find === "function" ? await messages.find({ conversationId: pairKey, senderId: req.user.id, deletedAt: { $exists: false } }).sort({ _id: -1 }).limit(3).toArray() : [];
    if (moderatedText && recent.length >= 3 && recent.every((message) => message.text === moderatedText)) return res.status(429).json({ error: "Please do not repeat the same message." });
    const now = new Date();
    const replyTo = await getReplyPreview(db, req.body?.replyToId, { global: false, conversationId: pairKey });
    const message = { conversationId: pairKey, senderId: req.user.id, sender: req.user.username, role: req.user.role, text: moderatedText, ...(replyTo ? { replyTo } : {}), ...(attachment ? { attachment } : {}), createdAt: now };
    const inserted = await messages.insertOne(message);
    const conversations = db.collection("conversations");
    await conversations.updateOne(
      { pairKey },
      { $set: { pairKey, userIds: [req.user.id, targetId], lastMessageAt: now, lastMessagePreview: moderatedText || "Attachment" }, $inc: { [`unread.${userIdString(targetId)}`]: 1 }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    await db.collection("chat_notifications").insertOne({ recipientId: targetId, senderId: req.user.id, messageId: inserted.insertedId, conversationUserId: req.user.id, kind: "direct", createdAt: now });
    res.status(201).json({ message: { id: inserted.insertedId.toHexString(), conversationId: pairKey, senderId: userIdString(req.user.id), sender: req.user.username, role: req.user.role, text: moderatedText, replyTo, ...(attachment ? { attachment } : {}), createdAt: now.toISOString() } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/conversations/:userId/read", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const targetId = validObjectId(req.params.userId);
    if (!targetId) return res.status(400).json({ error: "Invalid player." });
    const db = await getDatabase();
    const access = await chatTargetAccess(db, req.user.id, targetId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const userId = userIdString(req.user.id);
    const update = { $set: { [`unread.${userId}`]: 0 } };
    if (req.user.readReceipts === false) update.$unset = { [`readAt.${userId}`]: "" };
    else update.$set[`readAt.${userId}`] = new Date();
    await db.collection("conversations").updateOne({ pairKey: friendPairKey(req.user.id, targetId) }, update);
    await db.collection("chat_notifications").updateMany({ recipientId: req.user.id, kind: "direct", conversationUserId: targetId, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/conversations/:userId/typing", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const targetId = validObjectId(req.params.userId);
    if (!targetId) return res.status(400).json({ error: "Invalid player." });
    const db = await getDatabase();
    if (req.user.chatMuted) return res.status(403).json({ error: "Chat is unavailable for this account." });
    const access = await chatTargetAccess(db, req.user.id, targetId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const userId = userIdString(req.user.id);
    await db.collection("conversations").updateOne(
      { pairKey: friendPairKey(req.user.id, targetId) },
      { $set: { [`typing.${userId}`]: { active: Boolean(req.body?.typing) && req.user.typingIndicators !== false, updatedAt: new Date() } } },
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/chat/messages/:id", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid message." });
    const db = await getDatabase();
    const located = await findChatMessage(db, req.params.id);
    if (!located) return res.status(404).json({ error: "Message not found." });
    if (!await canAccessChatMessage(db, located, req.user)) return res.status(403).json({ error: "You cannot edit this message." });
    if (located.message.deletedAt) return res.status(409).json({ error: "Deleted messages cannot be edited." });
    if (!isOwnerEquivalentRole(req.user.role) && userIdString(located.message.senderId) !== userIdString(req.user.id)) return res.status(403).json({ error: "You can only edit your own messages." });
    const text = sanitizeChatText(req.body?.text);
    if (!text) return res.status(400).json({ error: "Write a message first." });
    if (text.length > 300) return res.status(400).json({ error: "Messages are limited to 300 characters." });
    const moderatedText = moderateChatText(text, await getChatFilterTerms(db));
    const editedAt = new Date();
    await db.collection(located.collection).updateOne({ _id: located.message._id }, { $set: { text: moderatedText, editedAt, editedBy: req.user.id } });
    res.json({ message: { id: req.params.id, text: moderatedText, editedAt: editedAt.toISOString() } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/messages/:id/reactions", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid message." });
    const emoji = typeof req.body?.emoji === "string" ? req.body.emoji : "";
    if (!CHAT_REACTION_EMOJIS.has(emoji)) return res.status(400).json({ error: "That reaction is not available." });
    const db = await getDatabase();
    const located = await findChatMessage(db, req.params.id);
    if (!located) return res.status(404).json({ error: "Message not found." });
    if (!await canAccessChatMessage(db, located, req.user) || located.message.deletedAt) return res.status(403).json({ error: "You cannot react to this message." });
    const reactions = located.message.reactions && typeof located.message.reactions === "object" && !Array.isArray(located.message.reactions) ? { ...located.message.reactions } : {};
    const viewer = userIdString(req.user.id);
    const users = Array.isArray(reactions[emoji]) ? reactions[emoji].filter((id) => id !== viewer) : [];
    const reacted = !Array.isArray(reactions[emoji]) || !reactions[emoji].includes(viewer);
    reactions[emoji] = reacted ? [...users, viewer] : users;
    if (!reactions[emoji].length) delete reactions[emoji];
    await db.collection(located.collection).updateOne({ _id: located.message._id }, { $set: { reactions } });
    res.json({ reactions: publicChatReactions(reactions, req.user.id) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/chat/messages/:id", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid message." });
    const db = await getDatabase();
    const located = await findChatMessage(db, req.params.id);
    if (!located) return res.status(404).json({ error: "Message not found." });
    if (!await canAccessChatMessage(db, located, req.user)) return res.status(403).json({ error: "You cannot delete this message." });
    const canModerateGlobal = located.global && (isOwnerEquivalentRole(req.user.role) || req.user.role === "admin" || req.user.role === "moderator");
    if (!canModerateGlobal && userIdString(located.message.senderId) !== userIdString(req.user.id)) return res.status(403).json({ error: "You can only delete your own messages." });
    await db.collection(located.collection).updateOne({ _id: located.message._id }, { $set: { deletedAt: new Date(), deletedBy: req.user.id, reactions: {} } });
    if (isOwnerEquivalentRole(req.user.role)) await db.collection("chat_audit").insertOne({ action: "delete", messageId: located.message._id, actorId: req.user.id, targetUserId: located.message.senderId, createdAt: new Date() });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/messages/:id/report", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid message." });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "Reported by player";
    const db = await getDatabase();
    const located = await findChatMessage(db, req.params.id);
    if (!located || located.message.deletedAt) return res.status(404).json({ error: "Message not found." });
    if (!await canAccessChatMessage(db, located, req.user)) return res.status(403).json({ error: "You cannot report this message." });
    if (userIdString(located.message.senderId) === userIdString(req.user.id)) return res.status(400).json({ error: "You cannot report your own message." });
    const reporterId = req.user.id;
    await db.collection("chat_reports").insertOne({
      messageId: located.message._id,
      messageCollection: located.collection,
      global: located.global,
      reporterId,
      reporter: req.user.username,
      targetUserId: located.message.senderId,
      sender: located.message.sender ?? "Unknown pilot",
      messageText: located.message.text ?? "",
      reason: reason || "Reported by player",
      createdAt: new Date(),
      status: "open",
    });
    res.status(201).json({ reported: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/chat/reports", requirePermission("moderation"), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const reports = typeof db.collection("chat_reports").find === "function" ? await db.collection("chat_reports").find({ status: "open" }).sort({ createdAt: -1 }).limit(100).toArray() : [];
    res.json({ reports: reports.map((report) => ({
      id: userIdString(report._id),
      messageId: userIdString(report.messageId),
      senderId: userIdString(report.targetUserId),
      sender: typeof report.sender === "string" ? report.sender : "Unknown pilot",
      reporter: typeof report.reporter === "string" ? report.reporter : "Unknown pilot",
      text: typeof report.messageText === "string" ? report.messageText : "Message details are unavailable for this older report.",
      reason: typeof report.reason === "string" ? report.reason : "Reported by player",
      global: Boolean(report.global),
      createdAt: report.createdAt?.toISOString?.() ?? report.createdAt ?? null,
    })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/chat-filter", requireOwner, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const terms = await getChatFilterTerms(db);
    noStore(res);
    res.json({ terms: terms.map(publicChatFilterTerm), builtInCount: terms.filter((term) => term.builtIn).length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/chat-filter", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const term = normalizeChatFilterTerm(req.body?.term);
    if (term.length < 2 || term.length > 80) return res.status(400).json({ error: "Enter a word or short phrase from 2 to 80 characters." });
    const category = typeof req.body?.category === "string" && req.body.category.trim() ? req.body.category.trim().slice(0, 30) : "Custom";
    const db = await getDatabase();
    const allTerms = await getChatFilterTerms(db);
    if (allTerms.some((entry) => entry.term === term)) return res.status(409).json({ error: "That word or phrase is already blocked." });
    const customTerms = await getStoredChatFilterTerms(db);
    const entry = { id: `custom-${crypto.randomBytes(10).toString("hex")}`, term, category, builtIn: false };
    await saveSetting(db, "chat_filter", { terms: [...customTerms, entry].map(({ id, term: value, category: label }) => ({ id, term: value, category: label })) }, req.user.id);
    res.status(201).json({ term: publicChatFilterTerm(entry) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/chat-filter/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    if (typeof req.params.id !== "string" || !req.params.id.startsWith("custom-")) return res.status(400).json({ error: "Built-in blocked terms cannot be removed." });
    const db = await getDatabase();
    const customTerms = await getStoredChatFilterTerms(db);
    if (!customTerms.some((entry) => entry.id === req.params.id)) return res.status(404).json({ error: "Blocked term not found." });
    await saveSetting(db, "chat_filter", { terms: customTerms.filter((entry) => entry.id !== req.params.id).map(({ id, term, category }) => ({ id, term, category })) }, req.user.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

async function setChatMute(req, res, next, muted) {
  try {
    const targetId = validObjectId(req.params.id);
    if (!targetId) return res.status(400).json({ error: "Invalid player." });
    const db = await getDatabase();
    const result = await db.collection("users").updateOne({ _id: targetId, role: { $in: USER_ROLES.filter((role) => role !== "owner") }, banned: { $ne: true } }, { $set: { chatMuted: muted } });
    if (!result.matchedCount) return res.status(404).json({ error: "Player not found." });
    await db.collection("chat_audit").insertOne({ action: muted ? "mute" : "unmute", actorId: req.user.id, targetUserId: targetId, reason: typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : "", createdAt: new Date() });
    res.json({ chatMuted: muted });
  } catch (error) {
    next(error);
  }
}

app.post("/api/admin/users/:id/chat-mute", requireSameOrigin, requirePermission("moderation"), (req, res, next) => setChatMute(req, res, next, true));
app.post("/api/admin/users/:id/chat-unmute", requireSameOrigin, requirePermission("moderation"), (req, res, next) => setChatMute(req, res, next, false));

app.post("/api/chat/uploads", requireSameOrigin, chatUploadLimiter, requireUser, express.raw({ type: ["image/*", "video/*"], limit: "25mb" }), async (req, res, next) => {
  try {
    if (req.user.chatMuted) return res.status(403).json({ error: "Chat is unavailable for this account." });
    const db = await getDatabase();
    const targetId = validObjectId(String(req.headers["x-chat-user-id"] ?? ""));
    if (!targetId) return res.status(400).json({ error: "Choose a chat recipient before uploading." });
    const access = await chatTargetAccess(db, req.user.id, targetId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const body = Buffer.isBuffer(req.body) ? req.body : null;
    const contentType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"].split(";", 1)[0].toLowerCase() : "";
    const allowedImages = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const allowedVideos = new Set(["video/mp4", "video/webm"]);
    const kind = allowedVideos.has(contentType) ? "video" : allowedImages.has(contentType) ? (contentType === "image/gif" ? "gif" : "image") : "";
    const maxBytes = kind === "video" ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!body || !kind || body.byteLength < 1 || body.byteLength > maxBytes) return res.status(400).json({ error: "That file type or size is not allowed." });
    const rawName = typeof req.headers["x-file-name"] === "string" ? req.headers["x-file-name"] : "attachment";
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "attachment";
    const blobOrigin = process.env.VERCEL_BLOB_PUBLIC_URL || process.env.BLOB_PUBLIC_URL;
    let url;
    if (process.env.BLOB_READ_WRITE_TOKEN && blobOrigin) {
      const blob = await put(`jacer-chat/${userIdString(req.user.id)}/${Date.now()}-${safeName}`, body, {
        access: "public",
        addRandomSuffix: true,
        contentType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      url = blob.url;
    } else {
      // MongoDB is already required for chat. GridFS keeps attachments private
      // and makes direct-message uploads work on local servers and Vercel even
      // when a separate Blob store has not been connected.
      const bucket = new GridFSBucket(db, { bucketName: "chat_uploads" });
      const upload = bucket.openUploadStream(safeName, {
        contentType,
        metadata: { uploaderId: req.user.id, recipientId: targetId, kind, bytes: body.byteLength },
      });
      await new Promise((resolve, reject) => {
        upload.once("error", reject);
        upload.once("finish", resolve);
        upload.end(body);
      });
      url = `/api/chat/uploads/${upload.id.toHexString()}`;
    }
    noStore(res);
    res.status(201).json({ attachment: { kind, contentType, bytes: body.byteLength, url } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat/uploads/:id", requireUser, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).end();
    const db = await getDatabase();
    const bucket = new GridFSBucket(db, { bucketName: "chat_uploads" });
    const fileId = new ObjectId(req.params.id);
    const file = await bucket.find({ _id: fileId }).next();
    if (!file) return res.status(404).end();
    const uploaderId = userIdString(file.metadata?.uploaderId);
    const recipientId = userIdString(file.metadata?.recipientId);
    const viewerId = userIdString(req.user.id);
    if (!uploaderId || !recipientId || (viewerId !== uploaderId && viewerId !== recipientId)) return res.status(403).end();
    res.setHeader("Content-Type", typeof file.contentType === "string" ? file.contentType : "application/octet-stream");
    res.setHeader("Content-Length", String(file.length));
    res.setHeader("Cache-Control", "private, max-age=3600");
    bucket.openDownloadStream(fileId).on("error", next).pipe(res);
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/password", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;
    if (typeof currentPassword !== "string" || !isValidPassword(newPassword)) {
      return res.status(400).json({ error: "Provide the current password and a valid 10-128 character new password." });
    }
    const db = await getDatabase();
    const users = db.collection("users");
    const user = await users.findOne({ _id: req.user.id }, { projection: { passwordHash: 1, role: 1 } });
    if (isOwnerEquivalentRole(user?.role)) return res.status(403).json({ error: "Owner passwords are managed through deployment account settings." });
    if (!user || !await argon2.verify(user.passwordHash ?? dummyPasswordHash, currentPassword)) {
      return res.status(401).json({ error: "The current password is incorrect." });
    }
    const passwordHash = await argon2.hash(newPassword, passwordHashOptions);
    const result = await users.updateOne(
      { _id: req.user.id, role: { $ne: "owner" } },
      { $set: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false } },
    );
    if (!result.matchedCount) return res.status(403).json({ error: "Owner passwords are managed through deployment account settings." });
    await db.collection("user_sessions").deleteMany({ userId: req.user.id });
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/recovery-code", requireSameOrigin, requireUser, async (req, res, next) => {
  noStore(res);
  try {
    const currentPassword = req.body?.currentPassword;
    if (typeof currentPassword !== "string") {
      return res.status(400).json({ error: "Enter your current password to make a recovery code." });
    }
    const db = await getDatabase();
    const users = db.collection("users");
    const user = await users.findOne({ _id: req.user.id }, { projection: { passwordHash: 1, role: 1 } });
    if (isOwnerEquivalentRole(user?.role)) return res.status(403).json({ error: "Recovery codes are unavailable for owner accounts." });
    if (!user || !await argon2.verify(user.passwordHash ?? dummyPasswordHash, currentPassword)) {
      return res.status(401).json({ error: "The current password is incorrect." });
    }
    const code = recoveryCode();
    const recoveryCodeCreatedAt = new Date();
    const recoveryCodeHash = await argon2.hash(normalizeRecoveryCode(code), passwordHashOptions);
    const result = await users.updateOne(
      { _id: req.user.id, role: { $ne: "owner" } },
      { $set: { recoveryCodeHash, recoveryCodeCreatedAt } },
    );
    if (!result.matchedCount) return res.status(403).json({ error: "Recovery codes are unavailable for owner accounts." });
    res.json({ recoveryCode: code });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/presence", requirePermission("moderation"), async (_req, res, next) => {
  try {
    noStore(res);
    const db = await getDatabase();
    const accounts = await db.collection("users")
      .find({}, { projection: { usernameNormalized: 1, banned: 1, appearOffline: 1 } })
      .sort({ usernameNormalized: 1 })
      .limit(200)
      .toArray();
    const onlineUserIds = await getActiveUserIds(db, accounts.map((user) => user._id));
    res.json({
      users: accounts.map((user) => ({
        id: user._id.toHexString(),
        isOnline: !user.banned && !user.appearOffline && onlineUserIds.has(user._id.toHexString()),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", requirePermission("moderation"), async (_req, res, next) => {
  try {
    noStore(res);
    const db = await getDatabase();
    const users = await db.collection("users")
      .find({}, { projection: {
        username: 1,
        usernameNormalized: 1,
        role: 1,
        banned: 1,
        loginLocked: 1,
        chatMuted: 1,
        appearOffline: 1,
        createdAt: 1,
        usernameChangedAt: 1,
        lastLoginAt: 1,
        lastSeenIpHash: 1,
        emailHash: 1,
        emailMasked: 1,
        passwordChangedAt: 1,
        wipeVersion: 1,
        recoveryCodeHash: 1,
        recoveryCodeCreatedAt: 1,
      } })
      .sort({ usernameNormalized: 1 })
      .limit(200)
      .toArray();
    const onlineUserIds = await getActiveUserIds(db, users.map((user) => user._id));
    const ipHashes = users.map((user) => user.lastSeenIpHash).filter((hash) => typeof hash === "string" && hash.length > 0);
    const ipBanCollection = db.collection("ip_bans");
    const activeIpBans = ipHashes.length && typeof ipBanCollection.find === "function"
      ? await ipBanCollection.find({ _id: { $in: ipHashes }, active: { $ne: false } }, { projection: { _id: 1 } }).toArray()
      : [];
    const activeIpBanHashes = new Set(activeIpBans.map((ban) => String(ban._id)));
    const emailHashes = users.map((user) => user.emailHash).filter((hash) => typeof hash === "string" && hash.length > 0);
    const emailBanCollection = db.collection("email_bans");
    const activeEmailBans = emailHashes.length && typeof emailBanCollection.find === "function"
      ? await emailBanCollection.find({ _id: { $in: emailHashes }, active: { $ne: false } }, { projection: { _id: 1 } }).toArray()
      : [];
    const activeEmailBanHashes = new Set(activeEmailBans.map((ban) => String(ban._id)));
    const progressRecords = await db.collection("player_progress")
      .find({ _id: { $in: users.map((user) => user._id) } }, { projection: { data: 1 } })
      .toArray();
    const progressByUser = new Map(progressRecords.map((record) => {
      const validated = validatePlayerProgress(record.data) ?? {};
      const safeProgress = Object.fromEntries(Object.entries(validated).filter(([key]) =>
        key !== "orbit-last-level" && !/(password|recovery|hash|token|secret)/i.test(key)));
      return [record._id.toHexString(), safeProgress];
    }));
    const recoveryLocks = await db.collection("account_recovery_attempts")
      .find({ _id: { $in: users.map((user) => user.usernameNormalized) } }, {
        projection: { attempts: 1, lockedUntil: 1, windowExpiresAt: 1 },
      })
      .toArray();
    const recoveryByUsername = new Map(recoveryLocks.map((lock) => [lock._id, lock]));
    res.json({
      users: users.map((user) => ({
        id: user._id.toHexString(),
        username: user.username,
        role: user.role,
        banned: Boolean(user.banned),
        loginLocked: Boolean(user.loginLocked),
        chatMuted: Boolean(user.chatMuted),
        status: user.banned ? "banned" : user.loginLocked ? "locked" : "active",
        isOnline: !user.banned && !user.loginLocked && !user.appearOffline && onlineUserIds.has(user._id.toHexString()),
        createdAt: user.createdAt,
        usernameChangedAt: user.usernameChangedAt ?? null,
        lastLoginAt: user.lastLoginAt ?? null,
        lastSeenIpAvailable: Boolean(user.lastSeenIpHash),
        ipBanned: Boolean(user.lastSeenIpHash && activeIpBanHashes.has(user.lastSeenIpHash)),
        emailMasked: user.emailMasked ?? null,
        emailSet: Boolean(user.emailHash),
        emailBanned: Boolean(user.emailHash && activeEmailBanHashes.has(user.emailHash)),
        passwordChangedAt: user.passwordChangedAt ?? null,
        wipeVersion: user.wipeVersion ?? 0,
        progress: progressByUser.get(user._id.toHexString()) ?? {},
        hasRecoveryCode: Boolean(user.recoveryCodeHash),
        recoveryCodeCreatedAt: user.recoveryCodeCreatedAt ?? null,
        recoveryAttempts: recoveryByUsername.get(user.usernameNormalized)?.attempts ?? 0,
        recoveryLockedUntil: recoveryByUsername.get(user.usernameNormalized)?.lockedUntil ?? null,
        recoveryLockState: recoveryByUsername.get(user.usernameNormalized)?.lockedUntil > new Date() ? "locked" : "clear",
      })),
    });
  } catch (error) {
    next(error);
  }
});

async function getTargetManagedUser(db, rawId, actorRole = "owner") {
  const userId = validObjectId(rawId);
  if (!userId) return { error: { status: 400, message: "Invalid account." } };
  const user = await db.collection("users").findOne(
    { _id: userId },
    { projection: { role: 1, username: 1, usernameNormalized: 1, lastSeenIpHash: 1, emailHash: 1, emailMasked: 1, banned: 1, loginLocked: 1 } },
  );
  if (!user) return { error: { status: 404, message: "Account not found." } };
  if (isOwnerEquivalentRole(user.role)) return { error: { status: 403, message: "Owner accounts are protected from player management." } };
  if (actorRole === "moderator" && ["admin", "moderator", "level-maker"].includes(user.role)) {
    return { error: { status: 403, message: "Moderators can only take action on player accounts." } };
  }
  return { user, userId };
}

app.get("/api/admin/moderation-settings", requirePermission("moderation"), async (_req, res, next) => {
  try {
    noStore(res);
    res.json({ settings: await getModerationSettings(await getDatabase()) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/moderation-settings", requireSameOrigin, requirePermission("moderation"), async (req, res, next) => {
  try {
    const settings = validateModerationSettings(req.body?.settings);
    if (!settings) return res.status(400).json({ error: "Moderation settings contain an invalid value." });
    const db = await getDatabase();
    await db.collection("game_settings").updateOne(
      { _id: "moderation_settings" },
      { $set: { value: settings, updatedAt: new Date(), updatedBy: req.user.id } },
      { upsert: true },
    );
    moderationSettingsCache = { ...settings };
    await recordModerationLog(db, {
      action: "Moderation settings updated",
      reason: "Shared anti-bot and account-protection rules were changed.",
      actorId: req.user.id,
      actorUsername: req.user.username,
      targetUserId: null,
      targetUsername: "Game moderation settings",
    });
    noStore(res);
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/moderation-log", requirePermission("moderation"), async (_req, res, next) => {
  try {
    noStore(res);
    const db = await getDatabase();
    const collection = db.collection("moderation_log");
    const entries = typeof collection.find === "function"
      ? await collection.find({}).sort({ createdAt: -1 }).limit(250).toArray()
      : [];
    res.json({ entries: entries.map((entry) => ({
      id: userIdString(entry._id),
      action: entry.action,
      reason: entry.reason,
      actor: entry.actorUsername ?? "System",
      target: entry.targetUsername ?? "Unknown player",
      createdAt: entry.createdAt ?? null,
    })) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/ban", requireSameOrigin, requirePermission("moderation"), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id, req.user.role);
    if (target.error) return res.status(target.error.status).json({ error: target.error.message });
    const banned = req.body?.banned !== false;
    const reason = moderationReason(req.body?.reason, banned ? "No reason supplied." : "Ban removed.");
    await db.collection("users").updateOne({ _id: target.userId }, { $set: { banned } });
    if (banned) await db.collection("user_sessions").deleteMany({ userId: target.userId });
    await recordModerationLog(db, {
      action: banned ? "Account banned" : "Account unbanned",
      reason,
      actorId: req.user.id,
      actorUsername: req.user.username,
      targetUserId: target.userId,
      targetUsername: target.user.username,
    });
    res.json({ ok: true, banned });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/warn", requireSameOrigin, requirePermission("moderation"), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id, req.user.role);
    if (target.error) return res.status(target.error.status).json({ error: target.error.message });
    const reason = moderationReason(req.body?.reason, "A moderator issued a warning.");
    const filterTerms = await getChatFilterTerms(db);
    const result = await db.collection("owner_messages").insertOne({
      title: "Account warning",
      body: moderateChatText(reason, filterTerms),
      type: "warning",
      userId: target.userId,
      createdAt: new Date(),
      createdBy: req.user.id,
    });
    await recordModerationLog(db, {
      action: "Account warned",
      reason,
      actorId: req.user.id,
      actorUsername: req.user.username,
      targetUserId: target.userId,
      targetUsername: target.user.username,
    });
    res.status(201).json({ ok: true, warningId: userIdString(result.insertedId) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/login-lock", requireSameOrigin, requirePermission("moderation"), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id, req.user.role);
    if (target.error) return res.status(target.error.status).json({ error: target.error.message });
    const locked = req.body?.locked !== false;
    const reason = moderationReason(req.body?.reason, locked ? "No reason supplied." : "Login lock removed.");
    await db.collection("users").updateOne({ _id: target.userId }, { $set: { loginLocked: locked } });
    if (locked) await db.collection("user_sessions").deleteMany({ userId: target.userId });
    await recordModerationLog(db, {
      action: locked ? "Account login locked" : "Account login unlocked",
      reason,
      actorId: req.user.id,
      actorUsername: req.user.username,
      targetUserId: target.userId,
      targetUsername: target.user.username,
    });
    res.json({ ok: true, loginLocked: locked });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/ip-ban", requireSameOrigin, requirePermission("moderation"), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id, req.user.role);
    if (target.error) return res.status(target.error.status).json({ error: target.error.message });
    if (!target.user.lastSeenIpHash) return res.status(400).json({ error: "This account has no recorded login network yet." });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "Owner network ban";
    const now = new Date();
    await db.collection("ip_bans").updateOne(
      { _id: target.user.lastSeenIpHash },
      { $set: { active: true, reason: reason || "Owner network ban", bannedAt: now, bannedBy: req.user.id }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    const affectedUsers = typeof db.collection("users").find === "function"
      ? await db.collection("users").find({ lastSeenIpHash: target.user.lastSeenIpHash }, { projection: { _id: 1 } }).toArray()
      : [];
    const affectedIds = affectedUsers.map((user) => user._id);
    await db.collection("user_sessions").deleteMany({ $or: [{ ipHash: target.user.lastSeenIpHash }, ...(affectedIds.length ? [{ userId: { $in: affectedIds } }] : [])] });
    await recordSecurityEvent(db, { type: "ip_ban", actorId: req.user.id, targetUserId: target.userId, ipHash: target.user.lastSeenIpHash, reason: reason || "Owner network ban" });
    await recordModerationLog(db, { action: "Login network banned", reason: reason || "Owner network ban", actorId: req.user.id, actorUsername: req.user.username, targetUserId: target.userId, targetUsername: target.user.username });
    res.json({ ok: true, ipBanned: true, affectedAccounts: affectedIds.length });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id/ip-ban", requireSameOrigin, requirePermission("moderation"), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id, req.user.role);
    if (target.error) return res.status(target.error.status).json({ error: target.error.message });
    if (!target.user.lastSeenIpHash) return res.status(400).json({ error: "This account has no recorded login network yet." });
    await db.collection("ip_bans").updateOne(
      { _id: target.user.lastSeenIpHash },
      { $set: { active: false, unbannedAt: new Date(), unbannedBy: req.user.id } },
    );
    await recordSecurityEvent(db, { type: "ip_unban", actorId: req.user.id, targetUserId: target.userId, ipHash: target.user.lastSeenIpHash });
    await recordModerationLog(db, { action: "Login network unbanned", reason: "Network ban removed.", actorId: req.user.id, actorUsername: req.user.username, targetUserId: target.userId, targetUsername: target.user.username });
    res.json({ ok: true, ipBanned: false });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/email-ban", requireSameOrigin, requirePermission("moderation"), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id, req.user.role);
    if (target.error) return res.status(target.error.status).json({ error: target.error.message });
    if (!target.user.emailHash) return res.status(400).json({ error: "This account does not have an email address on file." });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "Owner email ban";
    const now = new Date();
    await db.collection("email_bans").updateOne(
      { _id: target.user.emailHash },
      { $set: { active: true, emailMasked: target.user.emailMasked ?? null, reason: reason || "Owner email ban", bannedAt: now, bannedBy: req.user.id }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    const affectedUsers = typeof db.collection("users").find === "function"
      ? await db.collection("users").find({ emailHash: target.user.emailHash }, { projection: { _id: 1 } }).toArray()
      : [];
    const affectedIds = affectedUsers.map((user) => user._id);
    if (affectedIds.length) await db.collection("user_sessions").deleteMany({ userId: { $in: affectedIds } });
    await recordSecurityEvent(db, { type: "email_ban", actorId: req.user.id, targetUserId: target.userId, emailHash: target.user.emailHash, reason: reason || "Owner email ban" });
    await recordModerationLog(db, { action: "Email banned", reason: reason || "Owner email ban", actorId: req.user.id, actorUsername: req.user.username, targetUserId: target.userId, targetUsername: target.user.username });
    res.json({ ok: true, emailBanned: true, affectedAccounts: affectedIds.length });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id/email-ban", requireSameOrigin, requirePermission("moderation"), async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id, req.user.role);
    if (target.error) return res.status(target.error.status).json({ error: target.error.message });
    if (!target.user.emailHash) return res.status(400).json({ error: "This account does not have an email address on file." });
    await db.collection("email_bans").updateOne(
      { _id: target.user.emailHash },
      { $set: { active: false, unbannedAt: new Date(), unbannedBy: req.user.id } },
    );
    await recordSecurityEvent(db, { type: "email_unban", actorId: req.user.id, targetUserId: target.userId, emailHash: target.user.emailHash });
    await recordModerationLog(db, { action: "Email unbanned", reason: "Email ban removed.", actorId: req.user.id, actorUsername: req.user.username, targetUserId: target.userId, targetUsername: target.user.username });
    res.json({ ok: true, emailBanned: false });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id, req.user.role);
    if (target.error) return res.status(target.error.status).json({ error: target.error.message });
    const { user, userId } = target;
    const conversations = typeof db.collection("conversations").find === "function"
      ? await db.collection("conversations").find({ userIds: userId }, { projection: { pairKey: 1 } }).toArray()
      : [];
    const conversationKeys = conversations.map((conversation) => conversation.pairKey).filter((key) => typeof key === "string");
    const messages = typeof db.collection("chat_messages").find === "function"
      ? await db.collection("chat_messages").find({ $or: [{ senderId: userId }, { conversationId: { $in: conversationKeys } }] }, { projection: { _id: 1 } }).toArray()
      : [];
    const messageIds = messages.map((message) => message._id);

    await Promise.all([
      db.collection("user_sessions").deleteMany({ userId }),
      db.collection("player_progress").deleteOne({ _id: userId }),
      db.collection("leaderboard_entries").deleteMany({ userId }),
      db.collection("profile_backups").deleteMany({ userId }),
      db.collection("code_redemptions").deleteMany({ userId }),
      db.collection("code_redemption_logs").deleteMany({ userId }),
      db.collection("owner_messages").deleteMany({ userId }),
      db.collection("message_deliveries").deleteMany({ userId }),
      db.collection("friendships").deleteMany({ userIds: userId }),
      db.collection("user_blocks").deleteMany({ $or: [{ blockerId: userId }, { blockedId: userId }] }),
      db.collection("conversations").deleteMany({ userIds: userId }),
      db.collection("global_chat_messages").deleteMany({ senderId: userId }),
      db.collection("chat_reports").deleteMany({ $or: [{ reporterId: userId }, ...(messageIds.length ? [{ messageId: { $in: messageIds } }] : [])] }),
      db.collection("chat_audit").deleteMany({ $or: [{ actorId: userId }, { targetUserId: userId }] }),
      db.collection("account_recovery_attempts").deleteOne({ _id: user.usernameNormalized }),
      db.collection("security_events").deleteMany({ $or: [{ userId }, { targetUserId: userId }] }),
      ...(messageIds.length ? [db.collection("chat_messages").deleteMany({ _id: { $in: messageIds } })] : []),
      db.collection("users").deleteOne({ _id: userId, role: { $ne: "owner" } }),
    ]);
    await recordSecurityEvent(db, { type: "account_deleted", actorId: req.user.id, targetUserId: userId, targetUsername: user.username });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/users/:id", requireSameOrigin, requirePermission("moderation"), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid account." });
    const db = await getDatabase();
    const userId = new ObjectId(req.params.id);
    const target = await db.collection("users").findOne({ _id: userId }, { projection: { role: 1, emailHash: 1, emailMasked: 1 } });
    if (!target) return res.status(404).json({ error: "Account not found." });
    if (target.role === "owner") return res.status(403).json({ error: "Owner accounts cannot be changed from player management." });
    if (req.user.role === "moderator" && ["admin", "moderator", "level-maker"].includes(target.role)) {
      return res.status(403).json({ error: "Moderators can only take action on player accounts." });
    }
    // Moderators and admins may suspend/restore an account, but only the owner
    // can edit identity, role, email, or progress (all of which can grant or
    // alter valuable game data).
    if (!isOwnerEquivalentRole(req.user.role)) {
      const allowedKeys = new Set(["banned"]);
      const suppliedKeys = Object.keys(req.body ?? {});
      if (suppliedKeys.some((key) => !allowedKeys.has(key))) {
        return res.status(403).json({ error: "Only the owner can edit player profile data or roles." });
      }
    }
    const updates = {};
    const unsets = {};
    let emailMasked = target.emailMasked ?? null;
    if (req.body?.username !== undefined) {
      const username = normalizeUsername(req.body.username);
      if (!username) return res.status(400).json({ error: "Use a 3-20 character username (letters, numbers, underscore)." });
      updates.username = username.display;
      updates.usernameNormalized = username.normalized;
      updates.usernameChangedAt = new Date();
    }
    if (req.body?.banned !== undefined) {
      if (typeof req.body.banned !== "boolean") return res.status(400).json({ error: "Banned must be true or false." });
      updates.banned = req.body.banned;
    }
    if (req.body?.role !== undefined) {
      if (!USER_ROLES.includes(req.body.role) || ["owner", "developer"].includes(req.body.role)) {
        return res.status(400).json({ error: "Role must be player, tester, moderator, admin, or level-maker; owner access cannot be assigned here." });
      }
      updates.role = req.body.role;
    }
    if (req.body?.email !== undefined) {
      const suppliedEmail = req.body.email;
      if (suppliedEmail === null || (typeof suppliedEmail === "string" && suppliedEmail.trim() === "")) {
        unsets.emailHash = "";
        unsets.emailMasked = "";
        emailMasked = null;
      } else {
        const email = normalizeEmail(suppliedEmail);
        if (!email) return res.status(400).json({ error: "Enter a valid email address or leave it blank to clear the saved email." });
        const emailHash = hashEmail(email);
        if (emailHash && await isEmailBanned(db, emailHash)) return res.status(403).json({ error: "That email address is permanently banned." });
        updates.emailHash = emailHash;
        updates.emailMasked = maskEmail(email);
        emailMasked = updates.emailMasked;
      }
    }
    let progress;
    if (req.body?.progress !== undefined) {
      progress = validatePlayerProgress(req.body.progress);
      if (!progress) return res.status(400).json({ error: "Player progress is invalid or exceeds the allowed size." });
    }
    if (Object.keys(updates).length || Object.keys(unsets).length) {
      try {
        const updateDocument = {};
        if (Object.keys(updates).length) updateDocument.$set = updates;
        if (Object.keys(unsets).length) updateDocument.$unset = unsets;
        await db.collection("users").updateOne({ _id: userId }, updateDocument);
      } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: "That username or email is already in use." });
        throw error;
      }
    }
    if (progress !== undefined) {
      const progressCollection = db.collection("player_progress");
      const existingProgress = await progressCollection.findOne({ _id: userId }, { projection: { "data.orbit-last-level": 1 } });
      if (typeof existingProgress?.data?.["orbit-last-level"] === "string") {
        progress["orbit-last-level"] = existingProgress.data["orbit-last-level"];
      }
      const result = await writePlayerProgress(progressCollection, userId, progress, null, true);
      if (!result.progress) return res.status(409).json({ error: "Player data changed concurrently. Retry saving the profile." });
    }
    if (updates.banned === true) await db.collection("user_sessions").deleteMany({ userId });
    if (updates.role) await db.collection("user_sessions").deleteMany({ userId });
    if (updates.role && updates.role !== "player") {
      await db.collection("leaderboard_entries").deleteMany({ userId });
    }
    res.json({ ok: true, emailMasked, emailSet: Boolean(emailMasked) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/password", requireSameOrigin, requireOwner, async (req, res, next) => {
  noStore(res);
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid account." });
    const db = await getDatabase();
    const users = db.collection("users");
    const user = await users.findOne({ _id: new ObjectId(req.params.id) }, { projection: { role: 1 } });
    if (!user) return res.status(404).json({ error: "Account not found." });
    if (user.role === "owner") return res.status(403).json({ error: "Owner accounts cannot be reset here." });
    const generatedPassword = req.body?.newPassword === undefined
      ? temporaryPassword()
      : null;
    const newPassword = generatedPassword ?? req.body.newPassword;
    if (!isValidPassword(newPassword)) return res.status(400).json({ error: "Password must be 10-128 characters." });
    const passwordHash = await argon2.hash(newPassword, passwordHashOptions);
    const updated = await users.updateOne(
      { _id: user._id, role: { $ne: "owner" } },
      { $set: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: true } },
    );
    if (!updated.matchedCount) return res.status(403).json({ error: "Owner accounts cannot be reset here." });
    await db.collection("user_sessions").deleteMany({ userId: user._id });
    if (generatedPassword) {
      noStore(res);
      return res.json({ ok: true, temporaryPassword: generatedPassword });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/recovery-code", requireSameOrigin, requireOwner, async (req, res, next) => {
  noStore(res);
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid account." });
    const db = await getDatabase();
    const users = db.collection("users");
    const user = await users.findOne({ _id: new ObjectId(req.params.id) }, { projection: { role: 1 } });
    if (!user) return res.status(404).json({ error: "Account not found." });
    if (user.role === "owner") return res.status(403).json({ error: "Owner accounts cannot use recovery codes." });
    const code = recoveryCode();
    const recoveryCodeCreatedAt = new Date();
    const recoveryCodeHash = await argon2.hash(normalizeRecoveryCode(code), passwordHashOptions);
    const updated = await users.updateOne(
      { _id: user._id, role: { $ne: "owner" } },
      { $set: { recoveryCodeHash, recoveryCodeCreatedAt } },
    );
    if (!updated.matchedCount) return res.status(403).json({ error: "Owner accounts cannot use recovery codes." });
    res.json({ recoveryCode: code });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id/recovery-lock", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid account." });
    const db = await getDatabase();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.params.id) }, { projection: { role: 1, usernameNormalized: 1 } });
    if (!user) return res.status(404).json({ error: "Account not found." });
    if (user.role === "owner") return res.status(403).json({ error: "Owner recovery locks cannot be cleared here." });
    await db.collection("account_recovery_attempts").deleteOne({ _id: user.usernameNormalized });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users/:id/backups", requireOwner, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid account." });
    const userId = new ObjectId(req.params.id);
    const user = await (await getDatabase()).collection("users").findOne(
      { _id: userId },
      { projection: { role: 1 } },
    );
    if (!user) return res.status(404).json({ error: "Account not found." });
    if (user.role === "owner") return res.status(403).json({ error: "Owner profiles cannot be restored here." });
    const backups = await (await getDatabase()).collection("profile_backups")
      .find(
        { userId, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        { projection: { categories: 1, createdAt: 1 } },
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .toArray();
    res.json({
      backups: backups.map((backup) => ({
        id: backup._id.toHexString(),
        categories: backup.categories,
        createdAt: backup.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/wipe", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid account." });
    const categories = req.body?.categories;
    const allowedCategories = new Set(["progress", "cosmetics", "leaderboard", "portalsCooldowns"]);
    if (!Array.isArray(categories) || categories.length < 1
      || categories.some((category) => !allowedCategories.has(category))
      || new Set(categories).size !== categories.length) {
      return res.status(400).json({ error: "Select one or more valid wipe categories." });
    }
    const db = await getDatabase();
    const users = db.collection("users");
    const userId = new ObjectId(req.params.id);
    const user = await users.findOne({ _id: userId }, { projection: { role: 1, username: 1 } });
    if (!user) return res.status(404).json({ error: "Account not found." });
    if (user.role === "owner") return res.status(403).json({ error: "Owner profiles cannot be wiped." });
    const wipeProgress = categories.some((category) => category !== "leaderboard");
    const saved = wipeProgress ? await db.collection("player_progress").findOne({ _id: userId }) : null;
    const currentProgress = saved?.data ?? {};
    const affectedProgress = {};
    const remainingProgress = { ...currentProgress };
    for (const [key, value] of Object.entries(currentProgress)) {
      const isCosmetic = ["orbit-ship-color", "orbit-avatar", "orbit-trail"].includes(key);
      const isPortalOrCooldown = /portal|cooldown|orbit-key-|secret-unlocked/i.test(key);
      const selected = (isCosmetic && categories.includes("cosmetics"))
        || (isPortalOrCooldown && categories.includes("portalsCooldowns"))
        || (!isCosmetic && !isPortalOrCooldown && categories.includes("progress"));
      if (selected) {
        affectedProgress[key] = value;
        delete remainingProgress[key];
      }
    }
    const leaderboardEntries = categories.includes("leaderboard")
      ? await db.collection("leaderboard_entries").find({ userId }).toArray()
      : undefined;
    const now = new Date();
    const backup = {
      userId,
      username: user.username,
      categories,
      affectedProgress: Object.keys(affectedProgress).length ? affectedProgress : undefined,
      leaderboardEntries,
      createdAt: now,
      createdBy: req.user.id,
    };
    const inserted = await db.collection("profile_backups").insertOne(backup);
    if (wipeProgress) {
      const saveResult = await writePlayerProgress(db.collection("player_progress"), userId, remainingProgress, null, true);
      if (!saveResult.progress) return res.status(409).json({ error: "Player progress changed concurrently. Retry the wipe." });
    }
    if (categories.includes("leaderboard")) await db.collection("leaderboard_entries").deleteMany({ userId });
    const result = await users.updateOne(
      { _id: userId, role: { $ne: "owner" } },
      { $inc: { wipeVersion: 1 }, $set: { profileWipedAt: now } },
    );
    if (!result.matchedCount) return res.status(409).json({ error: "Account role changed. Wipe was not completed." });
    await db.collection("user_sessions").deleteMany({ userId });
    const updatedUser = await users.findOne({ _id: userId }, { projection: { wipeVersion: 1 } });
    res.json({ ok: true, wipeVersion: updatedUser.wipeVersion ?? 1, backupId: inserted.insertedId.toHexString() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/restore", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid account." });
    const db = await getDatabase();
    const userId = new ObjectId(req.params.id);
    const user = await db.collection("users").findOne({ _id: userId }, { projection: { role: 1, wipeVersion: 1 } });
    if (!user) return res.status(404).json({ error: "Account not found." });
    if (user.role === "owner") return res.status(403).json({ error: "Owner profiles cannot be restored here." });
    if (!ObjectId.isValid(req.body?.backupId)) return res.status(400).json({ error: "Select a valid backup to restore." });
    const backupFilter = { _id: new ObjectId(req.body.backupId), userId };
    const backup = await db.collection("profile_backups").findOne(backupFilter, { sort: { createdAt: -1 } });
    if (!backup) return res.status(404).json({ error: "No profile backup was found." });
    if (!(backup.createdAt instanceof Date) || backup.createdAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
      return res.status(410).json({ error: "Profile backups can only be restored for seven days after the wipe." });
    }
    if (!Array.isArray(backup.categories)) return res.status(400).json({ error: "This backup does not contain restorable category metadata." });
    if (backup.affectedProgress && typeof backup.affectedProgress === "object" && !Array.isArray(backup.affectedProgress)) {
      const progressCollection = db.collection("player_progress");
      const current = await progressCollection.findOne({ _id: userId });
      const merged = { ...(current?.data ?? {}), ...backup.affectedProgress };
      const result = await writePlayerProgress(progressCollection, userId, merged, null, true);
      if (!result.progress) return res.status(409).json({ error: "Player progress changed concurrently. Retry restoring the profile." });
    }
    if (backup.categories.includes("leaderboard")) {
      for (const entry of backup.leaderboardEntries ?? []) {
        await db.collection("leaderboard_entries").updateOne(
          { userId, levelName: entry.levelName },
          {
            $set: {
              timeMs: entry.timeMs,
              abilities: entry.abilities,
              achievedAt: entry.achievedAt,
            },
            $setOnInsert: { _id: entry._id, userId, levelName: entry.levelName },
          },
          { upsert: true },
        );
      }
    }
    res.json({ ok: true, wipeVersion: user.wipeVersion ?? 0, restoredBackupId: backup._id.toHexString() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings", async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const [golden, roulette, version, updateLog, profileTitles, builtinLevelOverrides, portalAssignments, holidayEvent] = await Promise.all([
      db.collection("game_settings").findOne({ _id: "golden_time_limit_ms" }),
      db.collection("game_settings").findOne({ _id: "roulette_tiers" }),
      db.collection("game_settings").findOne({ _id: "app_version" }),
      db.collection("game_settings").findOne({ _id: "update_log" }),
      db.collection("game_settings").findOne({ _id: "profile_titles" }),
      db.collection("game_settings").findOne({ _id: "builtin_level_overrides" }),
      db.collection("game_settings").findOne({ _id: "portal_assignments" }),
      db.collection("game_settings").findOne({ _id: "holiday_event" }),
    ]);
    res.json({
      goldenTimeLimitMs: parseGoldenTimeLimit(golden?.value) ? golden.value : 60000,
      rouletteTiers: includeRouletteTitleOdds(validateRouletteTiers(roulette?.value) ?? defaultRouletteTiers),
      version: version?.value ?? "1",
      updateLog: validateUpdateLog(updateLog?.value) ?? [],
      profileTitles: includeRouletteTitles(validateProfileTitles(profileTitles?.value) ?? PROFILE_TITLE_MILESTONES),
      builtinLevelOverrides: validateBuiltinLevelOverrides(builtinLevelOverrides?.value) ?? {},
      portalAssignments: validatePortalAssignments(portalAssignments?.value) ?? {},
      holidayEvent: resolveHolidayEventSettings(holidayEvent?.value),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/holiday-event", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const holidayEvent = validateHolidayEventSettings(req.body?.holidayEvent);
    if (!holidayEvent) return res.status(400).json({ error: "Holiday event settings are invalid." });
    const db = await getDatabase();
    await saveSetting(db, "holiday_event", holidayEvent, req.user.id);
    res.json({ holidayEvent: resolveHolidayEventSettings(holidayEvent) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/version", async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const current = await db.collection("game_settings").findOne({ _id: "app_version" });
    res.json({ version: current?.value ?? "1", updatedAt: current?.updatedAt ?? null });
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings/history", requirePermission("content:update-log"), async (req, res, next) => {
  try {
    const query = {};
    if (req.query.key !== undefined) {
      if (typeof req.query.key !== "string" || !/^[a-z0-9_]{1,50}$/.test(req.query.key)) {
        return res.status(400).json({ error: "Invalid setting history key." });
      }
      query.settingKey = req.query.key;
    }
    const db = await getDatabase();
    const history = await db.collection("setting_history")
      .find(query, { projection: { settingKey: 1, previousValue: 1, nextValue: 1, changedAt: 1, changedBy: 1 } })
      .sort({ changedAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    res.json({ history });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/roulette-tiers", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const tiers = validateRouletteTiers(req.body?.tiers);
    if (!tiers) return res.status(400).json({ error: "Roulette tiers must be unique, bounded, and total exactly 100%." });
    const db = await getDatabase();
    await saveSetting(db, "roulette_tiers", tiers, req.user.id);
    res.json({ rouletteTiers: tiers });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/update-log", requireSameOrigin, requirePermission("content:update-log"), async (req, res, next) => {
  try {
    const entries = validateUpdateLog(req.body?.entries);
    if (!entries) return res.status(400).json({ error: "Update log entries need a valid date, title, and body (up to 100 entries, 20,000 characters per body, and 200 KB total)." });
    const db = await getDatabase();
    await saveSetting(db, "update_log", entries, req.user.id);
    res.json({ updateLog: entries });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/profile-titles", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const profileTitles = validateProfileTitles(req.body?.profileTitles);
    if (!profileTitles) return res.status(400).json({ error: "Titles need unique lowercase IDs, names, and route requirements." });
    const db = await getDatabase();
    await saveSetting(db, "profile_titles", profileTitles, req.user.id);
    res.json({ profileTitles });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/builtin-level-overrides", requireSameOrigin, requirePermission("levels:manage"), async (req, res, next) => {
  try {
    const index = req.body?.index;
    if (!Number.isSafeInteger(index) || index < 0 || index > 999) return res.status(400).json({ error: "Select a valid built-in level." });
    const validatedLevel = validateBuiltinLevelOverrides({ [String(index)]: req.body?.level });
    if (!validatedLevel) return res.status(400).json({ error: "Built-in level data is invalid." });
    const db = await getDatabase();
    const current = await db.collection("game_settings").findOne({ _id: "builtin_level_overrides" });
    const overrides = validateBuiltinLevelOverrides(current?.value) ?? {};
    overrides[String(index)] = validatedLevel[String(index)];
    await saveSetting(db, "builtin_level_overrides", overrides, req.user.id);
    res.json({ level: validatedLevel[String(index)], builtinLevelOverrides: overrides });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/portal-assignments", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const assignments = validatePortalAssignments(req.body?.assignments);
    if (!assignments) return res.status(400).json({ error: "Portal assignments are invalid." });
    const db = await getDatabase();
    await saveSetting(db, "portal_assignments", assignments, req.user.id);
    res.json({ portalAssignments: assignments });
  } catch (error) {
    next(error);
  }
});

app.put("/api/version", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const version = req.body?.version;
    if (typeof version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,39}$/.test(version)) {
      return res.status(400).json({ error: "Version must be 1-40 letters, numbers, dots, pluses, underscores, or hyphens." });
    }
    const db = await getDatabase();
    await saveSetting(db, "app_version", version, req.user.id);
    res.json({ version });
  } catch (error) {
    next(error);
  }
});

app.get("/api/game-config", async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const setting = await db.collection("game_settings").findOne({ _id: "game_config" });
    const config = isValidGameConfig(setting?.value) ? setting.value : DEFAULT_GAME_CONFIG;
    res.json({ config });
  } catch (error) {
    next(error);
  }
});

app.put("/api/game-config", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const { config } = req.body ?? {};
    if (!isValidGameConfig(config)) return res.status(400).json({ error: "Game settings are invalid. Check percentage totals, power-up limits, and enemy behavior values." });
    const db = await getDatabase();
    await saveSetting(db, "game_config", config, req.user.id);
    res.json({ config });
  } catch (error) {
    next(error);
  }
});

app.get("/api/levels", async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const documents = await db.collection("workshop_levels").find().sort({ _id: 1 }).toArray();
    const levels = documents.flatMap(({ _id, data }) => {
      const level = validateWorkshopLevel(data);
      return level ? [{ ...level, customId: _id.toHexString() }] : [];
    });
    res.json({ levels });
  } catch (error) {
    next(error);
  }
});

app.post("/api/levels", requireSameOrigin, requirePermission("levels:workshop"), async (req, res, next) => {
  try {
    const level = validateWorkshopLevel(req.body?.level);
    if (!level) return res.status(400).json({ error: "The workshop level is invalid. Check its name, length, and tile positions." });
    const db = await getDatabase();
    const result = await db.collection("workshop_levels").insertOne({ data: level, createdAt: new Date() });
    res.status(201).json({ level: { ...level, customId: result.insertedId.toHexString() } });
  } catch (error) {
    next(error);
  }
});

app.put("/api/levels/:id", requireSameOrigin, requirePermission("levels:workshop"), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid workshop level." });
    const level = validateWorkshopLevel(req.body?.level);
    if (!level) return res.status(400).json({ error: "The workshop level is invalid. Check its name, length, and tile positions." });
    const db = await getDatabase();
    const result = await db.collection("workshop_levels").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { data: level, updatedAt: new Date() } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Workshop level not found." });
    res.json({ level: { ...level, customId: req.params.id } });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/levels/:id", requireSameOrigin, requirePermission("levels:workshop"), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid workshop level." });
    const db = await getDatabase();
    const result = await db.collection("workshop_levels").deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ error: "Workshop level not found." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/golden-time-limit", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const { timeLimitMs } = req.body ?? {};
    if (!parseGoldenTimeLimit(timeLimitMs)) return res.status(400).json({ error: "Golden clear time must be between 1 second and 60 minutes." });
    const db = await getDatabase();
    await saveSetting(db, "golden_time_limit_ms", timeLimitMs, req.user.id);
    res.json({ goldenTimeLimitMs: timeLimitMs });
  } catch (error) {
    next(error);
  }
});

app.get("/api/leaderboard", async (req, res, next) => {
  try {
    const level = typeof req.query.level === "string" ? req.query.level.trim() : "";
    if (req.query.level !== undefined && (!level || level.length > 80)) {
      return res.status(400).json({ error: "Level filter must be 1-80 characters." });
    }
    const db = await getDatabase();
    const entries = await db.collection("leaderboard_entries").aggregate([
      { $match: level ? { levelName: level } : {} },
      { $sort: { timeMs: 1, achievedAt: 1, _id: 1 } },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "profile" } },
      { $unwind: "$profile" },
      { $match: { "profile.banned": { $ne: true }, $or: [{ "profile.role": "player" }, { "profile.role": "owner", public: true }] } },
      { $limit: 100 },
      { $project: { _id: 1, userId: 1, username: "$profile.username", role: "$profile.role", levelName: 1, timeMs: 1, abilities: 1, achievedAt: 1 } },
    ]).toArray();
    res.json({
      entries: entries.map((entry) => ({
        id: entry._id.toHexString(),
        userId: entry.userId.toHexString(),
        username: entry.username ?? "Unknown pilot",
        role: entry.role,
        level: entry.levelName,
        timeMs: entry.timeMs,
        abilities: entry.abilities,
        achievedAt: entry.achievedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/staff/leaderboard", requireStaff, async (req, res, next) => {
  try {
    const level = typeof req.query.level === "string" ? req.query.level.trim() : "";
    if (req.query.level !== undefined && (!level || level.length > 80)) {
      return res.status(400).json({ error: "Level filter must be 1-80 characters." });
    }
    const db = await getDatabase();
    const entries = await db.collection("leaderboard_entries").aggregate([
      { $match: level ? { levelName: level } : {} },
      { $sort: { timeMs: 1, achievedAt: 1, _id: 1 } },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "profile" } },
      { $unwind: "$profile" },
      { $match: { "profile.role": { $in: ["player", "tester"] }, "profile.banned": { $ne: true } } },
      { $limit: 100 },
      { $project: { _id: 1, userId: 1, username: "$profile.username", role: "$profile.role", levelName: 1, timeMs: 1, abilities: 1, achievedAt: 1 } },
    ]).toArray();
    res.json({
      entries: entries.map((entry) => ({
        id: entry._id.toHexString(),
        userId: entry.userId.toHexString(),
        username: entry.username ?? "Unknown pilot",
        role: entry.role,
        level: entry.levelName,
        timeMs: entry.timeMs,
        abilities: entry.abilities,
        achievedAt: entry.achievedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs/start", requireSameOrigin, runStartLimiter, requireUser, async (req, res, next) => {
  try {
    const db = await getDatabase();
    if (req.user.role === "player" && req.user.humanVerified === false && (await getModerationSettings(db)).humanVerificationRequired) {
      await recordSecurityEvent(db, { type: "unverified-run-start", userId: req.user.id, role: req.user.role });
      return res.status(403).json({ error: "Complete the human check in Player settings before playing online levels." });
    }
    const levelName = typeof req.body?.level === "string" ? req.body.level.trim() : "";
    if (!levelName || levelName.length > 80 || /[<>]/.test(levelName)) {
      return res.status(400).json({ error: "The level name is invalid." });
    }
    const now = new Date();
    const runId = crypto.randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + RUN_PROOF_TTL_MS);
    await db.collection("run_proofs").insertOne({
      _id: runId,
      userId: req.user.id,
      levelName,
      startedAt: now,
      expiresAt,
      consumedAt: null,
    });
    res.status(201).json({ runId, startedAt: now.getTime(), expiresAt: expiresAt.getTime() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs", requireSameOrigin, runSubmissionLimiter, requireUser, async (req, res, next) => {
  try {
    const run = req.body;
    if (!isValidRun(run)) return res.status(400).json({ error: "The run details are invalid." });
    const db = await getDatabase();
    if (req.user.role === "player" && req.user.humanVerified === false && (await getModerationSettings(db)).humanVerificationRequired) {
      await recordSecurityEvent(db, { type: "unverified-run-submit", userId: req.user.id, role: req.user.role });
      return res.status(403).json({ error: "Complete the human check in Player settings before submitting online runs." });
    }
    const runId = typeof run.proofId === "string" && /^[A-Za-z0-9_-]{32,80}$/.test(run.proofId) ? run.proofId : "";
    if (!runId) return res.status(400).json({ error: "This run could not be verified. Start the level again while online." });
    const ownerSubmission = isOwnerEquivalentRole(req.user.role) && req.body?.submitOwner === true;
    if (req.user.role !== "player" && !ownerSubmission) return res.json({ improved: false, ignored: true, reason: "owner-private", entry: null });
    if (req.user.role === "player" && req.user.leaderboardOptIn === false) return res.json({ improved: false, ignored: true, reason: "opted-out", entry: null });
    const levelName = run.level.trim();
    const runProofs = db.collection("run_proofs");
    const now = new Date();
    const proof = await runProofs.findOne({ _id: runId, userId: req.user.id, levelName, consumedAt: null, expiresAt: { $gt: now } });
    if (!proof || !(proof.startedAt instanceof Date)) {
      await recordSecurityEvent(db, { type: "invalid-run-proof", userId: req.user.id, role: req.user.role, levelName });
      return res.status(403).json({ error: "This run could not be verified. Start the level again while online." });
    }
    const serverElapsedMs = now.getTime() - proof.startedAt.getTime();
    if (!ownerSubmission && (!Number.isFinite(serverElapsedMs) || run.timeMs + RUN_PROOF_MIN_TOLERANCE_MS < serverElapsedMs)) {
      await recordSecurityEvent(db, { type: "impossible-run-time", userId: req.user.id, role: req.user.role, levelName, submittedTimeMs: run.timeMs, serverElapsedMs });
      return res.status(403).json({ error: "This run time was faster than the server could verify." });
    }
    const consumed = await runProofs.updateOne({ _id: runId, userId: req.user.id, consumedAt: null }, { $set: { consumedAt: now } });
    if (!consumed.matchedCount) {
      await recordSecurityEvent(db, { type: "replayed-run-proof", userId: req.user.id, role: req.user.role, levelName });
      return res.status(403).json({ error: "This run proof has already been used." });
    }
    const entries = db.collection("leaderboard_entries");
    let improved = false;
    const betterRunFilter = {
      userId: req.user.id,
      levelName,
      $or: [{ timeMs: { $gt: run.timeMs } }, { timeMs: { $exists: false } }],
    };
    const update = {
      $set: {
        timeMs: run.timeMs,
        abilities: run.abilities,
        achievedAt: new Date(),
        ...(ownerSubmission ? { public: true } : {}),
      },
      $setOnInsert: { userId: req.user.id, levelName },
    };
    try {
      const result = await entries.updateOne(betterRunFilter, update, { upsert: true });
      improved = result.upsertedCount === 1 || result.matchedCount === 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // Another request may have inserted a slower first run. Retry without
      // upserting so the faster time still wins the race.
      const result = await entries.updateOne(betterRunFilter, update);
      improved = result.matchedCount === 1;
    }
    const entry = await entries.findOne({ userId: req.user.id, levelName });
    if (!entry) throw new Error("Leaderboard entry was not available after saving the run.");
    const responseEntry = {
      id: entry._id.toHexString(),
      level: entry.levelName,
      timeMs: entry.timeMs,
      abilities: entry.abilities,
      achievedAt: entry.achievedAt,
    };
    res.status(improved ? 201 : 200).json({ entry: responseEntry, improved });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/leaderboard/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const { level, timeMs, abilities } = req.body ?? {};
    if (!ObjectId.isValid(req.params.id)
      || typeof level !== "string" || level.trim().length < 1 || level.trim().length > 80
      || !Number.isSafeInteger(timeMs) || timeMs < 1000 || timeMs > 30 * 60 * 1000
      || !Array.isArray(abilities) || abilities.length > ALLOWED_ABILITIES.size
      || !abilities.every((ability) => ALLOWED_ABILITIES.has(ability))
      || new Set(abilities).size !== abilities.length) {
      return res.status(400).json({ error: "The leaderboard update is invalid." });
    }
    const db = await getDatabase();
    const entries = db.collection("leaderboard_entries");
    const result = await entries.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { levelName: level.trim(), timeMs, abilities, achievedAt: new Date() } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Leaderboard entry not found." });
    const entry = await entries.findOne({ _id: new ObjectId(req.params.id) });
    res.json({
      entry: {
        id: entry._id.toHexString(),
        level: entry.levelName,
        timeMs: entry.timeMs,
        abilities: entry.abilities,
        achievedAt: entry.achievedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/leaderboard/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid leaderboard entry." });
    const db = await getDatabase();
    const result = await db.collection("leaderboard_entries").deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ error: "Leaderboard entry not found." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/messages", requireUser, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const [messages, deliveries] = await Promise.all([
      db.collection("owner_messages")
        .find({
          $or: [
            { userId: req.user.id },
            { userId: null, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          ],
        })
        .sort({ createdAt: -1, _id: -1 })
        .limit(100)
        .toArray(),
      db.collection("message_deliveries").find({ userId: req.user.id }).toArray(),
    ]);
    const acknowledged = new Set(deliveries.map((delivery) => delivery.messageId.toHexString()));
    res.json({
      messages: messages.map((message) => ({
        id: message._id.toHexString(),
        title: message.title,
        body: message.body,
        type: message.type ?? "info",
        createdAt: message.createdAt,
        acknowledged: acknowledged.has(message._id.toHexString()),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/messages/:id/ack", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid message." });
    const db = await getDatabase();
    const messageId = new ObjectId(req.params.id);
    const message = await db.collection("owner_messages").findOne({
      _id: messageId,
      $or: [{ userId: req.user.id }, { userId: null }],
    }, { projection: { _id: 1 } });
    if (!message) return res.status(404).json({ error: "Message not found." });
    await db.collection("message_deliveries").updateOne(
      { messageId, userId: req.user.id },
      { $setOnInsert: { acknowledgedAt: new Date() } },
      { upsert: true },
    );
    res.status(204).end();
  } catch (error) {
    if (error?.code === 11000) return res.status(204).end();
    next(error);
  }
});

app.get("/api/admin/messages", requirePermission("content:messages"), async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const messages = await db.collection("owner_messages")
      .find({}, { projection: { title: 1, body: 1, type: 1, userId: 1, createdAt: 1, createdBy: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    res.json({ messages: messages.map((message) => ({ ...message, id: message._id.toHexString() })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/messages/:id/deliveries", requirePermission("content:messages"), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid message." });
    const db = await getDatabase();
    const messageId = new ObjectId(req.params.id);
    const deliveries = await db.collection("message_deliveries")
      .find({ messageId }, { projection: { userId: 1, acknowledgedAt: 1 } })
      .sort({ acknowledgedAt: -1 })
      .limit(500)
      .toArray();
    const users = await db.collection("users")
      .find({ _id: { $in: deliveries.map((delivery) => delivery.userId) } }, { projection: { username: 1 } })
      .toArray();
    const usernames = new Map(users.map((user) => [user._id.toHexString(), user.username]));
    res.json({
      deliveries: deliveries.map((delivery) => ({
        userId: delivery.userId.toHexString(),
        username: usernames.get(delivery.userId.toHexString()) ?? "Unknown pilot",
        acknowledgedAt: delivery.acknowledgedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/messages", requireSameOrigin, requirePermission("content:messages"), async (req, res, next) => {
  try {
    const { title, body } = req.body ?? {};
    const type = req.body?.type ?? "info";
    if (typeof title !== "string" || !title.trim() || title.trim().length > 100
      || typeof body !== "string" || !body.trim() || body.trim().length > 300
      || !["info", "warning", "reward"].includes(type)) {
      return res.status(400).json({ error: "Message title and body must be within the allowed lengths." });
    }
    const db = await getDatabase();
    const filterTerms = await getChatFilterTerms(db);
    const moderatedTitle = moderateChatText(title.trim(), filterTerms);
    const moderatedBody = moderateChatText(body.trim(), filterTerms);
    let userId = null;
    if (req.body?.userId !== undefined && req.body.userId !== null) {
      if (!ObjectId.isValid(req.body.userId)) return res.status(400).json({ error: "Invalid recipient." });
      userId = new ObjectId(req.body.userId);
      const recipient = await db.collection("users").findOne({ _id: userId }, { projection: { _id: 1 } });
      if (!recipient) return res.status(404).json({ error: "Recipient not found." });
    }
    const createdAt = new Date();
    const result = await db.collection("owner_messages").insertOne({
      title: moderatedTitle,
      body: moderatedBody,
      type,
      userId,
      createdAt,
      createdBy: req.user.id,
    });
    res.status(201).json({ message: { id: result.insertedId.toHexString(), title: moderatedTitle, body: moderatedBody, type, userId: userId?.toHexString() ?? null, createdAt } });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/messages/:id", requireSameOrigin, requirePermission("content:messages"), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid message." });
    const { title, body } = req.body ?? {};
    const type = req.body?.type ?? "info";
    if (typeof title !== "string" || !title.trim() || title.trim().length > 100
      || typeof body !== "string" || !body.trim() || body.trim().length > 300
      || !["info", "warning", "reward"].includes(type)) {
      return res.status(400).json({ error: "Message title and body must be within the allowed lengths." });
    }
    const db = await getDatabase();
    const filterTerms = await getChatFilterTerms(db);
    const result = await db.collection("owner_messages").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title: moderateChatText(title.trim(), filterTerms), body: moderateChatText(body.trim(), filterTerms), type, updatedAt: new Date(), updatedBy: req.user.id } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Message not found." });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/messages/:id", requireSameOrigin, requirePermission("content:messages"), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid message." });
    const db = await getDatabase();
    const messageId = new ObjectId(req.params.id);
    const result = await db.collection("owner_messages").deleteOne({ _id: messageId });
    if (!result.deletedCount) return res.status(404).json({ error: "Message not found." });
    await db.collection("message_deliveries").deleteMany({ messageId });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/codes", requirePermission("content:codes"), async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const codes = await db.collection("redemption_codes")
      .find({}, { projection: { codeHash: 0 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .toArray();
    res.json({ codes: codes.map((code) => ({ ...code, id: code._id.toHexString() })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/codes/:id/redemptions", requirePermission("content:codes"), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid code." });
    const db = await getDatabase();
    const codeId = new ObjectId(req.params.id);
    const redemptions = await db.collection("code_redemption_logs")
      .find({ codeId }, { projection: { userId: 1, redeemedAt: 1, reward: 1 } })
      .sort({ redeemedAt: -1, _id: -1 })
      .limit(500)
      .toArray();
    const users = await db.collection("users")
      .find({ _id: { $in: redemptions.map((entry) => entry.userId) } }, { projection: { username: 1 } })
      .toArray();
    const usernames = new Map(users.map((user) => [user._id.toHexString(), user.username]));
    res.json({
      redemptions: redemptions.map((entry) => ({
        userId: entry.userId.toHexString(),
        username: usernames.get(entry.userId.toHexString()) ?? "Unknown pilot",
        redeemedAt: entry.redeemedAt,
        reward: entry.reward,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/codes", requireSameOrigin, requirePermission("content:codes"), async (req, res, next) => {
  noStore(res);
  try {
    const code = typeof req.body?.code === "string"
      ? req.body.code.trim().toUpperCase()
      : crypto.randomBytes(12).toString("hex").toUpperCase();
    const maxUses = req.body?.maxUses === null ? null : req.body?.maxUses ?? 1;
    const perPlayerLimit = req.body?.perPlayerLimit ?? 1;
    const reward = validateCodeReward(req.body?.reward ?? { type: "claims", amount: 0 });
    if (!/^[A-Z0-9!?@#$%&*+=._~()\-]{8,40}$/.test(code)
      || !(maxUses === null || (Number.isSafeInteger(maxUses) && maxUses >= 1 && maxUses <= 1000000))
      || !Number.isSafeInteger(perPlayerLimit) || perPlayerLimit < 1 || perPlayerLimit > 1000
      || !reward
      || (req.body?.expiresAt !== undefined && !isValidDateString(req.body.expiresAt))) {
      return res.status(400).json({ error: "Code settings are invalid." });
    }
    const db = await getDatabase();
    if (reward.type === "title") {
      const titles = await getProfileTitles(db);
      if (!titles.some((title) => title.id === reward.titleId)) return res.status(400).json({ error: "That title does not exist." });
    }
    const document = {
      codeHash: hashRedemptionCode(code),
      maxUses,
      perPlayerLimit,
      reward,
      uses: 0,
      enabled: true,
      expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
      createdAt: new Date(),
      createdBy: req.user.id,
    };
    const result = await db.collection("redemption_codes").insertOne(document);
    res.status(201).json({
      code: { id: result.insertedId.toHexString(), maxUses, perPlayerLimit, reward, expiresAt: document.expiresAt },
      redemptionCode: code,
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "That code already exists." });
    next(error);
  }
});

app.patch("/api/admin/codes/:id", requireSameOrigin, requirePermission("content:codes"), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid code." });
    const db = await getDatabase();
    const codes = db.collection("redemption_codes");
    const codeId = new ObjectId(req.params.id);
    const current = await codes.findOne({ _id: codeId });
    if (!current) return res.status(404).json({ error: "Code not found." });
    const updates = {};
    if (Object.hasOwn(req.body ?? {}, "reward")) {
      const reward = validateCodeReward(req.body.reward);
      if (!reward) return res.status(400).json({ error: "The code reward is invalid." });
      if (reward.type === "title") {
        const titles = await getProfileTitles(db);
        if (!titles.some((title) => title.id === reward.titleId)) return res.status(400).json({ error: "That title does not exist." });
      }
      updates.reward = reward;
    }
    if (Object.hasOwn(req.body ?? {}, "maxUses")) {
      const maxUses = req.body.maxUses;
      if (!(maxUses === null || (Number.isSafeInteger(maxUses) && maxUses >= 1 && maxUses <= 1000000))) {
        return res.status(400).json({ error: "Total use limit must be a positive number or unlimited." });
      }
      if (maxUses !== null && maxUses < (Number.isSafeInteger(current.uses) ? current.uses : 0)) {
        return res.status(400).json({ error: "Total use limit cannot be lower than the code's current uses." });
      }
      updates.maxUses = maxUses;
    }
    if (Object.hasOwn(req.body ?? {}, "perPlayerLimit")) {
      const perPlayerLimit = req.body.perPlayerLimit;
      if (!Number.isSafeInteger(perPlayerLimit) || perPlayerLimit < 1 || perPlayerLimit > 1000) {
        return res.status(400).json({ error: "Per-player use limit must be between 1 and 1000." });
      }
      updates.perPlayerLimit = perPlayerLimit;
    }
    if (Object.hasOwn(req.body ?? {}, "expiresAt")) {
      if (req.body.expiresAt === null || req.body.expiresAt === "") updates.expiresAt = null;
      else if (!isValidDateString(req.body.expiresAt)) return res.status(400).json({ error: "Expiration date is invalid." });
      else updates.expiresAt = new Date(req.body.expiresAt);
    }
    if (Object.hasOwn(req.body ?? {}, "enabled")) {
      if (typeof req.body.enabled !== "boolean") return res.status(400).json({ error: "Enabled must be true or false." });
      updates.enabled = req.body.enabled;
      if (!req.body.enabled) updates.disabledAt = new Date();
      else updates.disabledAt = null;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: "Choose at least one code setting to update." });
    updates.updatedAt = new Date();
    updates.updatedBy = req.user.id;
    await codes.updateOne({ _id: codeId }, { $set: updates });
    const updated = await codes.findOne({ _id: codeId }, { projection: { codeHash: 0 } });
    res.json({ code: { ...updated, id: codeId.toHexString() } });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/codes/:id", requireSameOrigin, requirePermission("content:codes"), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid code." });
    const db = await getDatabase();
    const result = await db.collection("redemption_codes").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { enabled: false, disabledAt: new Date() } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Code not found." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/codes/redeem", requireSameOrigin, codeRedemptionLimiter, requireUser, async (req, res, next) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9!?@#$%&*+=._~()\-]{8,40}$/.test(code)) return res.status(400).json({ error: "Enter a valid redemption code." });
    const db = await getDatabase();
    const codes = db.collection("redemption_codes");
    const redemptions = db.collection("code_redemptions");
    const progressCollection = db.collection("player_progress");
    const session = mongoClient.startSession();
    try {
      const redemptionResult = await session.withTransaction(async () => {
        const now = new Date();
        const codeRecord = await codes.findOne(
          { codeHash: hashRedemptionCode(code) },
          { session },
        );
        if (!codeRecord) throw Object.assign(new Error("Code is invalid or unavailable."), { statusCode: 404 });
        if (codeRecord.reward?.type === "title") {
          const titles = await getProfileTitles(db);
          if (!titles.some((title) => title.id === codeRecord.reward.titleId)) throw Object.assign(new Error("That title no longer exists."), { statusCode: 409 });
        }
        if (codeRecord.enabled === false) throw Object.assign(new Error("This code has been disabled."), { statusCode: 410 });
        if (codeRecord.expiresAt && codeRecord.expiresAt <= now) {
          throw Object.assign(new Error("This code has expired."), { statusCode: 410 });
        }

        const maxUses = codeRecord.maxUses === null
          ? null
          : Number.isSafeInteger(codeRecord.maxUses) ? codeRecord.maxUses : 1;
        const perPlayerLimit = Number.isSafeInteger(codeRecord.perPlayerLimit) ? codeRecord.perPlayerLimit : 1;
        const prior = await redemptions.findOne(
          { codeId: codeRecord._id, userId: req.user.id },
          { session },
        );
        if (prior && prior.uses >= perPlayerLimit) {
          throw Object.assign(new Error("This code has already reached your per-player use limit."), { statusCode: 409 });
        }
        if (prior) {
          const playerIncrement = await redemptions.updateOne(
            { _id: prior._id, uses: { $lt: perPlayerLimit } },
            { $inc: { uses: 1 }, $set: { lastRedeemedAt: now } },
            { session },
          );
          if (!playerIncrement.matchedCount) {
            throw Object.assign(new Error("This code has already reached your per-player use limit."), { statusCode: 409 });
          }
        } else {
          await redemptions.insertOne({
            codeId: codeRecord._id,
            userId: req.user.id,
            uses: 1,
            redeemedAt: now,
          }, { session });
        }

        const totalUseFilter = {
          _id: codeRecord._id,
          enabled: { $ne: false },
          $and: [
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }] },
          ],
        };
        if (maxUses !== null) totalUseFilter.$and.unshift({ $or: [{ uses: { $lt: maxUses } }, { uses: { $exists: false } }] });
        const totalIncrement = await codes.updateOne(
          totalUseFilter,
          { $inc: { uses: 1 } },
          { session },
        );
        if (!totalIncrement.matchedCount) {
          const currentCode = await codes.findOne(
            { _id: codeRecord._id },
            { projection: { enabled: 1, expiresAt: 1 }, session },
          );
          if (currentCode?.enabled === false) {
            throw Object.assign(new Error("This code has been disabled."), { statusCode: 410 });
          }
          if (currentCode?.expiresAt && currentCode.expiresAt <= now) {
            throw Object.assign(new Error("This code has expired."), { statusCode: 410 });
          }
          throw Object.assign(new Error("This code has reached its total use limit."), { statusCode: 409 });
        }

        const reward = validateCodeReward(codeRecord.reward)
          ?? (Number.isSafeInteger(codeRecord.reward) && codeRecord.reward >= 0
            ? { type: "claims", amount: codeRecord.reward }
            : { type: "claims", amount: 0 });
        const savedProgress = await progressCollection.findOne({ _id: req.user.id }, { session });
        const progress = validatePlayerProgress(savedProgress?.data ?? {});
        if (!progress) throw Object.assign(new Error("Saved player progress is invalid. Contact the owner for help."), { statusCode: 409 });
        const nextProgress = { ...progress };
        if (reward.type === "claims" || reward.type === "specialClaims" || reward.type === "presents") {
          const rewardKey = reward.type === "claims" ? "orbit-claims" : reward.type === "specialClaims" ? "orbit-special-claims" : "orbit-christmas-presents";
          const currentValue = progress[rewardKey];
          const currentAmount = typeof currentValue === "string" && /^\d{1,10}$/.test(currentValue)
            ? Math.min(Number(currentValue), 100000000)
            : 0;
          nextProgress[rewardKey] = String(Math.min(100000000, currentAmount + reward.amount));
        } else if (reward.type === "powerup") {
          let inventory = {};
          try { inventory = JSON.parse(progress["orbit-powerups"] ?? "{}"); } catch { inventory = {}; }
          const currentAmount = Number.isSafeInteger(inventory?.[reward.kind]) ? inventory[reward.kind] : 0;
          nextProgress["orbit-powerups"] = JSON.stringify({ ...inventory, [reward.kind]: Math.min(100000, currentAmount + reward.amount) });
        } else if (["skin", "trail", "avatar"].includes(reward.type)) {
          nextProgress[`orbit-spin-${reward.type}-${reward.index}`] = "1";
        } else if (reward.type === "title") {
          nextProgress[`orbit-title-unlock-${reward.titleId}`] = "1";
        }
        const progressResult = await writePlayerProgress(progressCollection, req.user.id, nextProgress, null, true, session);
        if (!progressResult.progress) {
          throw Object.assign(new Error("Player progress changed while redeeming the code. Try again."), { statusCode: 409 });
        }
        await db.collection("code_redemption_logs").insertOne({
          codeId: codeRecord._id,
          userId: req.user.id,
          redeemedAt: now,
          reward,
        }, { session });
        return {
          reward,
          remainingUses: maxUses === null ? null : Math.max(0, maxUses - ((codeRecord.uses ?? 0) + 1)),
        };
      });
      res.json({ ok: true, ...redemptionResult });
    } catch (error) {
      if (Number.isInteger(error?.statusCode)) return res.status(error.statusCode).json({ error: error.message });
      if (error?.code === 11000) return res.status(409).json({ error: "This code has already reached your per-player use limit." });
      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
app.use(express.static(path.join(dirname, "..", "dist"), { index: false, maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(dirname, "..", "dist", "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  console.error("API request failed:", error);
  if (res.headersSent) return;
  if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "Request body must be valid JSON." });
  if (error instanceof MongoNetworkError || error instanceof MongoServerSelectionError) {
    res.set("Retry-After", "10");
    res.set("Cache-Control", "no-store");
    return res.status(503).json({ error: "The online service is temporarily unavailable. Please try again shortly." });
  }
  res.status(500).json({ error: "The server could not complete that request." });
});

async function initializeDatabaseOnce() {
  if (databaseConfigurationError) {
    const error = new Error(databaseConfigurationError);
    error.code = "DATABASE_CONFIG";
    throw error;
  }
  const db = await getDatabase();
  const users = db.collection("users");
  const sessions = db.collection("user_sessions");
  const entries = db.collection("leaderboard_entries");
  const runProofs = db.collection("run_proofs");
  const settings = db.collection("game_settings");
  const recoveryAttempts = db.collection("account_recovery_attempts");

  await dropLegacyRecoveryIndex(recoveryAttempts);

  await Promise.all([
    users.createIndex({ usernameNormalized: 1 }, { unique: true }),
    users.createIndex({ emailHash: 1 }, { unique: true, sparse: true }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ lastSeenAt: 1 }),
    users.createIndex({ lastSeenIpHash: 1 }),
    users.createIndex({ lastSeenIpHash: 1, createdAt: -1 }),
    entries.createIndex({ userId: 1, levelName: 1 }, { unique: true }),
    entries.createIndex({ levelName: 1, timeMs: 1, achievedAt: 1, _id: 1 }),
    entries.createIndex({ timeMs: 1, achievedAt: 1, _id: 1 }),
    runProofs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    runProofs.createIndex({ userId: 1, consumedAt: 1 }),
    recoveryAttempts.createIndex({ lockedUntil: 1 }),
    db.collection("profile_backups").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("redemption_codes").createIndex({ codeHash: 1 }, { unique: true }),
    db.collection("code_redemptions").createIndex({ codeId: 1, userId: 1 }, { unique: true }),
    db.collection("code_redemption_logs").createIndex({ codeId: 1, redeemedAt: -1 }),
    db.collection("code_redemption_logs").createIndex({ userId: 1, redeemedAt: -1 }),
    db.collection("owner_messages").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("message_deliveries").createIndex({ messageId: 1, userId: 1 }, { unique: true }),
    db.collection("friendships").createIndex({ pairKey: 1 }, { unique: true }),
    db.collection("friendships").createIndex({ userIds: 1, status: 1, createdAt: -1 }),
    db.collection("user_blocks").createIndex({ blockerId: 1, blockedId: 1 }, { unique: true }),
    db.collection("conversations").createIndex({ pairKey: 1 }, { unique: true }),
    db.collection("conversations").createIndex({ userIds: 1, lastMessageAt: -1 }),
    db.collection("chat_messages").createIndex({ conversationId: 1, _id: -1 }),
    db.collection("global_chat_messages").createIndex({ senderId: 1, _id: -1 }),
    db.collection("chat_notifications").createIndex({ recipientId: 1, readAt: 1, createdAt: -1 }),
    db.collection("chat_reports").createIndex({ status: 1, createdAt: -1 }),
    db.collection("chat_audit").createIndex({ createdAt: -1 }),
    db.collection("moderation_log").createIndex({ createdAt: -1 }),
    db.collection("security_events").createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }),
    db.collection("ip_bans").createIndex({ active: 1, bannedAt: -1 }),
    db.collection("email_bans").createIndex({ active: 1, bannedAt: -1 }),
    db.collection("pending_email_verifications").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("setting_history").createIndex({ settingKey: 1, changedAt: -1 }),
  ]);
  await users.updateMany({ role: { $exists: false } }, { $set: { role: "player" } });
  await Promise.all([
    settings.updateOne(
      { _id: "golden_time_limit_ms" },
      { $setOnInsert: { value: 60000, createdAt: new Date() } },
      { upsert: true },
    ),
    settings.updateOne(
      { _id: "game_config" },
      { $setOnInsert: { value: DEFAULT_GAME_CONFIG, createdAt: new Date() } },
      { upsert: true },
    ),
    settings.updateOne(
      { _id: "roulette_tiers" },
      { $setOnInsert: { value: defaultRouletteTiers, createdAt: new Date() } },
      { upsert: true },
    ),
    settings.updateOne(
      { _id: "update_log" },
      { $setOnInsert: { value: [], createdAt: new Date() } },
      { upsert: true },
    ),
    settings.updateOne(
      { _id: "app_version" },
      { $setOnInsert: { value: "1", createdAt: new Date() } },
      { upsert: true },
    ),
    settings.updateOne(
      { _id: "chat_filter" },
      { $setOnInsert: { value: { terms: [] }, createdAt: new Date() } },
      { upsert: true },
    ),
    settings.updateOne(
      { _id: "moderation_settings" },
      { $setOnInsert: { value: DEFAULT_MODERATION_SETTINGS, createdAt: new Date() } },
      { upsert: true },
    ),
    settings.updateOne(
      { _id: "builtin_level_overrides" },
      { $setOnInsert: { value: {}, createdAt: new Date() } },
      { upsert: true },
    ),
  ]);
  await getModerationSettings(db);

  dummyPasswordHash = await argon2.hash("constant-time account lookup", passwordHashOptions);
  dummyRecoveryHash = await argon2.hash("constant-time recovery lookup", passwordHashOptions);
  for (const account of ownerAccounts) {
    const username = normalizeUsername(account.username);
    const passwordHash = await argon2.hash(account.password, passwordHashOptions);
    const ownerUpdate = {
      $set: {
        username: username.display,
        usernameNormalized: username.normalized,
        passwordHash,
        role: "owner",
        mustChangePassword: false,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    };
    try {
      await users.updateOne({ usernameNormalized: username.normalized }, ownerUpdate, { upsert: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await users.updateOne({ usernameNormalized: username.normalized }, { $set: ownerUpdate.$set });
    }
  }
  // The developer role is reserved for this existing account. Do not upsert it:
  // a password must be created through the normal registration flow first.
  await users.updateOne(
    { usernameNormalized: developerUsername },
    { $set: { role: "developer", updatedAt: new Date() } },
  );
  console.log(`Owner accounts ${ownerAccounts.map(({ username }) => `"${username}"`).join(" and ")} are ready.`);
}

let databaseInitializationPromise;
export function initializeDatabase() {
  if (!databaseInitializationPromise) {
    databaseInitializationPromise = initializeDatabaseOnce().then(() => {
      databaseReady = true;
    }).catch((error) => {
      databaseReady = false;
      databaseInitializationPromise = undefined;
      throw error;
    });
  }
  return databaseInitializationPromise;
}

export default app;
