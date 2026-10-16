import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { MongoClient, ObjectId } from "mongodb";
import argon2 from "argon2";
import { getMongoDatabaseConfigurationError } from "./database-config.mjs";
import {
  ALLOWED_ABILITIES,
  isValidPassword,
  isValidGameConfig,
  isValidRun,
  normalizeUsername,
  parseGoldenTimeLimit,
  DEFAULT_GAME_CONFIG,
  validateWorkshopLevel,
} from "./game-data.mjs";

const app = express();
const ownerAccounts = [
  { username: "vslxped", password: process.env.OWNER_PASSWORD },
  { username: "riverwth", password: process.env.ADDITIONAL_OWNER_PASSWORD },
];
const cookieName = "jacer_session";
const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;
const databaseUrl = process.env.DATABASE_MONGODB_URI;
const databaseConfigurationError = getMongoDatabaseConfigurationError(databaseUrl, { vercel: Boolean(process.env.VERCEL) });
const mongoClient = databaseUrl && !databaseConfigurationError
  ? new MongoClient(databaseUrl, { maxPoolSize: process.env.VERCEL ? 5 : 10 })
  : null;
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
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-site" },
}));
app.use(express.json({ limit: "16kb", strict: true }));

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
let dummyPasswordHash = "";

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
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeMs / 1000}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function getAuthenticatedUser(req) {
  const token = getCookie(req, cookieName);
  if (!token || token.length > 100) return null;
  const db = await getDatabase();
  const session = await db.collection("user_sessions").findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const user = await db.collection("users").findOne(
    { _id: session.userId },
    { projection: { username: 1, role: 1 } },
  );
  return user ? { id: user._id, username: user.username, role: user.role } : null;
}

async function requireUser(req, res, next) {
  try {
    req.user = await getAuthenticatedUser(req);
    if (!req.user) return res.status(401).json({ error: "Log in to continue." });
    next();
  } catch (error) {
    next(error);
  }
}

async function requireOwner(req, res, next) {
  try {
    req.user = await getAuthenticatedUser(req);
    if (!req.user) return res.status(401).json({ error: "Log in to continue." });
    if (req.user.role !== "owner") return res.status(403).json({ error: "Owner access is required." });
    next();
  } catch (error) {
    next(error);
  }
}

async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  const db = await getDatabase();
  await db.collection("user_sessions").deleteMany({ expiresAt: { $lte: new Date() } });
  await db.collection("user_sessions").insertOne({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt,
    createdAt: new Date(),
  });
  setSessionCookie(res, token);
}

async function accountHandler(req, res, next, mode) {
  try {
    const credentials = req.body;
    const username = normalizeUsername(credentials?.username);
    if (!username || !isValidPassword(credentials?.password)) {
      return res.status(400).json({ error: "Use a 3-20 character username (letters, numbers, underscore) and a 10-128 character password." });
    }

    if (mode === "register") {
      const passwordHash = await argon2.hash(credentials.password, passwordHashOptions);
      let user;
      const db = await getDatabase();
      try {
        const created = await db.collection("users").insertOne({
          username: username.display,
          usernameNormalized: username.normalized,
          passwordHash,
          role: "player",
          createdAt: new Date(),
        });
        user = { _id: created.insertedId, username: username.display, role: "player" };
      } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: "That username is already taken." });
        throw error;
      }
      await createSession(user._id, res);
      return res.status(201).json({ user: { username: user.username, role: user.role } });
    }

    const db = await getDatabase();
    const user = await db.collection("users").findOne({ usernameNormalized: username.normalized });
    const valid = await argon2.verify(user?.passwordHash ?? dummyPasswordHash, credentials.password);
    if (!valid || !user) return res.status(401).json({ error: "Username or password is incorrect." });
    await createSession(user._id, res);
    return res.json({ user: { username: user.username, role: user.role } });
  } catch (error) {
    next(error);
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/register", requireSameOrigin, authLimiter, (req, res, next) => accountHandler(req, res, next, "register"));
app.post("/api/auth/login", requireSameOrigin, authLimiter, (req, res, next) => accountHandler(req, res, next, "login"));

app.get("/api/auth/session", async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    res.json({ user: user ? { username: user.username, role: user.role } : null });
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

app.get("/api/settings", async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const setting = await db.collection("game_settings").findOne({ _id: "golden_time_limit_ms" });
    res.json({ goldenTimeLimitMs: Number(setting?.value ?? 60000) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/game-config", async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const setting = await db.collection("game_settings").findOne({ _id: "game_config" });
    const config = setting?.value ?? DEFAULT_GAME_CONFIG;
    res.json({ config });
  } catch (error) {
    next(error);
  }
});

app.put("/api/game-config", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const { config } = req.body ?? {};
    if (!isValidGameConfig(config)) return res.status(400).json({ error: "Game settings are invalid. Check percentage totals and power-up limits." });
    const db = await getDatabase();
    await db.collection("game_settings").updateOne(
      { _id: "game_config" },
      { $set: { value: config, updatedAt: new Date() } },
      { upsert: true },
    );
    res.json({ config });
  } catch (error) {
    next(error);
  }
});

