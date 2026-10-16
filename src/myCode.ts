const playerLabel = document.createElement("div");
const world = document.createElement("main");
const claimLabel = document.createElement("span");
const levelLabel = document.createElement("span");
const statusLabel = document.createElement("p");
const bossLabel = document.createElement("span");
const timerLabel = document.createElement("span");
const areaLabel = document.createElement("span");

type Box = { x: number; y: number; width: number; height: number };
type Obstacle = Box & { airborne?: boolean; barrier?: boolean; block?: boolean; goalLock?: boolean; boundary?: boolean };
type Asteroid = { x: number; y: number; claimed: boolean; special: boolean };
type Hazard = { x: number; y: number; width: number; height: number; kind: "spikes" | "gravity" };
type Enemy = { x: number; y: number; defeated: boolean };
type Projectile = { x: number; y: number; vx: number; vy: number; angle?: number; element: HTMLElement; owner: "player" | "enemy" };
type PowerupKind = "shield" | "boost" | "rapid" | "cannon" | "star";
type Powerup = { x: number; y: number; kind: PowerupKind; collected: boolean };
type LevelKey = { id: string; x: number; y: number; collected: boolean; requiresPortal: boolean };
type Boss = { x: number; y: number; health: number; maxHealth: number; defeated: boolean };
type MiniBoss = { x: number; y: number; health: number; maxHealth: number; defeated: boolean };
type TrailStyle = { name: string; color: string; required: number; effect: "ember" | "comet" | "spark" | "ribbon" | "arc"; secret?: boolean; boss?: boolean; golden?: boolean; prestige?: number };
type PrestigeShipArt = "stellar-guard" | "quantum-dancer" | "cosmic-queen" | "void-knight" | "eclipse-oracle" | "infinity-pilot" | "stellar-legend";
type AvatarStyle = { name: string; color: string; shape: "classic" | "dart" | "ring" | "blade"; required: number; image?: string; cssArt?: PrestigeShipArt; defaultSkin: number; prestige?: number; golden?: boolean; jackpot?: boolean };
type FlippedRoute = { walls: number[]; enemies: number[]; spikes: number[]; gravity: number[]; powerups?: { index: number; kind: PowerupKind }[]; key?: number };
type SecretKeyPlacement = { id: string; index: number; y?: number; requiresPortal?: boolean };
type SecretPortal = { index: number; secretId: string; y?: number };
type LevelMakerDraft = { name: string; briefing: string; prestige: boolean; tiles: string[]; flippedTiles: string[]; customId?: string };
type Level = { name: string; briefing: string; length: number; asteroids: number[]; walls: number[]; blocks?: number[]; enemies: number[]; spikes: number[]; gravity: number[]; portals?: number[]; secretPortals?: SecretPortal[]; flip?: number[]; flippedRoute?: FlippedRoute; powerups?: { index: number; kind: PowerupKind }[]; key?: number; secretKey?: SecretKeyPlacement; secretId?: string; specialAsteroids?: number[]; miniBosses?: number[]; boss?: boolean; bossIndex?: number; secret?: boolean; prestige?: boolean; customId?: string; localOnly?: boolean };
type ControlAction = "left" | "right" | "jump" | "down" | "shoot";
type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
type CosmeticGroup = "skin" | "trail" | "avatar";
type OnlineUser = { username: string; role: "player" | "owner" };
type ManagedUser = { id: string; username: string; role: "player" | "owner"; banned: boolean; createdAt: string; usernameChangedAt: string | null; progress: Record<string, string> };
type OnlineLeaderboardEntry = { id: string; username: string; level: string; timeMs: number; abilities: string[]; achievedAt: string };
type OnlineSettings = { goldenTimeLimitMs: number };
type WorldGameConfig = {
    rainbowStarChance: number;
    rarityOdds: Record<Rarity, number>;
    rewardRanges: Record<Rarity, readonly [number, number]>;
    skinChances: Record<Rarity, number>;
    powerupSpawnChances: Record<PowerupKind, number>;
};
type GameConfig = {
    normal: WorldGameConfig;
    prestige: WorldGameConfig;
    powerupEffects: {
        shield: { charges: number };
        boost: { durationSeconds: number; movementMultiplier: number };
        rapid: { durationSeconds: number };
        cannon: { durationSeconds: number };
        star: { durationSeconds: number };
    };
};

const TILE_WIDTH = 180;
const PORTAL_Y = 175;
const PORTAL_SIZE = 58;
const CEILING_Y = 20;
const FLOOR_Y = 300;
const FLIPPED_WORLD_HEIGHT = 400;
const SECRET_BOSS_HEIGHT = 120;
const SPECIAL_ASTEROID_ODDS: Record<Rarity, number> = { Common: 52, Uncommon: 27, Rare: 13, Epic: 6, Legendary: 2 };
const SPECIAL_ASTEROID_REWARD_RANGES: Record<Rarity, readonly [number, number]> = { Common: [50, 100], Uncommon: [101, 250], Rare: [251, 500], Epic: [501, 750], Legendary: [751, 1000] };
const RARITY_ORDER: Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const DEFAULT_SKIN_CHANCES: Record<Rarity, number> = { Common: 0, Uncommon: 0, Rare: 0, Epic: 15, Legendary: 35 };
const DEFAULT_WORLD_CONFIG: WorldGameConfig = {
    rainbowStarChance: 3,
    rarityOdds: { ...SPECIAL_ASTEROID_ODDS },
    rewardRanges: { ...SPECIAL_ASTEROID_REWARD_RANGES },
    skinChances: { ...DEFAULT_SKIN_CHANCES },
    powerupSpawnChances: { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 3 },
};
const DEFAULT_GAME_CONFIG: GameConfig = {
    normal: structuredClone(DEFAULT_WORLD_CONFIG),
    prestige: structuredClone(DEFAULT_WORLD_CONFIG),
    powerupEffects: {
        shield: { charges: 1 },
        boost: { durationSeconds: 7, movementMultiplier: 1.7 },
        rapid: { durationSeconds: 10 },
        cannon: { durationSeconds: 0 },
        star: { durationSeconds: 15 },
    },
};
let gameConfig: GameConfig = structuredClone(DEFAULT_GAME_CONFIG);
const testerSettingsDraft = new Map<string, string>();
let levelMakerPreviewReturn: (() => void) | null = null;
let isLevelMakerPreview = false;
const levels: Level[] = [
    { name: "Quiet Orbit", briefing: "Learn the drift. Claim every asteroid and reach the beacon.", length: 12, asteroids: [2, 5, 8], walls: [4], enemies: [], spikes: [], gravity: [] },
    { name: "Redline Pass", briefing: "The rocks are tighter here. Watch the sentry fire.", length: 15, asteroids: [2, 5, 8, 12], walls: [4, 7], enemies: [9], spikes: [6], gravity: [] },
    { name: "Gravity Well", briefing: "Gravity wells pull you down. Use a double jump to escape.", length: 17, asteroids: [2, 5, 9, 13, 15], walls: [4, 8, 12], enemies: [7, 14], spikes: [6, 11], gravity: [10] },
    { name: "Shatter Belt", briefing: "Spikes, sentries, and a long drift. Keep your hull steady.", length: 20, asteroids: [2, 5, 8, 11, 15, 18], walls: [4, 7, 10, 14, 17], enemies: [6, 13, 16], spikes: [5, 12, 16], gravity: [9, 18] },
    { name: "Last Light", briefing: "The final claim. Bring seven asteroids home through the storm.", length: 23, asteroids: [2, 5, 8, 11, 14, 17, 20], walls: [4, 7, 10, 13, 16, 19], enemies: [6, 12, 15, 21], spikes: [5, 9, 14, 18], gravity: [8, 11, 17, 20], secretPortals: [{ index: 3, secretId: "eclipse" }] },
    { name: "Ion Cathedral", briefing: "The cathedral hums with static. Break through its sentry choir.", length: 24, asteroids: [2, 5, 8, 12, 15, 19, 22], walls: [4, 7, 11, 14, 18, 21], enemies: [6, 13, 20], spikes: [5, 10, 16, 22], gravity: [9, 17], powerups: [{ index: 3, kind: "shield" }, { index: 16, kind: "cannon" }], miniBosses: [11] },
    { name: "Neon Graveyard", briefing: "Old ships drift here. Their guardians do not want you leaving.", length: 27, asteroids: [2, 5, 9, 12, 16, 20, 24], walls: [4, 8, 11, 15, 19, 23], enemies: [6, 14, 21], spikes: [5, 10, 17, 22], gravity: [7, 18], powerups: [{ index: 7, kind: "boost" }, { index: 18, kind: "shield" }, { index: 23, kind: "cannon" }], miniBosses: [9, 20] },
    { name: "Crystal Run", briefing: "The crystal storm bends every shot. Find the portal route; an Eclipse key signal is hidden above its far end.", length: 30, asteroids: [3, 6, 10, 13, 17, 21, 25, 28], walls: [5, 9, 12, 16, 20, 24, 27], enemies: [7, 15, 23], spikes: [6, 11, 18, 26], gravity: [8, 14, 22], portals: [7, 25], secretPortals: [{ index: 2, secretId: "nebula" }], secretKey: { id: "eclipse", index: 25, y: 72, requiresPortal: true }, powerups: [{ index: 5, kind: "rapid" }, { index: 14, kind: "boost" }, { index: 25, kind: "shield" }], miniBosses: [10, 22] },
    { name: "Titan's Wake", briefing: "The titan is waiting. Every asteroid you claim tears through its armor.", length: 33, asteroids: [3, 6, 9, 12, 15, 18, 21, 24, 28, 30], walls: [5, 8, 11, 14, 17, 20, 23, 26, 29], enemies: [7, 16, 25], spikes: [6, 13, 19, 27], gravity: [10, 18, 24], powerups: [{ index: 4, kind: "shield" }, { index: 15, kind: "rapid" }, { index: 25, kind: "boost" }], miniBosses: [12, 24], boss: true },
    { name: "Solar Foundry", briefing: "The foundry burns hot. Ride the safe gaps between its moving sentries.", length: 28, asteroids: [2, 6, 10, 14, 18, 22, 26], walls: [4, 8, 12, 16, 20, 24], enemies: [7, 15, 23], spikes: [5, 11, 17, 25], gravity: [9, 19], powerups: [{ index: 3, kind: "shield" }, { index: 13, kind: "boost" }, { index: 21, kind: "cannon" }], miniBosses: [14], boss: true },
    { name: "Moonlit Ruins", briefing: "The ruins hide a Nebula key past an unmarked portal. Reach the high ledge after the transit.", length: 31, asteroids: [3, 7, 11, 15, 19, 23, 27], walls: [5, 9, 13, 17, 21, 25], enemies: [6, 14, 22, 28], spikes: [8, 12, 20, 26], gravity: [10, 18, 24], portals: [8, 27], secretKey: { id: "nebula", index: 27, y: 64, requiresPortal: true }, powerups: [{ index: 6, kind: "cannon" }, { index: 16, kind: "shield" }, { index: 26, kind: "boost" }], miniBosses: [11, 24] },
    { name: "Event Horizon", briefing: "One last crossing before the vault. Nothing escapes the horizon unchanged.", length: 36, asteroids: [3, 7, 11, 15, 19, 23, 27, 31, 34], walls: [5, 9, 13, 17, 21, 25, 29, 33], enemies: [6, 14, 22, 30], spikes: [8, 12, 20, 28, 34], gravity: [10, 18, 26, 32], secretPortals: [{ index: 4, secretId: "eclipse" }], powerups: [{ index: 4, kind: "boost" }, { index: 16, kind: "shield" }, { index: 28, kind: "rapid" }], miniBosses: [12, 26] },
    { name: "Eclipse Vault", briefing: "A hidden route beyond the fourth asteroid. Find the vault and claim its impossible light.", length: 19, asteroids: [2, 4, 7, 10, 13, 16], walls: [3, 6, 9, 12, 15], enemies: [5, 11, 17], spikes: [4, 8, 14], gravity: [7, 16], powerups: [{ index: 6, kind: "shield" }, { index: 14, kind: "boost" }], specialAsteroids: [2, 4, 7, 10, 13, 16], secret: true, secretId: "eclipse", secretKey: { id: "nebula", index: 16, y: 105 }, secretPortals: [{ index: 2, secretId: "eclipse" }] },
    { name: "Comet Nursery", briefing: "Young comets cut across the route. Claim their bright cores and keep your aim ready.", length: 26, asteroids: [2, 6, 10, 14, 18, 22], walls: [4, 8, 12, 16, 20], enemies: [7, 13, 19, 24], spikes: [5, 11, 17, 23], gravity: [9, 21], powerups: [{ index: 3, kind: "cannon" }, { index: 15, kind: "shield" }], miniBosses: [18] },
    { name: "Prism Citadel", briefing: "The citadel's walls fold light around its guardians. Break the second titan before the beacon.", length: 32, asteroids: [3, 7, 11, 15, 19, 23, 27, 30], walls: [5, 9, 13, 17, 21, 25, 29], enemies: [6, 14, 22, 28], spikes: [8, 12, 20, 26], gravity: [10, 18, 24], powerups: [{ index: 4, kind: "shield" }, { index: 16, kind: "cannon" }, { index: 26, kind: "boost" }], miniBosses: [12, 24], boss: true },
    { name: "Afterglow Station", briefing: "A final station waits beyond the old lanes. Its archive key is hidden over the destination portal.", length: 35, asteroids: [3, 7, 11, 15, 19, 23, 27, 31, 33], walls: [5, 9, 13, 17, 21, 25, 29], enemies: [6, 14, 22, 30], spikes: [8, 12, 20, 28, 33], gravity: [10, 18, 26, 32], portals: [9, 31], secretKey: { id: "archive", index: 31, y: 58, requiresPortal: true }, powerups: [{ index: 4, kind: "cannon" }, { index: 16, kind: "shield" }, { index: 28, kind: "boost" }], miniBosses: [12, 26], boss: true },
    { name: "Nebula Hollow", briefing: "A moonlit key opens this silent passage. Drift through the dark and find the hidden beacon.", length: 25, asteroids: [3, 7, 11, 15, 19, 22], walls: [5, 9, 13, 17, 21], enemies: [6, 14, 20], spikes: [8, 12, 18], gravity: [10, 16, 22], powerups: [{ index: 4, kind: "shield" }, { index: 14, kind: "cannon" }], specialAsteroids: [3, 7, 11, 15, 19, 22], secret: true, secretId: "nebula", secretKey: { id: "archive", index: 22, y: 92 }, secretPortals: [{ index: 2, secretId: "nebula" }] },
    { name: "Black Hole Archive", briefing: "The last key points into the archive. Survive the spiral and face the keeper.", length: 30, asteroids: [3, 7, 11, 15, 19, 23, 27], walls: [5, 9, 13, 17, 21, 25], enemies: [6, 14, 22, 28], spikes: [8, 12, 20, 26], gravity: [10, 18, 24], powerups: [{ index: 4, kind: "cannon" }, { index: 16, kind: "shield" }, { index: 25, kind: "boost" }], miniBosses: [12, 24], boss: true, secret: true, secretId: "archive", specialAsteroids: [3, 7, 11, 15, 19, 23, 27], secretPortals: [{ index: 2, secretId: "archive" }] },
    { name: "Prestige Gate", briefing: "The gatekeeper tests every route. Defeat it before claiming your next prestige.", length: 28, asteroids: [3, 7, 11, 15, 19, 23], walls: [5, 9, 13, 17, 21], enemies: [6, 14, 22], spikes: [8, 12, 20], gravity: [10, 18], powerups: [{ index: 4, kind: "shield" }, { index: 16, kind: "cannon" }], miniBosses: [12], boss: true, secret: true, secretId: "prestige-gate", secretPortals: [{ index: 2, secretId: "prestige-gate" }] },
    // Prestige-exclusive secret levels with prestige-only keys
    { name: "Stellar Sanctum", briefing: "A sanctuary hidden in the ringed planet's deep orbit. Only the worthy can claim its stellar core.", length: 28, asteroids: [3, 7, 11, 15, 19, 23, 26], walls: [5, 9, 13, 17, 21], enemies: [6, 14, 22], spikes: [8, 12, 20, 25], gravity: [10, 18], powerups: [{ index: 5, kind: "shield" }, { index: 17, kind: "cannon" }], secretId: "stellar-sanctum", specialAsteroids: [3, 7, 11, 15, 19, 23, 26], secret: true, prestige: true, miniBosses: [14], secretPortals: [{ index: 2, secretId: "stellar-sanctum" }] },
    { name: "Quantum Depths", briefing: "Reality bends in the quantum realm. Claim the fragments before the tunnel collapses.", length: 32, asteroids: [3, 8, 12, 16, 20, 24, 28, 31], walls: [5, 10, 14, 18, 22, 26, 30], enemies: [7, 17, 25], spikes: [6, 13, 21, 29], gravity: [11, 19, 27], powerups: [{ index: 6, kind: "rapid" }, { index: 18, kind: "boost" }, { index: 28, kind: "shield" }], secretId: "quantum-depths", specialAsteroids: [3, 8, 12, 16, 20, 24, 28, 31], secret: true, prestige: true, miniBosses: [13, 26], secretPortals: [{ index: 2, secretId: "quantum-depths" }] },
    { name: "Infinity Spiral", briefing: "The spiral stretches beyond infinity. Navigate the impossible geometry and find the Infinity Key.", length: 35, asteroids: [4, 9, 13, 17, 21, 25, 29, 32, 34], walls: [6, 10, 14, 18, 22, 26, 30, 33], enemies: [8, 18, 28], spikes: [7, 14, 22, 30, 34], gravity: [12, 20, 28], powerups: [{ index: 7, kind: "cannon" }, { index: 19, kind: "shield" }, { index: 30, kind: "boost" }], secretId: "infinity-spiral", specialAsteroids: [4, 9, 13, 17, 21, 25, 29, 32, 34], secret: true, prestige: true, miniBosses: [15, 28], boss: true, secretPortals: [{ index: 2, secretId: "infinity-spiral" }] },
];

const skins: { name: string; color: string; shape: "classic" | "dart" | "ring" | "blade"; required: number; image?: string; boss?: boolean; secret?: boolean; prestige?: number; golden?: boolean }[] = [
    { name: "Solar", color: "#ed7657", shape: "classic", required: 0 },
    { name: "Mint Dart", color: "#62d6b2", shape: "dart", required: 3, image: "/src/assets/ships/dart.svg" },
    { name: "Gold UFO", color: "#f6c46e", shape: "ring", required: 7, image: "/src/assets/ships/ufo.svg" },
    { name: "Plasma Sword", color: "#b991ff", shape: "blade", required: 12, image: "/src/assets/ships/sword.svg" },
    { name: "Aurora", color: "#6ecbff", shape: "classic", required: 18 },
    { name: "Titan Core", color: "#ffdf72", shape: "ring", required: 24, boss: true },
    { name: "Eclipse", color: "#f58bff", shape: "blade", required: 0, secret: true },
    { name: "Ion Glass", color: "#8de7ff", shape: "dart", required: 30 },
    { name: "Rose Prism", color: "#ff8fbd", shape: "ring", required: 38 },
    { name: "Void Flame", color: "#8b7dff", shape: "blade", required: 46, boss: true },
    { name: "Comet Copper", color: "#f29d68", shape: "dart", required: 86 },
    { name: "Prism Ice", color: "#8de7ff", shape: "ring", required: 98 },
    { name: "Starforge", color: "#f4f3cf", shape: "classic", required: 54 },
    { name: "Solar Flare", color: "#ff9b55", shape: "blade", required: 62 },
    { name: "Moon Silver", color: "#d9f5ff", shape: "ring", required: 70 },
    { name: "Horizon Pink", color: "#ff72c8", shape: "dart", required: 78 },
    { name: "Vault Prism", color: "#d6a8ff", shape: "blade", required: 0, secret: true },
    { name: "Golden Body", color: "#ffe36e", shape: "classic", required: 0, golden: true },
    // Prestige-exclusive skins from special rolls
    { name: "Stellar Crown", color: "#ffcc33", shape: "classic", required: 0, prestige: 1 },
    { name: "Nebula Dancer", color: "#b24bff", shape: "dart", required: 0, prestige: 1 },
    { name: "Quantum Ring", color: "#00ffcc", shape: "ring", required: 0, prestige: 1 },
    { name: "Void Edge", color: "#ff0099", shape: "blade", required: 0, prestige: 2 },
    { name: "Cosmic Pearl", color: "#e0e0e0", shape: "classic", required: 0, prestige: 2 },
    { name: "Eclipse Dancer", color: "#9933ff", shape: "dart", required: 0, prestige: 2 },
    { name: "Infinity Gate", color: "#00ff66", shape: "ring", required: 0, prestige: 3 },
    { name: "Stellar Blade", color: "#ff6600", shape: "blade", required: 0, prestige: 3 },
];

const trails: TrailStyle[] = [
    { name: "Ember", color: "#ed7657", required: 0, effect: "ember" },
    { name: "Mint Comet", color: "#62d6b2", required: 5, effect: "comet" },
    { name: "Gold Dust", color: "#f6c46e", required: 10, effect: "spark" },
    { name: "Nebula", color: "#b991ff", required: 16, effect: "ribbon" },
    { name: "Titan Sparks", color: "#ffdf72", required: 24, effect: "spark", boss: true },
    { name: "Eclipse Ribbon", color: "#f58bff", required: 0, effect: "ribbon", secret: true },
    { name: "Ion Beam", color: "#8de7ff", required: 30, effect: "comet" },
    { name: "Prism Wake", color: "#ff8fbd", required: 38, effect: "ribbon" },
    { name: "Void Flame", color: "#8b7dff", required: 46, effect: "ember", boss: true },
    { name: "Comet Line", color: "#f29d68", required: 86, effect: "comet" },
    { name: "Prism Arc", color: "#8de7ff", required: 98, effect: "arc" },
    { name: "Jackpot Spark", color: "#ffe36e", required: 0, effect: "spark", secret: true },
    { name: "Golden Trail", color: "#fff0a1", required: 0, effect: "arc", golden: true },
    // Prestige-exclusive trails from special rolls
    { name: "Stellar Beam", color: "#ffcc33", required: 0, effect: "arc", prestige: 1 },
    { name: "Quantum Wave", color: "#b24bff", required: 0, effect: "ribbon", prestige: 1 },
    { name: "Cosmic Spark", color: "#00ffcc", required: 0, effect: "spark", prestige: 1 },
    { name: "Void Ribbon", color: "#ff0099", required: 0, effect: "ribbon", prestige: 2 },
    { name: "Eclipse Arc", color: "#9933ff", required: 0, effect: "arc", prestige: 2 },
    { name: "Infinite Comet", color: "#e0e0e0", required: 0, effect: "comet", prestige: 2 },
    { name: "Stellar Ribbon", color: "#00ff66", required: 0, effect: "ribbon", prestige: 3 },
    { name: "Infinity Spark", color: "#ff6600", required: 0, effect: "spark", prestige: 3 },
];
const avatars: AvatarStyle[] = [
    { name: "Classic", color: "#ed7657", shape: "classic", required: 0, defaultSkin: 0 },
    { name: "Dart", color: "#62d6b2", shape: "dart", required: 0, image: "/src/assets/ships/dart.svg", defaultSkin: 1 },
    { name: "UFO", color: "#f6c46e", shape: "ring", required: 0, image: "/src/assets/ships/ufo.svg", defaultSkin: 2 },
    { name: "Sword", color: "#b991ff", shape: "blade", required: 0, image: "/src/assets/ships/sword.svg", defaultSkin: 3 },
    { name: "Jackpot Crown", color: "#ffe36e", shape: "classic", required: 0, defaultSkin: 17, jackpot: true, image: "/src/assets/ships/jackpot-crown.svg" },
    { name: "Prestige Comet", color: "#fff6a8", shape: "dart", required: 0, defaultSkin: 1, prestige: 1, image: "/src/assets/ships/prestige-comet.png" },
    { name: "Prestige Halo", color: "#b8fff1", shape: "ring", required: 0, defaultSkin: 2, prestige: 2, image: "/src/assets/ships/prestige-halo.png" },
    { name: "Prestige Nova", color: "#ffb6e6", shape: "blade", required: 0, defaultSkin: 3, prestige: 3, image: "/src/assets/ships/prestige-nova.png" },
    { name: "Golden Pilot", color: "#ffe36e", shape: "classic", required: 0, defaultSkin: 17, golden: true, image: "/src/assets/ships/golden-crown.svg" },
    // Prestige-exclusive avatars from special rolls
    { name: "Stellar Guard", color: "#ffcc33", shape: "classic", required: 0, defaultSkin: 19, prestige: 1, cssArt: "stellar-guard" },
    { name: "Quantum Dancer", color: "#b24bff", shape: "dart", required: 0, defaultSkin: 20, prestige: 1, cssArt: "quantum-dancer" },
    { name: "Cosmic Queen", color: "#00ffcc", shape: "ring", required: 0, defaultSkin: 21, prestige: 1, cssArt: "cosmic-queen" },
    { name: "Void Knight", color: "#ff0099", shape: "blade", required: 0, defaultSkin: 22, prestige: 2, cssArt: "void-knight" },
    { name: "Eclipse Oracle", color: "#9933ff", shape: "classic", required: 0, defaultSkin: 23, prestige: 2, cssArt: "eclipse-oracle" },
    { name: "Infinity Pilot", color: "#00ff66", shape: "dart", required: 0, defaultSkin: 24, prestige: 3, cssArt: "infinity-pilot" },
    { name: "Stellar Legend", color: "#ff6600", shape: "ring", required: 0, defaultSkin: 25, prestige: 3, cssArt: "stellar-legend" },
];

