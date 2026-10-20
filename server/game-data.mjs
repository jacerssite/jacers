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
export const PROFILE_TITLE_MILESTONES = [
  { id: "cadet", name: "Cadet", routes: 1, requirement: { type: "routes", amount: 1 } },
  { id: "pathfinder", name: "Pathfinder", routes: 5, requirement: { type: "routes", amount: 5 } },
  { id: "sector-ace", name: "Sector Ace", routes: 10, requirement: { type: "routes", amount: 10 } },
  { id: "stellar-navigator", name: "Stellar Navigator", routes: 20, requirement: { type: "routes", amount: 20 } },
  { id: "cosmic-legend", name: "Cosmic Legend", routes: 40, requirement: { type: "routes", amount: 40 } },
];
export function validateProfileTitles(value) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ids = new Set();
  const titles = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || typeof entry.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(entry.id)
      || ids.has(entry.id)
      || typeof entry.name !== "string" || !entry.name.trim() || entry.name.trim().length > 50 || /[<>]/.test(entry.name)
      || !Number.isSafeInteger(entry.routes) || entry.routes < 0 || entry.routes > 100000) return null;
    const requirement = entry.requirement ?? { type: "routes", amount: entry.routes };
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)
      || !["routes", "golden", "prestige", "roulette"].includes(requirement.type)
      || !Number.isSafeInteger(requirement.amount) || requirement.amount < 0 || requirement.amount > 100000) return null;
    ids.add(entry.id);
    const normalized = { id: entry.id, name: entry.name.trim(), routes: entry.routes };
    if (entry.requirement !== undefined) normalized.requirement = { type: requirement.type, amount: requirement.amount };
    titles.push(normalized);
  }
  return titles;
}
const defaultRarityOdds = { Common: 52, Uncommon: 27, Rare: 13, Epic: 6, Legendary: 2 };
const defaultRewardRanges = { Common: [50, 100], Uncommon: [101, 250], Rare: [251, 500], Epic: [501, 750], Legendary: [751, 1000] };
const defaultSkinChances = { Common: 0, Uncommon: 0, Rare: 0, Epic: 15, Legendary: 35 };
const defaultSpawnChances = { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 3 };

