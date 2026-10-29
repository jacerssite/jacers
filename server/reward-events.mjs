// This catalog is deliberately server-side.  It mirrors the fixed built-in
// routes, but contains only the reward facts the server needs to verify an
// asteroid collection.  A browser may name a route or asteroid slot; it may
// not choose how much currency that slot is worth.

const MAX_CURRENCY = 100_000_000;

/** @typedef {"claims" | "specialClaims" | "presents"} RewardCurrency */

/** @type {ReadonlyArray<{ index: number, name: string, asteroidCount: number, currency: RewardCurrency }>} */
export const TRUSTED_LEVEL_REWARDS = Object.freeze([
  { index: 0, name: "Quiet Orbit", asteroidCount: 3, currency: "claims" },
  { index: 1, name: "Redline Pass", asteroidCount: 4, currency: "claims" },
  { index: 2, name: "Gravity Well", asteroidCount: 5, currency: "claims" },
  { index: 3, name: "Shatter Belt", asteroidCount: 6, currency: "claims" },
  { index: 4, name: "Last Light", asteroidCount: 7, currency: "claims" },
  { index: 5, name: "Ion Cathedral", asteroidCount: 7, currency: "claims" },
  { index: 6, name: "Neon Graveyard", asteroidCount: 7, currency: "claims" },
  { index: 7, name: "Crystal Run", asteroidCount: 8, currency: "claims" },
  { index: 8, name: "Titan's Wake", asteroidCount: 10, currency: "claims" },
  { index: 9, name: "Solar Foundry", asteroidCount: 7, currency: "claims" },
  { index: 10, name: "Moonlit Ruins", asteroidCount: 7, currency: "claims" },
  { index: 11, name: "Event Horizon", asteroidCount: 9, currency: "claims" },
  { index: 12, name: "Eclipse Vault", asteroidCount: 6, currency: "specialClaims" },
  { index: 13, name: "Comet Nursery", asteroidCount: 6, currency: "claims" },
  { index: 14, name: "Prism Citadel", asteroidCount: 8, currency: "claims" },
  { index: 15, name: "Afterglow Station", asteroidCount: 9, currency: "claims" },
  { index: 16, name: "Nebula Hollow", asteroidCount: 6, currency: "specialClaims" },
  { index: 17, name: "Black Hole Archive", asteroidCount: 7, currency: "specialClaims" },
  { index: 18, name: "Prestige Gate", asteroidCount: 6, currency: "specialClaims" },
  { index: 19, name: "Stellar Sanctum", asteroidCount: 7, currency: "specialClaims" },
  { index: 20, name: "Quantum Depths", asteroidCount: 8, currency: "specialClaims" },
  { index: 21, name: "Infinity Spiral", asteroidCount: 9, currency: "specialClaims" },
  // Christmas routes are appended after the fixed routes by ensureChristmasLevels.
  { index: 22, name: "Tinsel Trail", asteroidCount: 5, currency: "presents" },
  { index: 23, name: "Candy Cane Crossing", asteroidCount: 5, currency: "presents" },
  { index: 24, name: "Evergreen Escape", asteroidCount: 6, currency: "presents" },
  { index: 25, name: "Frostlight Station", asteroidCount: 6, currency: "presents" },
  { index: 26, name: "Sleighbelt Run", asteroidCount: 7, currency: "presents" },
  { index: 27, name: "Star atop the Tree", asteroidCount: 8, currency: "presents" },
]);

const currencyProgressKey = Object.freeze({
  claims: "orbit-claims",
  specialClaims: "orbit-special-claims",
  presents: "orbit-christmas-presents",
});

function validRunId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,80}$/.test(value);
}

function asSafeCurrency(value) {
  return typeof value === "string" && /^\d{1,10}$/.test(value) && Number.isSafeInteger(Number(value))
    ? Math.min(MAX_CURRENCY, Number(value))
    : 0;
}

function readClaimedIndices(value, asteroidCount) {
  if (value === undefined) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > asteroidCount) return null;
    if (parsed.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= asteroidCount)) return null;
    const unique = [...new Set(parsed)].sort((first, second) => first - second);
    return unique.length === parsed.length ? unique : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a route only when both its stable level index and display name agree.
 * That makes a forged route name, a stale index, and a custom level all fail
 * closed instead of being allowed to choose a reward amount.
 */
export function getTrustedLevelReward(levelName, levelIndex) {
  if (typeof levelName !== "string" || !Number.isSafeInteger(levelIndex)) return null;
  const candidate = TRUSTED_LEVEL_REWARDS.find((level) => level.index === levelIndex && level.name === levelName.trim());
  return candidate ? { ...candidate } : null;
}

/** Validate one collectible slot in a trusted fixed route. */
export function validateAsteroidRewardRequest({ levelName, levelIndex, asteroidIndex } = {}) {
  const level = getTrustedLevelReward(levelName, levelIndex);
  if (!level || !Number.isSafeInteger(asteroidIndex) || asteroidIndex < 0 || asteroidIndex >= level.asteroidCount) return null;
  return { ...level, asteroidIndex, currencyKey: currencyProgressKey[level.currency] };
}

/** A stable unique event id used for the reward_events _id unique index. */
export function asteroidRewardEventId(runId, levelIndex, asteroidIndex) {
  if (!validRunId(runId) || !Number.isSafeInteger(levelIndex) || !Number.isSafeInteger(asteroidIndex) || levelIndex < 0 || asteroidIndex < 0) return null;
  return `asteroid:${runId}:${levelIndex}:${asteroidIndex}`;
}

/**
 * Apply exactly one server-validated asteroid reward to a copied progress map.
 * It intentionally returns an already-claimed result rather than crediting a
 * second time; the caller can then treat a retry/replayed packet as harmless.
 */
export function applyTrustedAsteroidReward(progress, reward) {
  if (!progress || typeof progress !== "object" || !reward || typeof reward !== "object") return { status: "invalid", progress: null };
  const request = validateAsteroidRewardRequest(reward);
  if (!request) return { status: "invalid", progress: null };
  const claimedKey = `orbit-asteroids-${request.index}`;
  const existing = readClaimedIndices(progress[claimedKey], request.asteroidCount);
  if (existing === null) return { status: "invalid", progress: null };
  if (existing.includes(request.asteroidIndex)) return { status: "already-claimed", progress: { ...progress } };
  const next = { ...progress };
  const nextClaims = [...existing, request.asteroidIndex].sort((first, second) => first - second);
  next[claimedKey] = JSON.stringify(nextClaims);
  next[`orbit-level-claims-${request.index}`] = String(nextClaims.length);
  next[request.currencyKey] = String(Math.min(MAX_CURRENCY, asSafeCurrency(progress[request.currencyKey]) + 1));
  return {
    status: "awarded",
    progress: next,
    reward: { currency: request.currency, amount: 1, levelIndex: request.index, asteroidIndex: request.asteroidIndex },
  };
}

export const SERVER_OWNED_PROGRESS_KEY = /^(orbit-(claims|special-claims|christmas-presents|asteroids-\d+|level-claims-\d+|reward-|secret-cooldown-|christmas-cooldown-))/;

