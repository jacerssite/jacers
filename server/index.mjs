import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pg from "pg";
import argon2 from "argon2";
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

const { Pool } = pg;
const app = express();
const ownerAccounts = [
  { username: "vslxped", password: process.env.OWNER_PASSWORD },
  { username: "riverwth", password: process.env.ADDITIONAL_OWNER_PASSWORD },
];
const cookieName = "jacer_session";
const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new Pool({
  connectionString: databaseUrl,
  max: process.env.VERCEL ? 1 : 10,
}) : null;
const dirname = path.dirname(fileURLToPath(import.meta.url));
const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

if (!databaseUrl) throw new Error("DATABASE_URL must be configured before the API can start.");
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
  const result = await pool.query(
    `SELECT u.id, u.username, u.role
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashSessionToken(token)],
  );
  return result.rows[0] ?? null;
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
  await pool.query("DELETE FROM user_sessions WHERE expires_at <= NOW()");
  await pool.query(
    "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashSessionToken(token), userId, expiresAt],
  );
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
      try {
        const created = await pool.query(
          `INSERT INTO users (username, username_normalized, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, username, role`,
          [username.display, username.normalized, passwordHash],
        );
        user = created.rows[0];
      } catch (error) {
        if (error?.code === "23505") return res.status(409).json({ error: "That username is already taken." });
        throw error;
      }
      await createSession(user.id, res);
      return res.status(201).json({ user: { username: user.username, role: user.role } });
    }

    const result = await pool.query(
      "SELECT id, username, username_normalized, password_hash, role FROM users WHERE username_normalized = $1",
      [username.normalized],
    );
    const user = result.rows[0];
    const valid = await argon2.verify(user?.password_hash ?? dummyPasswordHash, credentials.password);
    if (!valid || !user) return res.status(401).json({ error: "Username or password is incorrect." });
    await createSession(user.id, res);
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
    if (token) await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [hashSessionToken(token)]);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT value FROM game_settings WHERE key = 'golden_time_limit_ms'");
    res.json({ goldenTimeLimitMs: Number(result.rows[0]?.value ?? 60000) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/game-config", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT value FROM game_settings WHERE key = 'game_config'");
    const config = result.rows[0] ? JSON.parse(result.rows[0].value) : DEFAULT_GAME_CONFIG;
    res.json({ config });
  } catch (error) {
    next(error);
  }
});

app.put("/api/game-config", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const { config } = req.body ?? {};
    if (!isValidGameConfig(config)) return res.status(400).json({ error: "Game settings are invalid. Check percentage totals and power-up limits." });
    const value = JSON.stringify(config);
    await pool.query(
      `INSERT INTO game_settings (key, value) VALUES ('game_config', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [value],
    );
    res.json({ config });
  } catch (error) {
    next(error);
  }
});