export const DEFAULT_GAME_CONFIG = {
  normal: {
    rainbowStarChance: 3,
    portalSpawnChance: 100,
    rarityOdds: defaultRarityOdds,
    rewardRanges: defaultRewardRanges,
    skinChances: defaultSkinChances,
    powerupSpawnChances: defaultSpawnChances,
  },
  prestige: {
    rainbowStarChance: 3,
    portalSpawnChance: 100,
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
  powerupRules: {
    oneActiveAtATime: false,
    rainbowStarInvincible: true,
    rainbowStarDefeatsEnemies: true,
    maxUsesPerLevel: { shield: 99, boost: 99, rapid: 99, cannon: 99, star: 99 },
    maxPickupsPerLevel: { shield: 1, boost: 1, rapid: 1, cannon: 1, star: 1 },
  },
  enemyRules: {
    attackIntervalFrames: 90,
    prestigeAttackMultiplier: 0.72,
    prestigeAttackMultipliers: [0.72, 0.72, 0.72],
    secretAttackMultiplier: 0.84,
    rapidAttackMultiplier: 0.58,
    projectileSpeed: 2.6,
    miniBossProjectileSpeed: 4.5,
    bossProjectileSpeed: 4.2,
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
    && isPercent(value.portalSpawnChance)
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
  const limits = value.powerupRules;
  const enemies = value.enemyRules;
  const validLimits = (candidate, maximum) => candidate && POWERUP_KINDS.every((kind) => isBoundedInteger(candidate[kind], 0, maximum));
  return isWorldConfig(value.normal)
    && isWorldConfig(value.prestige)
    && effects && isBoundedInteger(effects.shield?.charges, 1, 10)
    && isBoundedInteger(effects.boost?.durationSeconds, 1, 300)
    && Number.isFinite(effects.boost?.movementMultiplier)
    && effects.boost.movementMultiplier >= 1
    && effects.boost.movementMultiplier <= 4
    && isBoundedInteger(effects.rapid?.durationSeconds, 1, 300)
    && isBoundedInteger(effects.cannon?.durationSeconds, 0, 300)
    && isBoundedInteger(effects.star?.durationSeconds, 1, 300)
    && value.powerupRules
    && typeof value.powerupRules.oneActiveAtATime === "boolean"
    && typeof value.powerupRules.rainbowStarInvincible === "boolean"
    && typeof value.powerupRules.rainbowStarDefeatsEnemies === "boolean"
    && validLimits(limits.maxUsesPerLevel, 99)
    && validLimits(limits.maxPickupsPerLevel, 20)
    && enemies
    && isBoundedInteger(enemies.attackIntervalFrames, 15, 600)
    && Number.isFinite(enemies.prestigeAttackMultiplier) && enemies.prestigeAttackMultiplier >= 0.25 && enemies.prestigeAttackMultiplier <= 2
    && (enemies.prestigeAttackMultipliers === undefined
      || (Array.isArray(enemies.prestigeAttackMultipliers)
        && enemies.prestigeAttackMultipliers.length >= 1
        && enemies.prestigeAttackMultipliers.length <= 100
        && enemies.prestigeAttackMultipliers.every((value) => Number.isFinite(value) && value >= 0.25 && value <= 2)))
    && Number.isFinite(enemies.secretAttackMultiplier) && enemies.secretAttackMultiplier >= 0.25 && enemies.secretAttackMultiplier <= 2
    && Number.isFinite(enemies.rapidAttackMultiplier) && enemies.rapidAttackMultiplier >= 0.25 && enemies.rapidAttackMultiplier <= 1
    && Number.isFinite(enemies.projectileSpeed) && enemies.projectileSpeed >= 0.5 && enemies.projectileSpeed <= 12
    && Number.isFinite(enemies.miniBossProjectileSpeed) && enemies.miniBossProjectileSpeed >= 0.5 && enemies.miniBossProjectileSpeed <= 16
    && Number.isFinite(enemies.bossProjectileSpeed) && enemies.bossProjectileSpeed >= 0.5 && enemies.bossProjectileSpeed <= 16;
}

function parseTileList(value, length) {
  return Array.isArray(value)
    && value.length <= 60
    && value.every((index) => isBoundedInteger(index, 1, length - 2))
    && new Set(value).size === value.length;
}

function validPowerups(value, length) {
  return Array.isArray(value) && value.length <= 60
    && value.every((item) => item && isBoundedInteger(item.index, 1, length - 2) && POWERUP_KINDS.includes(item.kind))
    && new Set(value.map((item) => item.index)).size === value.length;
}

function validSecretPortal(value, length) {
  return value && typeof value === "object" && !Array.isArray(value)
    && isBoundedInteger(value.index, 1, length - 2)
    && typeof value.secretId === "string" && /^[a-z0-9-]{1,50}$/.test(value.secretId)
    && (value.id === undefined || typeof value.id === "string" && /^[a-z0-9-]{1,80}$/.test(value.id))
    && (value.y === undefined || isBoundedInteger(value.y, 0, 2000))
    && (value.requiresPortal === undefined || typeof value.requiresPortal === "boolean");
}

function validSecretKey(value, length) {
  return value && typeof value === "object" && !Array.isArray(value)
    && typeof value.id === "string" && /^[a-z0-9-]{1,50}$/.test(value.id)
    && isBoundedInteger(value.index, 1, length - 2)
    && (value.y === undefined || isBoundedInteger(value.y, 0, 2000))
    && (value.requiresPortal === undefined || typeof value.requiresPortal === "boolean");
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
  if (value.powerups !== undefined && !validPowerups(value.powerups, value.length)) return null;
  if (value.bossIndex !== undefined && !isBoundedInteger(value.bossIndex, 1, value.length - 2)) return null;
  if (value.secretId !== undefined && (typeof value.secretId !== "string" || !/^[a-z0-9-]{1,50}$/.test(value.secretId))) return null;
  if (value.secretPortals !== undefined && (!Array.isArray(value.secretPortals) || value.secretPortals.length > 20 || !value.secretPortals.every((portal) => validSecretPortal(portal, value.length)))) return null;
  if (value.secretKey !== undefined && !validSecretKey(value.secretKey, value.length)) return null;
  if (value.flippedRoute !== undefined) {
    const route = value.flippedRoute;
    if (!route || typeof route !== "object" || Array.isArray(route)
      || !["walls", "enemies", "spikes", "gravity"].every((field) => parseTileList(route[field], value.length))
      || (route.powerups !== undefined && !validPowerups(route.powerups, value.length))
      || (route.key !== undefined && !isBoundedInteger(route.key, 1, value.length - 2))) return null;
  }
  if (value.secret !== undefined && typeof value.secret !== "boolean"
    || value.prestige !== undefined && typeof value.prestige !== "boolean"
    || value.boss !== undefined && typeof value.boss !== "boolean"
    || value.prestigeRequirement !== undefined && !isBoundedInteger(value.prestigeRequirement, 0, 100)
    || value.type !== undefined && !["normal", "secret", "prestige"].includes(value.type)) return null;
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
  for (const field of ["blocks", "portals", "specialAsteroids", "miniBosses", "flip", "powerups", "bossIndex", "secret", "secretId", "secretPortals", "secretKey", "prestige", "prestigeRequirement", "type", "boss"]) {
    if (value[field] !== undefined) level[field] = structuredClone(value[field]);
  }
  if (value.flippedRoute !== undefined) {
    const route = value.flippedRoute;
    level.flippedRoute = Object.fromEntries(["walls", "enemies", "spikes", "gravity", "powerups", "key"]
      .filter((field) => route[field] !== undefined)
      .map((field) => [field, structuredClone(route[field])]));
  }
  return level;
}

export function validateBuiltinLevelOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 100) return null;
  const overrides = {};
  for (const [index, item] of entries) {
    if (!/^\d{1,3}$/.test(index) || Number(index) > 999) return null;
    const level = validateWorkshopLevel(item);
    if (!level) return null;
    overrides[index] = level;
  }
  return overrides;
}

