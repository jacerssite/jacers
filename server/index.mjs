import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { MongoClient, ObjectId } from "mongodb";
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
} from "./game-data.mjs";

const app = express();
const ownerAccounts = [
  { username: "vslxped", password: process.env.OWNER_PASSWORD },
  { username: "riverwth", password: process.env.ADDITIONAL_OWNER_PASSWORD },
];
const cookieName = "jacer_session";
const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;
const presenceActiveWindowMs = 90 * 1000;
const recoveryLockMs = 24 * 60 * 60 * 1000;
const defaultRouletteTiers = [
  { buyIn: 5, chances: { claims: 45, specialClaims: 15, color: 20, trail: 12, avatar: 8, title: 0 }, rewards: { claims: [50, 150], specialClaims: [1, 2] } },
  { buyIn: 10, chances: { claims: 30, specialClaims: 18, color: 22, trail: 18, avatar: 12, title: 0 }, rewards: { claims: [125, 350], specialClaims: [1, 3] } },
  { buyIn: 25, chances: { claims: 15, specialClaims: 20, color: 22, trail: 25, avatar: 18, title: 0 }, rewards: { claims: [300, 1000], specialClaims: [2, 5] } },
];
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
const runSubmissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many run submissions. Wait a minute and try again." },
});
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
  const allTitlesGranted = (role === "owner" || role === "tester") && progress["orbit-all-titles"] === "1";
  const title = profileTitles.find((candidate) => {
    if (candidate.id !== selectedTitle) return false;
    if (allTitlesGranted) return true;
    if (progress[`orbit-title-unlock-${candidate.id}`] === "1") return true;
    const requirement = candidate.requirement ?? { type: "routes", amount: candidate.routes };
    if (requirement.type === "locked") return false;
    if (requirement.type === "golden") return goldenRouteCount >= requirement.amount;
    if (requirement.type === "prestige") return prestigeLevel >= requirement.amount;
    if (requirement.type === "roulette") return false;
    return completedRouteCount >= requirement.amount;
  })?.name ?? "";
  const equippedIndex = (key) => {
    const value = equippedValue(key);
    const index = value === null ? 0 : Number(value);
    return Number.isSafeInteger(index) && index >= 0 && index <= 1000 ? index : 0;
  };
  return {
    username,
    role,
    roleBadge: role === "tester" ? "tester" : "player",
    asteroids: readCount("orbit-claims"),
    specialAsteroids: readCount("orbit-special-claims"),
    prestige: prestigeLevel,
    routesCleared: completedRouteCount,
    shipColor: equippedValue("orbit-ship-color") ?? "#ed7657",
    avatar: equippedIndex("orbit-avatar"),
    skin: equippedIndex("orbit-skin"),
    trail: equippedIndex("orbit-trail"),
    title,
  };
}

