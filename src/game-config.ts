import type { GameConfig, PowerupKind, ProfileTitle, Rarity, RouletteTier, WorldGameConfig } from "./types";

export const TILE_WIDTH = 180;
export const powerupPrices: Record<PowerupKind, number> = { shield: 8, boost: 10, rapid: 12, cannon: 15, star: 9999 };
export const powerupLabels: Record<PowerupKind, string> = { shield: "Shield", boost: "Boost", rapid: "Rapid Fire", cannon: "Cannon", star: "Rainbow Star" };
export const PORTAL_Y = 175;
export const PORTAL_SIZE = 58;
export const SECRET_LEVEL_COOLDOWN_MS = 30 * 60 * 1000;
export const CEILING_Y = 20;
export const FLOOR_Y = 300;
export const FLIPPED_WORLD_HEIGHT = 400;
export const SECRET_BOSS_HEIGHT = 120;
export const SPECIAL_ASTEROID_ODDS: Record<Rarity, number> = { Common: 52, Uncommon: 27, Rare: 13, Epic: 6, Legendary: 2 };
export const SPECIAL_ASTEROID_REWARD_RANGES: Record<Rarity, readonly [number, number]> = { Common: [50, 100], Uncommon: [101, 250], Rare: [251, 500], Epic: [501, 750], Legendary: [751, 1000] };
export const RARITY_ORDER: Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
export const DEFAULT_SKIN_CHANCES: Record<Rarity, number> = { Common: 0, Uncommon: 0, Rare: 0, Epic: 15, Legendary: 35 };
export const DEFAULT_WORLD_CONFIG: WorldGameConfig = {
    rainbowStarChance: 3,
    portalSpawnChance: 100,
    rarityOdds: { ...SPECIAL_ASTEROID_ODDS },
    rewardRanges: { ...SPECIAL_ASTEROID_REWARD_RANGES },
    skinChances: { ...DEFAULT_SKIN_CHANCES },
    powerupSpawnChances: { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 3 },
};
export const DEFAULT_GAME_CONFIG: GameConfig = {
    normal: structuredClone(DEFAULT_WORLD_CONFIG),
    prestige: structuredClone(DEFAULT_WORLD_CONFIG),
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
};
export const DEFAULT_ROULETTE_TIERS: RouletteTier[] = [
    { buyIn: 5, chances: { claims: 45, specialClaims: 15, color: 20, trail: 12, avatar: 8 }, rewards: { claims: [50, 150], specialClaims: [1, 2] } },
    { buyIn: 10, chances: { claims: 30, specialClaims: 18, color: 22, trail: 18, avatar: 12 }, rewards: { claims: [125, 350], specialClaims: [1, 3] } },
    { buyIn: 25, chances: { claims: 15, specialClaims: 20, color: 22, trail: 25, avatar: 18 }, rewards: { claims: [300, 1000], specialClaims: [2, 5] } },
];
export const PROFILE_TITLES: ProfileTitle[] = [
    { id: "cadet", name: "Cadet", routes: 1 },
    { id: "pathfinder", name: "Pathfinder", routes: 5 },
    { id: "sector-ace", name: "Sector Ace", routes: 10 },
    { id: "stellar-navigator", name: "Stellar Navigator", routes: 20 },
    { id: "cosmic-legend", name: "Cosmic Legend", routes: 40 },
];