let playerX = 120;
let playerY = 300;
let verticalSpeed = 0;
let jumpCount = 0;
let asteroidsClaimed = Number(localStorage.getItem("orbit-claims") ?? "0");
let specialAsteroids = Number(localStorage.getItem("orbit-special-claims") ?? "0");
let prestigeLevel = Number(localStorage.getItem("orbit-prestige") ?? "0");
let prestigeMax = Number(localStorage.getItem("orbit-prestige-max") ?? "3");
let currentLevel = 0;
let levelAsteroids: Asteroid[] = [];
let levelObstacles: Obstacle[] = [];
let levelHazards: Hazard[] = [];
let levelEnemies: Enemy[] = [];
let levelPowerups: Powerup[] = [];
let levelKey: LevelKey | null = null;
let levelMiniBosses: MiniBoss[] = [];
let boss: Boss | null = null;
let projectiles: Projectile[] = [];
let trailElement: HTMLElement[] = [];
let trailPositions: { x: number; y: number }[] = [];
let trailDirection = 1;
let trailActive = false;
let projectileTimer = 0;
let trailTimer = 0;
let trailMovementFrames = 0;
let shieldCharges = 0;
let boostTimer = 0;
let rapidTimer = 0;
let rapidUntil = 0;
let rapidCannonUntil = 0;
let cannonTimer = 0;
let playerShotTimer = 0;
let shootingHeld = false;
let gameStarted = false;
let gameActive = false;
let animationFrame = 0;
let lastFrameTimestamp = 0;
let currentFrameScale = 1;
let hudUpdateFrames = 0;
let previousPlayerY = playerY;
let selectedSkin = Number(localStorage.getItem("orbit-skin") ?? "0");
let selectedTrail = Number(localStorage.getItem("orbit-trail") ?? "0");
let selectedAvatar = Number(localStorage.getItem("orbit-avatar") ?? "0");
if (!localStorage.getItem("orbit-skin") && avatars[selectedAvatar]) selectedSkin = avatars[selectedAvatar].defaultSkin;
let reducedEffects = localStorage.getItem("orbit-reduced-effects") === "true";
let levelStartedAt = 0;
let elapsedMilliseconds = 0;
let shipFlipped = false;
let portalCooldownUntil = 0;
let inFlippedRoute = false;
let flippedRouteKeyCollected = false;
let flippedRouteKeyY = 170;
let secretRoomFloorY = FLOOR_Y;
let secretKeyRevealed = false;
let endGoalLocked = false;
let portalTravelInProgress = false;
let portalTransitTimer = 0;
let lastDownPressAt = 0;
let spinInProgress = false;
let activePlanet: "normal" | "prestige" = "normal";
let secretBossRoomActive = false;
let secretBoss: Boss | null = null;
let currentSecretPortalTarget: string | null = null;
let portalReturnX: number | null = null;
let currentOnlineUser: OnlineUser | null = null;
let ownerBadgeObserver: MutationObserver | null = null;
let goldenTimeLimitMs = 60000;
let usedAbilities = new Set<string>();
let lastJumpDirection = 0;
let starPowerupActive = false;
let starPowerupTimer = 0;
let starPowerupElement: HTMLElement | null = null;
const pressedKeys = new Set<string>();
const DEFAULT_CONTROL_BINDINGS: Record<ControlAction, string> = {
    left: "arrowleft",
    right: "arrowright",
    jump: "arrowup",
    down: "arrowdown",
    shoot: "keye",
};
function readControlBindings(): Record<ControlAction, string> {
    try {
        const stored = JSON.parse(localStorage.getItem("orbit-controls") ?? "{}") as Partial<Record<ControlAction, string>>;
        return Object.fromEntries((Object.keys(DEFAULT_CONTROL_BINDINGS) as ControlAction[]).map((action) => [
            action,
            typeof stored[action] === "string" && stored[action].length <= 32 ? stored[action].toLowerCase() : DEFAULT_CONTROL_BINDINGS[action],
        ])) as Record<ControlAction, string>;
    } catch {
        return { ...DEFAULT_CONTROL_BINDINGS };
    }
}
let controlBindings = readControlBindings();
let mouseAim = { x: 148, y: 29 };
let hasMouseAim = false;
let accountProgressTimer = 0;
let accountProgressSyncing = false;
let lastSyncedAccountProgress = "";
const gravity = 0.7;
const jumpPower = -16;
const playerWidth = 48;
const playerHeight = 58;
const playerHitboxInsetX = 7;
const playerHitboxInsetY = 5;
const playerHitboxWidth = playerWidth - playerHitboxInsetX * 2;
const playerHitboxHeight = playerHeight - playerHitboxInsetY - 5;
const powerupPrices: Record<PowerupKind, number> = { shield: 8, boost: 10, rapid: 12, cannon: 15, star: 9999 };
const powerupLabels: Record<PowerupKind, string> = { shield: "Shield", boost: "Boost", rapid: "Rapid Fire", cannon: "Cannon", star: "Rainbow Star" };
const prestigeRouteNames = ["Violet Meridian", "Moonfall Circuit", "Amethyst Rift", "Crown of Saturn", "Lilac Nebula", "Oracle's Reach", "Prismatic Grave", "The White Eclipse", "Sovereign Drift", "Astral Citadel", "Veil of Io", "Radiant Ruin", "Dusk Cathedral", "Nova Labyrinth", "Purple Eventide", "The Inverted Sea", "Halo of Ash", "Sable Aurora", "Titan's Throne", "Infinity Crown"];

function loadCustomLevels() {
    let legacyLevels: Level[] = [];
    try {
        legacyLevels = JSON.parse(localStorage.getItem("orbit-custom-levels") ?? "[]") as Level[];
    } catch { }
    const normalCount = levels.filter((level) => !level.secret && !level.prestige).length;
    for (let index = normalCount; index < 20; index++) {
        levels.splice(Math.min(index, levels.length), 0, { name: `Frontier ${index + 1}`, briefing: "A longer route on the blue planet. Reach the beacon and claim the whole lane.", length: 28 + index, asteroids: [3, 7, 11, 15, 19, 23], walls: [5, 9, 13, 17, 21, 25], enemies: [8, 16, 24], spikes: [6, 14, 22], gravity: [10, 20], portals: [12, 26], boss: index === 19 });
    }
    for (let index = 0; index < 20; index++) {
        levels.push({ name: prestigeRouteNames[index], briefing: "A longer route around the ringed planet. Planetary flip fields reveal the upper lane.", length: 38 + index, asteroids: [3, 8, 13, 18, 23, 28, 33], walls: [5, 10, 15, 20, 25, 30], enemies: [7, 17, 27, 35], spikes: [6, 14, 24, 32], gravity: [11, 21, 31], flip: [11, 31], boss: index === 19, prestige: true });
    }
    let cachedLevels: Level[] = [];
    try { cachedLevels = JSON.parse(localStorage.getItem("orbit-global-level-cache") ?? "[]") as Level[]; } catch { }
    [...legacyLevels, ...cachedLevels].forEach((level, index) => levels.push({
        ...level,
        customId: level.customId,
        localOnly: !level.customId || level.localOnly,
        flip: level.prestige ? level.flip : undefined,
        flippedRoute: level.prestige ? level.flippedRoute : undefined,
        secret: Boolean(level.secret),
        boss: Boolean(level.boss),
        prestige: Boolean(level.prestige),
        ...(level.customId ? {} : { customId: `local-${index + 1}` }),
    }));
}

function getHiddenPortalIndex(level: Level) {
    const occupied = new Set([...level.walls, ...level.enemies, ...level.spikes, ...level.gravity]);
    const candidates = Array.from({ length: Math.max(1, level.length - 4) }, (_, index) => index + 2).filter((index) => !occupied.has(index));
    return candidates[Math.floor(Math.random() * candidates.length)] ?? Math.max(2, Math.floor(level.length / 2));
}

function getHiddenPortalY() {
    return [68, 82, 96][Math.floor(Math.random() * 3)];
}

function pickDistinctLevelIndices(candidates: number[], count: number) {
    const pool = [...candidates];
    const selected: number[] = [];
    while (selected.length < count && pool.length) selected.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
    return selected;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
    if (response.status === 204) return undefined as T;
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(response.ok
            ? "Online API is not configured at this address."
            : `Online API is unavailable (${response.status}).`);
    }
    let payload: { error?: string } & T;
    try {
        payload = await response.json() as { error?: string } & T;
    } catch {
        throw new Error(`Online service returned an invalid response (${response.status}).`);
    }
    if (!response.ok) throw new Error(payload.error || `Online request failed (${response.status}).`);
    return payload;
}

function getLocalAccountProgress() {
    return Object.fromEntries(
        Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
            .filter((key): key is string => Boolean(key?.startsWith("orbit-") && key !== "orbit-global-level-cache"))
            .sort()
            .map((key) => [key, localStorage.getItem(key) ?? ""]),
    );
}

function serializeAccountProgress(progress: Record<string, string>) {
    return JSON.stringify(Object.fromEntries(Object.entries(progress).sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)));
}

function refreshProgressStateFromStorage() {
    const readCount = (key: string, fallback: number, minimum: number, maximum: number) => {
        const value = Number(localStorage.getItem(key) ?? fallback);
        return Number.isSafeInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
    };
    asteroidsClaimed = readCount("orbit-claims", 0, 0, 100000000);
    specialAsteroids = readCount("orbit-special-claims", 0, 0, 100000000);
    prestigeLevel = readCount("orbit-prestige", 0, 0, 100);
    prestigeMax = readCount("orbit-prestige-max", 3, 1, 100);
    selectedSkin = readCount("orbit-skin", 0, 0, skins.length - 1);
    selectedTrail = readCount("orbit-trail", 0, 0, trails.length - 1);
    selectedAvatar = readCount("orbit-avatar", 0, 0, avatars.length - 1);
    if (!localStorage.getItem("orbit-skin") && avatars[selectedAvatar]) selectedSkin = avatars[selectedAvatar].defaultSkin;
    reducedEffects = localStorage.getItem("orbit-reduced-effects") === "true";
    controlBindings = readControlBindings();
}

function reloadLocalCustomLevels() {
    let savedLevels: Level[] = [];
    try {
        savedLevels = JSON.parse(localStorage.getItem("orbit-custom-levels") ?? "[]") as Level[];
    } catch (error) {
        console.error("Could not load account workshop levels:", error);
    }
    levels.splice(0, levels.length, ...levels.filter((level) => !level.localOnly));
    savedLevels.forEach((level, index) => levels.push({
        ...level,
        localOnly: !level.customId || level.localOnly,
        ...(level.customId ? {} : { customId: `local-${index + 1}` }),
    }));
    configurePortalDistribution();
}

async function syncAccountProgress(direction: "load" | "save", force = false) {
    if (!currentOnlineUser) return;
    if (accountProgressSyncing) {
        if (!force) return;
        while (accountProgressSyncing) await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
        if (!currentOnlineUser) return;
    }
    accountProgressSyncing = true;
    try {
        if (direction === "load") {
            const { progress } = await apiRequest<{ progress: Record<string, string> | null }>("/account/progress");
            if (progress === null) {
                const localProgress = getLocalAccountProgress();
                const result = await apiRequest<{ progress: Record<string, string> }>("/account/progress", {
                    method: "PUT",
                    body: JSON.stringify({ progress: localProgress, baseProgress: null }),
                });
                lastSyncedAccountProgress = serializeAccountProgress(result.progress);
                return;
            }
            Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
                .filter((key): key is string => Boolean(key?.startsWith("orbit-") && key !== "orbit-global-level-cache"))
                .forEach((key) => localStorage.removeItem(key));
            Object.entries(progress).forEach(([key, value]) => localStorage.setItem(key, value));
            refreshProgressStateFromStorage();
            reloadLocalCustomLevels();
            lastSyncedAccountProgress = JSON.stringify(getLocalAccountProgress());
            return;
        }
        const localProgress = getLocalAccountProgress();
        const serializedProgress = serializeAccountProgress(localProgress);
        if (!force && serializedProgress === lastSyncedAccountProgress) return;
        const baseProgress = lastSyncedAccountProgress ? JSON.parse(lastSyncedAccountProgress) as Record<string, string> : null;
        const result = await apiRequest<{ progress: Record<string, string> }>("/account/progress", {
            method: "PUT",
            body: JSON.stringify({ progress: localProgress, baseProgress }),
        });
        const previousCustomLevels = localStorage.getItem("orbit-custom-levels");
        const progressKeys = new Set([...Object.keys(localProgress), ...Object.keys(result.progress)]);
        progressKeys.forEach((key) => {
            const sentValue = Object.hasOwn(localProgress, key) ? localProgress[key] : null;
            if (localStorage.getItem(key) !== sentValue) return;
            const serverValue = result.progress[key];
            if (serverValue === undefined) localStorage.removeItem(key);
            else if (serverValue !== sentValue) localStorage.setItem(key, serverValue);
        });
        refreshProgressStateFromStorage();
        if (previousCustomLevels !== localStorage.getItem("orbit-custom-levels")) reloadLocalCustomLevels();
        lastSyncedAccountProgress = serializeAccountProgress(result.progress);
    } finally {
        accountProgressSyncing = false;
    }
}

async function refreshOnlineState() {
    const [session, settings, sharedConfig, sharedLevels] = await Promise.all([
        apiRequest<{ user: OnlineUser | null }>("/auth/session"),
        apiRequest<OnlineSettings>("/settings"),
        apiRequest<{ config: GameConfig }>("/game-config"),
        apiRequest<{ levels: Level[] }>("/levels"),
    ]);
    currentOnlineUser = session.user;
    updateOwnerAccountIndicator();
    if (session.user) await syncAccountProgress("load");
    goldenTimeLimitMs = settings.goldenTimeLimitMs;
    gameConfig = sharedConfig.config;
    levels.splice(0, levels.length, ...levels.filter((level) => !level.customId || level.localOnly), ...sharedLevels.levels.map((level) => ({ ...level, localOnly: false })));
    localStorage.setItem("orbit-global-level-cache", JSON.stringify(sharedLevels.levels));
    configurePortalDistribution();
}

function configurePortalDistribution() {
    levels.forEach((level) => {
        if (level.customId || level.localOnly) return;
        level.portals = [];
        level.secretPortals = undefined;
    });
    const secretLevels = levels.map((level, index) => ({ level, index })).filter(({ level }) => level.secret && !level.customId && !level.localOnly);
    secretLevels.forEach(({ level, index }) => {
        if (!level.secretId) level.secretId = `secret-level-${index + 1}`;
        level.secretPortals = [{ index: getHiddenPortalIndex(level), y: getHiddenPortalY(), secretId: level.secretId }];
    });

    const normalSources = levels.map((level, index) => ({ level, index })).filter(({ level }) => !level.secret && !level.prestige && !level.customId && !level.localOnly);
    const prestigeSources = levels.map((level, index) => ({ level, index })).filter(({ level }) => !level.secret && level.prestige && !level.customId && !level.localOnly);
    const normalTargets = secretLevels.filter(({ level }) => !level.prestige && level.secretId !== "prestige-gate");
    const prestigeTargets = secretLevels.filter(({ level }) => level.prestige);
    pickDistinctLevelIndices(normalSources.map(({ index }) => index), 3).forEach((sourceIndex, portalIndex) => {
        const target = normalTargets[portalIndex]?.level.secretId;
        if (!target) return;
        levels[sourceIndex].portals = [];
        levels[sourceIndex].secretPortals = [{ index: getHiddenPortalIndex(levels[sourceIndex]), y: getHiddenPortalY(), secretId: target }];
    });
    pickDistinctLevelIndices(prestigeSources.map(({ index }) => index), 3).forEach((sourceIndex, portalIndex) => {
        const target = prestigeTargets[portalIndex]?.level.secretId;
        if (!target) return;
        levels[sourceIndex].portals = [];
        levels[sourceIndex].secretPortals = [{ index: getHiddenPortalIndex(levels[sourceIndex]), y: getHiddenPortalY(), secretId: target }];
    });
}

export function startApp() {
    loadCustomLevels();
    configurePortalDistribution();
    document.body.innerHTML = "";
    ownerBadgeObserver ??= new MutationObserver(updateOwnerAccountIndicator);
    ownerBadgeObserver.observe(document.body, { childList: true });
    void refreshOnlineState().then(() => {
        if (!gameActive) showMenu();
    }).catch((error: unknown) => { console.error("Could not load shared game settings:", error); });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", () => pressedKeys.clear());
    if (!accountProgressTimer) accountProgressTimer = window.setInterval(() => {
        if (currentOnlineUser) void syncAccountProgress("save").catch((error: unknown) => console.error("Could not sync account progress:", error));
    }, 2500);
    showMenu();
}

function updateOwnerAccountIndicator() {
    const existing = document.querySelector(".owner-account-indicator");
    if (currentOnlineUser?.role === "owner") {
        if (existing) return;
        const indicator = document.createElement("span");
        indicator.className = "owner-account-indicator";
        indicator.textContent = "★";
        indicator.setAttribute("role", "img");
        indicator.setAttribute("aria-label", `Owner account active: ${currentOnlineUser.username}`);
        indicator.title = `Owner account active: ${currentOnlineUser.username}`;
        document.body.prepend(indicator);
    } else existing?.remove();
}

function showMenu() {
    gameActive = false;
    cancelAnimationFrame(animationFrame);
    pressedKeys.clear();
        const menu = document.createElement("main");
        menu.className = "menu-screen home-screen";
        menu.innerHTML = `<div class="brand-mark">JACER <span>/ 02</span></div><h1>Jacer</h1><p class="menu-copy">Pilot the claim ship through five dangerous sectors. Every asteroid you secure upgrades your flight.</p><div class="home-stats"><span><strong>${asteroidsClaimed}</strong> normal</span><span><strong>${specialAsteroids}</strong> special</span><span><strong>${prestigeLevel}</strong> prestige</span><span><strong>${getCompletedLevelCount()} / ${levels.length}</strong> routes complete</span><span><strong>${getUnlockedSkinCount()}</strong> skins online</span><span><strong>${getUnlockedTrailCount()}</strong> trails online</span></div><p class="prestige-requirement">NEXT PRESTIGE / ${getPrestigeRequirement(prestigeLevel).normal} NORMAL + ${getPrestigeRequirement(prestigeLevel).special} SPECIAL</p>`;
    const menuActions = document.createElement("nav"); menuActions.className = "menu-actions";
    menuActions.append(createMenuButton("Launch mission", showLevelMenu), createMenuButton("Customization", showCustomization), createMenuButton("Power-up shop", showShop), createMenuButton("Flight settings", showSettings));
    const accountRail = document.createElement("aside");
    accountRail.className = "account-rail";
    const accountButton = createTextButton(currentOnlineUser ? currentOnlineUser.username : "Account", showAccount);
    accountButton.classList.add("account-rail-button");
    accountButton.setAttribute("aria-label", currentOnlineUser ? `Account: ${currentOnlineUser.username}` : "Open account");
    accountRail.append(accountButton);
    if (hasClearedPrestigeGate() && prestigeLevel < prestigeMax) {
        const claimPrestige = createMenuButton(canClaimPrestige() ? "Claim prestige" : "Claim prestige / requirements unmet", () => { if (tryPrestige()) showMenu(); });
        claimPrestige.disabled = !canClaimPrestige();
        claimPrestige.classList.add("claim-prestige");
        menuActions.append(claimPrestige);
    }
    const secondaryActions = document.createElement("div"); secondaryActions.className = "secondary-actions"; secondaryActions.append(createTextButton("Special asteroid odds", showDropRates), createTextButton("Credits", showCredits));
    menu.append(accountRail, menuActions, secondaryActions);
    menu.append(createPageCounter()); document.body.replaceChildren(menu);
}

function createMenuButton(text: string, action: () => void) {
    const button = document.createElement("button");
    button.className = "menu-button";
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
}

function showLevelMenu() {
    gameActive = false;
    cancelAnimationFrame(animationFrame);
    pressedKeys.clear();
    if (isLevelMakerPreview) {
        levelMakerPreviewReturn?.();
        return;
    }
        const menu = document.createElement("main");
        menu.className = "menu-screen level-menu";
        menu.innerHTML = `<p class="eyebrow">MISSION SELECT / ${activePlanet === "prestige" ? "RINGED PLANET" : "BLUE PLANET"}</p><h1>Choose your <em>sector</em></h1><p class="menu-copy">Claim the asteroids in order. New sectors unlock after the previous beacon is reached.</p>`;
        const planetButton = createMenuButton(activePlanet === "normal" ? "Fly to prestige planet" : "Return to blue planet", switchPlanet);
        if (activePlanet === "normal" && prestigeLevel < 2) {
            planetButton.disabled = true;
            planetButton.textContent = "Prestige planet locked / reach prestige 2";
            planetButton.classList.add("locked");
        }
        menu.append(planetButton, createTextButton("Online leaderboard", showLeaderboard));
    const levelList = document.createElement("div");
    levelList.className = "level-list";
    levels.forEach((level, index) => {
        if (level.secret || Boolean(level.prestige) !== (activePlanet === "prestige")) return;
        const visibleLevels = levels.filter((candidate) => !candidate.secret && Boolean(candidate.prestige) === (activePlanet === "prestige"));
        const routeIndex = visibleLevels.indexOf(level);
        const unlocked = level.secret ? isSecretLevelUnlocked(level) : Boolean(level.customId || level.localOnly) || routeIndex === 0 || Number(localStorage.getItem(`orbit-level-${index}`) ?? "0") === 1;
        const button = document.createElement("button");
        button.className = `level-button ${level.secret ? "secret-level" : ""} ${unlocked ? "" : "locked"}`;
        button.type = "button";
        button.disabled = !unlocked;
        const prestigeUnlocked = prestigeLevel >= 2 || routeIndex === 0;
        const prestigeLocked = activePlanet === "prestige" && !prestigeUnlocked;
        button.disabled = !unlocked || prestigeLocked;
        const lockMessage = prestigeLocked ? "LOCKED / reach prestige 2" : "LOCKED / clear the previous sector";
        button.innerHTML = `<span><b>${String(routeIndex + 1).padStart(2, "0")}</b> ${level.name}</span><small>${button.disabled ? lockMessage : `${level.asteroids.length} asteroids / ${level.briefing}`}</small>`;
        if (!button.disabled) button.addEventListener("click", () => startGame(index));
        levelList.append(button);
    });
    const secretGate = document.createElement("button");
    secretGate.className = "secret-gate";
    secretGate.type = "button";
    secretGate.innerHTML = "<span aria-hidden=\"true\">◯</span><b>Secret space</b><small>Open discovered routes</small>";
    secretGate.addEventListener("click", showSecretLevels);
    const missionActions = document.createElement("nav"); missionActions.className = "secondary-actions";
    missionActions.append(createTextButton("Customization", showCustomization), createTextButton("Shop", showShop), createTextButton("Settings", showSettings), createTextButton("Main menu", showMenu));
    menu.append(createLoadoutPanel(), levelList, secretGate, missionActions, createPageCounter());
    document.body.replaceChildren(menu);
}

function showSecretLevels() {
    gameActive = false;
    cancelAnimationFrame(animationFrame);
    const menu = document.createElement("main");
    menu.className = "menu-screen level-menu secret-menu";
    menu.innerHTML = `<p class="eyebrow">WHITE HOLE / HIDDEN ROUTES</p><h1>Secret <em>space</em></h1><p class="menu-copy">Special asteroids appear here. Defeat the keeper bosses to unlock unusual ships.</p>`;
    const levelList = document.createElement("div");
    levelList.className = "level-list";
    levels.forEach((level, index) => {
        if (!level.secret) return;
        const unlocked = isSecretLevelUnlocked(level);
        const button = document.createElement("button");
        button.className = `level-button secret-level ${unlocked ? "" : "locked"}`;
        button.type = "button";
        button.disabled = !unlocked;
        button.innerHTML = `<span><b>??</b> ${level.name}</span><small>${unlocked ? `${level.prestige ? "PRESTIGE SECRET / " : ""}${level.asteroids.length} special asteroids / ${level.briefing}` : `LOCKED / find its ${level.prestige ? "prestige " : ""}key`}</small>`;
        if (unlocked) button.addEventListener("click", () => startGame(index));
        levelList.append(button);
    });
    menu.append(levelList, createTextButton("Mission select", showLevelMenu), createTextButton("Main menu", showMenu), createPageCounter());
    document.body.replaceChildren(menu);
}

function showSettings() {
    const menu = document.createElement("main");
    menu.className = "menu-screen settings-screen";
    menu.innerHTML = `<p class="eyebrow">FLIGHT SYSTEMS</p><h1>Ship <em>settings</em></h1><p class="menu-copy">Tune the cockpit for your setup. Your selection is saved on this device.</p>`;
    const panel = document.createElement("section");
    panel.className = "settings-panel";
    
    const effectsRow = document.createElement("label");
    effectsRow.className = "setting-row";
    effectsRow.innerHTML = `<span><b>Reduced effects</b><small>Calm the glow, trails, and motion.</small></span>`;
    const effectsInput = document.createElement("input");
    effectsInput.type = "checkbox";
    effectsInput.checked = reducedEffects;
    effectsInput.addEventListener("change", () => { reducedEffects = effectsInput.checked; localStorage.setItem("orbit-reduced-effects", String(reducedEffects)); });
    effectsRow.append(effectsInput);
    panel.append(effectsRow);
    
    // Planetary flip toggle for customization
    const flipRow = document.createElement("label");
    flipRow.className = "setting-row";
    flipRow.innerHTML = `<span><b>Show prestige planetary flip in hangar</b><small>Toggle to preview flipped planet avatars/skins.</small></span>`;
    const flipInput = document.createElement("input");
    flipInput.type = "checkbox";
    flipInput.checked = localStorage.getItem("orbit-show-planetary-flip") === "1";
    flipInput.addEventListener("change", () => { localStorage.setItem("orbit-show-planetary-flip", flipInput.checked ? "1" : "0"); });
    flipRow.append(flipInput);
    panel.append(flipRow);

    const controlsSection = document.createElement("section");
    controlsSection.className = "custom-controls-settings";
    controlsSection.innerHTML = `<h2>Keyboard controls</h2><p>Choose a key for each action. Controls are shared with your signed-in account.</p>`;
    const controlsStatus = document.createElement("small");
    controlsStatus.setAttribute("role", "status");
    const controlLabels: Record<ControlAction, string> = { left: "Move left", right: "Move right", jump: "Jump", down: "Move down", shoot: "Fire cannon" };
    (Object.keys(controlLabels) as ControlAction[]).forEach((action) => {
        const button = createTextButton(`${controlLabels[action]}: ${formatControlBinding(controlBindings[action])}`, () => {
            button.textContent = `${controlLabels[action]}: Press a key...`;
            const captureKey = (event: KeyboardEvent) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                const code = event.code.toLowerCase();
                const conflict = (Object.keys(controlBindings) as ControlAction[]).find((item) => item !== action && controlKeysFor(item).includes(code));
                if (!code || conflict) {
                    controlsStatus.textContent = conflict ? `${formatControlBinding(code)} is already assigned to ${controlLabels[conflict]}.` : "That key cannot be assigned.";
                    button.textContent = `${controlLabels[action]}: ${formatControlBinding(controlBindings[action])}`;
                    return;
                }
                controlBindings[action] = code;
                localStorage.setItem("orbit-controls", JSON.stringify(controlBindings));
                controlsStatus.textContent = `${controlLabels[action]} is now ${formatControlBinding(code)}.`;
                showSettings();
            };
            window.addEventListener("keydown", captureKey, { once: true });
        });
        controlsSection.append(button);
    });
    controlsSection.append(createTextButton("Reset keyboard controls", () => {
        controlBindings = { ...DEFAULT_CONTROL_BINDINGS };
        localStorage.setItem("orbit-controls", JSON.stringify(controlBindings));
        showSettings();
    }), controlsStatus);
    panel.append(controlsSection);
    
    // Completion times display
    const timesSection = document.createElement("section");
    timesSection.className = "settings-times-section";
    timesSection.innerHTML = `<h2>Best Times by Planet</h2>`;
    
    const normalLevels = levels.filter((l) => !l.secret && !l.prestige);
    const prestigeLevels = levels.filter((l) => !l.secret && l.prestige);
    const normalSecretLevels = levels.filter((l) => l.secret && !l.prestige);
    const prestigeSecretLevels = levels.filter((l) => l.secret && l.prestige);
    
    const createTimeGroup = (title: string, levelList: Level[]) => {
        const group = document.createElement("div");
        group.className = "time-group";
        group.innerHTML = `<h3>${title}</h3>`;
        const list = document.createElement("div");
        list.className = "time-list";
        levelList.forEach((level, _index) => {
            const originalIndex = levels.indexOf(level);
            const best = Number(localStorage.getItem(`orbit-best-${originalIndex}`) ?? "0");
            const completed = localStorage.getItem(`orbit-level-complete-${originalIndex}`) === "1";
            if (best > 0 || completed) {
                const item = document.createElement("div");
                item.className = "time-item";
                item.innerHTML = `<span>${level.name}</span><strong>${best > 0 ? formatTime(best) : "—"}</strong>`;
                list.append(item);
            }
        });
        if (list.children.length === 0) {
            list.innerHTML = `<p class="menu-copy">No times recorded yet.</p>`;
        }
        group.append(list);
        return group;
    };
    
    if (activePlanet === "normal") {
        timesSection.append(createTimeGroup("Normal Levels", normalLevels));
        timesSection.append(createTimeGroup("Secret Levels", normalSecretLevels));
    } else {
        timesSection.append(createTimeGroup("Prestige Levels", prestigeLevels));
        timesSection.append(createTimeGroup("Prestige Secret Levels", prestigeSecretLevels));
    }
    
    panel.append(timesSection);
    
    // Golden skin progress meter
    const normalCompleted = getNormalCompletedLevelCount();
    const normalTotal = getNormalRouteCount();
    const goldenProgress = normalTotal > 0 ? (normalCompleted / normalTotal) * 100 : 0;
    
    const progressSection = document.createElement("section");
    progressSection.className = "golden-progress-section";
    progressSection.innerHTML = `
        <h2>Golden Body Progress</h2>
        <p class="menu-copy">Complete each normal route in ${formatTime(goldenTimeLimitMs)} or less to unlock the Golden Body skin.</p>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${goldenProgress}%"></div>
        </div>
        <small>${normalCompleted} / ${normalTotal} routes under the time limit (${Math.round(goldenProgress)}%)</small>
    `;
    panel.append(progressSection);
    
    const testerRow = document.createElement("div");
    testerRow.className = "tester-entry";
    testerRow.innerHTML = `<span><b>Tester tools</b><small>Adjust claims, power-ups, and level unlocks.</small></span>`;
    testerRow.append(createTextButton("Login", showTesterLogin));
    panel.append(testerRow);
    
    menu.append(panel, createTextButton("Back", showMenu), createPageCounter());
    document.body.replaceChildren(menu);
}