app.get("/api/levels", async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const documents = await db.collection("workshop_levels").find().sort({ _id: 1 }).toArray();
    res.json({ levels: documents.map(({ _id, data }) => ({ ...data, customId: _id.toHexString() })) });
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
    await db.collection("game_settings").updateOne(
      { _id: "golden_time_limit_ms" },
      { $set: { value: timeLimitMs, updatedAt: new Date() } },
      { upsert: true },
    );
    res.json({ goldenTimeLimitMs: timeLimitMs });
  } catch (error) {
    next(error);
  }
});

app.get("/api/leaderboard", async (_req, res, next) => {
  try {
    const db = await getDatabase();
    const entries = await db.collection("leaderboard_entries")
      .find()
      .sort({ timeMs: 1, achievedAt: 1 })
      .limit(100)
      .toArray();
    const userIds = [...new Set(entries.map((entry) => entry.userId.toHexString()))].map((id) => new ObjectId(id));
    const users = await db.collection("users")
      .find({ _id: { $in: userIds } }, { projection: { username: 1 } })
      .toArray();
    const usernames = new Map(users.map((user) => [user._id.toHexString(), user.username]));
    res.json({
      entries: entries.map((entry) => ({
        id: entry._id.toHexString(),
        username: usernames.get(entry.userId.toHexString()) ?? "Unknown pilot",
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
    const levelName = run.level.trim();
    const db = await getDatabase();
    const entries = db.collection("leaderboard_entries");
    let improved = false;
    try {
      const result = await entries.updateOne(
        {
          userId: req.user.id,
          levelName,
          $or: [{ timeMs: { $gt: run.timeMs } }, { timeMs: { $exists: false } }],
        },
        {
          $set: {
            timeMs: run.timeMs,
            abilities: run.abilities,
            achievedAt: new Date(),
          },
          $setOnInsert: { userId: req.user.id, levelName },
        },
        { upsert: true },
      );
      improved = result.upsertedCount === 1 || result.matchedCount === 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
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

  await Promise.all([
    users.createIndex({ usernameNormalized: 1 }, { unique: true }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    entries.createIndex({ userId: 1, levelName: 1 }, { unique: true }),
    entries.createIndex({ timeMs: 1, achievedAt: 1 }),
  ]);
  await settings.updateOne(
    { _id: "golden_time_limit_ms" },
    { $setOnInsert: { value: 60000, createdAt: new Date() } },
    { upsert: true },
  );
  await settings.updateOne(
    { _id: "game_config" },
    { $setOnInsert: { value: DEFAULT_GAME_CONFIG, createdAt: new Date() } },
    { upsert: true },
  );

  dummyPasswordHash = await argon2.hash("constant-time account lookup", passwordHashOptions);
  for (const account of ownerAccounts) {
    const username = normalizeUsername(account.username);
    const passwordHash = await argon2.hash(account.password, passwordHashOptions);
    const ownerUpdate = {
      $set: {
        username: username.display,
        usernameNormalized: username.normalized,
        passwordHash,
        role: "owner",
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