app.get("/api/levels", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT id, data FROM workshop_levels ORDER BY id ASC");
    res.json({ levels: result.rows.map((row) => ({ ...row.data, customId: String(row.id) })) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/levels", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const level = validateWorkshopLevel(req.body?.level);
    if (!level) return res.status(400).json({ error: "The workshop level is invalid. Check its name, length, and tile positions." });
    const result = await pool.query("INSERT INTO workshop_levels (data) VALUES ($1::jsonb) RETURNING id, data", [JSON.stringify(level)]);
    res.status(201).json({ level: { ...result.rows[0].data, customId: String(result.rows[0].id) } });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/levels/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid workshop level." });
    const result = await pool.query("DELETE FROM workshop_levels WHERE id = $1", [id]);
    if (!result.rowCount) return res.status(404).json({ error: "Workshop level not found." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/golden-time-limit", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const { timeLimitMs } = req.body ?? {};
    if (!parseGoldenTimeLimit(timeLimitMs)) return res.status(400).json({ error: "Golden clear time must be between 1 second and 60 minutes." });
    await pool.query(
      `INSERT INTO game_settings (key, value) VALUES ('golden_time_limit_ms', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [String(timeLimitMs)],
    );
    res.json({ goldenTimeLimitMs: timeLimitMs });
  } catch (error) {
    next(error);
  }
});

app.get("/api/leaderboard", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.id, u.username, e.level_name AS "level", e.time_ms AS "timeMs",
              e.abilities, e.achieved_at AS "achievedAt"
       FROM leaderboard_entries e
       JOIN users u ON u.id = e.user_id
       ORDER BY e.time_ms ASC, e.achieved_at ASC
       LIMIT 100`,
    );
    res.json({ entries: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs", requireSameOrigin, runSubmissionLimiter, requireUser, async (req, res, next) => {
  try {
    const run = req.body;
    if (!isValidRun(run)) return res.status(400).json({ error: "The run details are invalid." });
    const levelName = run.level.trim();
    const result = await pool.query(
      `INSERT INTO leaderboard_entries (user_id, level_name, time_ms, abilities)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, level_name) DO UPDATE
         SET time_ms = EXCLUDED.time_ms, abilities = EXCLUDED.abilities, achieved_at = NOW()
         WHERE EXCLUDED.time_ms < leaderboard_entries.time_ms
       RETURNING id, level_name AS "level", time_ms AS "timeMs", abilities, achieved_at AS "achievedAt"`,
      [req.user.id, levelName, run.timeMs, run.abilities],
    );
    if (result.rows[0]) return res.status(201).json({ entry: result.rows[0], improved: true });
    const current = await pool.query(
      `SELECT id, level_name AS "level", time_ms AS "timeMs", abilities, achieved_at AS "achievedAt"
       FROM leaderboard_entries WHERE user_id = $1 AND level_name = $2`,
      [req.user.id, levelName],
    );
    res.json({ entry: current.rows[0], improved: false });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/leaderboard/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { level, timeMs, abilities } = req.body ?? {};
    if (!Number.isSafeInteger(id) || id < 1
      || typeof level !== "string" || level.trim().length < 1 || level.trim().length > 80
      || !Number.isSafeInteger(timeMs) || timeMs < 1000 || timeMs > 30 * 60 * 1000
      || !Array.isArray(abilities) || abilities.length > ALLOWED_ABILITIES.size
      || !abilities.every((ability) => ALLOWED_ABILITIES.has(ability))
      || new Set(abilities).size !== abilities.length) {
      return res.status(400).json({ error: "The leaderboard update is invalid." });
    }
    const result = await pool.query(
      `UPDATE leaderboard_entries SET level_name = $2, time_ms = $3, abilities = $4, achieved_at = NOW()
       WHERE id = $1
       RETURNING id, level_name AS "level", time_ms AS "timeMs", abilities, achieved_at AS "achievedAt"`,
      [id, level.trim(), timeMs, abilities],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Leaderboard entry not found." });
    res.json({ entry: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/leaderboard/:id", requireSameOrigin, requireOwner, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid leaderboard entry." });
    const result = await pool.query("DELETE FROM leaderboard_entries WHERE id = $1", [id]);
    if (!result.rowCount) return res.status(404).json({ error: "Leaderboard entry not found." });
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

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      username VARCHAR(20) NOT NULL,
      username_normalized VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(10) NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'owner')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions (expires_at);
    CREATE TABLE IF NOT EXISTS leaderboard_entries (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      level_name VARCHAR(80) NOT NULL,
      time_ms INTEGER NOT NULL CHECK (time_ms BETWEEN 1000 AND 1800000),
      abilities TEXT[] NOT NULL DEFAULT '{}',
      achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, level_name)
    );
    CREATE INDEX IF NOT EXISTS leaderboard_time_idx ON leaderboard_entries (time_ms, achieved_at);
    CREATE TABLE IF NOT EXISTS game_settings (
      key VARCHAR(80) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workshop_levels (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO game_settings (key, value) VALUES ('golden_time_limit_ms', '60000')
      ON CONFLICT (key) DO NOTHING;
    INSERT INTO game_settings (key, value) VALUES ('game_config', '${JSON.stringify(DEFAULT_GAME_CONFIG)}')
      ON CONFLICT (key) DO NOTHING;
  `);

  dummyPasswordHash = await argon2.hash("constant-time account lookup", passwordHashOptions);
  for (const account of ownerAccounts) {
    const username = normalizeUsername(account.username);
    const passwordHash = await argon2.hash(account.password, passwordHashOptions);
    await pool.query(
      `INSERT INTO users (username, username_normalized, password_hash, role)
       VALUES ($1, $2, $3, 'owner')
       ON CONFLICT (username_normalized) DO UPDATE
         SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, role = 'owner'`,
      [username.display, username.normalized, passwordHash],
    );
  }
  console.log(`Owner accounts ${ownerAccounts.map(({ username }) => `"${username}"`).join(" and ")} are ready.`);
}

export default app;