function showCustomization() {
    const menu = document.createElement("main");
    menu.className = "menu-screen customization-screen";
    menu.innerHTML = `<p class="eyebrow">HANGAR / LOADOUT</p><h1>Build your <em>ship</em></h1><p class="menu-copy">Equip a skin, trail, and avatar. Every collection is grouped from Common through Legendary.</p>`;
    const layout = document.createElement("div"); layout.className = "customization-layout";
    const panel = document.createElement("section"); panel.className = "settings-panel customization-panel";
    
    // Planetary flip toggle for customization
    const flipToggleRow = document.createElement("label");
    flipToggleRow.className = "setting-row";
    const showFlip = localStorage.getItem("orbit-show-planetary-flip") === "1";
    flipToggleRow.innerHTML = `<span><b>Show prestige planetary flip</b><small>View prestige-exclusive avatars, skins, and trails.</small></span>`;
    const flipToggle = document.createElement("input");
    flipToggle.type = "checkbox";
    flipToggle.checked = showFlip;
    flipToggle.addEventListener("change", () => { localStorage.setItem("orbit-show-planetary-flip", flipToggle.checked ? "1" : "0"); showCustomization(); });
    flipToggleRow.append(flipToggle);
    panel.append(flipToggleRow);
    
    const selectedAvatarStyle = avatars[selectedAvatar] ?? avatars[0];
    const selectedSkinStyle = skins[selectedSkin] ?? skins[0];
    const previewArt = selectedAvatarStyle.image ?? selectedSkinStyle.image;
    const selectedTrailStyle = trails[selectedTrail] ?? trails[0];
    const preview = document.createElement("aside"); preview.className = "ship-preview"; preview.innerHTML = `<p class="setting-title">Current character</p><div class="preview-stage">${selectedAvatarStyle.cssArt ? createCssShipArtMarkup(selectedAvatarStyle.cssArt, selectedAvatarStyle.name, selectedSkinStyle.color) : previewArt ? createShipArtMarkup(previewArt, selectedAvatarStyle.name, selectedSkinStyle.color) : `<div class="preview-ship ship-${selectedSkinStyle.shape}" style="--ship-color:${selectedSkinStyle.color}"><span></span><i></i></div>`}</div><b>${selectedAvatarStyle.name}</b><small>${selectedSkinStyle.name} skin / ${selectedTrailStyle.name} trail</small><div class="trail-preview" style="--trail-color:${selectedTrailStyle.color}">${Array.from({ length: 5 }, (_, index) => `<i class="trail-preview-particle trail-effect-${selectedTrailStyle.effect}" style="--trail-delay:${index * 90}ms"></i>`).join("")}</div>`;
    
    const rarityOrder: Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
    
    // Create arrays with original indices
    const skinsWithIndex = showFlip 
        ? skins.map((s, i) => ({ ...s, originalIndex: i })).filter(s => s.prestige)
        : skins.map((s, i) => ({ ...s, originalIndex: i })).filter(s => !s.prestige);
    const trailsWithIndex = showFlip
        ? trails.map((t, i) => ({ ...t, originalIndex: i })).filter(t => t.prestige)
        : trails.map((t, i) => ({ ...t, originalIndex: i })).filter(t => !t.prestige);
    const avatarsWithIndex = showFlip
        ? avatars.map((a, i) => ({ ...a, originalIndex: i })).filter(a => a.prestige)
        : avatars.map((a, i) => ({ ...a, originalIndex: i })).filter(a => !a.prestige);
    
    const appendRarityGroups = <T extends { name: string; required: number; secret?: boolean; boss?: boolean; prestige?: number; golden?: boolean; jackpot?: boolean }>(title: string, collection: T[], gridClass: string, createChoice: (item: T, index: number, rarity: Rarity) => HTMLButtonElement) => {
        const heading = document.createElement("p"); heading.className = "setting-title"; heading.textContent = title; panel.append(heading);
        const ordered = collection.map((item, index) => ({ item, index, rarity: getCosmeticRarity(item) })).sort((first, second) => rarityOrder.indexOf(first.rarity) - rarityOrder.indexOf(second.rarity) || first.item.name.localeCompare(second.item.name));
        rarityOrder.forEach((rarity) => {
            const groupItems = ordered.filter((entry) => entry.rarity === rarity);
            if (!groupItems.length) return;
            const group = document.createElement("section"); group.className = `rarity-group rarity-${rarity.toLowerCase()}`;
            group.innerHTML = `<h2>${rarity}</h2>`;
            const grid = document.createElement("div"); grid.className = gridClass;
            groupItems.forEach(({ item, index }) => grid.append(createChoice(item, index, rarity)));
            group.append(grid); panel.append(group);
        });
    };
    appendRarityGroups("Skins", skinsWithIndex, "customization-grid", (skin, _index, rarity) => {
        const button = document.createElement("button"); button.className = `loadout-choice ${selectedSkin === skin.originalIndex ? "selected" : ""}`; button.disabled = !isSkinUnlocked(skin, skin.originalIndex);
        button.innerHTML = `<span>${skin.name}</span>${createRarityBadge(rarity)}`;
        button.addEventListener("click", () => { selectedSkin = skin.originalIndex; localStorage.setItem("orbit-skin", String(selectedSkin)); showCustomization(); }); return button;
    });
    appendRarityGroups("Trails", trailsWithIndex, "customization-grid", (trail, _index, rarity) => {
        const button = document.createElement("button"); button.className = `loadout-choice ${selectedTrail === trail.originalIndex ? "selected" : ""}`; button.disabled = !isTrailUnlocked(trail);
        button.innerHTML = `<span>${trail.name}</span>${createRarityBadge(rarity)}`;
        button.addEventListener("click", () => { selectedTrail = trail.originalIndex; localStorage.setItem("orbit-trail", String(selectedTrail)); showCustomization(); }); return button;
    });
    appendRarityGroups("Avatars", avatarsWithIndex, "avatar-grid", (avatar, _index, rarity) => {
        const unlocked = isAvatarUnlocked(avatar);
        const button = document.createElement("button"); button.className = `avatar-option ${selectedAvatar === avatar.originalIndex ? "selected" : ""}`; button.disabled = !unlocked;
        button.innerHTML = `${avatar.cssArt ? createCssShipArtMarkup(avatar.cssArt, avatar.name, selectedSkinStyle.color) : avatar.image ? createShipArtMarkup(avatar.image, avatar.name, selectedSkinStyle.color) : `<i style="--avatar-color:${selectedSkinStyle.color}"></i>`}<span>${avatar.name}</span>${createRarityBadge(rarity)}<small>${unlocked ? "READY" : avatar.prestige ? `PRESTIGE ${avatar.prestige}` : avatar.golden ? "20 routes" : avatar.jackpot ? "JACKPOT" : "LOCKED"}</small>`;
        button.addEventListener("click", () => {
            selectedAvatar = avatar.originalIndex;
            if (isSkinUnlocked(skins[avatar.defaultSkin], avatar.defaultSkin)) { selectedSkin = avatar.defaultSkin; localStorage.setItem("orbit-skin", String(selectedSkin)); }
            localStorage.setItem("orbit-avatar", String(selectedAvatar)); showCustomization();
        }); return button;
    });
    layout.append(panel, preview);
    menu.append(layout, createTextButton("Back", showMenu), createPageCounter()); document.body.replaceChildren(menu);
}

function showCredits() {
    const menu = document.createElement("main"); menu.className = "menu-screen credits-screen";
    menu.innerHTML = `<p class="eyebrow">ORBIT RUN / CREDITS</p><h1>Made by <em>the crew</em></h1><p class="menu-copy">A small flight team built every route, ship, and secret.</p><section class="credits-list"><b>vslxped</b><b>Mr. Cline</b><b>riverwth (#1 sql hater)</b></section>`;
    menu.append(createTextButton("Back", showMenu)); document.body.replaceChildren(menu);
}

function showLeaderboard() {
    const menu = document.createElement("main");
    menu.className = "menu-screen leaderboard-screen";
    menu.innerHTML = `<p class="eyebrow">FLIGHT DATA / FASTEST RUNS</p><h1>Online <em>leaderboard</em></h1><p class="menu-copy">Best submitted account entry per level, with the abilities used on that run.</p>`;
    const accountSummary = document.createElement("p");
    accountSummary.className = "online-account-summary";
    accountSummary.setAttribute("role", "status");
    const accountButton = createTextButton("Sign in / Create account", showAccount);
    const list = document.createElement("section");
    list.className = "leaderboard-list";
    const adminPanel = document.createElement("section");
    adminPanel.className = "leaderboard-admin";
    const serviceStatus = document.createElement("p");
    serviceStatus.className = "online-service-status";
    serviceStatus.setAttribute("role", "status");
    menu.append(accountSummary, accountButton, serviceStatus, list, adminPanel, createTextButton("Mission select", showLevelMenu), createTextButton("Back", showMenu));
    document.body.replaceChildren(menu);

    void (async () => {
        try {
            const [session, settings, response] = await Promise.all([
                apiRequest<{ user: OnlineUser | null }>("/auth/session"),
                apiRequest<OnlineSettings>("/settings"),
                apiRequest<{ entries: OnlineLeaderboardEntry[] }>("/leaderboard"),
            ]);
            currentOnlineUser = session.user;
            goldenTimeLimitMs = settings.goldenTimeLimitMs;
            accountSummary.textContent = session.user
                ? `Signed in as ${session.user.username}${session.user.role === "owner" ? " / OWNER" : ""}`
                : "Sign in or create a username account to submit a time.";
            accountButton.textContent = session.user ? "Account / Sign out" : "Sign in / Create account";
            accountButton.onclick = session.user ? () => showAccount() : showAccount;
            renderLeaderboardEntries(list, response.entries, session.user);
            serviceStatus.textContent = response.entries.length ? `${response.entries.length} online best runs` : "No online runs have been submitted yet.";
            if (session.user?.role === "owner") renderOwnerControls(adminPanel, settings, () => showLeaderboard());
        } catch (error) {
            serviceStatus.textContent = `Online leaderboard unavailable: ${error instanceof Error ? error.message : "unknown service error"}`;
            list.textContent = "Leaderboard data could not be loaded.";
        }
    })();
}

function renderLeaderboardEntries(container: HTMLElement, entries: OnlineLeaderboardEntry[], user: OnlineUser | null) {
    container.replaceChildren();
    if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "menu-copy";
        empty.textContent = "No completed runs yet.";
        container.append(empty);
        return;
    }
    entries.forEach((entry, index) => {
        const row = document.createElement("div");
        row.className = "leaderboard-entry";
        const rank = document.createElement("b");
        rank.textContent = String(index + 1).padStart(2, "0");
        const playerLevel = document.createElement("span");
        playerLevel.className = "leaderboard-player-level";
        playerLevel.textContent = `${entry.username} / ${entry.level}`;
        const abilities = document.createElement("small");
        abilities.className = "leaderboard-abilities";
        abilities.textContent = `Abilities: ${entry.abilities.length ? entry.abilities.map(formatAbilityName).join(", ") : "None"}`;
        const time = document.createElement("strong");
        time.textContent = formatTime(entry.timeMs);
        row.append(rank, playerLevel, time, abilities);
        if (user?.role === "owner") row.append(createOwnerEntryControls(entry, () => showLeaderboard()));
        container.append(row);
    });
}

