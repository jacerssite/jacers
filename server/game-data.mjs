export const ALLOWED_ABILITIES = new Set([
  "shield",
  "boost",
  "rapid",
  "cannon",
  "rainbow-star",
  "double-jump",
  "portal",
]);

export const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
export const POWERUP_KINDS = ["shield", "boost", "rapid", "cannon", "star"];
export const USER_ROLES = ["owner", "tester", "player"];
const defaultRarityOdds = { Common: 52, Uncommon: 27, Rare: 13, Epic: 6, Legendary: 2 };
const defaultRewardRanges = { Common: [50, 100], Uncommon: [101, 250], Rare: [251, 500], Epic: [501, 750], Legendary: [751, 1000] };
const defaultSkinChances = { Common: 0, Uncommon: 0, Rare: 0, Epic: 15, Legendary: 35 };
const defaultSpawnChances = { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 3 };

export const DEFAULT_GAME_CONFIG = {
  normal: {
    rainbowStarChance: 3,
    rarityOdds: defaultRarityOdds,
    rewardRanges: defaultRewardRanges,
    skinChances: defaultSkinChances,
    powerupSpawnChances: defaultSpawnChances,
  },
  prestige: {
    rainbowStarChance: 3,
    rarityOdds: defaultRarityOdds,
    rewardRanges: defaultRewardRanges,
    skinChances: defaultSkinChances,
    powerupSpawnChances: defaultSpawnChances,
  },
  powerupEffects: {
    shield: { charges: 1 },
    boost: { durationSeconds: 7, movementMultiplier: 1.7 },
    rapid: { durationSeconds: 10 },
    cannon: { durationSeconds: 0 },
    star: { durationSeconds: 15 },
  },
};

function isPercent(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function isBoundedInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isWorldConfig(value) {
  if (!value || typeof value !== "object") return false;
  const rarityOdds = value.rarityOdds;
  const rewardRanges = value.rewardRanges;
  const skinChances = value.skinChances;
  const spawnChances = value.powerupSpawnChances;
  return isPercent(value.rainbowStarChance)
    && rarityOdds && RARITIES.every((rarity) => isPercent(rarityOdds[rarity]))
    && RARITIES.reduce((total, rarity) => total + rarityOdds[rarity], 0) === 100
    && rewardRanges && RARITIES.every((rarity) => Array.isArray(rewardRanges[rarity])
      && rewardRanges[rarity].length === 2
      && isBoundedInteger(rewardRanges[rarity][0], 0, 1000000)
      && isBoundedInteger(rewardRanges[rarity][1], rewardRanges[rarity][0], 1000000))
    && skinChances && RARITIES.every((rarity) => isPercent(skinChances[rarity]))
    && spawnChances && POWERUP_KINDS.every((kind) => isPercent(spawnChances[kind]));
}

export function isValidGameConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const effects = value.powerupEffects;
  return isWorldConfig(value.normal)
    && isWorldConfig(value.prestige)
    && effects && isBoundedInteger(effects.shield?.charges, 1, 10)
    && isBoundedInteger(effects.boost?.durationSeconds, 1, 300)
    && Number.isFinite(effects.boost?.movementMultiplier)
    && effects.boost.movementMultiplier >= 1
    && effects.boost.movementMultiplier <= 4
    && isBoundedInteger(effects.rapid?.durationSeconds, 1, 300)
    && isBoundedInteger(effects.cannon?.durationSeconds, 0, 300)
    && isBoundedInteger(effects.star?.durationSeconds, 1, 300);
}

function parseTileList(value, length) {
  return Array.isArray(value)
    && value.length <= 60
    && value.every((index) => isBoundedInteger(index, 1, length - 2))
    && new Set(value).size === value.length;
}