async function getProfileTitles(db) {
  const setting = await db.collection("game_settings").findOne({ _id: "profile_titles" });
  return validateProfileTitles(setting?.value) ?? PROFILE_TITLE_MILESTONES;
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

async function writePlayerProgress(collection, userId, progress, baseProgress = null, replace = false, session = undefined, actorRole = "owner") {
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
    const suspiciousMutation = getSuspiciousPlayerMutation(existing?.data, mergedProgress, actorRole);
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

async function isIpBanned(db, ipHash) {
  if (!ipHash) return false;
  const bans = db.collection("ip_bans");
  if (typeof bans.findOne !== "function") return false;
  const ban = await bans.findOne({ _id: ipHash, active: { $ne: false } });
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
    { projection: { username: 1, role: 1, banned: 1, mustChangePassword: 1, appearOffline: 1, leaderboardOptIn: 1, allowFriendRequests: 1, chatMuted: 1 } },
  );
  return user && !user.banned && USER_ROLES.includes(user.role)
    ? { id: user._id, username: user.username, role: user.role, mustChangePassword: Boolean(user.mustChangePassword), appearOffline: Boolean(user.appearOffline), leaderboardOptIn: user.leaderboardOptIn !== false, allowFriendRequests: user.allowFriendRequests !== false, chatMuted: Boolean(user.chatMuted) }
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
    if (req.user.role !== "owner") return res.status(403).json({ error: "Owner access is required." });
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
    if (!["owner", "tester"].includes(req.user.role)) return res.status(403).json({ error: "Staff access is required." });
    next();
  } catch (error) {
    next(error);
  }
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

async function getFriendship(db, first, second) {
  return db.collection("friendships").findOne({ pairKey: friendPairKey(first, second) });
}

async function ensureChatUser(db, id) {
  return db.collection("users").findOne(
    { _id: id, role: { $in: ["player", "tester", "owner"] }, banned: { $ne: true } },
    { projection: { username: 1, role: 1, banned: 1, chatMuted: 1 } },
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
  return Boolean(blobOrigin && url.startsWith(blobOrigin.replace(/\/$/, "") + "/"));
}

async function unreadChatCount(db, userId) {
  const conversations = db.collection("conversations");
  if (typeof conversations.find !== "function") return 0;
  const rows = await conversations.find({ userIds: userId }).toArray();
  return rows.reduce((sum, row) => sum + (Number(row.unread?.[userIdString(userId)]) || 0), 0);
}

async function accountHandler(req, res, next, mode) {
  try {
    const credentials = req.body;
    const username = normalizeUsername(credentials?.username);
    if (!username || !isValidPassword(credentials?.password)) {
      return res.status(400).json({ error: "Use a 3-20 character username (letters, numbers, underscore) and a 10-128 character password." });
    }

    const db = await getDatabase();
    const ipHash = hashClientIp(req.ip);
    if (await isIpBanned(db, ipHash)) {
      return res.status(403).json({ error: "This device network has been banned. Contact the owner for help." });
    }

    if (mode === "register") {
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
          ...(ipHash ? { lastSeenIpHash: ipHash } : {}),
          createdAt: new Date(),
        });
        user = { _id: created.insertedId, username: username.display, role: "player" };
      } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: "That username is already taken." });
        throw error;
      }
      await createSession(user._id, res, ipHash);
      noStore(res);
      return res.status(201).json({
        user: { username: user.username, role: user.role, mustChangePassword: false, appearOffline: false, leaderboardOptIn: true, allowFriendRequests: true },
        recoveryCode: code,
      });
    }

    const user = await db.collection("users").findOne({ usernameNormalized: username.normalized });
    const valid = await argon2.verify(user?.passwordHash ?? dummyPasswordHash, credentials.password);
    if (!valid || !user) return res.status(401).json({ error: "Username or password is incorrect." });
    if (user.banned) return res.status(403).json({ error: "This account has been banned. Contact the owner for help." });
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
      },
    });
  } catch (error) {
    next(error);
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

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
        ? { username: user.username, role: user.role, mustChangePassword: user.mustChangePassword, appearOffline: user.appearOffline, leaderboardOptIn: user.leaderboardOptIn !== false, allowFriendRequests: user.allowFriendRequests !== false }
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
    noStore(res);
    res.json({ pendingRequests, unreadMessages });
  } catch (error) {
    next(error);
  }
});

