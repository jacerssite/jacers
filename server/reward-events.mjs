// This catalog is deliberately server-side. It mirrors the built-in routes,
// including server-defined generated routes, and contains only the reward
// facts needed to verify a collection. A browser cannot choose its value.

const MAX_CURRENCY = 100_000_000;

/** @typedef {"claims" | "specialClaims" | "presents"} RewardCurrency */

/** @type {ReadonlyArray<{ index: number, name: string, asteroidCount: number, currency: RewardCurrency }>} */
export const TRUSTED_LEVEL_REWARDS = Object.freeze([
  { index: 0, name: "Vega Outpost", asteroidCount: 4, currency: "claims" },
  { index: 1, name: "Emberline Run", asteroidCount: 4, currency: "claims" },
  { index: 2, name: "Graviton Rift", asteroidCount: 5, currency: "claims" },
  { index: 3, name: "Shardstorm Passage", asteroidCount: 6, currency: "claims" },
  { index: 4, name: "Duskfall Reach", asteroidCount: 7, currency: "claims" },
  { index: 5, name: "Ion Crown", asteroidCount: 7, currency: "claims" },
  { index: 6, name: "Reliquary of Stars", asteroidCount: 7, currency: "claims" },
  { index: 7, name: "Prism Breaker", asteroidCount: 8, currency: "claims" },
  { index: 8, name: "Colossus Crossing", asteroidCount: 10, currency: "claims" },
  { index: 9, name: "Helios Crucible", asteroidCount: 7, currency: "claims" },
  { index: 10, name: "Moonforge Depths", asteroidCount: 7, currency: "claims" },
  { index: 11, name: "Event Horizon", asteroidCount: 9, currency: "claims" },
  { index: 12, name: "Eclipse Vault", asteroidCount: 6, currency: "specialClaims" },
  { index: 13, name: "Comet Foundry", asteroidCount: 6, currency: "claims" },
  { index: 14, name: "Amethyst Rampart", asteroidCount: 8, currency: "claims" },
  { index: 15, name: "Starfall Citadel", asteroidCount: 9, currency: "claims" },
  { index: 16, name: "Nebula Hollow", asteroidCount: 6, currency: "specialClaims" },
  { index: 17, name: "Black Hole Archive", asteroidCount: 7, currency: "specialClaims" },
  { index: 18, name: "Nova Crossing", asteroidCount: 6, currency: "claims" },
  { index: 19, name: "Meteor Run", asteroidCount: 6, currency: "claims" },
  { index: 20, name: "Astral Vault", asteroidCount: 6, currency: "specialClaims" },
  { index: 21, name: "Celestial Sanctum", asteroidCount: 7, currency: "specialClaims" },
  { index: 22, name: "Quantum Trench", asteroidCount: 8, currency: "specialClaims" },
  { index: 23, name: "Infinity Spiral", asteroidCount: 9, currency: "specialClaims" },
  { index: 24, name: "Frostbound Passage", asteroidCount: 5, currency: "presents" },
  { index: 25, name: "Candy Comet Run", asteroidCount: 5, currency: "presents" },
  { index: 26, name: "Evergreen Circuit", asteroidCount: 6, currency: "presents" },
  { index: 27, name: "Aurora Station", asteroidCount: 6, currency: "presents" },
  { index: 28, name: "Reindeer Nebula", asteroidCount: 7, currency: "presents" },
  { index: 29, name: "Northstar Throne", asteroidCount: 8, currency: "presents" },
  { index: 30, name: "Solar Breaker", asteroidCount: 6, currency: "claims" },
  { index: 31, name: "Aurora Run", asteroidCount: 6, currency: "claims" },
  { index: 32, name: "Gravity Escape", asteroidCount: 6, currency: "claims" },
  { index: 33, name: "Starline Rally", asteroidCount: 6, currency: "claims" },
  { index: 34, name: "Titan Passage", asteroidCount: 6, currency: "claims" },
  { index: 35, name: "Northstar Reach", asteroidCount: 6, currency: "claims" },
  { index: 36, name: "Aether Run", asteroidCount: 7, currency: "claims" },
  { index: 37, name: "Ringfall Circuit", asteroidCount: 7, currency: "claims" },
  { index: 38, name: "Violet Singularity", asteroidCount: 7, currency: "claims" },
  { index: 39, name: "Saturn's Crown", asteroidCount: 7, currency: "claims" },
  { index: 40, name: "Nebula Citadel", asteroidCount: 7, currency: "claims" },
  { index: 41, name: "Oracle's Crossing", asteroidCount: 7, currency: "claims" },
  { index: 42, name: "Prism Wastes", asteroidCount: 7, currency: "claims" },
  { index: 43, name: "Pale Eclipse", asteroidCount: 7, currency: "claims" },
  { index: 44, name: "Sovereign's Drift", asteroidCount: 7, currency: "claims" },
  { index: 45, name: "Astral Fortress", asteroidCount: 7, currency: "claims" },
  { index: 46, name: "Io's Veil", asteroidCount: 7, currency: "claims" },
  { index: 47, name: "Radiant Rupture", asteroidCount: 7, currency: "claims" },
  { index: 48, name: "Dusk Cathedral", asteroidCount: 7, currency: "claims" },
  { index: 49, name: "Nova Maze", asteroidCount: 7, currency: "claims" },
  { index: 50, name: "Violet Eventide", asteroidCount: 7, currency: "claims" },
  { index: 51, name: "Inverted Starsea", asteroidCount: 7, currency: "claims" },
  { index: 52, name: "Ashen Halo", asteroidCount: 7, currency: "claims" },
  { index: 53, name: "Sable Lights", asteroidCount: 7, currency: "claims" },
  { index: 54, name: "Titan's Expanse", asteroidCount: 7, currency: "claims" },
  { index: 55, name: "Endless Crown", asteroidCount: 7, currency: "claims" },
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