export function validateWorkshopLevel(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.name !== "string" || value.name.trim().length < 1 || value.name.trim().length > 40
    || /[<>]/.test(value.name)
    || typeof value.briefing !== "string" || value.briefing.trim().length < 1 || value.briefing.trim().length > 240
    || /[<>]/.test(value.briefing)
    || !isBoundedInteger(value.length, 8, 60)) return null;
  const fields = ["asteroids", "walls", "enemies", "spikes", "gravity"];
  if (!fields.every((field) => parseTileList(value[field], value.length))) return null;
  for (const field of ["blocks", "portals", "specialAsteroids", "miniBosses", "flip"]) {
    if (value[field] !== undefined && !parseTileList(value[field], value.length)) return null;
  }
  if (value.powerups !== undefined && (!Array.isArray(value.powerups) || value.powerups.length > 60
    || !value.powerups.every((item) => item && isBoundedInteger(item.index, 1, value.length - 2) && POWERUP_KINDS.includes(item.kind))
    || new Set(value.powerups.map((item) => item.index)).size !== value.powerups.length)) return null;
  if (value.bossIndex !== undefined && !isBoundedInteger(value.bossIndex, 1, value.length - 2)) return null;
  if (value.secretId !== undefined && (typeof value.secretId !== "string" || !/^[a-z0-9-]{1,50}$/.test(value.secretId))) return null;
  if (value.flippedRoute !== undefined) {
    const route = value.flippedRoute;
    if (!route || typeof route !== "object"
      || !["walls", "enemies", "spikes", "gravity"].every((field) => parseTileList(route[field], value.length))
      || (route.key !== undefined && !isBoundedInteger(route.key, 1, value.length - 2))) return null;
  }
  if (value.secret !== undefined && typeof value.secret !== "boolean"
    || value.prestige !== undefined && typeof value.prestige !== "boolean"
    || value.boss !== undefined && typeof value.boss !== "boolean") return null;
  const level = {
    name: value.name.trim(),
    briefing: value.briefing.trim(),
    length: value.length,
    asteroids: [...value.asteroids],
    walls: [...value.walls],
    enemies: [...value.enemies],
    spikes: [...value.spikes],
    gravity: [...value.gravity],
  };
  for (const field of ["blocks", "portals", "specialAsteroids", "miniBosses", "flip", "powerups", "flippedRoute", "bossIndex", "secret", "secretId", "prestige", "boss"]) {
    if (value[field] !== undefined) level[field] = structuredClone(value[field]);
  }
  return level;
}

export function validatePlayerProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 500) return null;
  let totalBytes = 0;
  const progress = {};
  for (const [key, item] of entries) {
    if (!/^orbit-[A-Za-z0-9_-]{1,120}$/.test(key) || key === "orbit-global-level-cache"
      || /password|recovery|hash|token/i.test(key)
      || typeof item !== "string" || Buffer.byteLength(item, "utf8") > 20000) return null;
    totalBytes += Buffer.byteLength(key, "utf8") + Buffer.byteLength(item, "utf8");
    if (totalBytes > 100000) return null;
    progress[key] = item;
  }
  return progress;
}

export function normalizeUsername(value) {
  if (typeof value !== "string") return null;
  const username = value.trim();
  return /^[A-Za-z0-9_]{3,20}$/.test(username)
    ? { display: username, normalized: username.toLowerCase() }
    : null;
}

export function normalizeRecoveryCode(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase().replace(/[-\s]/g, "");
  return /^[A-HJ-NP-Z2-9]{16}$/.test(code) ? code : null;
}

export function formatRecoveryCode(value) {
  const code = normalizeRecoveryCode(value);
  return code ? code.match(/.{4}/g).join("-") : null;
}

/**
 * Redemption reward contract: { type: "claims" | "specialClaims", amount: integer }.
 */
export function validateCodeReward(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !["claims", "specialClaims"].includes(value.type)
    || !Number.isSafeInteger(value.amount) || value.amount < 0 || value.amount > 1000000) return null;
  return { type: value.type, amount: value.amount };
}

export function validateRouletteTiers(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const names = new Set();
  const tiers = [];
  for (const tier of value) {
    if (!tier || typeof tier !== "object" || Array.isArray(tier)
      || typeof tier.name !== "string" || tier.name.trim().length < 1 || tier.name.trim().length > 40
      || /[<>]/.test(tier.name)
      || !isBoundedInteger(tier.chance, 0, 100)
      || !isBoundedInteger(tier.minReward, 0, 1000000)
      || !isBoundedInteger(tier.maxReward, tier.minReward, 1000000)) return null;
    const name = tier.name.trim();
    if (names.has(name.toLowerCase())) return null;
    names.add(name.toLowerCase());
    tiers.push({ name, chance: tier.chance, minReward: tier.minReward, maxReward: tier.maxReward });
  }
  return tiers.reduce((total, tier) => total + tier.chance, 0) === 100 ? tiers : null;
}

export function isValidPassword(value) {
  return typeof value === "string"
    && value.length >= 10
    && value.length <= 128
    && Buffer.byteLength(value, "utf8") <= 256;
}

export function isValidRun(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (typeof value.level !== "string" || value.level.trim().length < 1 || value.level.trim().length > 80) return false;
  if (!Number.isSafeInteger(value.timeMs) || value.timeMs < 1000 || value.timeMs > 30 * 60 * 1000) return false;
  return Array.isArray(value.abilities)
    && value.abilities.length <= ALLOWED_ABILITIES.size
    && value.abilities.every((ability) => ALLOWED_ABILITIES.has(ability))
    && new Set(value.abilities).size === value.abilities.length;
}

export function parseGoldenTimeLimit(value) {
  return Number.isSafeInteger(value) && value >= 1000 && value <= 60 * 60 * 1000;
}