function formatAbilityName(ability: string) {
    return ability.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function createOwnerEntryControls(entry: OnlineLeaderboardEntry, refresh: () => void) {
    const controls = document.createElement("details");
    controls.className = "leaderboard-entry-controls";
    const summary = document.createElement("summary");
    summary.textContent = "Edit entry";
    const form = document.createElement("form");
    const level = document.createElement("input");
    level.value = entry.level;
    level.maxLength = 80;
    level.setAttribute("aria-label", "Leaderboard level name");
    const seconds = document.createElement("input");
    seconds.type = "number";
    seconds.min = "1";
    seconds.max = "1800";
    seconds.step = "0.001";
    seconds.value = (entry.timeMs / 1000).toString();
    seconds.setAttribute("aria-label", "Leaderboard time in seconds");
    const abilities = document.createElement("input");
    abilities.value = entry.abilities.join(", ");
    abilities.setAttribute("aria-label", "Leaderboard abilities, comma separated");
    const error = document.createElement("small");
    error.className = "tester-error";
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    form.append(level, seconds, abilities, save, error);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const parsedAbilities = abilities.value.split(",").map((ability) => ability.trim().toLowerCase()).filter(Boolean);
        try {
            await apiRequest(`/leaderboard/${encodeURIComponent(entry.id)}`, {
                method: "PATCH",
                body: JSON.stringify({ level: level.value, timeMs: Math.round(Number(seconds.value) * 1000), abilities: parsedAbilities }),
            });
            refresh();
        } catch (requestError) {
            error.textContent = requestError instanceof Error ? requestError.message : "Could not update leaderboard entry.";
        }
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
        if (!window.confirm(`Delete ${entry.username}'s ${entry.level} record?`)) return;
        try {
            await apiRequest(`/leaderboard/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
            refresh();
        } catch (requestError) {
            error.textContent = requestError instanceof Error ? requestError.message : "Could not delete leaderboard entry.";
        }
    });
    form.append(remove);
    controls.append(summary, form);
    return controls;
}

function renderOwnerControls(container: HTMLElement, settings: OnlineSettings, refresh: () => void) {
    container.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "Owner controls";
    const description = document.createElement("p");
    description.textContent = "Set the maximum clear time that counts toward Golden Body progress.";
    const form = document.createElement("form");
    const label = document.createElement("label");
    label.textContent = "Golden clear limit (seconds)";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "3600";
    input.step = "1";
    input.value = String(Math.ceil(settings.goldenTimeLimitMs / 1000));
    label.append(input);
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save golden time limit";
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    form.append(label, save, status);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            const updated = await apiRequest<OnlineSettings>("/settings/golden-time-limit", {
                method: "PUT",
                body: JSON.stringify({ timeLimitMs: Math.round(Number(input.value) * 1000) }),
            });
            goldenTimeLimitMs = updated.goldenTimeLimitMs;
            status.textContent = "Golden progress time limit saved.";
            refresh();
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Could not update the golden progress threshold.";
        }
    });
    container.append(title, description, form);
}

function showAccount() {
    let registrationMode = false;
    const render = (messageText = "") => {
        const menu = document.createElement("main");
        menu.className = "menu-screen account-screen";
        menu.innerHTML = `<p class="eyebrow">ONLINE ACCOUNT / PLAYER DATA</p><h1>${currentOnlineUser ? "Your" : registrationMode ? "Create an" : "Sign in to your"} <em>account</em></h1><p class="menu-copy">${currentOnlineUser ? "Your account is signed in on this device." : "Choose a unique username and password. Passwords are salted and hashed on the server."}</p>`;
        if (currentOnlineUser) {
            const signedIn = document.createElement("p");
            signedIn.textContent = `Signed in as ${currentOnlineUser.username}${currentOnlineUser.role === "owner" ? " / OWNER" : ""}.`;
            if (messageText) {
                const message = document.createElement("small");
                message.className = "online-service-status";
                message.setAttribute("role", "status");
                message.textContent = messageText;
                menu.append(signedIn, message);
            } else menu.append(signedIn);
            const dashboard = document.createElement("section");
            dashboard.className = "account-dashboard";
            const statsHeading = document.createElement("h2");
            statsHeading.textContent = "Pilot stats";
            const stats = document.createElement("div");
            stats.className = "account-stats";
            [
                ["Asteroids", String(asteroidsClaimed)],
                ["Special currency", String(specialAsteroids)],
                ["Prestige", `${prestigeLevel} / ${prestigeMax}`],
                ["Routes cleared", `${getCompletedLevelCount()} / ${levels.length}`],
            ].forEach(([label, value]) => {
                const item = document.createElement("article");
                item.innerHTML = `<small></small><b></b>`;
                item.querySelector("small")!.textContent = label;
                item.querySelector("b")!.textContent = value;
                stats.append(item);
            });
            const inventoryHeading = document.createElement("h2");
            inventoryHeading.textContent = "Items and loadout";
            const inventory = getInventory();
            const itemList = document.createElement("div");
            itemList.className = "account-items";
            (Object.keys(powerupLabels) as PowerupKind[]).forEach((kind) => {
                const item = document.createElement("span");
                item.textContent = `${powerupLabels[kind]}: ${inventory[kind]}`;
                itemList.append(item);
            });
            const loadout = document.createElement("p");
            loadout.textContent = `Equipped: ${avatars[selectedAvatar]?.name ?? "Classic"} / ${skins[selectedSkin]?.name ?? "Standard"} / ${trails[selectedTrail]?.name ?? "Ember"}`;
            const profileHeading = document.createElement("h2");
            profileHeading.textContent = "Profile settings";
            const profileForm = document.createElement("form");
            profileForm.className = "account-profile-form";
            const usernameLabel = document.createElement("label");
            usernameLabel.textContent = "Display name";
            const usernameInput = document.createElement("input");
            usernameInput.value = currentOnlineUser.username;
            usernameInput.minLength = 3;
            usernameInput.maxLength = 20;
            usernameInput.pattern = "[A-Za-z0-9_]{3,20}";
            usernameInput.required = true;
            usernameLabel.append(usernameInput);
            const profileHint = document.createElement("small");
            profileHint.setAttribute("role", "status");
            const saveProfile = document.createElement("button");
            saveProfile.className = "menu-button";
            saveProfile.type = "submit";
            saveProfile.textContent = "Save profile";
            profileForm.append(usernameLabel, saveProfile, profileHint);
            profileForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                saveProfile.disabled = true;
                profileHint.textContent = "Saving profile...";
                try {
                    const updated = await apiRequest<{ user: { username: string }; usernameChangedAt: string | null }>("/account/profile", {
                        method: "PATCH",
                        body: JSON.stringify({ username: usernameInput.value }),
                    });
                    currentOnlineUser = { ...currentOnlineUser!, username: updated.user.username };
                    updateOwnerAccountIndicator();
                    render("Profile updated.");
                } catch (error) {
                    profileHint.textContent = error instanceof Error ? error.message : "Could not update your profile.";
                    saveProfile.disabled = false;
                }
            });
            dashboard.append(statsHeading, stats, inventoryHeading, itemList, loadout, profileHeading, profileForm);
            menu.append(dashboard);
            void apiRequest<{ role: "player" | "owner"; nextUsernameChangeAt: string | null }>("/account/profile")
                .then((profile) => {
                    if (!menu.isConnected) return;
                    if (profile.role === "owner") {
                        usernameInput.disabled = true;
                        saveProfile.disabled = true;
                        profileHint.textContent = "Owner usernames are managed through deployment account settings.";
                    } else if (profile.nextUsernameChangeAt && new Date(profile.nextUsernameChangeAt) > new Date()) {
                        const availableDate = new Date(profile.nextUsernameChangeAt);
                        saveProfile.disabled = true;
                        profileHint.textContent = `Username editing unlocks ${availableDate.toLocaleString()}.`;
                    } else profileHint.textContent = "Username changes are limited to once every 7 days.";
                })
                .catch((error: unknown) => {
                    if (menu.isConnected) profileHint.textContent = error instanceof Error ? error.message : "Could not load profile settings.";
                });
            const signOut = createTextButton("Sign out", async () => {
                try {
                    let syncWarning = "";
                    try {
                        await syncAccountProgress("save", true);
                    } catch (error) {
                        syncWarning = ` You are signed out, but the latest progress could not sync: ${error instanceof Error ? error.message : "online service error"}`;
                        console.error("Could not save account progress before sign-out:", error);
                    }
                    await apiRequest<void>("/auth/logout", { method: "POST" });
                    currentOnlineUser = null;
                    lastSyncedAccountProgress = "";
                    render(`You have signed out.${syncWarning}`);
                } catch (error) {
                    render(error instanceof Error ? error.message : "Could not sign out.");
                }
            });
            menu.append(signOut);
        } else {
            const form = document.createElement("form");
            form.className = "account-form";
            const usernameLabel = document.createElement("label");
            usernameLabel.textContent = "Username";
            const username = document.createElement("input");
            username.name = "username";
            username.autocomplete = "username";
            username.minLength = 3;
            username.maxLength = 20;
            username.required = true;
            username.pattern = "[A-Za-z0-9_]{3,20}";
            username.title = "3-20 letters, numbers, or underscores.";
            usernameLabel.append(username);
            const passwordLabel = document.createElement("label");
            passwordLabel.textContent = "Password";
            const password = document.createElement("input");
            password.name = "password";
            password.type = "password";
            password.autocomplete = registrationMode ? "new-password" : "current-password";
            password.minLength = 10;
            password.maxLength = 128;
            password.required = true;
            passwordLabel.append(password);
            const message = document.createElement("small");
            message.className = "online-service-status";
            message.setAttribute("role", "status");
            message.textContent = messageText;
            const submit = document.createElement("button");
            submit.className = "menu-button";
            submit.type = "submit";
            submit.textContent = registrationMode ? "Create account" : "Sign in";
            const switchMode = createTextButton(registrationMode ? "I already have an account" : "Create a new account", () => { registrationMode = !registrationMode; render(); });
            form.append(usernameLabel, passwordLabel, submit, message);
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                submit.disabled = true;
                message.textContent = "Connecting to the account service...";
                try {
                    const response = await apiRequest<{ user: OnlineUser }>(`/auth/${registrationMode ? "register" : "login"}`, {
                        method: "POST",
                        body: JSON.stringify({ username: username.value, password: password.value }),
                    });
                    currentOnlineUser = response.user;
                    updateOwnerAccountIndicator();
                    try {
                        await syncAccountProgress("load");
                    } catch (error) {
                        render(`Signed in, but account progress could not sync: ${error instanceof Error ? error.message : "online service error"}`);
                        return;
                    }
                    showAccount();
                } catch (error) {
                    message.textContent = error instanceof Error ? error.message : "The account service could not complete the request.";
                    submit.disabled = false;
                }
            });
            menu.append(form, switchMode);
        }
        menu.append(createTextButton("Back", showMenu));
        document.body.replaceChildren(menu);
    };
    render();
}

function levelToMakerDraft(level: Level): LevelMakerDraft {
    const tiles = Array<string>(144).fill("empty");
    const flippedTiles = Array<string>(144).fill("empty");
    const place = (target: string[], index: number, kind: string) => {
        const column = index - 1;
        if (column < 0 || column >= 24) return;
        let row = 0;
        while (row < 6 && target[row * 24 + column] !== "empty") row++;
        if (row < 6) target[row * 24 + column] = kind;
    };
    const special = new Set(level.specialAsteroids ?? []);
    level.asteroids.forEach((index) => place(tiles, index, special.has(index) ? "special" : "asteroid"));
    level.walls.forEach((index) => place(tiles, index, "wall"));
    (level.blocks ?? []).forEach((index) => place(tiles, index, "block"));
    level.enemies.forEach((index) => place(tiles, index, "enemy"));
    level.spikes.forEach((index) => place(tiles, index, "spike"));
    level.gravity.forEach((index) => place(tiles, index, "gravity"));
    (level.portals ?? []).forEach((index) => place(tiles, index, "portal"));
    (level.miniBosses ?? []).forEach((index) => place(tiles, index, "miniBoss"));
    if (level.boss && level.bossIndex !== undefined) place(tiles, level.bossIndex, "titan");
    (level.powerups ?? []).forEach(({ index, kind }) => place(tiles, index, `powerup${kind.charAt(0).toUpperCase()}${kind.slice(1)}`));
    const route = level.flippedRoute;
    if (route) {
        route.walls.forEach((index) => place(flippedTiles, index, "wall"));
        route.enemies.forEach((index) => place(flippedTiles, index, "enemy"));
        route.spikes.forEach((index) => place(flippedTiles, index, "spike"));
        route.gravity.forEach((index) => place(flippedTiles, index, "gravity"));
        (route.powerups ?? []).forEach(({ index, kind }) => place(flippedTiles, index, `powerup${kind.charAt(0).toUpperCase()}${kind.slice(1)}`));
        if (route.key !== undefined) place(flippedTiles, route.key, "exitKey");
    }
    return { name: level.name, briefing: level.briefing, prestige: Boolean(level.prestige), tiles, flippedTiles, customId: level.customId };
}

function showLevelMaker(draft?: LevelMakerDraft) {
    const menu = document.createElement("main"); menu.className = "menu-screen maker-screen";
    menu.innerHTML = `<p class="eyebrow">JACER WORKSHOP / LEVEL EDITOR</p><h1>Build a <em>route</em></h1><p class="menu-copy">Playtest your draft before publishing. Published workshop levels are stored online for every player; only workshop levels can be deleted.</p>`;
    const details = document.createElement("div");
    details.className = "maker-details";
    const nameInput = document.createElement("input");
    nameInput.placeholder = "Level name";
    nameInput.maxLength = 40;
    nameInput.required = true;
    nameInput.value = draft?.name ?? "";
    nameInput.setAttribute("aria-label", "Level name");
    const briefingInput = document.createElement("input");
    briefingInput.placeholder = "Briefing";
    briefingInput.maxLength = 240;
    briefingInput.value = draft?.briefing ?? "";
    briefingInput.setAttribute("aria-label", "Level briefing");
    details.append(nameInput, briefingInput);
    const existingWorkshopLevels = levels.filter((level) => Boolean(level.customId) && !level.localOnly);
    if (existingWorkshopLevels.length) {
        const editSection = document.createElement("section");
        editSection.className = "maker-existing-levels";
        const heading = document.createElement("p");
        heading.className = "setting-title";
        heading.textContent = "Edit a published level";
        editSection.append(heading);
        existingWorkshopLevels.forEach((level) => {
            const editButton = createTextButton(`Edit ${level.name}`, () => showLevelMaker(levelToMakerDraft(level)));
            editSection.append(editButton);
        });
        menu.append(editSection);
    }
    const toolbar = document.createElement("nav"); toolbar.className = "maker-toolbar";
    const undo = document.createElement("button"); undo.className = "maker-tool-button"; undo.type = "button"; undo.textContent = "Undo";
    const clear = document.createElement("button"); clear.className = "maker-tool-button danger"; clear.type = "button"; clear.textContent = "Clear area";
    const modeLabel = document.createElement("span"); modeLabel.className = "maker-mode-label"; modeLabel.textContent = "BUILD MODE";
    const buildMode = document.createElement("button"); buildMode.className = "maker-tool-button selected"; buildMode.type = "button"; buildMode.textContent = "Build";
    const eraseMode = document.createElement("button"); eraseMode.className = "maker-tool-button"; eraseMode.type = "button"; eraseMode.textContent = "Delete";
    toolbar.append(undo, clear, modeLabel, buildMode, eraseMode);
    const prestigeToggle = document.createElement("label"); prestigeToggle.className = "maker-mode-label"; prestigeToggle.innerHTML = `<input type="checkbox"> Prestige route`;
    const prestigeRouteInput = prestigeToggle.querySelector<HTMLInputElement>("input")!;
    prestigeRouteInput.checked = draft?.prestige ?? false;
    toolbar.append(prestigeToggle);
    const areaState = document.createElement("span"); areaState.className = "maker-area-state";
    const palette = document.createElement("nav"); palette.className = "maker-palette";
    const tiles = ["empty", "wall", "block", "spike", "gravity", "portal", "asteroid", "special", "enemy", "miniBoss", "titan", "exitKey", "powerupShield", "powerupBoost", "powerupRapid", "powerupCannon", "powerupStar"];
    const powerupTileKinds: Record<string, PowerupKind> = { powerupShield: "shield", powerupBoost: "boost", powerupRapid: "rapid", powerupCannon: "cannon", powerupStar: "star" };
    const makerCellClass = (kind: string) => `maker-cell ${kind}${powerupTileKinds[kind] ? ` powerup ${powerupTileKinds[kind]}` : ""}`;
    let selectedTile = "wall";
    let deleteMode = false;
    const history: { tiles: string[]; flippedTiles: string[] }[] = [];
    const tileLabels: Record<string, string> = { empty: "Erase", wall: "Platform", block: "Block", miniBoss: "Dark Knight", titan: "Titan", special: "Special asteroid", exitKey: "Exit key" };
    tileLabels.powerupShield = "Shield power-up"; tileLabels.powerupBoost = "Boost power-up"; tileLabels.powerupRapid = "Rapid power-up"; tileLabels.powerupCannon = "Cannon power-up"; tileLabels.powerupStar = "Rainbow Star";
    tiles.forEach((tile) => { const button = createTextButton(tileLabels[tile] ?? tile, () => { selectedTile = tile; deleteMode = false; buildMode.classList.add("selected"); eraseMode.classList.remove("selected"); palette.querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item.dataset.tile === tile)); }); button.dataset.tile = tile; button.classList.toggle("selected", tile === selectedTile); palette.append(button); });
    const createCells = (target: HTMLElement, initial: string[] = [], prefix: string) => Array.from({ length: 144 }, (_, index) => {
        const cell = document.createElement("button");
        cell.type = "button";
        const initialKind = initial[index] ?? "empty";
        cell.className = makerCellClass(initialKind);
        cell.dataset.kind = initialKind;
        cell.textContent = initialKind === "gravity" ? "" : initialKind === "exitKey" ? "K" : powerupTileKinds[initialKind] ? powerupLabels[powerupTileKinds[initialKind]].slice(0, 1) : "";
        cell.setAttribute("aria-label", `${prefix} tile ${index + 1}`);
        cell.addEventListener("click", () => {
            history.push({ tiles: cells.map((item) => item.dataset.kind ?? "empty"), flippedTiles: flippedCells.map((item) => item.dataset.kind ?? "empty") });
            const next = deleteMode ? "empty" : selectedTile;
            cell.dataset.kind = next;
            cell.className = makerCellClass(next);
            cell.textContent = next === "empty" || next === "gravity" ? "" : next === "exitKey" ? "K" : powerupTileKinds[next] ? powerupLabels[powerupTileKinds[next]].slice(0, 1) : "";
            updateFlippedTab();
        });
        target.append(cell);
        return cell;
    });
    const grid = document.createElement("div"); grid.className = "maker-grid"; grid.setAttribute("aria-label", "Normal area grid");
    const flippedTab = document.createElement("button"); flippedTab.className = "maker-tool-button"; flippedTab.type = "button"; flippedTab.textContent = "Flipped planet area"; flippedTab.hidden = true;
    const flippedGrid = document.createElement("div"); flippedGrid.className = "maker-grid"; flippedGrid.hidden = true; flippedGrid.setAttribute("aria-label", "Flipped planet area grid");
    let cells: HTMLButtonElement[] = [];
    let flippedCells: HTMLButtonElement[] = [];
    cells = createCells(grid, draft?.tiles, "Normal");
    flippedCells = createCells(flippedGrid, draft?.flippedTiles, "Flipped");
    const applyCellData = (collection: HTMLButtonElement[], values: string[]) => collection.forEach((cell, index) => {
        const kind = values[index] ?? "empty";
        cell.dataset.kind = kind;
        cell.className = makerCellClass(kind);
        cell.textContent = kind === "empty" || kind === "gravity" ? "" : kind === "exitKey" ? "K" : powerupTileKinds[kind] ? powerupLabels[powerupTileKinds[kind]].slice(0, 1) : "";
    });
    const currentDraft = (): LevelMakerDraft => ({
        name: nameInput.value,
        briefing: briefingInput.value,
        prestige: prestigeRouteInput.checked,
        tiles: cells.map((cell) => cell.dataset.kind ?? "empty"),
        flippedTiles: flippedCells.map((cell) => cell.dataset.kind ?? "empty"),
        customId: draft?.customId,
    });
    const showMainGrid = () => { grid.hidden = false; flippedGrid.hidden = true; buildMode.textContent = "Build"; };
    flippedTab.addEventListener("click", () => { grid.hidden = true; flippedGrid.hidden = false; buildMode.textContent = "Flipped build"; });
    const updateFlippedTab = () => {
        const canBuildFlippedArea = prestigeRouteInput.checked && cells.some((cell) => cell.dataset.kind === "gravity");
        flippedTab.hidden = !canBuildFlippedArea;
        areaState.textContent = prestigeRouteInput.checked ? (canBuildFlippedArea ? "PRESTIGE / main route + flipped route" : "PRESTIGE / place a gravity field to enable the flipped route") : "NORMAL / main route only";
        if (flippedTab.hidden) showMainGrid();
    };
    const activeCells = () => flippedGrid.hidden ? cells : flippedCells;
    undo.addEventListener("click", () => {
        const snapshot = history.pop();
        if (!snapshot) return;
        applyCellData(cells, snapshot.tiles);
        applyCellData(flippedCells, snapshot.flippedTiles);
        updateFlippedTab();
    });
    clear.addEventListener("click", () => {
        history.push({ tiles: cells.map((item) => item.dataset.kind ?? "empty"), flippedTiles: flippedCells.map((item) => item.dataset.kind ?? "empty") });
        applyCellData(activeCells(), []);
        updateFlippedTab();
    });
    buildMode.addEventListener("click", () => { deleteMode = false; modeLabel.textContent = "BUILD MODE"; buildMode.classList.add("selected"); eraseMode.classList.remove("selected"); });
    eraseMode.addEventListener("click", () => { deleteMode = true; modeLabel.textContent = "DELETE MODE"; eraseMode.classList.add("selected"); buildMode.classList.remove("selected"); });
    const collectLevel = (): Level | null => {
        const name = nameInput.value.trim();
        if (!name || /[<>]/.test(name)) { saveStatus.textContent = "Enter a level name using plain text."; return null; }
        const briefing = briefingInput.value.trim() || "A route assembled in the Jacer workshop.";
        if (/[<>]/.test(briefing)) { saveStatus.textContent = "Briefing must use plain text."; return null; }
        const level: Level = { name, briefing, length: 26, asteroids: [], walls: [], blocks: [], enemies: [], spikes: [], gravity: [], portals: [], specialAsteroids: [], miniBosses: [], powerups: [], prestige: prestigeRouteInput.checked, customId: draft?.customId };
        const addTile = (target: number[], index: number) => { if (!target.includes(index)) target.push(index); };
        cells.forEach((cell, cellIndex) => {
            const tile = cell.dataset.kind ?? "empty";
            const column = cellIndex % 24 + 1;
            if (tile === "asteroid" || tile === "special") addTile(level.asteroids, column);
            if (tile === "special") addTile(level.specialAsteroids!, column);
            if (tile === "wall") addTile(level.walls, column);
            if (tile === "block") addTile(level.blocks!, column);
            if (tile === "enemy") addTile(level.enemies, column);
            if (tile === "spike") addTile(level.spikes, column);
            if (tile === "gravity") addTile(level.gravity, column);
            if (tile === "portal") addTile(level.portals!, column);
            if (tile === "miniBoss") addTile(level.miniBosses!, column);
            if (tile === "titan") { level.boss = true; level.bossIndex = column; }
            if (powerupTileKinds[tile] && !level.powerups!.some((powerup) => powerup.index === column)) level.powerups!.push({ index: column, kind: powerupTileKinds[tile] });
        });
        if (level.prestige && level.gravity.length) {
            const route: FlippedRoute = { walls: [], enemies: [], spikes: [], gravity: [], powerups: [], key: 23 };
            flippedCells.forEach((cell, cellIndex) => {
                const tile = cell.dataset.kind ?? "empty";
                const column = cellIndex % 24 + 1;
                if (tile === "wall") addTile(route.walls, column);
                if (tile === "enemy") addTile(route.enemies, column);
                if (tile === "spike") addTile(route.spikes, column);
                if (tile === "gravity") addTile(route.gravity, column);
                if (tile === "asteroid" || tile === "special" || tile === "exitKey") route.key = column;
                if (powerupTileKinds[tile] && !route.powerups!.some((powerup) => powerup.index === column)) route.powerups!.push({ index: column, kind: powerupTileKinds[tile] });
            });
            level.flippedRoute = route;
        }
        return level;
    };
    const saveStatus = document.createElement("small");
    saveStatus.className = "tester-error";
    saveStatus.setAttribute("role", "status");
    const playtest = createMenuButton("Playtest draft", () => {
        const level = collectLevel();
        if (!level) return;
        const draftSnapshot = currentDraft();
        const previewIndex = levels.push(level) - 1;
        isLevelMakerPreview = true;
        levelMakerPreviewReturn = () => {
            levels.splice(previewIndex, 1);
            isLevelMakerPreview = false;
            levelMakerPreviewReturn = null;
            showLevelMaker(draftSnapshot);
        };
        startGame(previewIndex);
    });
    const save = createMenuButton(draft?.customId ? "Save level changes" : "Publish shared level", async () => {
        const level = collectLevel();
        if (!level) return;
        save.disabled = true;
        saveStatus.textContent = draft?.customId ? "Saving workshop changes..." : "Publishing workshop level...";
        const { customId: _customId, localOnly: _localOnly, ...levelData } = level;
        try {
            const result = await apiRequest<{ level: Level }>(draft?.customId ? `/levels/${encodeURIComponent(draft.customId)}` : "/levels", {
                method: draft?.customId ? "PUT" : "POST",
                body: JSON.stringify({ level: levelData }),
            });
            const savedLevel = { ...result.level, localOnly: false };
            if (draft?.customId) {
                const existingIndex = levels.findIndex((item) => item.customId === draft.customId);
                if (existingIndex >= 0) levels[existingIndex] = savedLevel;
                else levels.push(savedLevel);
            } else levels.push(savedLevel);
            localStorage.setItem("orbit-global-level-cache", JSON.stringify(levels.filter((item) => item.customId && !item.localOnly)));
            configurePortalDistribution();
            showLevelMenu();
        } catch (error) {
            saveStatus.textContent = error instanceof Error ? error.message : "Could not publish the shared level.";
            save.disabled = false;
        }

    });
    updateFlippedTab();
    toolbar.append(areaState, flippedTab);
    menu.append(details, toolbar, grid, flippedGrid, palette, playtest, save, saveStatus, createTextButton("Back to tester", () => showTesterPanel()));
    document.body.replaceChildren(menu);
}

function createTextButton(text: string, action: () => void) {
    const button = document.createElement("button");
    button.className = "text-button";
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
}

function formatControlBinding(code: string) {
    if (code === "space") return "Space";
    if (code.startsWith("key")) return code.slice(3).toUpperCase();
    if (code.startsWith("digit")) return code.slice(5);
    return code.replace(/([a-z])([a-z]*)/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

const secondaryControlKeys: Record<ControlAction, string[]> = {
    left: ["keya"],
    right: ["keyd"],
    jump: ["keyw", "space"],
    down: ["keys"],
    shoot: [],
};
function controlKeysFor(action: ControlAction) {
    return controlBindings[action] === DEFAULT_CONTROL_BINDINGS[action]
        ? [controlBindings[action], ...secondaryControlKeys[action]]
        : [controlBindings[action]];
}

function createShipArtMarkup(image: string, label: string, color: string) { return `<span class="ship-art-image" role="img" aria-label="${label}" style="--ship-image:url('${image}');--ship-color:${color}"></span>`; }
function createCssShipArtMarkup(art: PrestigeShipArt, label: string, color: string) { return `<span class="ship-css-art ship-css-${art}" role="img" aria-label="${label}" style="--ship-color:${color}"></span>`; }

function getInventory(): Record<PowerupKind, number> {
    try { return { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 0, ...JSON.parse(localStorage.getItem("orbit-powerups") ?? "{}") }; }
    catch { return { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 0 }; }
}

function saveInventory(inventory: Record<PowerupKind, number>) { localStorage.setItem("orbit-powerups", JSON.stringify(inventory)); }

function showShop() {
    gameActive = false;
    cancelAnimationFrame(animationFrame);
    const menu = document.createElement("main");
    menu.className = "menu-screen shop-screen";
    menu.innerHTML = `<p class="eyebrow">FLIGHT SUPPLY / SHOP</p><h1>Stock your <em>ship</em></h1><p class="menu-copy">Buy single-use power-ups with claimed asteroids. Use them from the power-up bar at the top of a mission.</p>`;
    const inventory = getInventory();
    const currency = document.createElement("p");
    currency.className = "shop-currency";
    currency.textContent = `NORMAL ${asteroidsClaimed}  /  SPECIAL ${specialAsteroids}`;
    const grid = document.createElement("div");
    grid.className = "shop-grid";
    const purchasableKinds: PowerupKind[] = ["shield", "boost", "rapid", "cannon"];
    purchasableKinds.forEach((kind) => {
        const card = document.createElement("article");
        card.className = `shop-card ${kind}`;
        card.innerHTML = `<b>${powerupLabels[kind]}</b><span class="shop-symbol">${kind === "shield" ? "◇" : kind === "boost" ? "»" : kind === "rapid" ? "ϟ" : "✦"}</span><small>IN HOLD: ${inventory[kind]}</small>`;
        const buy = document.createElement("button");
        buy.className = "text-button shop-buy";
        buy.disabled = asteroidsClaimed < powerupPrices[kind];
        buy.textContent = `Buy / ${powerupPrices[kind]} asteroids`;
        buy.addEventListener("click", () => { if (asteroidsClaimed < powerupPrices[kind]) return; asteroidsClaimed -= powerupPrices[kind]; localStorage.setItem("orbit-claims", String(asteroidsClaimed)); inventory[kind]++; saveInventory(inventory); showShop(); });
        card.append(buy);
        grid.append(card);
    });
    const wheel = document.createElement("article");
    wheel.className = "asteroid-wheel";
    wheel.innerHTML = `<div class="wheel-ring"><span>✦</span></div><b>ASTEROID ROLL</b><small>1 special asteroid / one reward only / reward odds and amounts can be tuned in tester tools</small>`;
    const roll = document.createElement("button");
    roll.className = "text-button shop-buy";
    roll.type = "button";
    roll.textContent = "Spin left to right / 1 special";
    roll.disabled = specialAsteroids < 1 || spinInProgress;
    roll.addEventListener("click", () => {
        if (specialAsteroids < 1 || spinInProgress) return;
        spinInProgress = true;
        specialAsteroids--;
        localStorage.setItem("orbit-special-claims", String(specialAsteroids));
        wheel.classList.add("spinning");
        roll.disabled = true;
        const rarity = rollSpecialAsteroidRarity();
        const resultCopy = getSpecialSpinReward(rarity);
        window.setTimeout(() => {
            spinInProgress = false;
            if (!document.body.contains(menu)) return;
            wheel.classList.remove("spinning");
            const result = document.createElement("div");
            result.className = "spin-result";
            result.setAttribute("role", "dialog");
            result.setAttribute("aria-modal", "true");
            result.innerHTML = `<div class="spin-result-card"><p class="eyebrow">ROLL COMPLETE</p>${createRarityBadge(rarity)}<h2>${resultCopy.title}</h2><p>${resultCopy.description}</p></div>`;
            const close = document.createElement("button");
            close.className = "menu-button";
            close.type = "button";
            close.textContent = "Continue";
            close.addEventListener("click", () => showShop());
            result.querySelector(".spin-result-card")?.append(close);
            menu.append(result);
        }, 850);
    });
    wheel.append(roll);
    const odds = document.createElement("section");
    odds.className = "shop-odds";
    const rarityOdds = getConfiguredRarityOdds();
    odds.innerHTML = `<b>Special asteroid odds</b>${RARITY_ORDER.map((rarity) => `<span>${rarity} ${rarityOdds[rarity]}%</span>`).join("")}`;
    menu.append(currency, grid, wheel, odds, createTextButton("Mission select", showLevelMenu), createTextButton("Main menu", showMenu), createPageCounter());
    document.body.replaceChildren(menu);
}

function getCosmeticRarity(item: { required: number; secret?: boolean; boss?: boolean; prestige?: number; golden?: boolean; jackpot?: boolean }): Rarity {
    if (item.golden || item.jackpot || (item.prestige ?? 0) >= 3) return "Legendary";
    if ((item.prestige ?? 0) >= 2 || item.boss || item.required >= 54) return "Epic";
    if ((item.prestige ?? 0) >= 1 || item.secret || item.required >= 30) return "Rare";
    if (item.required >= 10) return "Uncommon";
    return "Common";
}

function createRarityBadge(rarity: Rarity) { return `<span class="rarity-badge rarity-${rarity.toLowerCase()}">${rarity}</span>`; }
function cosmeticUnlockKey(group: CosmeticGroup, index: number) { return `orbit-spin-${group}-${index}`; }
function isSpinCosmeticUnlocked(group: CosmeticGroup, index: number) { return localStorage.getItem(cosmeticUnlockKey(group, index)) === "1"; }
function unlockSpinCosmetic(group: CosmeticGroup, index: number) { localStorage.setItem(cosmeticUnlockKey(group, index), "1"); }

function rollSpecialAsteroidRarity(): Rarity {
    const roll = Math.random() * 100;
    let threshold = 0;
    const odds = getConfiguredRarityOdds();
    for (const rarity of RARITY_ORDER) {
        threshold += odds[rarity];
        if (roll < threshold) return rarity;
    }
    return "Common";
}

function getSpecialSpinReward(rarity: Rarity) {
    const skinChance = getConfiguredSkinChances()[rarity] / 100;
    const availableSkins = skins
        .map((skin, index) => ({ skin, index }))
        .filter(({ skin, index }) => getCosmeticRarity(skin) === rarity && !isSpinCosmeticUnlocked("skin", index));
    if (availableSkins.length && Math.random() < skinChance) {
        const chosen = availableSkins[Math.floor(Math.random() * availableSkins.length)];
        unlockSpinCosmetic("skin", chosen.index);
        selectedSkin = chosen.index;
        localStorage.setItem("orbit-skin", String(selectedSkin));
        return {
            title: `You got <em>${chosen.skin.name}</em>`,
            description: `${rarity} skin added to your collection. This spin awarded a skin only.`,
        };
    }
    const [minimum, maximum] = getConfiguredRewardRanges()[rarity];
    const reward = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
    asteroidsClaimed += reward;
    localStorage.setItem("orbit-claims", String(asteroidsClaimed));
    return {
        title: `You got <em>${reward} asteroids</em>`,
        description: `${rarity} asteroid cache secured. This spin awarded asteroids only.`,
    };
}

function showDropRates() {
    gameActive = false;
    cancelAnimationFrame(animationFrame);
    const menu = document.createElement("main");
    menu.className = "menu-screen drop-rates-screen";
    menu.innerHTML = `<p class="eyebrow">SPECIAL ASTEROID / DROP RATES</p><h1>Know the <em>odds</em></h1><p class="menu-copy">Every spin gives one reward. Roll chances, asteroid rewards, and skin chances can be adjusted in the tester panel.</p>`;
    const odds = document.createElement("section");
    odds.className = "rarity-odds";
    const rarityOdds = getConfiguredRarityOdds();
    const rewardRanges = getConfiguredRewardRanges();
    const skinChances = getConfiguredSkinChances();
    RARITY_ORDER.forEach((rarity) => {
        const item = document.createElement("article");
        item.className = `rarity-odds-card rarity-${rarity.toLowerCase()}`;
        const [minimum, maximum] = rewardRanges[rarity];
        const rewardText = `${minimum.toLocaleString()}-${maximum.toLocaleString()} asteroids / ${skinChances[rarity]}% skin chance`;
        item.innerHTML = `${createRarityBadge(rarity)}<strong>${rarityOdds[rarity]}%</strong><small>${rewardText}</small>`;
        odds.append(item);
    });
    
    const catalog = document.createElement("section");
    catalog.className = "rarity-catalog";
    const collections: { title: string; items: { name: string; required: number; secret?: boolean; boss?: boolean; prestige?: number; golden?: boolean; jackpot?: boolean }[] }[] = [
        { title: "Skins", items: skins },
        { title: "Trails", items: trails },
        { title: "Avatars", items: avatars },
    ];
    collections.forEach((collection) => {
        const group = document.createElement("article");
        const orderedItems = [...collection.items].sort((first, second) =>
            RARITY_ORDER.indexOf(getCosmeticRarity(first)) - RARITY_ORDER.indexOf(getCosmeticRarity(second)) || first.name.localeCompare(second.name));
        group.innerHTML = `<h2>${collection.title}</h2><div>${orderedItems.map((item) => `<span>${item.name}${createRarityBadge(getCosmeticRarity(item))}</span>`).join("")}</div>`;
        catalog.append(group);
    });
    menu.append(odds, catalog, createTextButton("Back to main menu", showMenu), createPageCounter());
    document.body.replaceChildren(menu);
}

function switchPlanet() {
    activePlanet = activePlanet === "normal" ? "prestige" : "normal";
    document.body.classList.toggle("prestige-theme", activePlanet === "prestige");
    showLevelMenu();
    const transition = document.createElement("div");
    transition.className = `planet-transition ${activePlanet}`;
    transition.innerHTML = `<span>${activePlanet === "prestige" ? "ENTERING PRESTIGE ORBIT" : "RETURNING TO BLUE PLANET"}</span>`;
    document.body.append(transition);
    window.setTimeout(() => transition.remove(), 1100);
}

function createLoadoutPanel() {
    const panel = document.createElement("section");
    panel.className = "loadout-panel";
    panel.innerHTML = `<p class="setting-title">Mission power-ups</p><small>Click a power-up in the mission HUD to spend one from your hold.</small>`;
    const row = document.createElement("div");
    row.className = "loadout-row";
    const inventory = getInventory();
    (Object.keys(powerupPrices) as PowerupKind[]).forEach((kind) => {
        const item = document.createElement("span");
        item.className = `loadout-item ${kind}`;
        item.innerHTML = `${powerupLabels[kind]} <b>${inventory[kind]}</b>`;
        row.append(item);
    });
    panel.append(row);
    return panel;
}

function getClaimedAsteroids(levelIndex: number): Set<number> {
    try { return new Set<number>(JSON.parse(localStorage.getItem(`orbit-asteroids-${levelIndex}`) ?? "[]")); }
    catch { return new Set<number>(); }
}

function saveClaimedAsteroids(levelIndex: number, claimed: Set<number>) { localStorage.setItem(`orbit-asteroids-${levelIndex}`, JSON.stringify([...claimed])); }

function isSecretLevelUnlocked(level: Level) {
    if (level.secretId === "prestige-gate") return localStorage.getItem("orbit-key-prestige-gate") === "1" || getNormalCompletedLevelCount() >= getNormalRouteCount();
    return level.secretId === "eclipse" ? localStorage.getItem("orbit-key-eclipse") === "1" || localStorage.getItem("orbit-secret-unlocked") === "1" : level.secretId ? localStorage.getItem(`orbit-key-${level.secretId}`) === "1" : localStorage.getItem("orbit-secret-unlocked") === "1";
}

function createPageCounter() {
    const counter = document.createElement("div");
    counter.className = "page-counter";
    counter.innerHTML = `<span>ASTEROIDS IN FLEET</span><strong>${asteroidsClaimed}</strong>`;
    return counter;
}

function showTesterLogin() {
    const menu = document.createElement("main");
    menu.className = "menu-screen tester-screen";
    menu.innerHTML = `<p class="eyebrow">FLIGHT SYSTEMS / OWNER LOGIN</p><h1>Sign in to <em>manage</em></h1><p class="menu-copy">Global game settings and workshop levels can only be changed by the owner account.</p>`;
    const form = document.createElement("form");
    form.className = "tester-login";
    const username = document.createElement("input");
    username.autocomplete = "username";
    username.placeholder = "Owner username";
    username.required = true;
    const password = document.createElement("input");
    password.type = "password";
    password.autocomplete = "current-password";
    password.placeholder = "Owner password";
    password.required = true;
    const message = document.createElement("small");
    message.setAttribute("role", "status");
    const submit = document.createElement("button");
    submit.className = "menu-button";
    submit.type = "submit";
    submit.textContent = "Sign in as owner";
    form.append(username, password, submit, message);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submit.disabled = true;
        message.textContent = "Checking owner account...";
        try {
            const response = await apiRequest<{ user: OnlineUser }>("/auth/login", {
                method: "POST",
                body: JSON.stringify({ username: username.value, password: password.value }),
            });
            currentOnlineUser = response.user;
            updateOwnerAccountIndicator();
            if (response.user.role !== "owner") {
                message.textContent = "This account does not have owner access.";
                submit.disabled = false;
                return;
            }
            await syncAccountProgress("load");
            await showTesterPanel();
        } catch (error) {
            message.textContent = error instanceof Error ? error.message : "The owner account could not be verified.";
            submit.disabled = false;
        }
    });
    menu.append(form, createTextButton("Back to settings", showSettings));
    document.body.replaceChildren(menu);
    username.focus();
}

function createTesterRateField(title: string, input: HTMLInputElement) {
    const field = document.createElement("label");
    field.append(document.createTextNode(title), input);
    return field;
}

function bindTesterSetting(input: HTMLInputElement, key: string, world?: "normal" | "prestige") {
    const draftKey = world ? `${world}.${key}` : key;
    const draftValue = testerSettingsDraft.get(draftKey);
    if (draftValue !== undefined) input.value = draftValue;
    input.addEventListener("input", () => testerSettingsDraft.set(draftKey, input.value));
}

function readTesterSetting(key: string, fallback: number, world?: "normal" | "prestige") {
    const draftValue = testerSettingsDraft.get(world ? `${world}.${key}` : key);
    return draftValue === undefined ? fallback : Number(draftValue);
}

async function loadManagedUsers(container: HTMLElement) {
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Player accounts";
    const description = document.createElement("p");
    description.textContent = "Review player stats, ban or restore access, rename accounts, and edit saved profile data.";
    const status = document.createElement("small");
    status.className = "tester-error";
    status.setAttribute("role", "status");
    status.textContent = "Loading player accounts...";
    const refresh = createTextButton("Refresh accounts", () => { void loadManagedUsers(container); });
    container.append(heading, description, refresh, status);
    try {
        const { users } = await apiRequest<{ users: ManagedUser[] }>("/admin/users");
        if (!container.isConnected) return;
        status.textContent = users.length ? `${users.length} account${users.length === 1 ? "" : "s"} loaded (up to 200).` : "No player accounts found.";
        users.forEach((user) => {
            const card = document.createElement("details");
            card.className = "tester-player-card";
            const summary = document.createElement("summary");
            summary.textContent = `${user.username} / ${user.banned ? "BANNED" : "ACTIVE"} / ${user.role.toUpperCase()}`;
            card.append(summary);
            const stats = document.createElement("p");
            stats.textContent = `Asteroids: ${user.progress["orbit-claims"] ?? "0"} / Special: ${user.progress["orbit-special-claims"] ?? "0"} / Prestige: ${user.progress["orbit-prestige"] ?? "0"} / Power-ups: ${user.progress["orbit-powerups"] ?? "{}"}`;
            const created = document.createElement("small");
            created.textContent = `Created ${new Date(user.createdAt).toLocaleString()}`;
            card.append(stats, created);
            if (user.role === "owner") {
                const protectedMessage = document.createElement("small");
                protectedMessage.textContent = "Owner accounts are protected from player management.";
                card.append(protectedMessage);
                container.append(card);
                return;
            }
            const form = document.createElement("form");
            form.className = "tester-player-form";
            const username = document.createElement("input");
            username.value = user.username;
            username.maxLength = 20;
            username.pattern = "[A-Za-z0-9_]{3,20}";
            username.required = true;
            username.setAttribute("aria-label", `Username for ${user.username}`);
            const banLabel = document.createElement("label");
            const banned = document.createElement("input");
            banned.type = "checkbox";
            banned.checked = user.banned;
            banLabel.append(banned, document.createTextNode(" Ban account"));
            const progress = document.createElement("textarea");
            progress.value = JSON.stringify(user.progress, null, 2);
            progress.setAttribute("aria-label", `Saved progress for ${user.username}`);
            const save = document.createElement("button");
            save.type = "submit";
            save.textContent = "Save profile";
            const result = document.createElement("small");
            result.setAttribute("role", "status");
            form.append(username, banLabel, progress, save, result);
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                save.disabled = true;
                result.textContent = "Saving player profile...";
                try {
                    const updatedProgress: unknown = JSON.parse(progress.value);
                    await apiRequest(`/admin/users/${encodeURIComponent(user.id)}`, {
                        method: "PATCH",
                        body: JSON.stringify({ username: username.value, banned: banned.checked, progress: updatedProgress }),
                    });
                    result.textContent = "Profile saved. Changes are available on the player's signed-in devices.";
                    summary.textContent = `${username.value} / ${banned.checked ? "BANNED" : "ACTIVE"} / PLAYER`;
                } catch (error) {
                    result.textContent = error instanceof Error ? error.message : "Could not save this profile.";
                } finally {
                    save.disabled = false;
                }
            });
            card.append(form);
            container.append(card);
        });
    } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Could not load player accounts.";
    }
}

async function showTesterPanel(selectedWorld: "normal" | "prestige" = activePlanet) {
    let user = currentOnlineUser;
    try {
        if (!user) user = (await apiRequest<{ user: OnlineUser | null }>("/auth/session")).user;
    } catch (error) {
        showTesterLogin();
        console.error("Could not verify owner account:", error);
        return;
    }
    if (user?.role !== "owner") {
        showTesterLogin();
        return;
    }
    currentOnlineUser = user;
    const menu = document.createElement("main");
    menu.className = "menu-screen tester-screen";
    menu.innerHTML = `<p class="eyebrow">OWNER TOOLS / SHARED SAVE</p><h1>Adjust the <em>game</em></h1><p class="menu-copy">Manage shared game settings, workshop routes, and player profiles.</p>`;
    const worldTabs = document.createElement("nav");
    worldTabs.className = "tester-world-tabs";
    const normalTab = createTextButton("Normal world", () => showTesterPanel("normal"));
    const prestigeTab = createTextButton("Prestige world", () => showTesterPanel("prestige"));
    normalTab.classList.toggle("selected", selectedWorld === "normal");
    prestigeTab.classList.toggle("selected", selectedWorld === "prestige");
    normalTab.setAttribute("aria-pressed", String(selectedWorld === "normal"));
    prestigeTab.setAttribute("aria-pressed", String(selectedWorld === "prestige"));
    worldTabs.append(normalTab, prestigeTab);
    const testerTabs = document.createElement("nav");
    testerTabs.className = "tester-panel-tabs";
    const settingsTab = createTextButton("Game settings", () => {
        worldTabs.hidden = false;
        form.hidden = false;
        accountManagement.hidden = true;
        settingsTab.classList.add("selected");
        usersTab.classList.remove("selected");
    });
    const usersTab = createTextButton("Player accounts", () => {
        worldTabs.hidden = true;
        form.hidden = true;
        accountManagement.hidden = false;
        settingsTab.classList.remove("selected");
        usersTab.classList.add("selected");
        void loadManagedUsers(accountManagement);
    });
    settingsTab.classList.add("selected");
    testerTabs.append(settingsTab, usersTab);
    const form = document.createElement("form");
    form.className = "tester-panel";
    const accountManagement = document.createElement("section");
    accountManagement.className = "tester-player-management";
    accountManagement.hidden = true;
    const selectedConfig = gameConfig[selectedWorld];
    const claimsLabel = document.createElement("label");
    claimsLabel.innerHTML = `<span>Asteroids</span>`;
    const claimsInput = document.createElement("input");
    claimsInput.type = "number"; claimsInput.min = "0"; claimsInput.value = String(asteroidsClaimed);
    claimsLabel.append(claimsInput);
    form.append(claimsLabel);
    const specialLabel = document.createElement("label");
    specialLabel.innerHTML = `<span>Special asteroids</span>`;
    const specialInput = document.createElement("input");
    specialInput.type = "number"; specialInput.min = "0"; specialInput.value = String(specialAsteroids);
    specialLabel.append(specialInput);
    form.append(specialLabel);
    const prestigeLabel = document.createElement("label");
    prestigeLabel.innerHTML = `<span>Prestige level</span>`;
    const prestigeInput = document.createElement("input");
    prestigeInput.type = "number"; prestigeInput.min = "0"; prestigeInput.value = String(prestigeLevel);
    prestigeInput.dataset.prestige = "level";
    prestigeLabel.append(prestigeInput);
    form.append(prestigeLabel);
    const prestigeMaxLabel = document.createElement("label");
    prestigeMaxLabel.innerHTML = `<span>How many prestiges</span>`;
    const prestigeMaxInput = document.createElement("input");
    prestigeMaxInput.type = "number"; prestigeMaxInput.min = "1"; prestigeMaxInput.value = String(prestigeMax);
    prestigeMaxLabel.append(prestigeMaxInput);
    form.append(prestigeMaxLabel);
    const inventory = getInventory();
    (Object.keys(powerupPrices) as PowerupKind[]).forEach((kind) => {
        const label = document.createElement("label");
        label.innerHTML = `<span>${powerupLabels[kind]}</span>`;
        const input = document.createElement("input");
        input.type = "number"; input.min = "0"; input.value = String(inventory[kind]); input.dataset.powerup = kind;
        label.append(input); form.append(label);
    });
    const rewardSettings = document.createElement("section");
    rewardSettings.className = "tester-reward-settings";
    rewardSettings.innerHTML = `<p class="setting-title">${selectedWorld === "prestige" ? "Prestige" : "Normal"} world percentages</p><p class="menu-copy">Each world has its own Rainbow Star chance and special-roll percentages. Rarity odds must total exactly 100%.</p>`;
    const starChanceLabel = document.createElement("label");
    starChanceLabel.innerHTML = `<span>Rainbow Star chance per level (%)</span>`;
    const starChanceInput = document.createElement("input");
    starChanceInput.type = "number";
    starChanceInput.min = "0";
    starChanceInput.max = "100";
    starChanceInput.step = "1";
    starChanceInput.value = String(selectedConfig.rainbowStarChance);
    starChanceInput.dataset.rainbowStarChance = "true";
    bindTesterSetting(starChanceInput, "rainbowStarChance", selectedWorld);
    starChanceLabel.append(starChanceInput);
    rewardSettings.append(starChanceLabel);
    const odds = selectedConfig.rarityOdds;
    const rewards = selectedConfig.rewardRanges;
    const skinChances = selectedConfig.skinChances;
    RARITY_ORDER.forEach((rarity) => {
        const rarityLabel = document.createElement("label");
        rarityLabel.className = "tester-rarity-settings";
        rarityLabel.innerHTML = `<b>${rarity}</b>`;
        const rarityInputs = document.createElement("div");
        rarityInputs.className = "tester-rarity-inputs";
        const oddsInput = document.createElement("input");
        oddsInput.type = "number"; oddsInput.min = "0"; oddsInput.max = "100"; oddsInput.value = String(odds[rarity]);
        oddsInput.step = "1";
        oddsInput.setAttribute("aria-label", `${rarity} roll chance percent`);
        oddsInput.dataset.rollOdds = rarity;
        bindTesterSetting(oddsInput, `rarityOdds.${rarity}`, selectedWorld);
        const minimumInput = document.createElement("input");
        minimumInput.type = "number"; minimumInput.min = "0"; minimumInput.value = String(rewards[rarity][0]);
        minimumInput.setAttribute("aria-label", `${rarity} minimum asteroid reward`);
        minimumInput.dataset.rewardMin = rarity;
        bindTesterSetting(minimumInput, `rewardMin.${rarity}`, selectedWorld);
        const maximumInput = document.createElement("input");
        maximumInput.type = "number"; maximumInput.min = "0"; maximumInput.value = String(rewards[rarity][1]);
        maximumInput.setAttribute("aria-label", `${rarity} maximum asteroid reward`);
        maximumInput.dataset.rewardMax = rarity;
        bindTesterSetting(maximumInput, `rewardMax.${rarity}`, selectedWorld);
        const skinChanceInput = document.createElement("input");
        skinChanceInput.type = "number"; skinChanceInput.min = "0"; skinChanceInput.max = "100"; skinChanceInput.value = String(skinChances[rarity]);
        skinChanceInput.step = "1";
        skinChanceInput.setAttribute("aria-label", `${rarity} skin chance percent`);
        skinChanceInput.dataset.skinChance = rarity;
        bindTesterSetting(skinChanceInput, `skinChance.${rarity}`, selectedWorld);
        rarityInputs.append(
            createTesterRateField("Roll %", oddsInput),
            createTesterRateField("Min asteroids", minimumInput),
            createTesterRateField("Max asteroids", maximumInput),
            createTesterRateField("Skin %", skinChanceInput),
        );
        rarityLabel.append(rarityInputs);
        rewardSettings.append(rarityLabel);
    });
    const spawnTitle = document.createElement("p");
    spawnTitle.className = "setting-title";
    spawnTitle.textContent = "Power-up chance per level";
    rewardSettings.append(spawnTitle);
    (["shield", "boost", "rapid", "cannon"] as const).forEach((kind) => {
        const label = document.createElement("label");
        label.append(document.createTextNode(`${powerupLabels[kind]} chance (%)`));
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = "100";
        input.step = "1";
        input.value = String(selectedConfig.powerupSpawnChances[kind]);
        input.dataset.powerupSpawn = kind;
        bindTesterSetting(input, `powerupSpawn.${kind}`, selectedWorld);
        label.append(input);
        rewardSettings.append(label);
    });
    const rewardSettingsError = document.createElement("small");
    rewardSettingsError.className = "tester-error";
    rewardSettingsError.setAttribute("role", "status");
    rewardSettings.append(rewardSettingsError);
    form.append(rewardSettings);
    const effectSettings = document.createElement("section");
    effectSettings.className = "tester-reward-settings tester-powerup-effects";
    effectSettings.innerHTML = `<p class="setting-title">Power-up behavior</p><p class="menu-copy">Effect strength and duration apply to every world. Cannon duration of 0 means it stays active until hull breach.</p>`;
    const addEffectInput = (title: string, key: string, value: number, min: number, max: number, step = 1) => {
        const label = document.createElement("label");
        label.append(document.createTextNode(title));
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        input.dataset.powerupEffect = key;
        bindTesterSetting(input, `effect.${key}`);
        label.append(input);
        effectSettings.append(label);
    };
    addEffectInput("Shield hits absorbed per pickup", "shield-charges", gameConfig.powerupEffects.shield.charges, 1, 10);
    addEffectInput("Boost duration (seconds)", "boost-duration", gameConfig.powerupEffects.boost.durationSeconds, 1, 300);
    addEffectInput("Boost movement multiplier", "boost-multiplier", gameConfig.powerupEffects.boost.movementMultiplier, 1, 4, 0.1);
    addEffectInput("Rapid Fire duration (seconds)", "rapid-duration", gameConfig.powerupEffects.rapid.durationSeconds, 1, 300);
    addEffectInput("Cannon duration (seconds, 0 = permanent)", "cannon-duration", gameConfig.powerupEffects.cannon.durationSeconds, 0, 300);
    addEffectInput("Rainbow Star duration (seconds)", "star-duration", gameConfig.powerupEffects.star.durationSeconds, 1, 300);
    form.append(effectSettings);
    const customizationTitle = document.createElement("p"); customizationTitle.className = "setting-title"; customizationTitle.textContent = "Customization unlocks"; form.append(customizationTitle);
    const unlocks = document.createElement("div"); unlocks.className = "tester-unlocks";
    (["skins", "trails", "avatars"] as const).forEach((kind) => {
        const label = document.createElement("label");
        const input = document.createElement("input"); input.type = "checkbox"; input.checked = localStorage.getItem(`orbit-unlock-${kind}`) === "1"; input.dataset.unlock = kind;
        label.append(input, document.createTextNode(`Unlock all ${kind}`)); unlocks.append(label);
    });
    form.append(unlocks);
    const unlockEverySkin = createTextButton("Unlock every skin, including special skins", () => {
        localStorage.setItem("orbit-unlock-skins", "1");
        skins.forEach((_, index) => unlockSpinCosmetic("skin", index));
        showTesterPanel(selectedWorld);
    });
    form.append(unlockEverySkin);
    const levelTitle = document.createElement("p");
    levelTitle.className = "setting-title";
    levelTitle.textContent = "Unlock levels";
    form.append(levelTitle);
    const levelActions = document.createElement("div");
    levelActions.className = "tester-level-actions";
    const unlockLevels = (matches: (level: Level) => boolean) => {
        levels.forEach((level, index) => {
            if (!matches(level)) return;
            if (level.secret && level.secretId) localStorage.setItem(`orbit-key-${level.secretId}`, "1");
            else localStorage.setItem(`orbit-level-${index}`, "1");
        });
    };
    const normalUnlock = createTextButton("Unlock normal levels", () => { unlockLevels((level) => !level.secret && !level.prestige); showTesterPanel(selectedWorld); });
    const secretUnlock = createTextButton("Unlock secret levels", () => { unlockLevels((level) => Boolean(level.secret)); localStorage.setItem("orbit-secret-unlocked", "1"); showTesterPanel(selectedWorld); });
    const prestigeUnlock = createTextButton("Unlock prestige levels", () => { unlockLevels((level) => Boolean(level.prestige)); prestigeLevel = Math.max(prestigeLevel, 2); localStorage.setItem("orbit-prestige", String(prestigeLevel)); showTesterPanel(selectedWorld); });
    levelActions.append(normalUnlock, secretUnlock, prestigeUnlock);
    form.append(levelActions);
    const prestigeGateLabel = document.createElement("label");
    prestigeGateLabel.innerHTML = `<span>Access Prestige Gate</span>`;
    const prestigeGateInput = document.createElement("input");
    prestigeGateInput.type = "checkbox";
    prestigeGateInput.checked = localStorage.getItem("orbit-key-prestige-gate") === "1";
    prestigeGateInput.dataset.prestigeGate = "true";
    prestigeGateLabel.append(prestigeGateInput);
    form.append(prestigeGateLabel);
    const levelChoices = document.createElement("div");
    levelChoices.className = "tester-levels";
    const levelGroups = [
        { title: "Normal levels", matches: (level: Level) => !level.secret && !level.prestige },
        { title: "Secret levels", matches: (level: Level) => Boolean(level.secret) },
        { title: "Prestige levels", matches: (level: Level) => Boolean(level.prestige) },
    ];
    levelGroups.forEach((group) => {
        const groupPanel = document.createElement("section");
        groupPanel.className = "tester-level-group";
        groupPanel.innerHTML = `<b>${group.title}</b>`;
        levels.forEach((level, index) => {
            if (!group.matches(level)) return;
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "checkbox"; input.checked = level.secret ? isSecretLevelUnlocked(level) : index === 0 || Number(localStorage.getItem(`orbit-level-${index}`) ?? "0") === 1; input.dataset.level = String(index);
            const name = document.createElement("span");
            name.textContent = level.name;
            const metadata = document.createElement("small");
            const hasPortal = Boolean(level.portals?.length || level.secretPortals?.length);
            metadata.className = "tester-level-meta";
            metadata.textContent = `${hasPortal ? "PORTAL" : "NO PORTAL"} / RAINBOW STAR ${getConfiguredRainbowStarChance(Boolean(level.prestige))}%`;
            label.append(input, name, metadata); groupPanel.append(label);
        });
        levelChoices.append(groupPanel);
    });
    form.append(levelChoices);
    const customTitle = document.createElement("p");
    customTitle.className = "setting-title";
    customTitle.textContent = "Shared workshop levels";
    form.append(customTitle);
    const sharedLevels = document.createElement("div");
    sharedLevels.className = "tester-custom-levels";
    const serverCustomLevels = levels.map((level, index) => ({ level, index })).filter(({ level }) => Boolean(level.customId) && !level.localOnly);
    if (!serverCustomLevels.length) {
        const empty = document.createElement("small");
        empty.textContent = "No shared workshop levels yet. Create one in the level maker.";
        sharedLevels.append(empty);
    }
    serverCustomLevels.forEach(({ level, index }) => {
        const row = document.createElement("div");
        row.className = "tester-custom-level-row";
        const name = document.createElement("span");
        name.textContent = `${level.name} / ${level.prestige ? "PRESTIGE" : "NORMAL"}`;
        const remove = createTextButton("Delete", async () => {
            if (!level.customId || !window.confirm(`Delete the shared workshop level "${level.name}" for every player?`)) return;
            remove.disabled = true;
            try {
                await apiRequest<void>(`/levels/${encodeURIComponent(level.customId)}`, { method: "DELETE" });
                levels.splice(index, 1);
                localStorage.setItem("orbit-global-level-cache", JSON.stringify(levels.filter((item) => item.customId && !item.localOnly)));
                showTesterPanel(selectedWorld);
            } catch (error) {
                rewardSettingsError.textContent = error instanceof Error ? error.message : "Could not delete the shared level.";
                remove.disabled = false;
            }
        });
        remove.classList.add("danger");
        row.append(name, remove);
        sharedLevels.append(row);
    });
    form.append(sharedLevels);
    form.append(createTextButton("Try prestige planet", () => { if (activePlanet === "normal") switchPlanet(); else showLevelMenu(); }));
    form.append(createTextButton("Open level maker", () => showLevelMaker()));
    const resetTitle = document.createElement("p");
    resetTitle.className = "setting-title tester-reset-title";
    resetTitle.textContent = "Reset tester data";
    const resetPanel = document.createElement("div");
    resetPanel.className = "tester-reset-panel";
    resetPanel.innerHTML = "<small>Clear this device's progress, unlocks, cached levels, and inventory. Shared settings and workshop levels are not deleted.</small>";
    const resetButton = document.createElement("button");
    resetButton.className = "tester-reset-button";
    resetButton.type = "button";
    resetButton.textContent = "Reset all game data";
    resetButton.addEventListener("click", () => {
        Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith("orbit-"))).forEach((key) => localStorage.removeItem(key));
        window.location.reload();
    });
    resetPanel.append(resetButton);
    form.append(resetTitle, resetPanel);
    const apply = document.createElement("button");
    apply.className = "menu-button"; apply.type = "submit"; apply.textContent = "Save shared settings and apply";
    form.append(apply);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const nextConfig = structuredClone(gameConfig);
        let invalidWorld = "";
        (["normal", "prestige"] as const).forEach((world) => {
            const worldConfig = nextConfig[world];
            worldConfig.rainbowStarChance = readTesterSetting("rainbowStarChance", worldConfig.rainbowStarChance, world);
            worldConfig.powerupSpawnChances.star = worldConfig.rainbowStarChance;
            RARITY_ORDER.forEach((rarity) => {
                worldConfig.rarityOdds[rarity] = readTesterSetting(`rarityOdds.${rarity}`, worldConfig.rarityOdds[rarity], world);
                const minimum = readTesterSetting(`rewardMin.${rarity}`, worldConfig.rewardRanges[rarity][0], world);
                const maximum = readTesterSetting(`rewardMax.${rarity}`, worldConfig.rewardRanges[rarity][1], world);
                worldConfig.rewardRanges[rarity] = [minimum, maximum];
                worldConfig.skinChances[rarity] = readTesterSetting(`skinChance.${rarity}`, worldConfig.skinChances[rarity], world);
                if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 0 || maximum < minimum || maximum > 1000000) invalidWorld = world;
            });
            (["shield", "boost", "rapid", "cannon"] as const).forEach((kind) => {
                worldConfig.powerupSpawnChances[kind] = readTesterSetting(`powerupSpawn.${kind}`, worldConfig.powerupSpawnChances[kind], world);
            });
            const oddsTotal = RARITY_ORDER.reduce((total, rarity) => total + worldConfig.rarityOdds[rarity], 0);
            if (oddsTotal !== 100 || !Number.isInteger(worldConfig.rainbowStarChance)
                || !Object.values(worldConfig.skinChances).every(Number.isInteger)
                || !Object.values(worldConfig.powerupSpawnChances).every(Number.isInteger)) invalidWorld = world;
        });
        if (invalidWorld) {
            const oddsTotal = RARITY_ORDER.reduce((total, rarity) => total + nextConfig[invalidWorld as "normal" | "prestige"].rarityOdds[rarity], 0);
            rewardSettingsError.textContent = oddsTotal !== 100
                ? `${invalidWorld} world rarity chances total ${oddsTotal}%. Set them to exactly 100%.`
                : `${invalidWorld} world reward ranges and percentages are invalid.`;
            return;
        }
        nextConfig.powerupEffects.shield.charges = readTesterSetting("effect.shield-charges", nextConfig.powerupEffects.shield.charges);
        nextConfig.powerupEffects.boost.durationSeconds = readTesterSetting("effect.boost-duration", nextConfig.powerupEffects.boost.durationSeconds);
        nextConfig.powerupEffects.boost.movementMultiplier = readTesterSetting("effect.boost-multiplier", nextConfig.powerupEffects.boost.movementMultiplier);
        nextConfig.powerupEffects.rapid.durationSeconds = readTesterSetting("effect.rapid-duration", nextConfig.powerupEffects.rapid.durationSeconds);
        nextConfig.powerupEffects.cannon.durationSeconds = readTesterSetting("effect.cannon-duration", nextConfig.powerupEffects.cannon.durationSeconds);
        nextConfig.powerupEffects.star.durationSeconds = readTesterSetting("effect.star-duration", nextConfig.powerupEffects.star.durationSeconds);
        rewardSettingsError.textContent = "Saving shared settings...";
        apply.disabled = true;
        try {
            const response = await apiRequest<{ config: GameConfig }>("/game-config", {
                method: "PUT",
                body: JSON.stringify({ config: nextConfig }),
            });
            gameConfig = response.config;
            testerSettingsDraft.clear();
        } catch (error) {
            rewardSettingsError.textContent = error instanceof Error ? error.message : "Could not save shared game settings.";
            apply.disabled = false;
            return;
        }
        rewardSettingsError.textContent = "Shared game settings saved for all players.";
        asteroidsClaimed = Math.max(0, Number(claimsInput.value) || 0);
        specialAsteroids = Math.max(0, Number(specialInput.value) || 0);
        prestigeLevel = Math.max(0, Number(prestigeInput.value) || 0);
        prestigeMax = Math.max(1, Number(prestigeMaxInput.value) || 1);
        localStorage.setItem("orbit-claims", String(asteroidsClaimed));
        localStorage.setItem("orbit-special-claims", String(specialAsteroids));
        localStorage.setItem("orbit-prestige", String(prestigeLevel));
        localStorage.setItem("orbit-prestige-max", String(prestigeMax));
        const editedInventory = getInventory();
        form.querySelectorAll<HTMLInputElement>("input[data-powerup]").forEach((input) => { editedInventory[input.dataset.powerup as PowerupKind] = Math.max(0, Number(input.value) || 0); });
        saveInventory(editedInventory);
        unlocks.querySelectorAll<HTMLInputElement>("input[data-unlock]").forEach((input) => { const key = `orbit-unlock-${input.dataset.unlock}`; if (input.checked) localStorage.setItem(key, "1"); else localStorage.removeItem(key); });
        form.querySelectorAll<HTMLInputElement>("input[data-level]").forEach((input) => { const level = levels[Number(input.dataset.level)]; if (level.secret && level.secretId) { if (input.checked) localStorage.setItem(`orbit-key-${level.secretId}`, "1"); else localStorage.removeItem(`orbit-key-${level.secretId}`); } else if (input.checked) localStorage.setItem(`orbit-level-${input.dataset.level}`, "1"); else localStorage.removeItem(`orbit-level-${input.dataset.level}`); });
        if (prestigeGateInput.checked) localStorage.setItem("orbit-key-prestige-gate", "1"); else localStorage.removeItem("orbit-key-prestige-gate");
    });
    menu.append(worldTabs, testerTabs, form, accountManagement, createTextButton("Exit tester tools", () => { testerSettingsDraft.clear(); showMenu(); }));
    document.body.replaceChildren(menu);
}

function moveActorOutOfObstacles<T extends { x: number; y: number }>(actor: T, width: number, height: number): T | null {
    const offsets = [[0, 0], [0, -56], [0, -110], [0, -164], [-72, 0], [72, 0], [-72, -56], [72, -56], [-144, 0], [144, 0]];
    for (const [offsetX, offsetY] of offsets) {
        const x = Math.max(60, actor.x + offsetX);
        const y = Math.max(12, Math.min(FLOOR_Y + 40 - height, actor.y + offsetY));
        if (!levelObstacles.some((obstacle) => intersects({ x, y, width, height }, obstacle))) return { ...actor, x, y };
    }
    // A custom route may completely enclose an actor. Dropping that actor is
    // safer than leaving an enemy embedded in a wall where it cannot be hit.
    return null;
}

function separateActorsFromObstacles() {
    levelEnemies = levelEnemies.map((enemy) => moveActorOutOfObstacles(enemy, 48, 48)).filter((enemy): enemy is Enemy => enemy !== null);
    levelMiniBosses = levelMiniBosses.map((miniBoss) => moveActorOutOfObstacles(miniBoss, 70, 70)).filter((miniBoss): miniBoss is MiniBoss => miniBoss !== null);
    const actors = [
        ...levelEnemies.map((actor) => ({ actor, width: 48, height: 48, kind: "enemy" as const })),
        ...levelMiniBosses.map((actor) => ({ actor, width: 70, height: 70, kind: "mini-boss" as const })),
    ];
    const placed: Box[] = [];
    const keptEnemies: Enemy[] = [];
    const keptMiniBosses: MiniBoss[] = [];
    const worldWidth = levels[currentLevel].length * TILE_WIDTH;
    actors.forEach(({ actor, width, height, kind }) => {
        const offsets = [
            [0, 0], [0, -56], [0, 56], [0, -110], [0, 110],
            [-72, 0], [72, 0], [-72, -56], [72, -56], [-144, 0], [144, 0],
        ];
        let position: Box | undefined;
        for (const [offsetX, offsetY] of offsets) {
            const candidate = { x: actor.x + offsetX, y: actor.y + offsetY, width, height };
            if (candidate.x < 20 || candidate.x + width > worldWidth - 20 || candidate.y < 0 || candidate.y + height > FLIPPED_WORLD_HEIGHT) continue;
            if (levelObstacles.some((obstacle) => intersects(candidate, obstacle)) || placed.some((other) => intersects(candidate, other))) continue;
            position = candidate;
            break;
        }
        if (!position) {
            for (let y = 20; y + height <= FLOOR_Y + 40; y += 56) {
                for (let x = 20; x + width <= worldWidth - 20; x += 48) {
                    const candidate = { x, y, width, height };
                    if (levelObstacles.some((obstacle) => intersects(candidate, obstacle)) || placed.some((other) => intersects(candidate, other))) continue;
                    position = candidate;
                    break;
                }
                if (position) break;
            }
        }
        if (!position) return;
        actor.x = position.x;
        actor.y = position.y;
        placed.push(position);
        if (kind === "enemy") keptEnemies.push(actor);
        else keptMiniBosses.push(actor);
    });
    levelEnemies = keptEnemies;
    levelMiniBosses = keptMiniBosses;
}

function getWorldConfig(prestige = activePlanet === "prestige") {
    return gameConfig[prestige ? "prestige" : "normal"];
}

function getConfiguredRainbowStarChance(prestige = activePlanet === "prestige") {
    return getWorldConfig(prestige).rainbowStarChance;
}

function getConfiguredRarityOdds(prestige = activePlanet === "prestige") {
    return getWorldConfig(prestige).rarityOdds;
}

function getConfiguredRewardRanges(prestige = activePlanet === "prestige") {
    return getWorldConfig(prestige).rewardRanges;
}

function getConfiguredSkinChances(prestige = activePlanet === "prestige") {
    return getWorldConfig(prestige).skinChances;
}

function getLevelObstacleIndices(level: Level) {
    return [...new Set([...level.walls, ...(level.blocks ?? [])])]
        .filter((index) => Number.isInteger(index) && index > 0 && index < level.length)
        .sort((first, second) => first - second);
}

function getLevelEnemyIndices(level: Level) {
    return [...new Set(level.enemies)]
        .filter((index) => Number.isInteger(index) && index > 0 && index < level.length - 1)
        .sort((first, second) => first - second);
}

function createLevelPowerups(level: Level, positions: { index: number; kind: PowerupKind }[], blockedTiles: number[]) {
    const worldConfig = gameConfig[level.prestige ? "prestige" : "normal"];
    const available = Array.from({ length: Math.max(0, level.length - 3) }, (_, offset) => offset + 2)
        .filter((index) => !blockedTiles.includes(index) && !positions.some((powerup) => powerup.index === index));
    (["shield", "boost", "rapid", "cannon"] as const).forEach((kind) => {
        if (positions.some((powerup) => powerup.kind === kind) || Math.random() * 100 >= worldConfig.powerupSpawnChances[kind]) return;
        const candidateIndex = available.findIndex((index) => !positions.some((powerup) => powerup.index === index));
        if (candidateIndex < 0) return;
        const [index] = available.splice(candidateIndex, 1);
        positions.push({ index, kind });
    });
    if (!positions.some((powerup) => powerup.kind === "star") && Math.random() * 100 < worldConfig.rainbowStarChance) {
        const candidateIndex = Math.floor(Math.random() * available.length);
        if (available[candidateIndex] !== undefined) positions.push({ index: available[candidateIndex], kind: "star" });
    }
    return positions.map((powerup) => ({ x: 140 + powerup.index * TILE_WIDTH, y: 170, kind: powerup.kind, collected: false }));
}

function buildLevel(levelIndex: number) {
    const level = levels[levelIndex];
    const claimedAsteroids = getClaimedAsteroids(levelIndex);
    levelAsteroids = level.asteroids.map((index, asteroidIndex) => ({ x: 140 + index * TILE_WIDTH, y: 215 - (index % 2) * 55, claimed: claimedAsteroids.has(asteroidIndex), special: Boolean(level.secret) || (level.specialAsteroids ?? []).includes(index) }));
    const obstacleIndices = getLevelObstacleIndices(level);
    const enemyIndices = getLevelEnemyIndices(level);
    const groundObstacles = obstacleIndices.map((index, wallIndex) => ({
        x: 140 + index * TILE_WIDTH,
        y: wallIndex % 2 ? 250 : 330,
        width: wallIndex % 2 ? 105 : 70,
        height: wallIndex % 2 ? 150 : 70,
        block: (level.blocks ?? []).includes(index),
    }));
    // Only prestige routes use the upper planetary lane. Normal and normal
    // secret routes still keep their regular anti-gravity zones.
    const airborneObstacles: Obstacle[] = level.prestige && !level.customId && !isLevelMakerPreview
        ? obstacleIndices.filter((_, wallIndex) => wallIndex % 2 === 0).map((index, wallIndex) => ({
            x: 140 + index * TILE_WIDTH,
            y: 112 + (wallIndex % 2) * 22,
            width: 92,
            height: 52,
            airborne: true,
        }))
        : [];
    levelObstacles = [...groundObstacles, ...airborneObstacles];
    levelHazards = [...level.spikes.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 380, width: 76, height: 20, kind: "spikes" as const })), ...level.gravity.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 110, width: 115, height: 250, kind: "gravity" as const }))];
    levelEnemies = enemyIndices.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 285, defeated: false }));
    const blockedPowerupTiles = [...obstacleIndices, ...enemyIndices, ...level.spikes, ...level.gravity];
    levelPowerups = createLevelPowerups(level, [...(level.powerups ?? [])], blockedPowerupTiles);
    const keyPlacement = level.secret && !level.prestige ? level.secretKey : undefined;
    levelKey = keyPlacement ? {
        id: keyPlacement.id,
        x: 140 + keyPlacement.index * TILE_WIDTH,
        y: keyPlacement.y ?? 170,
        collected: localStorage.getItem(`orbit-key-${keyPlacement.id}`) === "1",
        requiresPortal: Boolean(keyPlacement.requiresPortal),
    } : null;
    secretKeyRevealed = Boolean(levelKey && (!levelKey.requiresPortal || levelKey.collected));
    endGoalLocked = Boolean(levelKey && !levelKey.collected && level.secret && !level.prestige);
    if (endGoalLocked) {
        levelObstacles.push({ x: (level.length - 1) * TILE_WIDTH + 82, y: 0, width: 58, height: 400, goalLock: true });
    }
    levelMiniBosses = (level.miniBosses ?? []).map((index) => ({ x: 140 + index * TILE_WIDTH, y: 245, health: 2, maxHealth: 2, defeated: false }));
separateActorsFromObstacles();
    boss = (level.boss || level.secret) ? { x: 140 + (level.bossIndex ?? level.length - 2) * TILE_WIDTH, y: 205, health: level.asteroids.length, maxHealth: level.asteroids.length, defeated: false } : null;
    if (boss) {
        levelObstacles.push({ x: boss.x, y: boss.y, width: 128, height: 150 });
        separateActorsFromObstacles();
        levelObstacles.pop();
    }
}

function isFlippedPlanetLevel(level = levels[currentLevel]) { return Boolean(level?.prestige); }

function resetFlippedVisualState() {
    shipFlipped = false;
    inFlippedRoute = false;
    flippedRouteKeyCollected = false;
    world.classList.remove("flipped-route");
    playerLabel.classList.remove("flipped");
}

function unlockEndGoal() {
    endGoalLocked = false;
    levelObstacles = levelObstacles.filter((obstacle) => !obstacle.goalLock);
    document.querySelector(".goal-lock")?.remove();
}

function cancelPortalTransit() {
    if (portalTransitTimer) window.clearTimeout(portalTransitTimer);
    portalTransitTimer = 0;
    projectiles.forEach((projectile) => projectile.element.remove());
    projectiles = [];
    portalTravelInProgress = false;
    secretBossRoomActive = false;
    secretBoss = null;
    currentSecretPortalTarget = null;
    portalReturnX = null;
    world.classList.remove("portal-boss-room-active");
    document.querySelector(".portal-key-room")?.remove();
}

function updateSecretBossRoom() {
    const room = document.querySelector<HTMLElement>(".portal-key-room");
    if (!room) return;
    const roomPlayer = room.querySelector<HTMLElement>(".portal-room-player");
    const roomWidth = room.clientWidth || 680;
    const leftHeld = pressedKeys.has("arrowleft") || pressedKeys.has("a");
    const rightHeld = pressedKeys.has("arrowright") || pressedKeys.has("d");
    if (leftHeld) playerX -= 5 * currentFrameScale * (boostTimer > 0 ? gameConfig.powerupEffects.boost.movementMultiplier : 1);
    if (rightHeld) playerX += 5 * currentFrameScale * (boostTimer > 0 ? gameConfig.powerupEffects.boost.movementMultiplier : 1);
    playerX = Math.max(24, Math.min(roomWidth - playerWidth - 24, playerX));
    previousPlayerY = playerY;
    verticalSpeed += gravity * currentFrameScale;
    playerY += verticalSpeed * currentFrameScale;
    if (playerY >= secretRoomFloorY) { playerY = secretRoomFloorY; verticalSpeed = 0; jumpCount = 0; }
    if (playerY < 12) { playerY = 12; verticalSpeed = 0; }
    if (roomPlayer) roomPlayer.style.transform = `translate(${playerX}px, ${playerY}px)`;
    playerShotTimer = Math.max(0, playerShotTimer - currentFrameScale);
    boostTimer = Math.max(0, boostTimer - currentFrameScale);
    cannonTimer = cannonTimer === Number.POSITIVE_INFINITY ? cannonTimer : Math.max(0, cannonTimer - currentFrameScale);
    rapidTimer = Math.max(0, rapidUntil - performance.now());
    if (starPowerupActive) {
        starPowerupTimer -= currentFrameScale;
        if (starPowerupTimer <= 0) {
            starPowerupActive = false;
            if (starPowerupElement) starPowerupElement.style.display = "none";
            playerLabel.classList.remove("star-invincible");
            statusLabel.textContent = "Rainbow Star faded. The rainbow glow has ended.";
        }
    }
    if (secretBoss) {
        const bossElement = room.querySelector<HTMLElement>(".void-warden");
        if (bossElement) { bossElement.style.left = `${secretBoss.x}px`; bossElement.style.top = `${secretBoss.y}px`; }
        if (!secretBoss.defeated) {
            const bossBox = { x: secretBoss.x, y: secretBoss.y, width: 128, height: SECRET_BOSS_HEIGHT };
            if (intersects(playerBox(), bossBox)) {
                const landedOnHead = verticalSpeed >= 0 && previousPlayerY + playerHeight <= bossBox.y + 18;
                if (landedOnHead) {
                    damageSecretBoss();
                    playerY = bossBox.y - playerHeight;
                    verticalSpeed = jumpPower * 0.65;
                    jumpCount = 1;
                    roomPlayer?.classList.add("ground-pound");
                    window.setTimeout(() => roomPlayer?.classList.remove("ground-pound"), 180);
                    statusLabel.textContent = "Void Warden crushed. Ground pound landed!";
                } else if (starPowerupActive) {
                    playerX = Math.max(20, Math.min(secretBoss.x - playerWidth - 8, room.clientWidth - playerWidth - 20));
                    statusLabel.textContent = "Rainbow Star absorbed the Void Warden impact.";
                } else if (shieldCharges > 0) {
                    shieldCharges--;
                    playerX = secretBoss.x - playerWidth - 8;
                    statusLabel.textContent = "Shield absorbed the Void Warden impact.";
                } else {
                    showGameOver("The Void Warden crushed your hull.");
                }
            }
            if (shootingHeld || controlKeysFor("shoot").some((key) => pressedKeys.has(key))) shootSecretBoss();
            projectileTimer += currentFrameScale;
            if (projectileTimer >= (rapidTimer > 0 ? 52 : reducedEffects ? 120 : 90)) { projectileTimer = 0; fireSecretBossProjectile(); }
        }
    }
    updateProjectiles();
    updatePowerupHud();
}

function shootSecretBoss() {
    if (!gameActive || !secretBoss || secretBoss.defeated || (cannonTimer <= 0 && rapidCannonUntil <= performance.now()) || playerShotTimer > 0) return;
    playerShotTimer = rapidUntil > performance.now() ? 8 : 20;
    const room = document.querySelector<HTMLElement>(".portal-key-room");
    if (room) firePlayerProjectile(room);
}

function fireSecretBossProjectile() {
    if (!secretBoss || secretBoss.defeated) return;
    const directionX = playerX + 24 - secretBoss.x;
    const directionY = playerY + 28 - secretBoss.y;
    const distance = Math.max(1, Math.hypot(directionX, directionY));
    const element = document.createElement("div");
    element.className = "boss-projectile secret-boss-projectile";
    document.querySelector(".portal-key-room")?.append(element);
    projectiles.push({ x: secretBoss.x + 64, y: secretBoss.y + SECRET_BOSS_HEIGHT / 2, vx: directionX / distance * 4.2, vy: directionY / distance * 4.2, element, owner: "enemy" });
}

function damageSecretBoss() {
    if (!secretBoss || secretBoss.defeated) return;
    secretBoss.health--;
    const room = document.querySelector(".portal-key-room");
    const bossElement = room?.querySelector(".void-warden");
    bossElement?.classList.add("hit");
    window.setTimeout(() => bossElement?.classList.remove("hit"), 180);
    if (secretBoss.health > 0) {
        const healthLabel = room?.querySelector<HTMLElement>(".portal-boss-health");
        if (healthLabel) healthLabel.textContent = `${secretBoss.health} HITS LEFT`;
        statusLabel.textContent = `Void Warden damaged. ${secretBoss.health} hit remaining.`;
        return;
    }
    secretBoss.defeated = true;
    bossElement?.classList.add("defeated");
    const keyId = currentSecretPortalTarget;
    if (keyId) {
        localStorage.setItem(`orbit-key-${keyId}`, "1");
        if (keyId === "eclipse") localStorage.setItem("orbit-secret-unlocked", "1");
        if (levelKey && !levelKey.collected) { levelKey.collected = true; secretKeyRevealed = true; localStorage.setItem(`orbit-key-${levelKey.id}`, "1"); unlockEndGoal(); }
        if (levelKey?.id === keyId) { levelKey.collected = true; secretKeyRevealed = true; }
    }
    room?.classList.add("key-collected");
    const smallEl = room?.querySelector<HTMLElement>(".portal-boss-health");
    if (smallEl) smallEl.textContent = keyId ? `${keyId.toUpperCase()} KEY SECURED` : "SECRET KEY SECURED";
    statusLabel.textContent = "Void Warden defeated. Secret key claimed!";
    portalTransitTimer = window.setTimeout(() => exitSecretBossRoom(), 1500);
}

function redrawRouteObjects() {
    Array.from(world.children).forEach((element) => { if (element !== playerLabel) element.remove(); });
    createWorldObjects();
}

function enterFlippedRoute() {
    if (inFlippedRoute || !isFlippedPlanetLevel()) return;
    inFlippedRoute = true;
    const level = levels[currentLevel];
    const route = level.flippedRoute ?? {
        walls: level.walls,
        enemies: level.enemies,
        spikes: level.spikes,
        gravity: level.gravity,
        key: level.length - 3,
    };
    const validTile = (index: number) => Number.isInteger(index) && index > 0 && index < level.length - 1;
    const reflectY = (y: number, height: number) => FLIPPED_WORLD_HEIGHT - y - height;
    const wallTiles = new Set([...new Set(route.walls)].filter(validTile));
    const routeEnemyTiles = getLevelEnemyIndices({ ...level, enemies: route.enemies }).filter(validTile);
    const routeWalls = [...wallTiles].map((index) => ({
        x: 140 + index * TILE_WIDTH,
        y: 20,
        width: 96,
        height: 54,
    }));
    levelObstacles = routeWalls;
    levelHazards = [
        ...[...new Set(route.spikes)].filter(validTile).map((index) => ({ x: 140 + index * TILE_WIDTH, y: 112, width: 76, height: 20, kind: "spikes" as const })),
        ...[...new Set(route.gravity)].filter(validTile).map((index) => ({ x: 140 + index * TILE_WIDTH, y: 74, width: 115, height: 270, kind: "gravity" as const })),
    ];
    levelEnemies = routeEnemyTiles.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 94, defeated: false }));
    levelAsteroids.forEach((asteroid) => { asteroid.y = reflectY(asteroid.y, 48); });
    const flippedPowerups = route.powerups ?? [];
    const blockedPowerupTiles = [...wallTiles, ...routeEnemyTiles, ...route.spikes, ...route.gravity];
    levelPowerups = createLevelPowerups(level, [...flippedPowerups], blockedPowerupTiles);
    levelMiniBosses = [];
    boss = null; levelKey = null;
    separateActorsFromObstacles();
    flippedRouteKeyY = reflectY(170, 38);
    playerX = 120; playerY = 88; verticalSpeed = 0; jumpCount = 0;
    world.classList.add("flipped-route");
    areaLabel.textContent = "AREA / FLIPPED PLANET";
    statusLabel.textContent = "FLIPPED PLANET: the ceiling is the ground. Clear obstacles through the exit key; the beacon is back on the main route.";
    redrawRouteObjects();
    showPlanetaryTransition("ENTERING FLIPPED PLANET");
}

function leaveFlippedRoute() {
    if (!isFlippedPlanetLevel()) return;
    inFlippedRoute = false; shipFlipped = false;
    world.classList.remove("flipped-route");
    buildLevel(currentLevel);
    playerX = Math.max(120, 140 + (levels[currentLevel].flip?.[0] ?? 2) * TILE_WIDTH + 140); playerY = FLOOR_Y; verticalSpeed = 0; jumpCount = 0;
    areaLabel.textContent = "AREA / PRESTIGE ORBIT";
    statusLabel.textContent = "Exit key secured. You returned to the main route.";
    redrawRouteObjects();
    showPlanetaryTransition("RETURNING TO MAIN ORBIT");
}

function showPlanetaryTransition(text: string) {
    const transition = document.createElement("div"); transition.className = "planet-transition prestige"; transition.innerHTML = `<span>${text}</span>`; document.body.append(transition); window.setTimeout(() => transition.remove(), 1100);
}

function startGame(levelIndex = currentLevel) {
    cancelPortalTransit();
    currentLevel = levelIndex;
    buildLevel(currentLevel);
    playerX = 120; playerY = FLOOR_Y; verticalSpeed = 0; jumpCount = 0; projectiles = []; trailElement = []; trailPositions = []; trailDirection = 1; trailActive = false; projectileTimer = 0; trailTimer = 0; playerShotTimer = 0; shieldCharges = 0; boostTimer = 0; rapidTimer = 0; rapidUntil = 0; rapidCannonUntil = 0; cannonTimer = 0; gameStarted = false; gameActive = true; previousPlayerY = playerY; levelStartedAt = performance.now(); elapsedMilliseconds = 0; usedAbilities = new Set<string>(); starPowerupActive = false; starPowerupTimer = 0; starPowerupElement = null; resetFlippedVisualState(); portalCooldownUntil = 0; lastFrameTimestamp = 0; currentFrameScale = 1; hudUpdateFrames = 0;
    document.body.innerHTML = "";
    createGameShell(); createPlayer(); createWorldObjects(); createTrail(false); createControls(); startGameLoop();
}

function showWinScreen() {
    gameActive = false; cancelAnimationFrame(animationFrame);
    if (isLevelMakerPreview) {
        const screen = document.createElement("main");
        screen.className = "win-screen win-screen-animation";
        screen.innerHTML = `<p class="eyebrow">WORKSHOP PLAYTEST</p><h1>Route <em>cleared</em></h1><p class="time-result">${formatTime(elapsedMilliseconds)}</p><p class="menu-copy">This was only a draft playtest. The level has not been published or saved.</p>`;
        screen.append(createMenuButton("Playtest again", () => startGame(currentLevel)), createTextButton("Back to level maker", () => showLevelMenu()));
        document.body.replaceChildren(screen);
        return;
    }
    localStorage.setItem(`orbit-level-claims-${currentLevel}`, String(levelAsteroids.length));
    localStorage.setItem(`orbit-level-complete-${currentLevel}`, "1");
    const previousBest = Number(localStorage.getItem(`orbit-best-${currentLevel}`) ?? "0");
    if (!previousBest || elapsedMilliseconds < previousBest) localStorage.setItem(`orbit-best-${currentLevel}`, String(elapsedMilliseconds));
    localStorage.setItem(`orbit-level-${currentLevel + 1}`, "1");
    if (levels[currentLevel].boss) localStorage.setItem("orbit-boss-defeated", "1");
    if (levels[currentLevel].secretId === "prestige-gate") localStorage.setItem("orbit-level-complete-prestige-gate", "1");
    const screen = document.createElement("main");
        screen.className = "win-screen win-screen-animation";
    const prestigeGateCleared = levels[currentLevel].secretId === "prestige-gate";
    const reward = prestigeGateCleared ? "Prestige Gate cleared. Return to the main menu to claim your prestige." : levels[currentLevel].boss ? "Titan Core skin unlocked. The fleet has a new legend." : levels[currentLevel].secret ? "The Eclipse skin has joined your collection." : `Every asteroid secured. Total fleet claims: ${asteroidsClaimed}.`;
    screen.innerHTML = `<p class="eyebrow">BEACON REACHED / ${levels[currentLevel].secret ? "SECRET" : `SECTOR 0${currentLevel + 1}`}</p><h1>Claim <em>complete</em></h1><p class="time-result">${formatTime(elapsedMilliseconds)}</p><p class="menu-copy">${reward}</p>`;
    const runStatus = document.createElement("p");
    runStatus.className = "menu-copy online-service-status";
    runStatus.setAttribute("role", "status");
    runStatus.textContent = `Abilities used: ${usedAbilities.size ? [...usedAbilities].map(formatAbilityName).join(", ") : "None"}. Saving online score...`;
    screen.append(runStatus);
    void submitLeaderboardRun(runStatus, levels[currentLevel].name, Math.round(elapsedMilliseconds), [...usedAbilities]);
    const nextLevel = levels.findIndex((level, index) => index > currentLevel && (level.secret ? isSecretLevelUnlocked(level) : index === 0 || Number(localStorage.getItem(`orbit-level-${index}`) ?? "0") === 1));
    screen.append(createMenuButton(nextLevel >= 0 ? "Next sector" : "Replay sector", () => nextLevel >= 0 ? startGame(nextLevel) : startGame(currentLevel)), createTextButton("Mission select", showLevelMenu), createPageCounter());
    document.body.replaceChildren(screen);
}

async function submitLeaderboardRun(status: HTMLElement, levelName: string, timeMs: number, abilities: string[]) {
    try {
        const session = await apiRequest<{ user: OnlineUser | null }>("/auth/session");
        currentOnlineUser = session.user;
        if (!session.user) {
            status.textContent = "Sign in or create an account to submit this run to the online leaderboard.";
            return;
        }
        const result = await apiRequest<{ entry: OnlineLeaderboardEntry; improved: boolean }>("/runs", {
            method: "POST",
            body: JSON.stringify({ level: levelName, timeMs, abilities }),
        });
        status.textContent = result.improved
            ? `Online leaderboard saved for ${session.user.username}. Abilities used: ${abilities.length ? abilities.map(formatAbilityName).join(", ") : "None"}.`
            : `Your fastest online ${levelName} record is ${formatTime(result.entry.timeMs)}.`;
    } catch (error) {
        status.textContent = `Online score was not saved: ${error instanceof Error ? error.message : "unknown service error"}`;
    }
}

function showGameOver(reason = "Your hull took a hit.") {
    if (!gameActive) return;
    gameActive = false; cancelAnimationFrame(animationFrame); pressedKeys.clear(); cancelPortalTransit();
    resetFlippedVisualState();
    const screen = document.createElement("main");
    screen.className = "win-screen game-over-screen";
    screen.innerHTML = `<p class="eyebrow">SIGNAL LOST</p><h1>Hull <em>breach</em></h1><p class="menu-copy">${reason} The sector is still waiting.</p>`;
    if (isLevelMakerPreview) screen.append(createMenuButton("Retry playtest", () => startGame(currentLevel)), createTextButton("Back to level maker", () => showLevelMenu()));
    else screen.append(createMenuButton("Retry sector", () => startGame(currentLevel)), createTextButton("Mission select", showLevelMenu), createPageCounter());
    document.body.replaceChildren(screen);
}

function createGameShell() {
    const header = document.createElement("header");
    header.innerHTML = `<div><p class="eyebrow">JACER / 02</p><h1>Jacer</h1></div>`;
    const hud = document.createElement("div");
    hud.className = "hud";
    claimLabel.textContent = `${levelAsteroids.filter((item) => item.claimed).length} / ${levelAsteroids.length}`;
    levelLabel.textContent = `SECTOR 0${currentLevel + 1}`;
    hud.innerHTML = `<span class="hud-label">CLAIMS</span>`;
    areaLabel.className = "area-hud";
    areaLabel.textContent = `AREA / ${isFlippedPlanetLevel() ? "PRESTIGE ORBIT" : "NORMAL ORBIT"}`;
    hud.append(claimLabel, levelLabel, areaLabel);
    timerLabel.className = "run-timer"; timerLabel.textContent = "00:00.000"; hud.append(timerLabel);
    if (boss) { bossLabel.className = "boss-hud"; bossLabel.textContent = `TITAN ${boss.health}/${boss.maxHealth}`; hud.append(bossLabel); }
    const currency = document.createElement("span");
    currency.className = "asteroid-currency";
    currency.textContent = `NORMAL ${asteroidsClaimed} / SPECIAL ${specialAsteroids}`;
    hud.append(currency);
    hud.append(createPowerupHud());
    header.append(hud);
    world.id = "game-world"; world.innerHTML = ""; world.style.width = `${levels[currentLevel].length * TILE_WIDTH + 1080}px`; world.classList.remove("flipped-route", "normal-area", "prestige-area", "reduced-effects"); world.classList.add(isFlippedPlanetLevel() ? "prestige-area" : "normal-area"); world.classList.toggle("reduced-effects", reducedEffects); world.setAttribute("aria-label", "Jacer game area");
    statusLabel.className = "status"; statusLabel.textContent = levels[currentLevel].briefing;
    const game = document.createElement("section"); game.className = "game-frame"; game.append(world, statusLabel);
    game.addEventListener("pointermove", updateMouseAim);
    game.addEventListener("pointerdown", (event) => {
        if ((event.target as HTMLElement).closest(".controls, button")) return;
        shootingHeld = true;
        shoot();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => game.addEventListener(eventName, () => { shootingHeld = false; }));
    document.body.append(header, game);
}

function createPlayer() {
    const skin = skins[selectedSkin] ?? skins[0];
    const avatar = avatars[selectedAvatar] ?? avatars[0];
    const shipArt = avatar.image ?? skin.image;
    const hasCustomArt = Boolean(avatar.cssArt || shipArt);
    playerLabel.className = `player ${hasCustomArt ? "" : `ship-${skin.shape}`} avatar-${selectedAvatar}`; playerLabel.style.setProperty("--ship-color", skin.color); playerLabel.innerHTML = `${avatar.cssArt ? createCssShipArtMarkup(avatar.cssArt, avatar.name, skin.color) : shipArt ? createShipArtMarkup(shipArt, avatar.name, skin.color) : "<span class=\"ship-window\"></span>"}<span class="ship-gun"></span><span class="ship-flame"></span>`; world.append(playerLabel); updatePlayerPosition();
}

function createWorldObjects() {
    createSpaceBackdrop();
    createMapBoundaries();
    levelObstacles.forEach((obstacle) => {
        const element = document.createElement("div");
        element.className = `obstacle ${obstacle.airborne ? "airborne" : ""} ${obstacle.barrier ? "flipped-barrier" : ""} ${obstacle.block ? "block" : ""} ${obstacle.goalLock ? "goal-lock" : ""} ${obstacle.boundary ? "boundary" : ""}`;
        Object.assign(element.style, { left: `${obstacle.x}px`, top: `${obstacle.y}px`, width: `${obstacle.width}px`, height: `${obstacle.height}px` });
        if (obstacle.goalLock) { 
            // Grey wall with lock visual
            element.innerHTML = `<div class="goal-lock-wall"></div><div class="goal-lock-icon">🔒</div><div class="goal-lock-text">KEY REQUIRED</div>`; 
            element.setAttribute("aria-label", "Locked ending gate. A portal key is required."); 
        }
        else if (obstacle.barrier) element.setAttribute("aria-label", "Flipped planet barrier");
        else if (obstacle.airborne) element.setAttribute("aria-label", "Airborne planetary obstacle");
        else if (obstacle.boundary) element.setAttribute("aria-label", "Map boundary");
        world.append(element);
    });
    levelAsteroids.forEach((asteroid) => { const element = document.createElement("div"); element.className = `asteroid ${asteroid.special ? "special" : ""} ${asteroid.claimed ? "claimed" : ""}`; element.textContent = asteroid.special ? "✹" : "✦"; element.style.left = `${asteroid.x}px`; element.style.top = `${asteroid.y}px`; world.append(element); });
    levelHazards.forEach((hazard) => { const element = document.createElement("div"); element.className = `hazard ${hazard.kind}`; element.style.left = `${hazard.x}px`; element.style.top = `${hazard.y}px`; element.style.width = `${hazard.width}px`; element.style.height = `${hazard.height}px`; element.setAttribute("aria-label", hazard.kind === "spikes" ? "Spike hazard" : "Gravity zone"); world.append(element); });
    levelEnemies.forEach((enemy) => { const element = document.createElement("div"); element.className = "enemy"; element.style.left = `${enemy.x}px`; element.style.top = `${enemy.y}px`; world.append(element); });
    levelMiniBosses.forEach((miniBoss) => { const element = document.createElement("div"); element.className = "mini-boss dark-knight"; element.setAttribute("aria-label", "Dark Knight guardian"); element.style.left = `${miniBoss.x}px`; element.style.top = `${miniBoss.y}px`; world.append(element); });
    levelPowerups.forEach((powerup) => { const element = document.createElement("div"); element.className = `powerup ${powerup.kind}`; element.textContent = powerup.kind === "shield" ? "◇" : powerup.kind === "rapid" ? "ϟ" : powerup.kind === "cannon" ? "✦" : "»"; element.style.left = `${powerup.x}px`; element.style.top = `${powerup.y}px`; element.setAttribute("aria-label", `${powerup.kind} powerup`); world.append(element); });
createLevelKeyObject();
    if (inFlippedRoute && !flippedRouteKeyCollected) { const routeKey = document.createElement("div"); routeKey.className = "level-key flipped-route-key"; routeKey.textContent = "⚿"; routeKey.style.left = `${140 + Math.min(levels[currentLevel].length - 2, Math.max(2, levels[currentLevel].flippedRoute?.key ?? levels[currentLevel].length - 3)) * TILE_WIDTH}px`; routeKey.style.top = `${flippedRouteKeyY}px`; routeKey.setAttribute("aria-label", "Flipped planet exit key"); world.append(routeKey); }
    
    // Secret portals - one per secret level, placed in hard-to-reach/obscured locations (y=80, reveal radius 50px)
    const secretPortals = levels[currentLevel].secretPortals ?? [];
    secretPortals.forEach((portal, portalIndex) => {
        const element = document.createElement("div");
        element.className = "secret-portal";
        element.textContent = "⚡";
        element.style.left = `${140 + portal.index * TILE_WIDTH}px`;
        element.style.top = `${portal.y ?? PORTAL_Y}px`;
        element.setAttribute("aria-label", `Hidden portal to ${portal.secretId}`);
        element.dataset.portalIndex = portalIndex.toString();
        world.append(element);
    });
    
    // Regular portals (for flipped route travel) - not in secret levels
    const isSecretLevel = levels[currentLevel].secret === true;
    if (!isSecretLevel) {
        const portals = levels[currentLevel].portals ?? [];
        portals.forEach((index, portalIndex) => { 
            const element = document.createElement("div"); 
            element.className = "portal";
            element.textContent = "↔";
            element.style.left = `${140 + index * TILE_WIDTH}px`; 
            element.style.top = "175px"; 
            element.setAttribute("aria-label", "Hidden level portal"); 
            element.dataset.portalIndex = portalIndex.toString();
            world.append(element); 
        });
    }
    
    // Only show boss if unlocked (key obtained or no key required)
    const bossUnlocked = !levelKey || levelKey.collected || levels[currentLevel].secret;
    if (boss && bossUnlocked) { 
        const element = document.createElement("div"); 
        element.className = "boss"; 
        element.style.left = `${boss.x}px`; 
        element.style.top = `${boss.y}px`; 
        world.append(element); 
    }
    
    const beacon = document.createElement("div"); beacon.className = "beacon"; beacon.style.left = `${(levels[currentLevel].length - 1) * TILE_WIDTH + 140}px`; world.append(beacon);
}

function createSpaceBackdrop() {
    const backdrop = document.createElement("div");
    backdrop.className = "space-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.innerHTML = `<i class="star-field"></i><i class="system-sun"></i><i class="orbit orbit-one"></i><i class="orbit orbit-two"></i><i class="world-planet"></i><i class="world-moon"></i><i class="distant-planet"></i>`;
    world.append(backdrop);
}

function createMapBoundaries() {
    const level = levels[currentLevel];
    const levelWidth = level.length * TILE_WIDTH;
    const leftBoundary = { x: -100, y: -200, width: 100, height: 800, barrier: true };
    const rightBoundary = { x: levelWidth, y: -200, width: 100, height: 800, barrier: true };
    const topBoundary = { x: -100, y: -200, width: levelWidth + 200, height: 100, barrier: true };
    const bottomBoundary = { x: -100, y: FLOOR_Y + 100, width: levelWidth + 200, height: 100, barrier: true };
    
    [leftBoundary, rightBoundary, topBoundary, bottomBoundary].forEach((boundary) => {
        const element = document.createElement("div");
        element.className = "obstacle boundary";
        Object.assign(element.style, { left: `${boundary.x}px`, top: `${boundary.y}px`, width: `${boundary.width}px`, height: `${boundary.height}px` });
        element.setAttribute("aria-label", "Map boundary");
        world.append(element);
    });
    
    levelObstacles.push(leftBoundary, rightBoundary, topBoundary, bottomBoundary);
}

function createLevelKeyObject() {
    if (!levelKey || (levelKey.requiresPortal && !secretKeyRevealed)) return;
    const element = document.createElement("div");
    element.className = `level-key ${levelKey.collected ? "collected" : ""}`;
    element.textContent = "⚿";
    element.style.left = `${levelKey.x}px`;
    element.style.top = `${levelKey.y}px`;
    element.setAttribute("aria-label", `${levelKey.id} secret level key`);
    world.append(element);
}

function startPortalTransit(target: number, secretId?: string) {
    if (portalTravelInProgress) return;
    usedAbilities.add("portal");
    const sourceLevel = levels[currentLevel];
    const targetLevel = levels.find((level) => level.secretId === secretId);
    if (targetLevel?.prestige && !sourceLevel.prestige) return;
    portalTravelInProgress = true;
    secretBossRoomActive = true;
    currentSecretPortalTarget = secretId ?? `secret-room-${currentLevel + 1}-${target}`;
    portalReturnX = playerX;
    shipFlipped = false;
    verticalSpeed = 0;
    jumpCount = 0;
    playerX = 36;
    playerY = FLOOR_Y;
    projectiles.forEach((projectile) => projectile.element.remove());
    projectiles = [];
    const room = document.createElement("section");
    room.className = "portal-key-room secret-boss-room";
    room.setAttribute("aria-live", "polite");
    room.innerHTML = `<div class="portal-key-room-warp"></div><div class="portal-room-boundary"></div><div class="portal-room-floor"></div><div class="portal-room-player player"></div><div class="portal-key-chamber"><p>PORTAL KEY ARENA</p><b>DEFEAT THE VOID WARDEN</b><div class="portal-key-room-key">⚿</div><small class="portal-boss-health">8 HITS LEFT / JUMP ON ITS HEAD OR USE CANNON</small></div>`;
    document.querySelector(".game-frame")?.append(room);
    world.classList.add("portal-boss-room-active");
    secretRoomFloorY = Math.max(170, room.clientHeight - playerHeight - 26);
    playerX = 36;
    playerY = secretRoomFloorY;
    previousPlayerY = playerY;
    statusLabel.textContent = "Portal arena entered. Defeat the Void Warden to claim its key.";
    const bossX = Math.max(112, Math.min(room.clientWidth - 152, room.clientWidth * 0.68));
    secretBoss = { x: bossX, y: secretRoomFloorY - SECRET_BOSS_HEIGHT, health: 8, maxHealth: 8, defeated: false };
    const bossElement = document.createElement("div");
    bossElement.className = "boss secret-boss void-warden";
    bossElement.style.left = `${secretBoss.x}px`;
    bossElement.style.top = `${secretBoss.y}px`;
    room.append(bossElement);
    room.classList.add("has-secret-boss");
    const roomPlayer = room.querySelector<HTMLElement>(".portal-room-player");
    if (roomPlayer) roomPlayer.style.transform = `translate(${playerX}px, ${playerY}px)`;
    updateTrail(false);
}

function exitSecretBossRoom() {
    if (!gameActive || !portalTravelInProgress) return;
    if (portalReturnX !== null) playerX = Math.max(20, Math.min(levels[currentLevel].length * TILE_WIDTH - playerWidth, portalReturnX + PORTAL_SIZE + 24));
    playerY = FLOOR_Y;
    previousPlayerY = playerY;
    verticalSpeed = 0;
    jumpCount = 0;
    portalCooldownUntil = performance.now() + 900;
    portalTravelInProgress = false;
    secretBossRoomActive = false;
    secretBoss = null;
    currentSecretPortalTarget = null;
    portalReturnX = null;
    secretRoomFloorY = FLOOR_Y;
    world.classList.remove("portal-boss-room-active");
    document.querySelector(".portal-key-room")?.remove();
    updatePlayerPosition();
}

function createControls() {
    const controls = document.createElement("nav"); controls.className = "controls"; controls.setAttribute("aria-label", "Game controls");
    controls.append(createButton("left", "←", moveLeft), createButton("jump", "↑", jump), createButton("down", "↓", moveDown), createButton("right", "→", moveRight), createHoldButton("shoot", "✦", shoot), createButton("exit", "Exit", showLevelMenu));
    document.querySelector(".game-frame")?.append(controls);
}

function createPowerupHud() {
    const bar = document.createElement("div");
    bar.className = "powerup-hud";
    const inventory = getInventory();
    const availableKinds: PowerupKind[] = ["shield", "boost", "rapid", "cannon"];
    if (inventory.star > 0) availableKinds.push("star");
    availableKinds.forEach((kind) => {
        const button = document.createElement("button");
        button.className = `hud-power ${kind}`;
        button.type = "button";
        button.addEventListener("click", () => useInventoryPowerup(kind));
        bar.append(button);
    });
    return bar;
}

function createButton(className: string, text: string, action: () => void) { const button = document.createElement("button"); button.className = `control-button ${className}`; button.type = "button"; button.textContent = text; button.setAttribute("aria-label", className === "exit" ? "Exit to mission select" : className === "jump" ? "Jump" : className === "shoot" ? `Fire cannon (${formatControlBinding("shoot")})` : `Move ${className}`); button.addEventListener("click", () => action()); return button; }
function createHoldButton(className: string, text: string, action: () => void) { const button = createButton(className, text, action); button.addEventListener("pointerdown", () => { shootingHeld = true; }); ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => button.addEventListener(eventName, () => { shootingHeld = false; })); return button; }
function handleKeyDown(event: KeyboardEvent) {
    if (!gameActive) return;
    const key = event.code.toLowerCase();
    const action = (Object.keys(controlBindings) as ControlAction[]).find((item) => controlKeysFor(item).includes(key));
    if (!action) return;
    event.preventDefault();
    if (pressedKeys.has(key)) return;
    pressedKeys.add(key);
    if (action === "jump") jump();
    if (action === "down") moveDown();
    if (action === "shoot") { shootingHeld = true; shoot(); }
}
function handleKeyUp(event: KeyboardEvent) {
    const key = event.code.toLowerCase();
    pressedKeys.delete(key);
    if (controlKeysFor("shoot").includes(key)) shootingHeld = false;
}
function updateHeldMovement() {
    const direction = Number(controlKeysFor("right").some((key) => pressedKeys.has(key))) - Number(controlKeysFor("left").some((key) => pressedKeys.has(key)));
    if (!direction) return;
    const boost = boostTimer > 0 ? gameConfig.powerupEffects.boost.movementMultiplier : 1;
    playerX = Math.max(20, Math.min(levels[currentLevel].length * TILE_WIDTH, playerX + direction * 4 * currentFrameScale * boost));
    trailMovementFrames = 8;
    gameStarted = true;
}
function moveLeft(distance = 38) { if (portalTravelInProgress) return; playerX = Math.max(20, playerX - distance * (boostTimer > 0 ? gameConfig.powerupEffects.boost.movementMultiplier : 1)); trailMovementFrames = 8; gameStarted = true; updatePlayerPosition(); }
function moveRight(distance = 38) { if (portalTravelInProgress) return; playerX = Math.min(levels[currentLevel].length * TILE_WIDTH, playerX + distance * (boostTimer > 0 ? gameConfig.powerupEffects.boost.movementMultiplier : 1)); trailMovementFrames = 8; gameStarted = true; updatePlayerPosition(); }
function playerBox(): Box {
    return {
        x: playerX + playerHitboxInsetX,
        y: playerY + playerHitboxInsetY,
        width: playerHitboxWidth,
        height: playerHitboxHeight,
    };
}
function isInGravityZone() { return levelHazards.some((hazard) => hazard.kind === "gravity" && intersects(playerBox(), hazard)); }
function moveDown(distance = 36) {
    if (portalTravelInProgress) return;
    const now = performance.now();
    const doubleDown = now - lastDownPressAt < 300;
    lastDownPressAt = now;
    if (inFlippedRoute && flippedRouteKeyCollected && doubleDown && isInGravityZone()) { leaveFlippedRoute(); return; }
    // On the ceiling, Down is the jump input: it dives under the upper-lane
    // obstacles created for the prestige planet.
    if (shipFlipped) { jump(); return; }
    playerY = Math.min(FLOOR_Y + 60, playerY + distance); verticalSpeed = 0; gameStarted = true; updatePlayerPosition();
}
function jump() {
    if (portalTravelInProgress) {
        if (secretBossRoomActive && jumpCount < 2) { jumpCount++; verticalSpeed = jumpPower; trailActive = true; trailPositions = []; }
        return;
    }
    if (jumpCount >= 2) return;
    const wasInFlipZone = isInGravityZone();
    if (jumpCount === 1) usedAbilities.add("double-jump");
    jumpCount++;
    verticalSpeed = shipFlipped ? Math.abs(jumpPower) : jumpPower;
    // Allow planetary flip on prestige levels (both regular and secret)
    const flipAllowed = Boolean(levels[currentLevel].prestige);
    if (!shipFlipped && flipAllowed && wasInFlipZone && jumpCount === 2) {
        // A planetary flip is earned by the second jump inside the anti-gravity field.
        shipFlipped = true;
        verticalSpeed = jumpPower;
        enterFlippedRoute();
    }
    // Track jump direction for trail effects
    if (pressedKeys.has("arrowleft") || pressedKeys.has("a")) lastJumpDirection = -1;
    else if (pressedKeys.has("arrowright") || pressedKeys.has("d")) lastJumpDirection = 1;
    else lastJumpDirection = 0;
    trailActive = true;
    trailPositions = [];
    gameStarted = true; updatePlayerPosition();
}

function startGameLoop(timestamp = performance.now()) {
    if (!gameActive) return;
    animationFrame = requestAnimationFrame(startGameLoop);
    if (document.hidden) {
        pressedKeys.clear();
        lastFrameTimestamp = 0;
        return;
    }
    currentFrameScale = lastFrameTimestamp ? Math.min(2.5, Math.max(0, (timestamp - lastFrameTimestamp) / (1000 / 60))) : 1;
    lastFrameTimestamp = timestamp;
    if (portalTravelInProgress) {
        if (secretBossRoomActive) updateSecretBossRoom();
        updateTrail(false);
        updatePlayerPosition();
        return;
    }
    updateHeldMovement(); previousPlayerY = playerY;
    const inGravity = isInGravityZone();
    if (shipFlipped && !inGravity && !inFlippedRoute) shipFlipped = false;
    playerLabel.classList.toggle("flipped", shipFlipped);
    if (gameStarted) { elapsedMilliseconds = performance.now() - levelStartedAt; timerLabel.textContent = formatTime(elapsedMilliseconds); }
    verticalSpeed += (shipFlipped ? -1 : 1) * (inGravity ? gravity * 1.55 : gravity) * currentFrameScale; playerY += verticalSpeed * currentFrameScale;
    if (!shipFlipped && playerY >= FLOOR_Y) { playerY = FLOOR_Y; verticalSpeed = 0; jumpCount = 0; }
    if (shipFlipped && playerY <= CEILING_Y) { playerY = CEILING_Y; verticalSpeed = 0; jumpCount = 0; }
    projectileTimer += currentFrameScale; trailTimer += currentFrameScale; playerShotTimer = Math.max(0, playerShotTimer - currentFrameScale); boostTimer = Math.max(0, boostTimer - currentFrameScale); cannonTimer = cannonTimer === Number.POSITIVE_INFINITY ? cannonTimer : Math.max(0, cannonTimer - currentFrameScale); rapidTimer = Math.max(0, rapidUntil - performance.now()); rapidCannonUntil = rapidCannonUntil > performance.now() ? rapidCannonUntil : 0;
    if (starPowerupActive) {
        starPowerupTimer -= currentFrameScale;
        if (starPowerupTimer <= 0) {
            starPowerupActive = false;
            if (starPowerupElement) starPowerupElement.style.display = "none";
            playerLabel.classList.remove("star-invincible");
            statusLabel.textContent = "Rainbow Star faded. The rainbow glow has ended.";
        }
    }
    if (shootingHeld || controlKeysFor("shoot").some((key) => pressedKeys.has(key))) shoot();
    const projectileInterval = rapidTimer > 0 ? 52 : reducedEffects ? 120 : 90;
    if (projectileTimer >= projectileInterval) { projectileTimer -= projectileInterval; levelEnemies.forEach(fireProjectile); levelMiniBosses.forEach(fireMiniBossProjectile); if (boss && !boss.defeated) fireBossProjectile(); }
    trailMovementFrames = Math.max(0, trailMovementFrames - currentFrameScale);
    if (lastJumpDirection !== 0) { trailDirection = lastJumpDirection; trailActive = true; trailPositions = []; lastJumpDirection = 0; }
    const airborne = Math.abs(verticalSpeed) > .2;
    const shouldTrail = trailActive && jumpCount > 0 && airborne;
    if (shouldTrail && trailTimer >= 2) { trailTimer = 0; createTrail(true); }
    updateTrail(shouldTrail);
    updateProjectiles(); updatePlayerPosition();
    hudUpdateFrames += currentFrameScale;
    if (hudUpdateFrames >= 6) { hudUpdateFrames = 0; updatePowerupHud(); }
    checkCollisions();
}

function updateMouseAim(event: PointerEvent) {
    const frame = document.querySelector(".game-frame");
    if (!frame) return;
    const bounds = frame.getBoundingClientRect();
    mouseAim = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    hasMouseAim = true;
    updateGunAim();
}
function getMouseAimWorldPosition() {
    const cameraOffset = secretBossRoomActive ? 0 : Math.max(0, playerX - 180);
    return { x: mouseAim.x + cameraOffset, y: mouseAim.y };
}
function updateGunAim() {
    const centerX = playerX + playerWidth / 2;
    const centerY = playerY + playerHeight / 2;
    const aim = getMouseAimWorldPosition();
    const angle = hasMouseAim ? Math.atan2(aim.y - centerY, aim.x - centerX) : 0;
    const gun = playerLabel.querySelector<HTMLElement>(".ship-gun");
    if (gun) gun.style.transform = `rotate(${angle - (shipFlipped ? Math.PI : 0)}rad)`;
}
function updatePlayerPosition() {
    playerLabel.style.transform = `translate(${playerX}px, ${playerY}px) rotate(${shipFlipped ? 180 : 0}deg)`;
    world.style.transform = `translateX(${-Math.max(0, playerX - 180)}px)`;
    levelLabel.textContent = `SECTOR 0${currentLevel + 1}`;
    updateGunAim();
}
function shoot() {
    const rapidCannonReady = rapidCannonUntil > performance.now();
    if (!gameActive || portalTravelInProgress || (cannonTimer <= 0 && !rapidCannonReady)) { if (gameActive && !portalTravelInProgress) statusLabel.textContent = "Cannon offline. Find the cannon power-up."; return; }
    if (playerShotTimer > 0) return;
    playerShotTimer = rapidUntil > performance.now() ? 8 : 20;
    firePlayerProjectile(world);
}
function firePlayerProjectile(container: HTMLElement) {
    const centerX = playerX + playerWidth / 2;
    const centerY = playerY + playerHeight / 2;
    const aim = getMouseAimWorldPosition();
    const directionX = hasMouseAim ? aim.x - centerX : 1;
    const directionY = hasMouseAim ? aim.y - centerY : 0;
    const distance = Math.max(1, Math.hypot(directionX, directionY));
    const angle = Math.atan2(directionY, directionX);
    const originX = centerX + Math.cos(angle) * 24;
    const originY = centerY + Math.sin(angle) * 24;
    const element = document.createElement("div");
    element.className = "player-projectile";
    container.append(element);
    projectiles.push({ x: originX, y: originY, vx: directionX / distance * 9, vy: directionY / distance * 9, angle, element, owner: "player" });
}
function fireProjectile(enemy: Enemy) {
    if (enemy.defeated) return;
    const startX = enemy.x + 18, startY = enemy.y + 25, directionX = playerX + 24 - startX, directionY = playerY + 28 - startY, distance = Math.max(1, Math.hypot(directionX, directionY)), element = document.createElement("div");
    element.className = "projectile"; world.append(element); projectiles.push({ x: startX, y: startY, vx: directionX / distance * 2.6, vy: directionY / distance * 2.6, element, owner: "enemy" });
}
function fireBossProjectile() { if (!boss) return; const directionX = playerX + 24 - boss.x, directionY = playerY + 28 - boss.y, distance = Math.max(1, Math.hypot(directionX, directionY)), element = document.createElement("div"); element.className = "boss-projectile"; world.append(element); projectiles.push({ x: boss.x, y: boss.y + 50, vx: directionX / distance * 4.2, vy: directionY / distance * 4.2, element, owner: "enemy" }); }
function fireMiniBossProjectile(miniBoss: MiniBoss) { if (miniBoss.defeated) return; const directionX = playerX + 24 - miniBoss.x, directionY = playerY + 28 - miniBoss.y, distance = Math.max(1, Math.hypot(directionX, directionY)), element = document.createElement("div"); element.className = "mini-projectile"; world.append(element); projectiles.push({ x: miniBoss.x, y: miniBoss.y + 36, vx: directionX / distance * 4.5, vy: directionY / distance * 4.5, element, owner: "enemy" }); }
function createTrail(visible = true) {
    const trail = trails[selectedTrail] ?? trails[0];
    if (trailElement.length === 0) {
        trailElement = Array.from({ length: 5 }, (_, index) => {
            const element = document.createElement("i");
            element.className = `trail-particle trail-effect-${trail.effect} ${index === 0 ? "trail-head" : ""}`;
            element.style.setProperty("--trail-delay", `${index * 60}ms`);
            element.style.opacity = "0";
            world.append(element);
            return element;
        });
    }
    trailElement.forEach((element) => element.style.setProperty("--trail-color", trail.color));
    if (visible) { trailActive = true; trailTimer = 0; }
    else { trailActive = false; trailPositions = []; }
    updateTrail(visible);
}

function updateTrail(visible = trailActive) {
    if (!visible) {
        trailActive = false;
        trailElement.forEach((element) => { element.classList.remove("trail-active"); element.style.opacity = "0"; });
        return;
    }
    trailElement.forEach((element) => element.classList.add("trail-active"));
    const anchor = { x: playerX + (playerWidth - 14) / 2, y: shipFlipped ? playerY + 2 : playerY + playerHeight - 2 };
    const last = trailPositions[0];
    if (last && anchor.x !== last.x) trailDirection = anchor.x > last.x ? 1 : -1;
    if (!last || last.x !== anchor.x || last.y !== anchor.y) trailPositions.unshift(anchor);
    trailPositions = trailPositions.slice(0, 24);
    trailElement.forEach((element, index) => {
        const point = trailPositions[Math.min(index * 2, trailPositions.length - 1)] ?? anchor;
        const tailX = trailDirection > 0 ? Math.min(point.x, anchor.x) : Math.max(point.x, anchor.x);
        const tailY = shipFlipped ? Math.min(point.y, anchor.y - index * 2) : Math.max(point.y, anchor.y + index * 2);
        element.classList.toggle("flipped-trail", shipFlipped);
        element.style.left = `${index === 0 ? anchor.x : tailX}px`;
        element.style.top = `${index === 0 ? anchor.y : tailY}px`;
        element.style.opacity = `${Math.max(0.1, 1 - index * 0.2)}`;
    });
}
function updateProjectiles() {
    projectiles = projectiles.filter((projectile) => {
        projectile.x += projectile.vx * currentFrameScale;
        projectile.y += projectile.vy * currentFrameScale;
        projectile.element.style.transform = `translate(${projectile.x}px, ${projectile.y}px) rotate(${projectile.angle ?? Math.atan2(projectile.vy, projectile.vx)}rad)`;
        const box = { x: projectile.x, y: projectile.y, width: 16, height: 16 };
        const obstacle = secretBossRoomActive ? undefined : levelObstacles.find((item) => intersects(box, item));
        if (obstacle) {
            createSplash(projectile.x, projectile.y);
            projectile.element.remove();
            return false;
        }
        if (projectile.owner === "player") {
            const enemy = secretBossRoomActive ? undefined : levelEnemies.find((item) => !item.defeated && intersects(box, { x: item.x, y: item.y, width: 48, height: 48 }));
            if (enemy) {
                enemy.defeated = true;
                document.querySelectorAll(".enemy")[levelEnemies.indexOf(enemy)]?.classList.add("defeated");
                projectile.element.remove();
                statusLabel.textContent = "Cannon hit. Sentry disabled.";
                return false;
            }
            const miniBoss = secretBossRoomActive ? undefined : levelMiniBosses.find((item) => !item.defeated && intersects(box, { x: item.x, y: item.y, width: 70, height: 70 }));
            if (miniBoss) {
                miniBoss.health--;
                projectile.element.remove();
                if (miniBoss.health <= 0) {
                    miniBoss.defeated = true;
                    document.querySelectorAll(".mini-boss")[levelMiniBosses.indexOf(miniBoss)]?.classList.add("defeated");
                    statusLabel.textContent = "Cannon fire shattered the mini-boss.";
                } else statusLabel.textContent = `Cannon hit. ${miniBoss.health} hit remaining.`;
                return false;
            }
            if (!secretBossRoomActive && boss && !boss.defeated && intersects(box, { x: boss.x, y: boss.y, width: 128, height: 150 })) {
                projectile.element.remove();
                damageBoss();
                return false;
            }
            if (secretBossRoomActive && secretBoss && !secretBoss.defeated && intersects(box, { x: secretBoss.x, y: secretBoss.y, width: 128, height: SECRET_BOSS_HEIGHT })) {
                projectile.element.remove();
                damageSecretBoss();
                return false;
            }
        } else if (intersects(box, playerBox())) {
            projectile.element.remove();
            if (starPowerupActive) return false;
            if (shieldCharges > 0) {
                shieldCharges--;
                statusLabel.textContent = "Shield absorbed the impact.";
                return false;
            }
            showGameOver("A sentry round cracked your hull.");
            return false;
        }
        if (projectile.x < playerX - 700 || projectile.x > playerX + 700 || projectile.y < -100 || projectile.y > 500) {
            projectile.element.remove();
            return false;
        }
        return true;
    });
}
function createSplash(x: number, y: number) { const splash = document.createElement("div"); splash.className = "splash"; splash.style.left = `${x}px`; splash.style.top = `${y}px`; world.append(splash); window.setTimeout(() => splash.remove(), reducedEffects ? 180 : 350); }
function intersects(first: Box, second: Box) { return first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y; }

function checkCollisions() {
    levelObstacles.forEach((obstacle) => {
        const hitbox = playerBox();
        const previousHitboxTop = previousPlayerY + playerHitboxInsetY;
        const previousHitboxBottom = previousHitboxTop + playerHitboxHeight;
        const horizontal = hitbox.x + hitbox.width > obstacle.x && hitbox.x < obstacle.x + obstacle.width;
        const vertical = hitbox.y + hitbox.height > obstacle.y && hitbox.y < obstacle.y + obstacle.height;
        const wasAbove = previousHitboxBottom <= obstacle.y;
        const wasBelow = previousHitboxTop >= obstacle.y + obstacle.height;
        const landed = shipFlipped
            ? (verticalSpeed >= 0 && wasAbove) || (verticalSpeed < 0 && wasBelow)
            : (verticalSpeed >= 0 && wasAbove) || (verticalSpeed < 0 && wasBelow);
        if (horizontal && vertical && landed) {
            if (verticalSpeed >= 0 && wasAbove) playerY = obstacle.y - playerHitboxInsetY - playerHitboxHeight;
            else if (verticalSpeed < 0 && wasBelow) playerY = obstacle.y + obstacle.height - playerHitboxInsetY;
            verticalSpeed = 0; jumpCount = 0;
        } else if (horizontal && vertical) {
            playerX = playerX < obstacle.x
                ? obstacle.x - playerHitboxInsetX - playerHitboxWidth - 4
                : obstacle.x + obstacle.width - playerHitboxInsetX + 4;
            if (obstacle.goalLock) statusLabel.textContent = "ENDING LOCKED — enter a portal chamber to recover the required key.";
            updatePlayerPosition();
        }
    });
    levelHazards.forEach((hazard) => { if (!starPowerupActive && hazard.kind === "spikes" && intersects(playerBox(), hazard)) { if (shieldCharges > 0) { shieldCharges--; playerY = 300; statusLabel.textContent = "Shield absorbed the spike hit."; } else showGameOver("The spike belt caught your ship."); } });
levelPowerups.forEach((powerup, index) => { if (!powerup.collected && intersects(playerBox(), { x: powerup.x, y: powerup.y, width: 38, height: 38 })) { powerup.collected = true; activatePowerup(powerup.kind); document.querySelectorAll(".powerup")[index]?.classList.add("collected"); } });
    
    const secretPortals = levels[currentLevel].secretPortals ?? [];
    if (!portalTravelInProgress && performance.now() >= portalCooldownUntil) {
        secretPortals.some((portal) => {
            const portalBox = { x: 140 + portal.index * TILE_WIDTH, y: portal.y ?? PORTAL_Y, width: PORTAL_SIZE, height: PORTAL_SIZE };
            if (!intersects(playerBox(), portalBox)) return false;
            startPortalTransit(portal.index, portal.secretId);
            return true;
        });
    }
    
    const portals = levels[currentLevel].portals ?? [];
    if (!portalTravelInProgress && performance.now() >= portalCooldownUntil) {
        portals.some((index, portalIndex) => {
            const portalBox = { x: 140 + index * TILE_WIDTH, y: PORTAL_Y, width: PORTAL_SIZE, height: PORTAL_SIZE };
            if (!intersects(playerBox(), portalBox)) return false;
            const pairedIndex = portalIndex % 2 === 0 ? portalIndex + 1 : portalIndex - 1;
            const target = portals[pairedIndex] ?? index + 5;
            startPortalTransit(target);
            return true;
        });
    }
if (portalTravelInProgress) return;
    if (levelKey && secretKeyRevealed && !levelKey.collected && intersects(playerBox(), { x: levelKey.x, y: levelKey.y, width: 38, height: 38 })) {
        levelKey.collected = true; 
        localStorage.setItem(`orbit-key-${levelKey.id}`, "1"); 
        if (levelKey.id === "eclipse") localStorage.setItem("orbit-secret-unlocked", "1"); 
        document.querySelector(".level-key")?.classList.add("collected"); 
        statusLabel.textContent = `${levelKey.id} key claimed. Secret level unlocked.`;
        // Show boss when key is collected
        if (boss && !document.querySelector(".boss")) {
            const element = document.createElement("div"); 
            element.className = "boss"; 
            element.style.left = `${boss.x}px`; 
            element.style.top = `${boss.y}px`; 
            world.append(element);
        }
    }
    if (inFlippedRoute && !flippedRouteKeyCollected && intersects(playerBox(), { x: 140 + Math.min(levels[currentLevel].length - 2, Math.max(2, levels[currentLevel].flippedRoute?.key ?? levels[currentLevel].length - 3)) * TILE_WIDTH, y: flippedRouteKeyY, width: 38, height: 38 })) { 
        flippedRouteKeyCollected = true; 
        document.querySelector(".flipped-route-key")?.classList.add("collected"); 
        statusLabel.textContent = "Exit key recovered. Double-tap Down in an anti-gravity zone to return."; 
    }
    levelEnemies.forEach((enemy, index) => {
        if (enemy.defeated) return;
        const enemyBox = { x: enemy.x, y: enemy.y, width: 48, height: 48 };
        const touchingEnemy = !starPowerupActive && intersects(playerBox(), enemyBox);
        const landedOnHead = touchingEnemy && (shipFlipped
            ? verticalSpeed < 0 && previousPlayerY >= enemy.y + enemyBox.height - 15
            : verticalSpeed >= 0 && previousPlayerY + playerHitboxInsetY + playerHitboxHeight <= enemy.y + 15);
        if (landedOnHead) {
            enemy.defeated = true;
            playerY = shipFlipped ? enemy.y + enemyBox.height - playerHitboxInsetY : enemy.y - playerHitboxInsetY - playerHitboxHeight;
            verticalSpeed = shipFlipped ? Math.abs(jumpPower) * 0.58 : jumpPower * 0.58;
            jumpCount = 1;
            playerLabel.classList.add("ground-pound");
            window.setTimeout(() => playerLabel.classList.remove("ground-pound"), 180);
            statusLabel.textContent = inFlippedRoute ? "Dark sentry crushed. Ground pound dominates." : "Sentry disabled. Nice landing.";
            document.querySelectorAll(".enemy")[index]?.classList.add("defeated");
        } else if (touchingEnemy) {
            if (shieldCharges > 0) { shieldCharges--; playerX = enemy.x - playerHitboxInsetX - playerHitboxWidth - 8; statusLabel.textContent = "Shield absorbed the sentry impact."; }
            else showGameOver("You hit a sentry head-on.");
        }
    });
    levelMiniBosses.forEach((miniBoss, index) => {
        if (miniBoss.defeated) return;
        const miniBox = { x: miniBoss.x, y: miniBoss.y, width: 70, height: 70 };
        const touching = !starPowerupActive && intersects(playerBox(), miniBox);
        const stomped = touching && (shipFlipped
            ? verticalSpeed < 0 && previousPlayerY >= miniBoss.y + miniBox.height - 18
            : verticalSpeed >= 0 && previousPlayerY + playerHitboxInsetY + playerHitboxHeight <= miniBoss.y + 18);
        if (stomped) {
            miniBoss.health -= inFlippedRoute ? 2 : 1;
            playerY = shipFlipped ? miniBoss.y + miniBox.height - playerHitboxInsetY : miniBoss.y - playerHitboxInsetY - playerHitboxHeight;
            verticalSpeed = shipFlipped ? Math.abs(jumpPower) * (inFlippedRoute ? 0.75 : .62) : jumpPower * (inFlippedRoute ? 0.75 : .62);
            jumpCount = 1;
            playerLabel.classList.add("ground-pound");
            window.setTimeout(() => playerLabel.classList.remove("ground-pound"), 180);
            document.querySelectorAll(".mini-boss")[index]?.classList.add("hit");
            window.setTimeout(() => document.querySelectorAll(".mini-boss")[index]?.classList.remove("hit"), 180);
            if (miniBoss.health <= 0) {
                miniBoss.defeated = true;
                document.querySelectorAll(".mini-boss")[index]?.classList.add("defeated");
                statusLabel.textContent = inFlippedRoute ? "Dark Knight crushed. Ground pound supremacy!" : "Dark Knight shattered. The route is clear.";
            } else {
                statusLabel.textContent = inFlippedRoute ? `Dark Knight staggered. ${miniBoss.health} hit remaining.` : `Dark Knight damaged. ${miniBoss.health} hit remaining.`;
            }
        } else if (touching) {
            if (shieldCharges > 0) { shieldCharges--; playerX = miniBoss.x - playerHitboxInsetX - playerHitboxWidth - 8; statusLabel.textContent = "Shield absorbed the mini-boss impact."; }
            else showGameOver("A Dark Knight slammed into your hull.");
        }
    });
    levelAsteroids.forEach((asteroid, index) => { if (!asteroid.claimed && Math.abs(playerX + 24 - asteroid.x) < 42 && Math.abs(playerY + 28 - asteroid.y) < 58) { asteroid.claimed = true; const claimedAsteroids = getClaimedAsteroids(currentLevel); claimedAsteroids.add(index); saveClaimedAsteroids(currentLevel, claimedAsteroids); if (asteroid.special) { specialAsteroids++; localStorage.setItem("orbit-special-claims", String(specialAsteroids)); } else { asteroidsClaimed++; localStorage.setItem("orbit-claims", String(asteroidsClaimed)); } claimLabel.textContent = `${levelAsteroids.filter((item) => item.claimed).length} / ${levelAsteroids.length}`; statusLabel.textContent = asteroid.special ? "Special asteroid secured. Spend it in the roll wheel." : boss ? "Asteroid impact. Titan armor is cracking." : "Asteroid claimed. This one is secured permanently."; document.querySelectorAll(".asteroid")[index]?.classList.add("claimed"); damageBoss(); } });
    if (boss && playerX > boss.x - 120 && !boss.defeated) { playerX = boss.x - 125; statusLabel.textContent = "Titan Core blocks the beacon. Claim asteroids to break it."; updatePlayerPosition(); }
    // Check win condition: for prestige levels, require flipped route key; for others, just need key/unlocked
    const isPrestigeLevel = levels[currentLevel].prestige === true;
    const hasWinKey = isPrestigeLevel ? flippedRouteKeyCollected : (!endGoalLocked);
    if (!inFlippedRoute && playerX > levels[currentLevel].length * TILE_WIDTH - 100 && gameStarted && (!boss || boss.defeated) && hasWinKey) showWinScreen();
}

function activatePowerup(kind: PowerupKind) { 
    usedAbilities.add(kind === "star" ? "rainbow-star" : kind);
    if (kind === "shield") { 
        const charges = gameConfig.powerupEffects.shield.charges;
        shieldCharges += charges;
        statusLabel.textContent = `Shield bubble online. ${charges} hit${charges === 1 ? "" : "s"} added.`;
    } else if (kind === "boost") { 
        const { durationSeconds, movementMultiplier } = gameConfig.powerupEffects.boost;
        boostTimer = durationSeconds * 60;
        statusLabel.textContent = `Thruster boost online for ${durationSeconds} seconds at ${movementMultiplier}x movement.`;
    } else if (kind === "rapid") { 
        const durationMs = gameConfig.powerupEffects.rapid.durationSeconds * 1000;
        rapidUntil = Math.max(rapidUntil, performance.now() + durationMs);
        rapidTimer = Math.max(0, rapidUntil - performance.now()); 
        rapidCannonUntil = Math.max(rapidCannonUntil, rapidUntil); 
        statusLabel.textContent = `Rapid fire online for ${gameConfig.powerupEffects.rapid.durationSeconds} seconds. Hold Shoot.`;
    } else if (kind === "cannon") { 
        const durationSeconds = gameConfig.powerupEffects.cannon.durationSeconds;
        cannonTimer = durationSeconds === 0 ? Number.POSITIVE_INFINITY : durationSeconds * 60;
        statusLabel.textContent = durationSeconds === 0 ? "Cannon online until hull breach. Press E or Shoot." : `Cannon online for ${durationSeconds} seconds. Press E or Shoot.`;
    } else if (kind === "star") { 
        starPowerupActive = true; 
        const durationSeconds = gameConfig.powerupEffects.star.durationSeconds;
        starPowerupTimer = durationSeconds * 60;
        // Create rainbow star visual effect on player
        if (!starPowerupElement) {
            starPowerupElement = document.createElement("div");
            starPowerupElement.className = "star-powerup-effect";
            starPowerupElement.innerHTML = `<div class="rainbow-star">★</div>`;
            playerLabel.append(starPowerupElement);
        }
        starPowerupElement.style.display = "grid";
        playerLabel.classList.add("star-invincible");
        statusLabel.textContent = `RAINBOW STAR ACTIVE! Your ship is rainbow and invincible for ${durationSeconds} seconds!`;
        // Kill all enemies instantly
        levelEnemies.forEach((enemy) => { if (!enemy.defeated) { enemy.defeated = true; document.querySelectorAll(".enemy")[levelEnemies.indexOf(enemy)]?.classList.add("defeated"); } });
        levelMiniBosses.forEach((miniBoss) => { if (!miniBoss.defeated) { miniBoss.defeated = true; document.querySelectorAll(".mini-boss")[levelMiniBosses.indexOf(miniBoss)]?.classList.add("defeated"); } });
        if (boss && !boss.defeated) { boss.defeated = true; document.querySelector(".boss")?.classList.add("defeated"); }
        if (secretBoss && !secretBoss.defeated) while (secretBoss && !secretBoss.defeated) damageSecretBoss();
    } 
    updatePowerupHud(); 
}
function useInventoryPowerup(kind: PowerupKind) { const inventory = getInventory(); if (inventory[kind] < 1) { statusLabel.textContent = `No ${powerupLabels[kind]} power-ups in the hold.`; return; } inventory[kind]--; saveInventory(inventory); activatePowerup(kind); statusLabel.textContent = `${powerupLabels[kind]} launched from the hold.`; }
function updatePowerupHud() { 
    const inventory = getInventory(); 
    document.querySelectorAll<HTMLButtonElement>(".hud-power").forEach((button) => { 
        const kind = button.classList.contains("shield") ? "shield" : button.classList.contains("boost") ? "boost" : button.classList.contains("rapid") ? "rapid" : button.classList.contains("star") ? "star" : "cannon" as PowerupKind; 
        const timer = kind === "shield" ? (shieldCharges ? ` x${shieldCharges}` : "") : kind === "cannon" && (cannonTimer === Number.POSITIVE_INFINITY || rapidCannonUntil > performance.now()) ? " READY" : kind === "boost" && boostTimer > 0 ? ` ${Math.ceil(boostTimer / 60)}s` : kind === "rapid" && rapidTimer > 0 ? ` ${Math.ceil(rapidTimer / 1000)}s` : kind === "star" && starPowerupActive ? ` ${Math.ceil(starPowerupTimer / 60)}s` : ""; 
        button.textContent = `${powerupLabels[kind]} ${inventory[kind]}${timer}`; 
        button.disabled = inventory[kind] < 1;
        button.classList.toggle("active", Boolean(timer)); 
    }); 
    playerLabel.classList.toggle("shielded", shieldCharges > 0); 
}
function damageBoss() { if (!boss || boss.defeated) return; boss.health--; bossLabel.textContent = `TITAN ${boss.health}/${boss.maxHealth}`; const bossElement = document.querySelector(".boss"); bossElement?.classList.add("hit"); window.setTimeout(() => bossElement?.classList.remove("hit"), 180); if (boss.health <= 0) { boss.defeated = true; bossElement?.classList.add("defeated"); statusLabel.textContent = "Titan Core shattered. Reach the beacon for your reward."; } }

function getPrestigeRequirement(level: number) { return { normal: 100 + level * 50, special: 10 + level * 5 }; }
function getNormalRouteCount() { return levels.filter((level) => !level.secret && !level.prestige).length; }
function getNormalCompletedLevelCount() { return levels.filter((level, index) => { const bestTime = Number(localStorage.getItem(`orbit-best-${index}`) ?? "0"); return !level.secret && !level.prestige && localStorage.getItem(`orbit-level-complete-${index}`) === "1" && bestTime > 0 && bestTime <= goldenTimeLimitMs; }).length; }
function getCompletedLevelCount() { return levels.filter((_, index) => localStorage.getItem(`orbit-level-complete-${index}`) === "1").length; }
function hasClearedPrestigeGate() { return localStorage.getItem("orbit-level-complete-prestige-gate") === "1" || levels.some((level, index) => level.secretId === "prestige-gate" && localStorage.getItem(`orbit-level-complete-${index}`) === "1"); }
function canClaimPrestige() { const requirement = getPrestigeRequirement(prestigeLevel); return prestigeLevel < prestigeMax && hasClearedPrestigeGate() && getNormalCompletedLevelCount() >= getNormalRouteCount() && asteroidsClaimed >= requirement.normal && specialAsteroids >= requirement.special; }
function tryPrestige() {
    if (!canClaimPrestige()) return false;
    const requirement = getPrestigeRequirement(prestigeLevel);
    asteroidsClaimed -= requirement.normal;
    specialAsteroids -= requirement.special;
    prestigeLevel++;
    localStorage.setItem("orbit-claims", String(asteroidsClaimed));
    localStorage.setItem("orbit-special-claims", String(specialAsteroids));
    localStorage.setItem("orbit-prestige", String(prestigeLevel));
    return true;
}
function isSkinUnlocked(skin: { required: number; boss?: boolean; secret?: boolean; prestige?: number; golden?: boolean }, index?: number) { return localStorage.getItem("orbit-unlock-skins") === "1" || (index !== undefined && isSpinCosmeticUnlocked("skin", index)) || (skin.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : skin.prestige !== undefined ? prestigeLevel >= skin.prestige : skin.boss ? localStorage.getItem("orbit-boss-defeated") === "1" : skin.secret ? localStorage.getItem("orbit-secret-unlocked") === "1" : asteroidsClaimed >= skin.required); }
function getUnlockedSkinCount() { return skins.filter(isSkinUnlocked).length; }
function isAvatarUnlocked(avatar: AvatarStyle) { return localStorage.getItem("orbit-unlock-avatars") === "1" || (avatar.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : avatar.prestige !== undefined ? prestigeLevel >= avatar.prestige : avatar.jackpot ? localStorage.getItem("orbit-jackpot-avatar") === "1" : true); }
function isTrailUnlocked(trail: TrailStyle) { return localStorage.getItem("orbit-unlock-trails") === "1" || (trail.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : trail.prestige !== undefined ? prestigeLevel >= trail.prestige : trail.boss ? localStorage.getItem("orbit-boss-defeated") === "1" : trail.secret ? localStorage.getItem("orbit-secret-unlocked") === "1" : asteroidsClaimed >= trail.required); }
function getUnlockedTrailCount() { return trails.filter(isTrailUnlocked).length; }
function formatTime(milliseconds: number) { const total = Math.max(0, Math.floor(milliseconds)); const minutes = Math.floor(total / 60000).toString().padStart(2, "0"); const seconds = Math.floor(total / 1000 % 60).toString().padStart(2, "0"); const millis = (total % 1000).toString().padStart(3, "0"); return `${minutes}:${seconds}.${millis}`; }