const PORTAL_TARGET_IDS = new Set(["eclipse", "nebula", "archive", "stellar-sanctum", "quantum-depths", "infinity-spiral"]);

export function validatePortalAssignments(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > PORTAL_TARGET_IDS.size) return null;
  const assignments = {};
  for (const [target, source] of entries) {
    if (!PORTAL_TARGET_IDS.has(target)
      || typeof source !== "string" || !source.trim() || source.trim().length > 120 || /[<>]/.test(source)) return null;
    assignments[target] = source.trim();
  }
  return assignments;
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

export function getEarnedProfileTitle(completedRouteCount, selectedTitle, titles = PROFILE_TITLE_MILESTONES) {
  if (!Number.isSafeInteger(completedRouteCount) || completedRouteCount < 0 || typeof selectedTitle !== "string") return "";
  return titles.find((title) => title.id === selectedTitle && completedRouteCount >= (title.requirement?.type === "routes" ? title.requirement.amount : title.routes))?.name ?? "";
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

/** Redemption rewards may grant currency, power-ups, cosmetics, or a profile title. */
export function validateCodeReward(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.type !== "string") return null;
  if (["claims", "specialClaims"].includes(value.type)) {
    if (!Number.isSafeInteger(value.amount) || value.amount < 0 || value.amount > 1000000) return null;
    return { type: value.type, amount: value.amount };
  }
  if (value.type === "powerup") {
    if (!POWERUP_KINDS.includes(value.kind) || !Number.isSafeInteger(value.amount) || value.amount < 1 || value.amount > 1000) return null;
    return { type: value.type, kind: value.kind, amount: value.amount };
  }
  if (["skin", "trail", "avatar"].includes(value.type)) {
    if (!Number.isSafeInteger(value.index) || value.index < 0 || value.index > 500) return null;
    return { type: value.type, index: value.index };
  }
  if (value.type === "title" && typeof value.titleId === "string" && /^[a-z0-9-]{1,40}$/.test(value.titleId)) {
    return { type: value.type, titleId: value.titleId };
  }
  return null;
}

export function validateRouletteTiers(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const expectedBuyIns = [5, 10, 25];
  const rewardTypes = ["claims", "specialClaims", "color", "trail", "avatar", "title"];
  const tiers = [];
  for (let index = 0; index < value.length; index++) {
    const tier = value[index];
    const hasTitleChance = Boolean(tier?.chances && Object.prototype.hasOwnProperty.call(tier.chances, "title"));
    if (!tier || typeof tier !== "object" || Array.isArray(tier) || tier.buyIn !== expectedBuyIns[index]
      || !tier.chances || typeof tier.chances !== "object" || Array.isArray(tier.chances)
      || !rewardTypes.every((type) => isBoundedInteger(tier.chances[type] ?? (type === "title" ? 0 : undefined), 0, 100))
      || rewardTypes.reduce((total, type) => total + (tier.chances[type] ?? 0), 0) !== 100
      || !tier.rewards || typeof tier.rewards !== "object" || Array.isArray(tier.rewards)) return null;
    const rewards = {};
    for (const type of ["claims", "specialClaims"]) {
      const range = tier.rewards[type];
      if (!Array.isArray(range) || range.length !== 2
        || !isBoundedInteger(range[0], 1, 1000000)
        || !isBoundedInteger(range[1], range[0], 1000000)) return null;
      rewards[type] = [...range];
    }
    const normalizedChances = Object.fromEntries(rewardTypes
      .filter((type) => hasTitleChance || type !== "title")
      .map((type) => [type, tier.chances[type] ?? 0]));
    tiers.push({
      buyIn: tier.buyIn,
      chances: normalizedChances,
      rewards,
    });
  }
  return tiers;
}

// Keep these limits in sync with src/admin-tools.ts. The total stays below the API's JSON request limit.
export const MAX_UPDATE_LOG_BODY_LENGTH = 20_000;
export const MAX_UPDATE_LOG_BYTES = 200_000;

export function validateUpdateLog(value) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const entries = [];
  for (const entry of value) {
    const parsedDate = typeof entry?.date === "string" ? new Date(`${entry.date}T00:00:00Z`) : null;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      || !parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== entry.date
      || typeof entry.title !== "string" || !entry.title.trim() || entry.title.trim().length > 80
      || typeof entry.body !== "string" || !entry.body.trim() || entry.body.length > MAX_UPDATE_LOG_BODY_LENGTH) return null;
    entries.push({ date: entry.date, title: entry.title.trim(), body: entry.body });
  }
  if (Buffer.byteLength(JSON.stringify({ entries }), "utf8") > MAX_UPDATE_LOG_BYTES) return null;
  return entries;
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