app.get("/api/presence", async (_req, res, next) => {
  try {
    noStore(res);
    const db = await getDatabase();
    const activeUserIds = await getActiveUserIds(db);
    if (!activeUserIds.size) return res.json({ users: [], truncated: false });
    const users = await db.collection("users")
      .find({
        _id: { $in: [...activeUserIds].map((id) => new ObjectId(id)) },
        role: { $in: ["player", "tester", "owner"] },
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
    if (req.body?.initializeOnly === true) {
      if (req.body.baseProgress !== null) return res.status(400).json({ error: "Initial progress must have a null base." });
      const safeInitialProgress = sanitizeInitialPlayerProgress(progress, req.user.role);
      if (req.user.role === "player" && JSON.stringify(safeInitialProgress) !== JSON.stringify(progress)) {
        await recordSecurityEvent(db, { type: "sanitized-initial-progress", userId: req.user.id, role: req.user.role });
      }
      const initialized = await initializePlayerProgress(collection, req.user.id, safeInitialProgress);
      if (!initialized) return res.status(409).json({ error: "Saved player progress is invalid. Contact the owner for help." });
      return res.json({ progress: initialized });
    }
    const result = await writePlayerProgress(collection, req.user.id, progress, baseProgress, false, undefined, req.user.role);
    if (result.suspiciousMutation) {
      await recordSecurityEvent(db, { type: "suspicious-progress-mutation", userId: req.user.id, role: req.user.role, reason: result.suspiciousMutation });
      return res.status(403).json({ error: "This progress update was blocked by server-side anti-cheat protection." });
    }
    if (!result.progress) return res.status(result.conflict ? 409 : 400).json({
      error: result.conflict ? "Progress changed on another device. Cloud saving is paused; signing in again will replace unsaved local changes with cloud progress." : "Player progress exceeds the allowed size.",
    });
    res.json({ progress: result.progress });
  } catch (error) {
    next(error);
  }
});

app.get("/api/account/profile", requireUser, async (req, res, next) => {
  try {
    noStore(res);
    const db = await getDatabase();
    const user = await db.collection("users").findOne(
      { _id: req.user.id },
      { projection: { username: 1, usernameChangedAt: 1, createdAt: 1, role: 1, mustChangePassword: 1, recoveryCodeHash: 1, recoveryCodeCreatedAt: 1 } },
    );
    if (!user) return res.status(404).json({ error: "Account not found." });
    res.json({
      username: user.username,
      role: user.role,
      mustChangePassword: Boolean(user.mustChangePassword),
      createdAt: user.createdAt,
      usernameChangedAt: user.usernameChangedAt ?? null,
      hasRecoveryCode: Boolean(user.recoveryCodeHash),
      recoveryCodeCreatedAt: user.recoveryCodeCreatedAt ?? null,
      nextUsernameChangeAt: user.usernameChangedAt
        ? new Date(user.usernameChangedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
        : null,
    });
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

app.patch("/api/account/profile", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    if (!username) return res.status(400).json({ error: "Use a 3-20 character username (letters, numbers, underscore)." });
    const db = await getDatabase();
    const users = db.collection("users");
    const current = await users.findOne({ _id: req.user.id }, { projection: { username: 1, usernameChangedAt: 1, role: 1 } });
    if (!current) return res.status(404).json({ error: "Account not found." });
    if (current.username === username.display) return res.json({ user: { username: current.username }, usernameChangedAt: current.usernameChangedAt ?? null });
    if (current.role === "owner") return res.status(403).json({ error: "Owner usernames are managed through the deployment account settings." });
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
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(req.params.id), role: { $in: ["player", "tester", "owner"] }, banned: { $ne: true } },
      { projection: { username: 1, role: 1, appearOffline: 1 } },
    );
    if (!user) return res.status(404).json({ error: "Player not found." });
    const [activeUserIds, profileTitles] = await Promise.all([
      user.appearOffline ? Promise.resolve(new Set()) : getActiveUserIds(db, [user._id]),
      getProfileTitles(db),
    ]);
    if (user.role === "owner") {
      const publicEntry = await db.collection("leaderboard_entries").findOne({ userId: user._id, public: true }, { projection: { _id: 1 } });
      if (!publicEntry) {
        return res.json({ player: {
          id: user._id.toHexString(), username: user.username, role: user.role,
          title: "", isOnline: activeUserIds.has(user._id.toHexString()), limited: true,
        } });
      }
    }
    const saved = await db.collection("player_progress").findOne(
      { _id: user._id },
      { projection: { data: 1 } },
    );
    res.json({
      player: {
        id: user._id.toHexString(),
        ...publicProfileFromProgress(user.username, user.role, saved?.data ?? {}, profileTitles),
        isOnline: activeUserIds.has(user._id.toHexString()),
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
  const otherIds = rows.map((row) => row.userIds?.find((id) => userIdString(id) !== userIdString(userId))).filter(Boolean);
  const users = otherIds.length && typeof db.collection("users").find === "function"
    ? await db.collection("users").find({ _id: { $in: otherIds } }, { projection: { username: 1, role: 1, banned: 1, appearOffline: 1 } }).toArray()
    : [];
  const usersById = new Map(users.map((user) => [userIdString(user._id), user]));
  const active = await getActiveUserIds(db, otherIds);
  const profileTitles = await getProfileTitles(db);
  const progressCollection = db.collection("player_progress");
  const result = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const otherId = otherIds[rows.indexOf(row)];
    const id = userIdString(otherId);
    const other = usersById.get(id);
    if (!other || other.banned) continue;
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
    const target = await db.collection("users").findOne({ _id: targetId, role: { $in: ["player", "tester", "owner"] }, banned: { $ne: true } }, { projection: { username: 1, role: 1, allowFriendRequests: 1 } });
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
    const messages = typeof db.collection("chat_messages").find === "function"
      ? await db.collection("chat_messages").find(filter).sort({ _id: -1 }).limit(limit).toArray()
      : [];
    const mapped = messages.reverse().map((message) => ({ id: userIdString(message._id), conversationId: pairKey, senderId: userIdString(message.senderId), sender: message.sender ?? (userIdString(message.senderId) === userIdString(req.user.id) ? req.user.username : access.target.username), role: message.role ?? (userIdString(message.senderId) === userIdString(req.user.id) ? req.user.role : access.target.role), text: message.deletedAt ? "Message deleted" : message.text, attachment: message.deletedAt ? undefined : message.attachment, createdAt: message.createdAt?.toISOString?.() ?? message.createdAt, deletedAt: message.deletedAt?.toISOString?.() ?? message.deletedAt ?? null }));
    res.json({ messages: mapped, hasMore: messages.length === limit });
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
    const rawText = typeof req.body?.text === "string" ? req.body.text : "";
    const text = rawText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
    const attachment = req.body?.attachment;
    if (!text && !attachment) return res.status(400).json({ error: "Write a message or attach an image/video." });
    if (text.length > 300) return res.status(400).json({ error: "Messages are limited to 300 characters." });
    if (!chatAttachmentIsValid(attachment)) return res.status(400).json({ error: "That attachment is not allowed or has not been uploaded." });
    const pairKey = friendPairKey(req.user.id, targetId);
    const messages = db.collection("chat_messages");
    const recent = typeof messages.find === "function" ? await messages.find({ conversationId: pairKey, senderId: req.user.id, deletedAt: { $exists: false } }).sort({ _id: -1 }).limit(3).toArray() : [];
    if (text && recent.length >= 3 && recent.every((message) => message.text === text)) return res.status(429).json({ error: "Please do not repeat the same message." });
    const now = new Date();
    const message = { conversationId: pairKey, senderId: req.user.id, sender: req.user.username, role: req.user.role, text, ...(attachment ? { attachment } : {}), createdAt: now };
    const inserted = await messages.insertOne(message);
    const conversations = db.collection("conversations");
    await conversations.updateOne(
      { pairKey },
      { $set: { pairKey, userIds: [req.user.id, targetId], lastMessageAt: now, lastMessagePreview: text || "Attachment" }, $inc: { [`unread.${userIdString(targetId)}`]: 1 }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    res.status(201).json({ message: { id: inserted.insertedId.toHexString(), conversationId: pairKey, senderId: userIdString(req.user.id), sender: req.user.username, role: req.user.role, text, ...(attachment ? { attachment } : {}), createdAt: now.toISOString() } });
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
    await db.collection("conversations").updateOne({ pairKey: friendPairKey(req.user.id, targetId) }, { $set: { [`unread.${userIdString(req.user.id)}`]: 0, [`readAt.${userIdString(req.user.id)}`]: new Date() } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/chat/messages/:id", requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid message." });
    const db = await getDatabase();
    const message = await db.collection("chat_messages").findOne({ _id: new ObjectId(req.params.id) });
    if (!message) return res.status(404).json({ error: "Message not found." });
    if (req.user.role !== "owner" && userIdString(message.senderId) !== userIdString(req.user.id)) return res.status(403).json({ error: "You can only delete your own messages." });
    await db.collection("chat_messages").updateOne({ _id: message._id }, { $set: { deletedAt: new Date(), deletedBy: req.user.id } });
    if (req.user.role === "owner") await db.collection("chat_audit").insertOne({ action: "delete", messageId: message._id, actorId: req.user.id, targetUserId: message.senderId, createdAt: new Date() });
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
    const message = await db.collection("chat_messages").findOne({ _id: new ObjectId(req.params.id) });
    if (!message) return res.status(404).json({ error: "Message not found." });
    const access = await chatTargetAccess(db, req.user.id, message.senderId);
    if (access.error && userIdString(message.senderId) !== userIdString(req.user.id)) return res.status(access.status).json({ error: access.error });
    await db.collection("chat_reports").insertOne({ messageId: message._id, reporterId: req.user.id, reason: reason || "Reported by player", createdAt: new Date(), status: "open" });
    res.status(201).json({ reported: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/chat/reports", requireOwner, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const reports = typeof db.collection("chat_reports").find === "function" ? await db.collection("chat_reports").find({ status: "open" }).sort({ createdAt: -1 }).limit(100).toArray() : [];
    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

async function setChatMute(req, res, next, muted) {
  try {
    const targetId = validObjectId(req.params.id);
    if (!targetId) return res.status(400).json({ error: "Invalid player." });
    const db = await getDatabase();
    const result = await db.collection("users").updateOne({ _id: targetId, role: { $in: ["player", "tester"] }, banned: { $ne: true } }, { $set: { chatMuted: muted } });
    if (!result.matchedCount) return res.status(404).json({ error: "Player not found." });
    await db.collection("chat_audit").insertOne({ action: muted ? "mute" : "unmute", actorId: req.user.id, targetUserId: targetId, reason: typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : "", createdAt: new Date() });
    res.json({ chatMuted: muted });
  } catch (error) {
    next(error);
  }
}

app.post("/api/admin/users/:id/chat-mute", requireSameOrigin, requireOwner, (req, res, next) => setChatMute(req, res, next, true));
app.post("/api/admin/users/:id/chat-unmute", requireSameOrigin, requireOwner, (req, res, next) => setChatMute(req, res, next, false));

app.post("/api/chat/uploads", requireSameOrigin, chatUploadLimiter, requireUser, express.raw({ type: ["image/*", "video/*"], limit: "25mb" }), async (req, res, next) => {
  try {
    if (req.user.chatMuted) return res.status(403).json({ error: "Chat is unavailable for this account." });
    const db = await getDatabase();
    if (!process.env.BLOB_READ_WRITE_TOKEN || !(process.env.VERCEL_BLOB_PUBLIC_URL || process.env.BLOB_PUBLIC_URL)) {
      return res.status(503).json({ error: "Attachment uploads are not configured yet." });
    }
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
    const blob = await put(`jacer-chat/${userIdString(req.user.id)}/${Date.now()}-${safeName}`, body, {
      access: "public",
      addRandomSuffix: true,
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    noStore(res);
    res.status(201).json({ attachment: { kind, contentType, bytes: body.byteLength, url: blob.url } });
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
    if (user?.role === "owner") return res.status(403).json({ error: "Owner passwords are managed through deployment account settings." });
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
    if (user?.role === "owner") return res.status(403).json({ error: "Recovery codes are unavailable for owner accounts." });
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

app.get("/api/admin/presence", requireOwner, async (_req, res, next) => {
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

app.get("/api/admin/users", requireOwner, async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const users = await db.collection("users")
      .find({}, { projection: {
        username: 1,
        usernameNormalized: 1,
        role: 1,
        banned: 1,
        chatMuted: 1,
        appearOffline: 1,
        createdAt: 1,
        usernameChangedAt: 1,
        lastLoginAt: 1,
        lastSeenIpHash: 1,
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
        chatMuted: Boolean(user.chatMuted),
        status: user.banned ? "banned" : "active",
        isOnline: !user.banned && !user.appearOffline && onlineUserIds.has(user._id.toHexString()),
        createdAt: user.createdAt,
        usernameChangedAt: user.usernameChangedAt ?? null,
        lastLoginAt: user.lastLoginAt ?? null,
        lastSeenIpAvailable: Boolean(user.lastSeenIpHash),
        ipBanned: Boolean(user.lastSeenIpHash && activeIpBanHashes.has(user.lastSeenIpHash)),
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

async function getTargetManagedUser(db, rawId) {
  const userId = validObjectId(rawId);
  if (!userId) return { error: { status: 400, message: "Invalid account." } };
  const user = await db.collection("users").findOne(
    { _id: userId },
    { projection: { role: 1, username: 1, usernameNormalized: 1, lastSeenIpHash: 1 } },
  );
  if (!user) return { error: { status: 404, message: "Account not found." } };
  if (user.role === "owner") return { error: { status: 403, message: "Owner accounts are protected from player management." } };
  return { user, userId };
}

app.post("/api/admin/users/:id/ip-ban", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id);
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
    res.json({ ok: true, ipBanned: true, affectedAccounts: affectedIds.length });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id/ip-ban", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id);
    if (target.error) return res.status(target.error.status).json({ error: target.error.message });
    if (!target.user.lastSeenIpHash) return res.status(400).json({ error: "This account has no recorded login network yet." });
    await db.collection("ip_bans").updateOne(
      { _id: target.user.lastSeenIpHash },
      { $set: { active: false, unbannedAt: new Date(), unbannedBy: req.user.id } },
    );
    await recordSecurityEvent(db, { type: "ip_unban", actorId: req.user.id, targetUserId: target.userId, ipHash: target.user.lastSeenIpHash });
    res.json({ ok: true, ipBanned: false });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const db = await getDatabase();
    const target = await getTargetManagedUser(db, req.params.id);
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

app.patch("/api/admin/users/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid account." });
    const db = await getDatabase();
    const userId = new ObjectId(req.params.id);
    const target = await db.collection("users").findOne({ _id: userId }, { projection: { role: 1 } });
    if (!target) return res.status(404).json({ error: "Account not found." });
    if (target.role === "owner") return res.status(403).json({ error: "Owner accounts cannot be changed from player management." });
    const updates = {};
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
      if (!USER_ROLES.includes(req.body.role) || req.body.role === "owner") {
        return res.status(400).json({ error: "Role must be tester or player; owner access cannot be assigned here." });
      }
      updates.role = req.body.role;
    }
    let progress;
    if (req.body?.progress !== undefined) {
      progress = validatePlayerProgress(req.body.progress);
      if (!progress) return res.status(400).json({ error: "Player progress is invalid or exceeds the allowed size." });
    }
    if (Object.keys(updates).length) {
      try {
        await db.collection("users").updateOne({ _id: userId }, { $set: updates });
      } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: "That username is already taken." });
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
    res.json({ ok: true });
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
    const [golden, roulette, version, updateLog, profileTitles, builtinLevelOverrides, portalAssignments] = await Promise.all([
      db.collection("game_settings").findOne({ _id: "golden_time_limit_ms" }),
      db.collection("game_settings").findOne({ _id: "roulette_tiers" }),
      db.collection("game_settings").findOne({ _id: "app_version" }),
      db.collection("game_settings").findOne({ _id: "update_log" }),
      db.collection("game_settings").findOne({ _id: "profile_titles" }),
      db.collection("game_settings").findOne({ _id: "builtin_level_overrides" }),
      db.collection("game_settings").findOne({ _id: "portal_assignments" }),
    ]);
    res.json({
      goldenTimeLimitMs: parseGoldenTimeLimit(golden?.value) ? golden.value : 60000,
      rouletteTiers: validateRouletteTiers(roulette?.value) ?? defaultRouletteTiers,
      version: version?.value ?? "1",
      updateLog: validateUpdateLog(updateLog?.value) ?? [],
      profileTitles: validateProfileTitles(profileTitles?.value) ?? PROFILE_TITLE_MILESTONES,
      builtinLevelOverrides: validateBuiltinLevelOverrides(builtinLevelOverrides?.value) ?? {},
      portalAssignments: validatePortalAssignments(portalAssignments?.value) ?? {},
    });
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

app.get("/api/settings/history", requireOwner, async (req, res, next) => {
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

app.put("/api/settings/update-log", requireSameOrigin, requireOwner, async (req, res, next) => {
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

app.put("/api/settings/builtin-level-overrides", requireSameOrigin, requireOwner, async (req, res, next) => {
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

app.post("/api/levels", requireSameOrigin, requireOwner, async (req, res, next) => {
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

app.put("/api/levels/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
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

app.delete("/api/levels/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
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

app.post("/api/runs", requireSameOrigin, runSubmissionLimiter, requireUser, async (req, res, next) => {
  try {
    const run = req.body;
    if (!isValidRun(run)) return res.status(400).json({ error: "The run details are invalid." });
    const ownerSubmission = req.user.role === "owner" && req.body?.submitOwner === true;
    if (req.user.role !== "player" && !ownerSubmission) return res.json({ improved: false, ignored: true, reason: "owner-private", entry: null });
    if (req.user.role === "player" && req.user.leaderboardOptIn === false) return res.json({ improved: false, ignored: true, reason: "opted-out", entry: null });
    const levelName = run.level.trim();
    const db = await getDatabase();
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

app.get("/api/admin/messages", requireOwner, async (_req, res, next) => {
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

app.get("/api/admin/messages/:id/deliveries", requireOwner, async (req, res, next) => {
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

app.post("/api/admin/messages", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const { title, body } = req.body ?? {};
    const type = req.body?.type ?? "info";
    if (typeof title !== "string" || !title.trim() || title.trim().length > 100
      || typeof body !== "string" || !body.trim() || body.trim().length > 300
      || !["info", "warning", "reward"].includes(type)) {
      return res.status(400).json({ error: "Message title and body must be within the allowed lengths." });
    }
    const db = await getDatabase();
    let userId = null;
    if (req.body?.userId !== undefined && req.body.userId !== null) {
      if (!ObjectId.isValid(req.body.userId)) return res.status(400).json({ error: "Invalid recipient." });
      userId = new ObjectId(req.body.userId);
      const recipient = await db.collection("users").findOne({ _id: userId }, { projection: { _id: 1 } });
      if (!recipient) return res.status(404).json({ error: "Recipient not found." });
    }
    const createdAt = new Date();
    const result = await db.collection("owner_messages").insertOne({
      title: title.trim(),
      body: body.trim(),
      type,
      userId,
      createdAt,
      createdBy: req.user.id,
    });
    res.status(201).json({ message: { id: result.insertedId.toHexString(), title: title.trim(), body: body.trim(), type, userId: userId?.toHexString() ?? null, createdAt } });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/messages/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
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
    const result = await db.collection("owner_messages").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title: title.trim(), body: body.trim(), type, updatedAt: new Date(), updatedBy: req.user.id } },
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Message not found." });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/messages/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
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

app.get("/api/admin/codes", requireOwner, async (_req, res, next) => {
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

app.get("/api/admin/codes/:id/redemptions", requireOwner, async (req, res, next) => {
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

app.post("/api/admin/codes", requireSameOrigin, requireOwner, async (req, res, next) => {
  noStore(res);
  try {
    const code = typeof req.body?.code === "string"
      ? req.body.code.trim().toUpperCase()
      : crypto.randomBytes(12).toString("hex").toUpperCase();
    const maxUses = req.body?.maxUses ?? 1;
    const perPlayerLimit = req.body?.perPlayerLimit ?? 1;
    const reward = validateCodeReward(req.body?.reward ?? { type: "claims", amount: 0 });
    if (!/^[A-Z0-9!?@#$%&*+=._~()\-]{8,40}$/.test(code)
      || !Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 1000000
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

app.delete("/api/admin/codes/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
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

        const maxUses = Number.isSafeInteger(codeRecord.maxUses) ? codeRecord.maxUses : 1;
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

        const totalIncrement = await codes.updateOne(
          {
            _id: codeRecord._id,
            enabled: { $ne: false },
            $and: [
              { $or: [{ uses: { $lt: maxUses } }, { uses: { $exists: false } }] },
              { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }] },
            ],
          },
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
        if (reward.type === "claims" || reward.type === "specialClaims") {
          const rewardKey = reward.type === "claims" ? "orbit-claims" : "orbit-special-claims";
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
          remainingUses: Math.max(0, maxUses - ((codeRecord.uses ?? 0) + 1)),
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
  const settings = db.collection("game_settings");
  const recoveryAttempts = db.collection("account_recovery_attempts");

  await dropLegacyRecoveryIndex(recoveryAttempts);

  await Promise.all([
    users.createIndex({ usernameNormalized: 1 }, { unique: true }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ lastSeenAt: 1 }),
    users.createIndex({ lastSeenIpHash: 1 }),
    entries.createIndex({ userId: 1, levelName: 1 }, { unique: true }),
    entries.createIndex({ levelName: 1, timeMs: 1, achievedAt: 1, _id: 1 }),
    entries.createIndex({ timeMs: 1, achievedAt: 1, _id: 1 }),
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
    db.collection("chat_reports").createIndex({ status: 1, createdAt: -1 }),
    db.collection("chat_audit").createIndex({ createdAt: -1 }),
    db.collection("security_events").createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }),
    db.collection("ip_bans").createIndex({ active: 1, bannedAt: -1 }),
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
      { _id: "builtin_level_overrides" },
      { $setOnInsert: { value: {}, createdAt: new Date() } },
      { upsert: true },
    ),
  ]);

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
  console.log(`Owner accounts ${ownerAccounts.map(({ username }) => `"${username}"`).join(" and ")} are ready.`);
}

let databaseInitializationPromise;
export function initializeDatabase() {
  if (!databaseInitializationPromise) {
    databaseInitializationPromise = initializeDatabaseOnce().catch((error) => {
      databaseInitializationPromise = undefined;
      throw error;
    });
  }
  return databaseInitializationPromise;
}

export default app;
