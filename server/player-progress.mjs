import { validatePlayerProgress } from "./game-data.mjs";

// Secret routes are replayable after their server-observable cooldown. Their
// per-route collection records must be cleared at that point so their special
// asteroids can spawn again. Keep this list intentionally narrow: it is the
// fixed built-in secret route layout, not a general way to delete progress.
const SECRET_ROUTE_BY_LEVEL_INDEX = new Map([
  [12, "eclipse"],
  [16, "nebula"],
  [17, "archive"],
  [18, "prestige-gate"],
  [19, "stellar-sanctum"],
  [20, "quantum-depths"],
  [21, "infinity-spiral"],
]);
const SECRET_ROUTE_COOLDOWN_MS = 30 * 60 * 1000;

function getExpiredSecretRespawnClaimCount(existing, progress) {
  let allowedClaims = 0;
  for (const [levelIndex, secretId] of SECRET_ROUTE_BY_LEVEL_INDEX) {
    const claimsKey = `orbit-asteroids-${levelIndex}`;
    const cooldownKey = `orbit-secret-cooldown-${secretId}`;
    if (!Object.hasOwn(existing, claimsKey) || Object.hasOwn(progress, claimsKey)) continue;
    const completedAt = Number(existing[cooldownKey]);
    if (!Number.isSafeInteger(completedAt) || completedAt <= 0 || completedAt + SECRET_ROUTE_COOLDOWN_MS > Date.now()) return -1;
    // The client removes the completed cooldown alongside its collection
    // record. Requiring that pair prevents this exception from being reused.
    if (Object.hasOwn(progress, cooldownKey)) return -1;
    try {
      const claims = JSON.parse(existing[claimsKey]);
      if (!Array.isArray(claims) || claims.some((claim) => !Number.isSafeInteger(claim) || claim < 0 || claim >= 20)) return -1;
      allowedClaims += claims.length;
    } catch {
      return -1;
    }
  }
  return allowedClaims;
}

// Do not silently replace a balance another device changed since this device's
// last sync. The caller can keep its local data and ask the player to reload.
export function hasCurrencyConflict(existing, progress, baseline) {
  if (!existing || !baseline) return false;
  const currencyKeys = ["orbit-claims", "orbit-special-claims"];
  const prestigeChanged = (existing["orbit-prestige"] ?? "0") !== (baseline["orbit-prestige"] ?? "0");
  return currencyKeys.some((key) => {
    const localChanged = (progress[key] ?? "0") !== (baseline[key] ?? "0");
    const remoteChanged = (existing[key] ?? "0") !== (baseline[key] ?? "0");
    return localChanged && (remoteChanged || prestigeChanged);
  });
}

// A browser can edit localStorage, so player syncs must never be allowed to
// mint privileged inventory or make a large unexplained balance jump. Server
// generated rewards (codes, admin actions, and roulette) use replace writes and
// bypass this client-mutation guard.
export function getSuspiciousPlayerMutation(existing, progress, role = "player") {
  // Owner-equivalent/admin/tester accounts are explicitly allowed to use local test
  // tools. Moderators and level makers still use the normal anti-cheat path;
  // their roles must never become a way to mint currency or unlocks.
  if (["owner", "developer", "admin", "tester"].includes(role) || !existing) return null;
  const changedKeys = Object.keys(progress).filter((key) => progress[key] !== existing[key]);
  const privileged = changedKeys.find((key) => /^(orbit-(all-titles|unlock-|spin-|title-unlock-|jackpot-avatar|prestige-max|tester-))/.test(key));
  if (privileged) return `privileged progress key: ${privileged}`;

  const readCount = (key) => {
    const value = existing[key];
    return typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : 0;
  };
  const nextCount = (key) => {
    const value = progress[key];
    return typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : 0;
  };
  // Asteroid balances must be backed by the per-route collection records. This
  // stops a modified browser from minting currency in a sequence of small
  // updates that each stay below a simple maximum-jump limit.
  const claimedAsteroids = (source) => {
    let total = 0;
    for (const [key, value] of Object.entries(source)) {
      if (!/^orbit-asteroids-\d+$/.test(key)) continue;
      try {
        const claims = JSON.parse(value);
        if (!Array.isArray(claims) || claims.length > 20) return null;
        const uniqueClaims = new Set(claims);
        if (uniqueClaims.size !== claims.length || claims.some((claim) => !Number.isSafeInteger(claim) || claim < 0 || claim >= 20)) return null;
        total += claims.length;
      } catch {
        return null;
      }
    }
    return total;
  };
  for (const key of ["orbit-claims", "orbit-special-claims", "orbit-enemies-killed", "orbit-bosses-killed", "orbit-prestige"]) {
    if (Object.hasOwn(progress, key) && (typeof progress[key] !== "string" || !/^\d{1,10}$/.test(progress[key]))) return `${key} is invalid`;
  }
  const currentPrestige = readCount("orbit-prestige");
  const nextPrestige = nextCount("orbit-prestige");
  // Prestige is the one legitimate player action that resets normal currency,
  // inventory and route records.  Validate the completed normal routes from
  // the already-saved record, then allow that single, expected reset through.
  // Without this exception every prestige save is rejected as a currency drop.
  const savedNormalRoutes = Object.keys(existing).filter((key) => /^orbit-level-complete-\d+$/.test(key) && existing[key] === "1").length;
  const isValidatedPrestigeReset = nextPrestige === currentPrestige + 1
    && savedNormalRoutes >= 20
    && nextCount("orbit-claims") === 0
    && nextCount("orbit-special-claims") === 0
    && progress["orbit-prestige-world-unlocked"] === "1";
  if (isValidatedPrestigeReset) return null;
  for (const key of ["orbit-claims", "orbit-special-claims"]) {
    if (nextCount(key) < readCount(key)) return `${key} cannot decrease in a player sync`;
  }
  const currentAsteroidClaims = claimedAsteroids(existing);
  const nextAsteroidClaims = claimedAsteroids(progress);
  if (currentAsteroidClaims === null || nextAsteroidClaims === null) return "asteroid claim data is invalid";
  const earnedAsteroids = (nextCount("orbit-claims") - readCount("orbit-claims"))
    + (nextCount("orbit-special-claims") - readCount("orbit-special-claims"));
  const newAsteroidClaims = nextAsteroidClaims - currentAsteroidClaims;
  if (newAsteroidClaims < 0) {
    const allowedRespawnClaims = getExpiredSecretRespawnClaimCount(existing, progress);
    if (allowedRespawnClaims !== -newAsteroidClaims) return "asteroid claims cannot be removed in a player sync";
  }
  if (newAsteroidClaims >= 0 && earnedAsteroids > newAsteroidClaims) return "asteroid balance does not match collected asteroids";
  for (const [key, maximumJump] of [["orbit-enemies-killed", 5000], ["orbit-bosses-killed", 100]]) {
    const current = readCount(key);
    const next = nextCount(key);
    if (next < current) return `${key} cannot decrease`;
    if (next - current > maximumJump) return `${key} jumped too far`;
  }
  if (nextPrestige < currentPrestige) return "prestige cannot decrease in a player sync";
  if (nextPrestige - currentPrestige > 1) return "prestige advanced too far in one sync";
  const routeKeys = new Set([...Object.keys(existing), ...Object.keys(progress)]);
  const completedRouteCount = [...routeKeys].filter((key) => /^orbit-level-complete-\d+$/.test(key)
    && (progress[key] === "1" || existing[key] === "1")).length;
  if (nextPrestige > Math.floor(completedRouteCount / 20)) return "prestige does not match completed routes";

  const completionKeys = changedKeys.filter((key) => /^(orbit-(level-complete|golden-level)-|orbit-key-)/.test(key) && progress[key] === "1");
  if (completionKeys.length > 1) return "multiple route rewards changed in one sync";
  if (progress["orbit-powerups"] !== existing["orbit-powerups"]) {
    let before = {};
    let after = {};
    try { before = JSON.parse(existing["orbit-powerups"] ?? "{}"); } catch { return "invalid saved power-up inventory"; }
    try { after = JSON.parse(progress["orbit-powerups"] ?? "{}"); } catch { return "invalid power-up inventory"; }
    for (const kind of ["shield", "boost", "rapid", "cannon", "star"]) {
      const oldAmount = Number.isSafeInteger(before?.[kind]) && before[kind] >= 0 ? before[kind] : 0;
      const newAmount = Number.isSafeInteger(after?.[kind]) && after[kind] >= 0 && after[kind] <= 100000 ? after[kind] : -1;
      if (newAmount < 0) return "power-up inventory contains an invalid amount";
      if (newAmount - oldAmount > 20) return "power-up inventory jumped too far";
    }
  }
  return null;
}

export function sanitizeInitialPlayerProgress(progress, role = "player") {
  if (["owner", "developer", "admin", "tester"].includes(role)) return progress;
  const sanitized = { ...progress };
  for (const key of Object.keys(sanitized)) {
    if (/^orbit-(all-titles|unlock-|spin-|title-unlock-|jackpot-avatar|prestige-max|tester-)/.test(key)) delete sanitized[key];
  }
  const clampCount = (key, maximum) => {
    const value = sanitized[key];
    if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) { if (value !== undefined) delete sanitized[key]; return; }
    sanitized[key] = String(Math.min(Number(value), maximum));
  };
  clampCount("orbit-claims", 5000);
  clampCount("orbit-special-claims", 100);
  clampCount("orbit-enemies-killed", 5000);
  clampCount("orbit-bosses-killed", 100);
  clampCount("orbit-prestige", 1);
  if (sanitized["orbit-powerups"] !== undefined) {
    try {
      const inventory = JSON.parse(sanitized["orbit-powerups"]);
      const safeInventory = Object.fromEntries(["shield", "boost", "rapid", "cannon", "star"]
        .map((kind) => [kind, Number.isSafeInteger(inventory?.[kind]) && inventory[kind] >= 0 ? Math.min(inventory[kind], 20) : 0]));
      sanitized["orbit-powerups"] = JSON.stringify(safeInventory);
    } catch {
      delete sanitized["orbit-powerups"];
    }
  }
  return sanitized;
}

// Only initialize a new account. If another device creates the record first,
// use its data instead of overwriting it with this device's guest progress.
export async function initializePlayerProgress(collection, userId, progress) {
  try {
    await collection.insertOne({ _id: userId, data: progress, revision: 1, updatedAt: new Date() });
    return progress;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await collection.findOne({ _id: userId });
    if (!existing) throw error;
    return validatePlayerProgress(existing.data);
  }
}
