const playerLabel = document.createElement("div");
const world = document.createElement("main");
const claimLabel = document.createElement("span");
const levelLabel = document.createElement("span");
const statusLabel = document.createElement("p");
const bossLabel = document.createElement("span");
const timerLabel = document.createElement("span");
const areaLabel = document.createElement("span");

type Box = { x: number; y: number; width: number; height: number };
type Obstacle = Box & { airborne?: boolean; barrier?: boolean; goalLock?: boolean; boundary?: boolean };
type Asteroid = { x: number; y: number; claimed: boolean; special: boolean };
type Hazard = { x: number; y: number; width: number; height: number; kind: "spikes" | "gravity" };
type Enemy = { x: number; y: number; defeated: boolean };
type Projectile = { x: number; y: number; vx: number; vy: number; element: HTMLElement; owner: "player" | "enemy" };
type PowerupKind = "shield" | "boost" | "rapid" | "cannon" | "star";
type Powerup = { x: number; y: number; kind: PowerupKind; collected: boolean };
type LevelKey = { id: string; x: number; y: number; collected: boolean; requiresPortal: boolean };
type Boss = { x: number; y: number; health: number; maxHealth: number; defeated: boolean };
type MiniBoss = { x: number; y: number; health: number; maxHealth: number; defeated: boolean };
type TrailStyle = { name: string; color: string; required: number; effect: "ember" | "comet" | "spark" | "ribbon" | "arc"; secret?: boolean; boss?: boolean; golden?: boolean; prestige?: number };
type PrestigeShipArt = "stellar-guard" | "quantum-dancer" | "cosmic-queen" | "void-knight" | "eclipse-oracle" | "infinity-pilot" | "stellar-legend";
type AvatarStyle = { name: string; color: string; shape: "classic" | "dart" | "ring" | "blade"; required: number; image?: string; cssArt?: PrestigeShipArt; defaultSkin: number; prestige?: number; golden?: boolean; jackpot?: boolean };
type FlippedRoute = { walls: number[]; enemies: number[]; spikes: number[]; gravity: number[]; key?: number };
type SecretKeyPlacement = { id: string; index: number; y?: number; requiresPortal?: boolean };
type SecretPortal = { index: number; secretId: string; y?: number };
type Level = { name: string; briefing: string; length: number; asteroids: number[]; walls: number[]; enemies: number[]; spikes: number[]; gravity: number[]; portals?: number[]; secretPortals?: SecretPortal[]; flip?: number[]; flippedRoute?: FlippedRoute; powerups?: { index: number; kind: PowerupKind }[]; key?: number; secretKey?: SecretKeyPlacement; secretId?: string; specialAsteroids?: number[]; miniBosses?: number[]; boss?: boolean; bossIndex?: number; secret?: boolean; prestige?: boolean };
type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
type CosmeticGroup = "skin" | "trail" | "avatar";

const TILE_WIDTH = 180;
const PORTAL_Y = 175;
const PORTAL_SIZE = 58;
const CEILING_Y = 20;
const FLOOR_Y = 300;
const SPECIAL_ASTEROID_ODDS: Record<Rarity, number> = { Common: 52, Uncommon: 27, Rare: 13, Epic: 6, Legendary: 2 };
const SPECIAL_ASTEROID_REWARD_RANGES: Record<Rarity, readonly [number, number]> = { Common: [50, 100], Uncommon: [101, 250], Rare: [251, 500], Epic: [501, 750], Legendary: [751, 1000] };
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
    { name: "Eclipse Vault", briefing: "A hidden route beyond the fourth asteroid. Find the vault and claim its impossible light.", length: 19, asteroids: [2, 4, 7, 10, 13, 16], walls: [3, 6, 9, 12, 15], enemies: [5, 11, 17], spikes: [4, 8, 14], gravity: [7, 16], powerups: [{ index: 6, kind: "shield" }, { index: 14, kind: "boost" }], specialAsteroids: [2, 4, 7, 10, 13, 16], secret: true, secretId: "eclipse", secretPortals: [{ index: 2, secretId: "eclipse" }] },
    { name: "Comet Nursery", briefing: "Young comets cut across the route. Claim their bright cores and keep your aim ready.", length: 26, asteroids: [2, 6, 10, 14, 18, 22], walls: [4, 8, 12, 16, 20], enemies: [7, 13, 19, 24], spikes: [5, 11, 17, 23], gravity: [9, 21], powerups: [{ index: 3, kind: "cannon" }, { index: 15, kind: "shield" }], miniBosses: [18] },
    { name: "Prism Citadel", briefing: "The citadel's walls fold light around its guardians. Break the second titan before the beacon.", length: 32, asteroids: [3, 7, 11, 15, 19, 23, 27, 30], walls: [5, 9, 13, 17, 21, 25, 29], enemies: [6, 14, 22, 28], spikes: [8, 12, 20, 26], gravity: [10, 18, 24], powerups: [{ index: 4, kind: "shield" }, { index: 16, kind: "cannon" }, { index: 26, kind: "boost" }], miniBosses: [12, 24], boss: true },
    { name: "Afterglow Station", briefing: "A final station waits beyond the old lanes. Its archive key is hidden over the destination portal.", length: 35, asteroids: [3, 7, 11, 15, 19, 23, 27, 31, 33], walls: [5, 9, 13, 17, 21, 25, 29], enemies: [6, 14, 22, 30], spikes: [8, 12, 20, 28, 33], gravity: [10, 18, 26, 32], portals: [9, 31], secretKey: { id: "archive", index: 31, y: 58, requiresPortal: true }, powerups: [{ index: 4, kind: "cannon" }, { index: 16, kind: "shield" }, { index: 28, kind: "boost" }], miniBosses: [12, 26], boss: true },
    { name: "Nebula Hollow", briefing: "A moonlit key opens this silent passage. Drift through the dark and find the hidden beacon.", length: 25, asteroids: [3, 7, 11, 15, 19, 22], walls: [5, 9, 13, 17, 21], enemies: [6, 14, 20], spikes: [8, 12, 18], gravity: [10, 16, 22], powerups: [{ index: 4, kind: "shield" }, { index: 14, kind: "cannon" }], specialAsteroids: [3, 7, 11, 15, 19, 22], secret: true, secretId: "nebula", secretPortals: [{ index: 2, secretId: "nebula" }] },
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
let lastJumpDirection = 0;
let starPowerupActive = false;
let starPowerupTimer = 0;
let starPowerupElement: HTMLElement | null = null;
const pressedKeys = new Set<string>();
const gravity = 0.7;
const jumpPower = -16;
const playerWidth = 48;
const playerHeight = 58;
const powerupPrices: Record<PowerupKind, number> = { shield: 8, boost: 10, rapid: 12, cannon: 15, star: 9999 };
const powerupLabels: Record<PowerupKind, string> = { shield: "Shield", boost: "Boost", rapid: "Rapid Fire", cannon: "Cannon", star: "Rainbow Star" };
const prestigeRouteNames = ["Violet Meridian", "Moonfall Circuit", "Amethyst Rift", "Crown of Saturn", "Lilac Nebula", "Oracle's Reach", "Prismatic Grave", "The White Eclipse", "Sovereign Drift", "Astral Citadel", "Veil of Io", "Radiant Ruin", "Dusk Cathedral", "Nova Labyrinth", "Purple Eventide", "The Inverted Sea", "Halo of Ash", "Sable Aurora", "Titan's Throne", "Infinity Crown"];

function loadCustomLevels() {
    try {
        const saved = JSON.parse(localStorage.getItem("orbit-custom-levels") ?? "[]") as Level[];
        levels.push(...saved.map((level) => ({
            ...level,
            // Old non-prestige workshop saves may contain a flipped route. It is
            // intentionally ignored so normal routes retain ordinary gravity only.
            flip: level.prestige ? level.flip : undefined,
            flippedRoute: level.prestige ? level.flippedRoute : undefined,
            secret: Boolean(level.secret),
            boss: Boolean(level.boss),
            prestige: Boolean(level.prestige),
        })));
    } catch { }
    const normalCount = levels.filter((level) => !level.secret && !level.prestige).length;
    for (let index = normalCount; index < 20; index++) {
        levels.splice(Math.min(index, levels.length), 0, { name: `Frontier ${index + 1}`, briefing: "A longer route on the blue planet. Reach the beacon and claim the whole lane.", length: 28 + index, asteroids: [3, 7, 11, 15, 19, 23], walls: [5, 9, 13, 17, 21, 25], enemies: [8, 16, 24], spikes: [6, 14, 22], gravity: [10, 20], portals: [12, 26], boss: index === 19 });
    }
    for (let index = 0; index < 20; index++) {
        levels.push({ name: prestigeRouteNames[index], briefing: "A longer route around the ringed planet. Planetary flip fields reveal the upper lane.", length: 38 + index, asteroids: [3, 8, 13, 18, 23, 28, 33], walls: [5, 10, 15, 20, 25, 30], enemies: [7, 17, 27, 35], spikes: [6, 14, 24, 32], gravity: [11, 21, 31], flip: [11, 31], boss: index === 19, prestige: true });
    }
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

function configurePortalDistribution() {
    levels.forEach((level) => { level.portals = []; level.secretPortals = undefined; });
    const secretLevels = levels.map((level, index) => ({ level, index })).filter(({ level }) => level.secret);
    secretLevels.forEach(({ level, index }) => {
        if (!level.secretId) level.secretId = `secret-level-${index + 1}`;
        level.secretPortals = [{ index: getHiddenPortalIndex(level), y: getHiddenPortalY(), secretId: level.secretId }];
    });

    const normalSources = levels.map((level, index) => ({ level, index })).filter(({ level }) => !level.secret && !level.prestige);
    const prestigeSources = levels.map((level, index) => ({ level, index })).filter(({ level }) => !level.secret && level.prestige);
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
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", () => pressedKeys.clear());
    showMenu();
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
    if (hasClearedPrestigeGate() && prestigeLevel < prestigeMax) {
        const claimPrestige = createMenuButton(canClaimPrestige() ? "Claim prestige" : "Claim prestige / requirements unmet", () => { if (tryPrestige()) showMenu(); });
        claimPrestige.disabled = !canClaimPrestige();
        claimPrestige.classList.add("claim-prestige");
        menuActions.append(claimPrestige);
    }
    const secondaryActions = document.createElement("div"); secondaryActions.className = "secondary-actions"; secondaryActions.append(createTextButton("Special asteroid odds", showDropRates), createTextButton("Credits", showCredits));
    menu.append(menuActions, secondaryActions);
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
        const menu = document.createElement("main");
        menu.className = "menu-screen level-menu";
        menu.innerHTML = `<p class="eyebrow">MISSION SELECT / ${activePlanet === "prestige" ? "RINGED PLANET" : "BLUE PLANET"}</p><h1>Choose your <em>sector</em></h1><p class="menu-copy">Claim the asteroids in order. New sectors unlock after the previous beacon is reached.</p>`;
        const planetButton = createMenuButton(activePlanet === "normal" ? "Fly to prestige planet" : "Return to blue planet", switchPlanet);
        if (activePlanet === "normal" && prestigeLevel < 2) {
            planetButton.disabled = true;
            planetButton.textContent = "Prestige planet locked / reach prestige 2";
            planetButton.classList.add("locked");
        }
        menu.append(planetButton);
    const levelList = document.createElement("div");
    levelList.className = "level-list";
    levels.forEach((level, index) => {
        if (level.secret || Boolean(level.prestige) !== (activePlanet === "prestige")) return;
        const visibleLevels = levels.filter((candidate) => !candidate.secret && Boolean(candidate.prestige) === (activePlanet === "prestige"));
        const routeIndex = visibleLevels.indexOf(level);
        const unlocked = level.secret ? isSecretLevelUnlocked(level) : routeIndex === 0 || Number(localStorage.getItem(`orbit-level-${index}`) ?? "0") === 1;
        const button = document.createElement("button");
        button.className = `level-button ${level.secret ? "secret-level" : ""} ${unlocked ? "" : "locked"}`;
        button.type = "button";
        button.disabled = !unlocked;
        const prestigeUnlocked = prestigeLevel >= 2 || routeIndex === 0;
        button.disabled = !unlocked || (activePlanet === "prestige" && !prestigeUnlocked);
        button.innerHTML = `<span><b>${String(routeIndex + 1).padStart(2, "0")}</b> ${level.name}</span><small>${button.disabled ? "LOCKED / reach prestige 2" : `${level.asteroids.length} asteroids / ${level.briefing}`}</small>`;
        if (!button.disabled) button.addEventListener("click", () => startGame(index));
        levelList.append(button);
    });
    const secretGate = document.createElement("button");
    secretGate.className = "secret-gate";
    secretGate.type = "button";
    secretGate.innerHTML = "<span aria-hidden=\"true\">◯</span><b>Secret space</b><small>Open discovered routes</small>";
    secretGate.addEventListener("click", showSecretLevels);
    const missionActions = document.createElement("nav"); missionActions.className = "secondary-actions";
    missionActions.append(createTextButton("Leaderboard", showLeaderboard), createTextButton("Customization", showCustomization), createTextButton("Shop", showShop), createTextButton("Settings", showSettings), createTextButton("Main menu", showMenu));
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
        <p class="menu-copy">Complete all ${normalTotal} normal routes to unlock the Golden Body skin.</p>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${goldenProgress}%"></div>
        </div>
        <small>${normalCompleted} / ${normalTotal} routes completed (${Math.round(goldenProgress)}%)</small>
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
        const button = document.createElement("button"); button.className = `loadout-choice ${selectedSkin === skin.originalIndex ? "selected" : ""}`; button.disabled = !isSkinUnlocked(skin);
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
            if (isSkinUnlocked(skins[avatar.defaultSkin])) { selectedSkin = avatar.defaultSkin; localStorage.setItem("orbit-skin", String(selectedSkin)); }
            localStorage.setItem("orbit-avatar", String(selectedAvatar)); showCustomization();
        }); return button;
    });
    layout.append(panel, preview);
    menu.append(layout, createTextButton("Back", showMenu), createPageCounter()); document.body.replaceChildren(menu);
}

function showCredits() {
    const menu = document.createElement("main"); menu.className = "menu-screen credits-screen";
    menu.innerHTML = `<p class="eyebrow">ORBIT RUN / CREDITS</p><h1>Made by <em>the crew</em></h1><p class="menu-copy">A small flight team built every route, ship, and secret.</p><section class="credits-list"><b>Matthew</b><b>Mr. Cline</b><b>River</b></section>`;
    menu.append(createTextButton("Back", showMenu)); document.body.replaceChildren(menu);
}

function showLeaderboard() {
    const menu = document.createElement("main"); menu.className = "menu-screen leaderboard-screen";
    const records = levels.flatMap((level, index) => { const value = Number(localStorage.getItem(`orbit-best-${index}`) ?? "0"); return value ? [{ name: level.name, value }] : []; }).sort((a, b) => a.value - b.value).slice(0, 12);
    menu.innerHTML = `<p class="eyebrow">FLIGHT DATA / FASTEST RUNS</p><h1>Time <em>leaderboard</em></h1><p class="menu-copy">Your best clear for each route is saved locally on this device.</p>`;
    const list = document.createElement("section"); list.className = "leaderboard-list";
    list.innerHTML = records.length ? records.map((record, index) => `<div><b>${String(index + 1).padStart(2, "0")}</b><span>${record.name}</span><strong>${formatTime(record.value)}</strong></div>`).join("") : "<p class=\"menu-copy\">No completed runs yet.</p>";
    menu.append(list, createTextButton("Mission select", showLevelMenu), createTextButton("Back", showMenu)); document.body.replaceChildren(menu);
}

function showLevelMaker() {
    const menu = document.createElement("main"); menu.className = "menu-screen maker-screen";
    menu.innerHTML = `<p class="eyebrow">JACER WORKSHOP / LEVEL EDITOR</p><h1>Build a <em>route</em></h1><p class="menu-copy">Normal routes support ordinary anti-gravity only. Turn on Prestige route to add a separate flipped-planet area.</p>`;
    const toolbar = document.createElement("nav"); toolbar.className = "maker-toolbar";
    const undo = document.createElement("button"); undo.className = "maker-tool-button"; undo.type = "button"; undo.textContent = "Undo";
    const clear = document.createElement("button"); clear.className = "maker-tool-button danger"; clear.type = "button"; clear.textContent = "Clear";
    const modeLabel = document.createElement("span"); modeLabel.className = "maker-mode-label"; modeLabel.textContent = "BUILD MODE";
    const buildMode = document.createElement("button"); buildMode.className = "maker-tool-button selected"; buildMode.type = "button"; buildMode.textContent = "Build";
    const eraseMode = document.createElement("button"); eraseMode.className = "maker-tool-button"; eraseMode.type = "button"; eraseMode.textContent = "Delete";
    toolbar.append(undo, clear, modeLabel, buildMode, eraseMode);
    const prestigeToggle = document.createElement("label"); prestigeToggle.className = "maker-mode-label"; prestigeToggle.innerHTML = `<input type="checkbox"> Prestige route`; toolbar.append(prestigeToggle);
    const prestigeRouteInput = prestigeToggle.querySelector<HTMLInputElement>("input")!;
    const areaState = document.createElement("span"); areaState.className = "maker-area-state";
    const palette = document.createElement("nav"); palette.className = "maker-palette";
    const tiles = ["empty", "wall", "spike", "gravity", "portal", "asteroid", "special", "enemy", "miniBoss", "titan", "powerupShield", "powerupBoost", "powerupRapid", "powerupCannon", "powerupStar"];
    const powerupTileKinds: Record<string, PowerupKind> = { powerupShield: "shield", powerupBoost: "boost", powerupRapid: "rapid", powerupCannon: "cannon", powerupStar: "star" };
    const makerCellClass = (kind: string) => `maker-cell ${kind}${powerupTileKinds[kind] ? ` powerup ${powerupTileKinds[kind]}` : ""}`;
    let selectedTile = "wall";
    let deleteMode = false;
    const history: string[][] = [];
    const tileLabels: Record<string, string> = { empty: "Erase", wall: "Platform", miniBoss: "Dark Knight", titan: "Titan", special: "Special asteroid" };
    tileLabels.powerupShield = "Shield power-up"; tileLabels.powerupBoost = "Boost power-up"; tileLabels.powerupRapid = "Rapid power-up"; tileLabels.powerupCannon = "Cannon power-up"; tileLabels.powerupStar = "Rainbow Star";
    tiles.forEach((tile) => { const button = createTextButton(tileLabels[tile] ?? tile, () => { selectedTile = tile; deleteMode = false; buildMode.classList.add("selected"); eraseMode.classList.remove("selected"); palette.querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item.dataset.tile === tile)); }); button.dataset.tile = tile; button.classList.toggle("selected", tile === selectedTile); palette.append(button); });
    const grid = document.createElement("div"); grid.className = "maker-grid"; grid.setAttribute("aria-label", "Normal area grid");
    const cells = Array.from({ length: 144 }, (_, index) => { const cell = document.createElement("button"); cell.type = "button"; cell.className = makerCellClass("empty"); cell.dataset.kind = "empty"; cell.textContent = ""; cell.setAttribute("aria-label", `Tile ${index + 1}`); cell.addEventListener("click", () => { history.push(cells.map((item) => item.dataset.kind ?? "empty")); const next = deleteMode ? "empty" : selectedTile; cell.dataset.kind = next; cell.className = makerCellClass(next); cell.textContent = next === "empty" ? "" : next === "gravity" ? "" : powerupTileKinds[next] ? powerupLabels[powerupTileKinds[next]].slice(0, 1) : ""; }); grid.append(cell); return cell; });
    const restore = (snapshot: string[]) => cells.forEach((cell, index) => { const kind = snapshot[index] ?? "empty"; cell.dataset.kind = kind; cell.className = makerCellClass(kind); cell.textContent = powerupTileKinds[kind] ? powerupLabels[powerupTileKinds[kind]].slice(0, 1) : ""; });
    const flippedTab = document.createElement("button"); flippedTab.className = "maker-tool-button"; flippedTab.type = "button"; flippedTab.textContent = "Flipped planet area"; flippedTab.hidden = true;
    const flippedGrid = document.createElement("div"); flippedGrid.className = "maker-grid"; flippedGrid.hidden = true; flippedGrid.setAttribute("aria-label", "Flipped planet area grid");
    const flippedCells = Array.from({ length: 144 }, (_, index) => { const cell = document.createElement("button"); cell.type = "button"; cell.className = makerCellClass("empty"); cell.dataset.kind = "empty"; cell.setAttribute("aria-label", `Flipped tile ${index + 1}`); cell.addEventListener("click", () => { const next = deleteMode ? "empty" : selectedTile; cell.dataset.kind = next; cell.className = makerCellClass(next); cell.textContent = powerupTileKinds[next] ? powerupLabels[powerupTileKinds[next]].slice(0, 1) : ""; }); flippedGrid.append(cell); return cell; });
    const showMainGrid = () => { grid.hidden = false; flippedGrid.hidden = true; buildMode.textContent = "Build"; };
    flippedTab.addEventListener("click", () => { grid.hidden = true; flippedGrid.hidden = false; buildMode.textContent = "Flipped build"; });
    const updateFlippedTab = () => {
        const canBuildFlippedArea = prestigeRouteInput.checked && cells.some((cell) => cell.dataset.kind === "gravity");
        flippedTab.hidden = !canBuildFlippedArea;
        areaState.textContent = prestigeRouteInput.checked ? (canBuildFlippedArea ? "PRESTIGE / normal + flipped planet areas" : "PRESTIGE / add an anti-gravity zone to unlock flipped area") : "NORMAL / anti-gravity only";
        if (flippedTab.hidden) showMainGrid();
    };
    grid.addEventListener("click", updateFlippedTab); prestigeRouteInput.addEventListener("change", updateFlippedTab);
    undo.addEventListener("click", () => { const snapshot = history.pop(); if (snapshot) restore(snapshot); });
    clear.addEventListener("click", () => { history.push(cells.map((item) => item.dataset.kind ?? "empty")); restore([]); });
    buildMode.addEventListener("click", () => { deleteMode = false; modeLabel.textContent = "BUILD MODE"; buildMode.classList.add("selected"); eraseMode.classList.remove("selected"); });
    eraseMode.addEventListener("click", () => { deleteMode = true; modeLabel.textContent = "DELETE MODE"; eraseMode.classList.add("selected"); buildMode.classList.remove("selected"); });
    const saveRoute = (startImmediately: boolean) => {
        const level: Level = { name: `Workshop ${Date.now().toString().slice(-4)}`, briefing: "A route assembled in the grid workshop.", length: 24, asteroids: [], walls: [], enemies: [], spikes: [], gravity: [], portals: [], flip: [], specialAsteroids: [], miniBosses: [], powerups: [], prestige: prestigeRouteInput.checked };
        cells.forEach((cell, index) => { const tile = cell.dataset.kind ?? "empty"; const column = index % 24; if (tile === "asteroid" || tile === "special") level.asteroids.push(column + 1); if (tile === "special") level.specialAsteroids?.push(column + 1); if (tile === "wall") level.walls.push(column + 1); if (tile === "enemy") level.enemies.push(column + 1); if (tile === "spike") level.spikes.push(column + 1); if (tile === "gravity") level.gravity.push(column + 1); if (tile === "portal") level.portals?.push(column + 1); if (tile === "miniBoss") level.miniBosses?.push(column + 1); if (tile === "titan") { level.boss = true; level.bossIndex = column + 1; } if (powerupTileKinds[tile]) level.powerups?.push({ index: column + 1, kind: powerupTileKinds[tile] }); });
        if (level.prestige && level.gravity.length) { const route: FlippedRoute = { walls: [], enemies: [], spikes: [], gravity: [], key: 19 }; flippedCells.forEach((cell, index) => { const column = index % 24 + 1; if (cell.dataset.kind === "wall") route.walls.push(column); if (cell.dataset.kind === "enemy") route.enemies.push(column); if (cell.dataset.kind === "spike") route.spikes.push(column); if (cell.dataset.kind === "gravity") route.gravity.push(column); if (cell.dataset.kind === "asteroid" || cell.dataset.kind === "special") route.key = column; }); level.flippedRoute = route; }
        const saved = JSON.parse(localStorage.getItem("orbit-custom-levels") ?? "[]") as Level[]; saved.push(level); localStorage.setItem("orbit-custom-levels", JSON.stringify(saved)); levels.push(level); if (startImmediately) startGame(levels.length - 1); else showLevelMenu();
    };
    const save = createMenuButton("Save custom route", () => saveRoute(false));
    const saveAndTest = createMenuButton("Save and test route", () => saveRoute(true));
    updateFlippedTab();
    toolbar.append(areaState, flippedTab); menu.append(toolbar, grid, flippedGrid, palette, save, saveAndTest, createTextButton("Normal area", showMainGrid), createTextButton("Back to tester", showTesterPanel)); document.body.replaceChildren(menu);
}

function createTextButton(text: string, action: () => void) {
    const button = document.createElement("button");
    button.className = "text-button";
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
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
    wheel.innerHTML = `<div class="wheel-ring"><span>✦</span></div><b>ASTEROID ROLL</b><small>1 special asteroid / 50-1,000 normal asteroids / prestige cosmetics on Epic+ tiers</small>`;
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
        const resultCopy = getNormalSpinReward(rarity);
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
    odds.innerHTML = `<b>Special asteroid odds</b>${(Object.keys(SPECIAL_ASTEROID_ODDS) as Rarity[]).map((rarity) => `<span>${rarity} ${SPECIAL_ASTEROID_ODDS[rarity]}%</span>`).join("")}`;
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
    for (const rarity of Object.keys(SPECIAL_ASTEROID_ODDS) as Rarity[]) {
        threshold += SPECIAL_ASTEROID_ODDS[rarity];
        if (roll < threshold) return rarity;
    }
    return "Common";
}

function getNormalSpinReward(rarity: Rarity) {
    const [minimum, maximum] = SPECIAL_ASTEROID_REWARD_RANGES[rarity];
    const reward = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
    asteroidsClaimed += reward;
    localStorage.setItem("orbit-claims", String(asteroidsClaimed));
    if (rarity === "Legendary") {
        const jackpotTrail = trails.findIndex((trail) => trail.name === "Jackpot Spark");
        unlockSpinCosmetic("trail", jackpotTrail);
        unlockSpinCosmetic("avatar", avatars.findIndex((avatar) => avatar.jackpot));
        selectedTrail = jackpotTrail;
        localStorage.setItem("orbit-trail", String(selectedTrail));
        localStorage.setItem("orbit-jackpot-avatar", "1");
    }
    if (rarity === "Epic" || rarity === "Legendary") {
        const allCosmetics = [
            ...skins.map((item, index) => ({ group: "skin" as const, index, item })),
            ...trails.map((item, index) => ({ group: "trail" as const, index, item })),
            ...avatars.map((item, index) => ({ group: "avatar" as const, index, item })),
        ];
        const matching = allCosmetics.filter((c) => getCosmeticRarity(c.item) === rarity);
        const unclaimed = matching.filter((c) => !isSpinCosmeticUnlocked(c.group, c.index));
        const pool = unclaimed.length ? unclaimed : matching.length ? matching : allCosmetics;
        if (pool.length) {
            const chosen = pool[Math.floor(Math.random() * pool.length)];
            unlockSpinCosmetic(chosen.group, chosen.index);
            if (chosen.group === "skin") { selectedSkin = chosen.index; localStorage.setItem("orbit-skin", String(selectedSkin)); }
            if (chosen.group === "trail") { selectedTrail = chosen.index; localStorage.setItem("orbit-trail", String(selectedTrail)); }
            if (chosen.group === "avatar") { selectedAvatar = chosen.index; localStorage.setItem("orbit-avatar", String(selectedAvatar)); }
        }
    }
    return {
        title: `You got <em>${reward} asteroids</em>`,
        description: rarity === "Legendary" ? "Jackpot Spark and Jackpot Crown were added to your collection." : `${rarity} asteroid cache secured.`,
    };
}

function showDropRates() {
    gameActive = false;
    cancelAnimationFrame(animationFrame);
    const menu = document.createElement("main");
    menu.className = "menu-screen drop-rates-screen";
    menu.innerHTML = `<p class="eyebrow">SPECIAL ASTEROID / DROP RATES</p><h1>Know the <em>odds</em></h1><p class="menu-copy">Every special-asteroid spin rolls exactly one tier. Higher tiers are rarer and give better asteroid caches or prestige cosmetics.</p>`;
    const odds = document.createElement("section");
    odds.className = "rarity-odds";
    // Organize from Legendary to Common (highest to lowest rarity)
    const rarityOrder: Rarity[] = ["Legendary", "Epic", "Rare", "Uncommon", "Common"];
    rarityOrder.forEach((rarity) => {
        const item = document.createElement("article");
        item.className = `rarity-odds-card rarity-${rarity.toLowerCase()}`;
        const [minimum, maximum] = SPECIAL_ASTEROID_REWARD_RANGES[rarity];
        const rewardText = `${minimum.toLocaleString()}-${maximum.toLocaleString()} normal asteroids`;
        item.innerHTML = `${createRarityBadge(rarity)}<strong>${SPECIAL_ASTEROID_ODDS[rarity]}%</strong><small>${rewardText}</small>`;
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
        group.innerHTML = `<h2>${collection.title}</h2><div>${collection.items.map((item) => `<span>${item.name}${createRarityBadge(getCosmeticRarity(item))}</span>`).join("")}</div>`;
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
    menu.innerHTML = `<p class="eyebrow">FLIGHT SYSTEMS / TESTER LOGIN</p><h1>Enter <em>keyword</em></h1><p class="menu-copy">Tester tools are local to this device. Enter the keyword to open the adjustment panel.</p>`;
    const form = document.createElement("form");
    form.className = "tester-login";
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "off";
    input.placeholder = "Keyword";
    input.setAttribute("aria-label", "Tester keyword");
    const message = document.createElement("small");
    const submit = document.createElement("button");
    submit.className = "menu-button";
    submit.type = "submit";
    submit.textContent = "Enter tester tools";
    form.append(input, submit, message);
    form.addEventListener("submit", (event) => { event.preventDefault(); if (input.value === "T3ster!") showTesterPanel(); else { message.textContent = "Keyword not recognized."; message.className = "tester-error"; } });
    menu.append(form, createTextButton("Back to settings", showSettings));
    document.body.replaceChildren(menu);
    input.focus();
}

function showTesterPanel() {
    const menu = document.createElement("main");
    menu.className = "menu-screen tester-screen";
    menu.innerHTML = `<p class="eyebrow">TESTER TOOLS / LOCAL SAVE</p><h1>Adjust the <em>run</em></h1><p class="menu-copy">Apply changes to make them appear across the game immediately.</p>`;
    const form = document.createElement("form");
    form.className = "tester-panel";
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
        showTesterPanel();
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
    const normalUnlock = createTextButton("Unlock normal levels", () => { unlockLevels((level) => !level.secret && !level.prestige); showTesterPanel(); });
    const secretUnlock = createTextButton("Unlock secret levels", () => { unlockLevels((level) => Boolean(level.secret)); localStorage.setItem("orbit-secret-unlocked", "1"); showTesterPanel(); });
    const prestigeUnlock = createTextButton("Unlock prestige levels", () => { unlockLevels((level) => Boolean(level.prestige)); prestigeLevel = Math.max(prestigeLevel, 2); localStorage.setItem("orbit-prestige", String(prestigeLevel)); showTesterPanel(); });
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
            label.append(input, document.createTextNode(level.name)); groupPanel.append(label);
        });
        levelChoices.append(groupPanel);
    });
    form.append(levelChoices);
    form.append(createTextButton("Try prestige planet", () => { if (activePlanet === "normal") switchPlanet(); else showLevelMenu(); }));
    const customTitle = document.createElement("p");
    customTitle.className = "setting-title";
    customTitle.textContent = "Post a new level";
    form.append(customTitle);
    const customFields = document.createElement("div");
    customFields.className = "custom-level-fields";
    customFields.innerHTML = `<input name="custom-name" placeholder="Level name (optional)"><input name="custom-briefing" placeholder="Briefing (optional)"><input name="custom-length" type="number" min="8" max="60" value="18" placeholder="Length"><input name="custom-asteroids" placeholder="Asteroid tiles: 2,5,8"><input name="custom-walls" placeholder="Wall tiles: 4,9"><input name="custom-enemies" placeholder="Enemy tiles: 6,12"><input name="custom-spikes" placeholder="Spike tiles: 5,10"><input name="custom-gravity" placeholder="Gravity tiles: 8,14"><label><input name="custom-secret" type="checkbox"> Secret route</label><label><input name="custom-boss" type="checkbox"> Add boss</label><label><input name="custom-prestige" type="checkbox"> Prestige route</label>`;
    form.append(customFields);
    
    // Powerup selection for level creator
    const powerupFields = document.createElement("div");
    powerupFields.className = "custom-level-fields";
    powerupFields.innerHTML = `<p class="setting-title">Powerups (index,kind: 5,shield 12,rapid)</p><input name="custom-powerups" placeholder="Powerup tiles: index,kind pairs">`;
    form.append(powerupFields);
    form.append(createTextButton("Open level maker", showLevelMaker));
    const resetTitle = document.createElement("p");
    resetTitle.className = "setting-title tester-reset-title";
    resetTitle.textContent = "Reset tester data";
    const resetPanel = document.createElement("div");
    resetPanel.className = "tester-reset-panel";
    resetPanel.innerHTML = "<small>Remove all saved progress, unlocks, custom levels, and inventory from this game.</small>";
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
    apply.className = "menu-button"; apply.type = "submit"; apply.textContent = "Apply tester changes";
    form.append(apply);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
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
        const value = (name: string) => (form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "").trim();
        const numbers = (name: string) => value(name).split(",").map(Number).filter((number) => Number.isInteger(number) && number > 0);
        const customName = value("custom-name");
        if (customName) {
            const isSecret = Boolean(form.querySelector<HTMLInputElement>("[name=custom-secret]")?.checked);
            const isPrestige = Boolean(form.querySelector<HTMLInputElement>("[name=custom-prestige]")?.checked);
            const secretId = isSecret ? `custom-${Date.now()}` : undefined;
            // Parse powerups: "index,kind index,kind" format
            const powerupValue = value("custom-powerups");
            const powerups: { index: number; kind: PowerupKind }[] = [];
            if (powerupValue) {
                powerupValue.split(" ").forEach((pair) => {
                    const [indexStr, kindStr] = pair.split(",");
                    const index = Number(indexStr);
                    const kind = kindStr as PowerupKind;
                    if (Number.isInteger(index) && index > 0 && powerupPrices[kind] !== undefined) {
                        powerups.push({ index, kind });
                    }
                });
            }
            const customLevel: Level = { name: customName, briefing: value("custom-briefing") || "Custom route.", length: Math.max(8, Number(value("custom-length")) || 18), asteroids: numbers("custom-asteroids"), walls: numbers("custom-walls"), enemies: numbers("custom-enemies"), spikes: numbers("custom-spikes"), gravity: numbers("custom-gravity"), secret: isSecret, secretId, boss: Boolean(form.querySelector<HTMLInputElement>("[name=custom-boss]")?.checked), prestige: isPrestige, powerups };
            const saved = JSON.parse(localStorage.getItem("orbit-custom-levels") ?? "[]") as Level[];
            saved.push(customLevel);
            localStorage.setItem("orbit-custom-levels", JSON.stringify(saved));
            if (secretId) localStorage.setItem(`orbit-key-${secretId}`, "1");
            levels.push(customLevel);
        }
        showTesterPanel();
    });
    menu.append(form, createTextButton("Exit tester tools", showMenu));
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
}

function buildLevel(levelIndex: number) {
    const level = levels[levelIndex];
    const claimedAsteroids = getClaimedAsteroids(levelIndex);
    levelAsteroids = level.asteroids.map((index, asteroidIndex) => ({ x: 140 + index * TILE_WIDTH, y: 215 - (index % 2) * 55, claimed: claimedAsteroids.has(asteroidIndex), special: Boolean(level.secret) || (level.specialAsteroids ?? []).includes(index) }));
    const groundObstacles = level.walls.map((index, wallIndex) => ({ x: 140 + index * TILE_WIDTH, y: wallIndex % 2 ? 250 : 330, width: wallIndex % 2 ? 105 : 70, height: wallIndex % 2 ? 150 : 70 }));
    // Only prestige routes use the upper planetary lane. Normal and normal
    // secret routes still keep their regular anti-gravity zones.
    const airborneObstacles: Obstacle[] = level.prestige
        ? level.walls.filter((_, wallIndex) => wallIndex % 2 === 0).map((index, wallIndex) => ({
            x: 140 + index * TILE_WIDTH,
            y: 112 + (wallIndex % 2) * 22,
            width: 92,
            height: 52,
            airborne: true,
        }))
        : [];
    levelObstacles = [...groundObstacles, ...airborneObstacles];
    levelHazards = [...level.spikes.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 380, width: 76, height: 20, kind: "spikes" as const })), ...level.gravity.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 110, width: 115, height: 250, kind: "gravity" as const }))];
    levelEnemies = level.enemies.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 285, defeated: false }));
    levelPowerups = (level.powerups ?? []).map((powerup) => ({ x: 140 + powerup.index * TILE_WIDTH, y: 170, kind: powerup.kind, collected: false }));
    // Random chance to spawn a Rainbow Star powerup (very rare, can't be bought)
    if (Math.random() < 0.03) { // 3% chance per level
        const starIndex = 3 + Math.floor(Math.random() * (level.length - 6));
        levelPowerups.push({ x: 140 + starIndex * TILE_WIDTH, y: 170, kind: "star", collected: false });
    }
    const keyPlacement = level.secretKey ?? (!level.secret && level.key !== undefined ? { id: level.secretId ?? "eclipse", index: level.key } : undefined);
    levelKey = keyPlacement ? {
        id: keyPlacement.id,
        x: 140 + keyPlacement.index * TILE_WIDTH,
        y: keyPlacement.y ?? 170,
        collected: localStorage.getItem(`orbit-key-${keyPlacement.id}`) === "1",
        requiresPortal: Boolean(keyPlacement.requiresPortal),
    } : null;
    secretKeyRevealed = Boolean(levelKey && (!levelKey.requiresPortal || levelKey.collected));
    endGoalLocked = Boolean(levelKey && !levelKey.collected && !level.secret);
    if (endGoalLocked) {
        levelObstacles.push({ x: (level.length - 1) * TILE_WIDTH + 82, y: 0, width: 58, height: 400, goalLock: true });
    }
    levelMiniBosses = (level.miniBosses ?? []).map((index) => ({ x: 140 + index * TILE_WIDTH, y: 245, health: 2, maxHealth: 2, defeated: false }));
separateActorsFromObstacles();
    // Only create boss if level is not locked behind a key, or if key is already obtained
    const bossUnlocked = !levelKey || levelKey.collected || level.secret;
    boss = (level.boss || level.secret) && bossUnlocked ? { x: 140 + (level.length - 2) * TILE_WIDTH, y: 205, health: level.asteroids.length, maxHealth: level.asteroids.length, defeated: false } : null;
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
    const roomWidth = room.clientWidth || 1080;
    const leftHeld = pressedKeys.has("arrowleft") || pressedKeys.has("a");
    const rightHeld = pressedKeys.has("arrowright") || pressedKeys.has("d");
    if (leftHeld) playerX -= 5 * (boostTimer > 0 ? 1.7 : 1);
    if (rightHeld) playerX += 5 * (boostTimer > 0 ? 1.7 : 1);
    playerX = Math.max(24, Math.min(roomWidth - playerWidth - 24, playerX));
    previousPlayerY = playerY;
    verticalSpeed += gravity;
    playerY += verticalSpeed;
    if (playerY >= FLOOR_Y) { playerY = FLOOR_Y; verticalSpeed = 0; jumpCount = 0; }
    if (roomPlayer) roomPlayer.style.transform = `translate(${playerX}px, ${playerY}px)`;
    if (secretBoss) {
        const bossElement = room.querySelector<HTMLElement>(".void-warden");
        if (bossElement) { bossElement.style.left = `${secretBoss.x}px`; bossElement.style.top = `${secretBoss.y}px`; }
        if (!secretBoss.defeated) {
            const bossBox = { x: secretBoss.x, y: secretBoss.y, width: 128, height: 150 };
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
                } else if (shieldCharges > 0) {
                    shieldCharges--;
                    playerX = secretBoss.x - playerWidth - 8;
                    statusLabel.textContent = "Shield absorbed the Void Warden impact.";
                } else {
                    showGameOver("The Void Warden crushed your hull.");
                }
            }
            if (shootingHeld || pressedKeys.has("e")) shootSecretBoss();
            projectileTimer++;
            if (projectileTimer >= (rapidTimer > 0 ? 52 : reducedEffects ? 120 : 90)) { projectileTimer = 0; fireSecretBossProjectile(); }
        }
    }
    updateProjectiles();
}

function shootSecretBoss() {
    if (!gameActive || !secretBoss || secretBoss.defeated || (cannonTimer <= 0 && rapidCannonUntil <= performance.now()) || playerShotTimer > 0) return;
    playerShotTimer = rapidUntil > performance.now() ? 8 : 20;
    const element = document.createElement("div");
    element.className = "player-projectile";
    document.querySelector(".portal-key-room")?.append(element);
    projectiles.push({ x: playerX + playerWidth, y: playerY + 22, vx: 8, vy: 0, element, owner: "player" });
}

function fireSecretBossProjectile() {
    if (!secretBoss || secretBoss.defeated) return;
    const directionX = playerX + 24 - secretBoss.x;
    const directionY = playerY + 28 - secretBoss.y;
    const distance = Math.max(1, Math.hypot(directionX, directionY));
    const element = document.createElement("div");
    element.className = "boss-projectile secret-boss-projectile";
    document.querySelector(".portal-key-room")?.append(element);
    projectiles.push({ x: secretBoss.x + 64, y: secretBoss.y + 76, vx: directionX / distance * 4.2, vy: directionY / distance * 4.2, element, owner: "enemy" });
}

function damageSecretBoss() {
    if (!secretBoss || secretBoss.defeated) return;
    secretBoss.health--;
    const room = document.querySelector(".portal-key-room");
    const bossElement = room?.querySelector(".void-warden");
    bossElement?.classList.add("hit");
    window.setTimeout(() => bossElement?.classList.remove("hit"), 180);
    if (secretBoss.health > 0) {
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
    const smallEl = room?.querySelector("small");
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
    const route = levels[currentLevel].flippedRoute ?? { walls: [3, 7, 11, 15], enemies: [5, 13], spikes: [9], gravity: [2, 17], key: 19 };
    const barrierTiles = [4, 10, 17];
    const routeWalls = route.walls.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 118, width: 92, height: 52, airborne: true }));
    const routeBarriers = barrierTiles.map((index, barrierIndex) => ({
        x: 140 + index * TILE_WIDTH,
        y: barrierIndex % 2 ? 215 : 0,
        width: 34,
        height: barrierIndex % 2 ? 185 : 220,
        airborne: true,
        barrier: true,
    }));
    levelObstacles = [...routeWalls, ...routeBarriers];
    levelHazards = [...route.spikes.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 74, width: 76, height: 20, kind: "spikes" as const })), ...route.gravity.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 80, width: 115, height: 270, kind: "gravity" as const }))];
    levelEnemies = [...route.enemies, 6, 16].map((index) => ({ x: 140 + index * TILE_WIDTH, y: 110, defeated: false }));
    levelPowerups = []; levelMiniBosses = [{ x: 140 + Math.max(2, (route.key ?? 19) - 2) * TILE_WIDTH, y: 92, health: 3, maxHealth: 3, defeated: false }]; boss = null; levelKey = null;
    separateActorsFromObstacles();
    playerX = 120; playerY = CEILING_Y; verticalSpeed = 0; jumpCount = 0;
    world.classList.add("flipped-route");
    areaLabel.textContent = "AREA / FLIPPED PLANET";
    statusLabel.textContent = "FLIPPED PLANET: defeat the Dark Knight guarding the key, then double-tap Down in anti-gravity.";
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
    playerX = 120; playerY = 300; verticalSpeed = 0; jumpCount = 0; projectiles = []; trailElement = []; trailPositions = []; trailDirection = 1; trailActive = false; projectileTimer = 0; trailTimer = 0; playerShotTimer = 0; shieldCharges = 0; boostTimer = 0; rapidTimer = 0; rapidUntil = 0; rapidCannonUntil = 0; cannonTimer = 0; gameStarted = false; gameActive = true; previousPlayerY = playerY; levelStartedAt = performance.now(); elapsedMilliseconds = 0; resetFlippedVisualState(); portalCooldownUntil = 0;
    document.body.innerHTML = "";
    createGameShell(); createPlayer(); createWorldObjects(); createTrail(false); createControls(); startGameLoop();
}

function showWinScreen() {
    gameActive = false; cancelAnimationFrame(animationFrame);
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
    const nextLevel = levels.findIndex((level, index) => index > currentLevel && (level.secret ? isSecretLevelUnlocked(level) : index === 0 || Number(localStorage.getItem(`orbit-level-${index}`) ?? "0") === 1));
    screen.append(createMenuButton(nextLevel >= 0 ? "Next sector" : "Replay sector", () => nextLevel >= 0 ? startGame(nextLevel) : startGame(currentLevel)), createTextButton("Mission select", showLevelMenu), createPageCounter());
    document.body.replaceChildren(screen);
}

function showGameOver(reason = "Your hull took a hit.") {
    if (!gameActive) return;
    gameActive = false; cancelAnimationFrame(animationFrame); pressedKeys.clear(); cancelPortalTransit();
    resetFlippedVisualState();
    const screen = document.createElement("main");
    screen.className = "win-screen game-over-screen";
    screen.innerHTML = `<p class="eyebrow">SIGNAL LOST</p><h1>Hull <em>breach</em></h1><p class="menu-copy">${reason} The sector is still waiting.</p>`;
    screen.append(createMenuButton("Retry sector", () => startGame(currentLevel)), createTextButton("Mission select", showLevelMenu), createPageCounter());
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
    world.id = "game-world"; world.innerHTML = ""; world.classList.remove("flipped-route", "normal-area", "prestige-area", "reduced-effects"); world.classList.add(isFlippedPlanetLevel() ? "prestige-area" : "normal-area"); world.classList.toggle("reduced-effects", reducedEffects); world.setAttribute("aria-label", "Jacer game area");
    statusLabel.className = "status"; statusLabel.textContent = levels[currentLevel].briefing;
    const game = document.createElement("section"); game.className = "game-frame"; game.append(world, statusLabel);
    document.body.append(header, game);
}

function createPlayer() {
    const skin = skins[selectedSkin] ?? skins[0];
    const avatar = avatars[selectedAvatar] ?? avatars[0];
    const shipArt = avatar.image ?? skin.image;
    const hasCustomArt = Boolean(avatar.cssArt || shipArt);
    playerLabel.className = `player ${hasCustomArt ? "" : `ship-${skin.shape}`} avatar-${selectedAvatar}`; playerLabel.style.setProperty("--ship-color", skin.color); playerLabel.innerHTML = `${avatar.cssArt ? createCssShipArtMarkup(avatar.cssArt, avatar.name, skin.color) : shipArt ? createShipArtMarkup(shipArt, avatar.name, skin.color) : "<span class=\"ship-window\"></span>"}<span class="ship-flame"></span>`; world.append(playerLabel); updatePlayerPosition();
}

function createWorldObjects() {
    createSpaceBackdrop();
    createMapBoundaries();
    levelObstacles.forEach((obstacle) => {
        const element = document.createElement("div");
        element.className = `obstacle ${obstacle.airborne ? "airborne" : ""} ${obstacle.barrier ? "flipped-barrier" : ""} ${obstacle.goalLock ? "goal-lock" : ""} ${obstacle.boundary ? "boundary" : ""}`;
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
    if (inFlippedRoute && !flippedRouteKeyCollected) { const routeKey = document.createElement("div"); routeKey.className = "level-key flipped-route-key"; routeKey.textContent = "⚿"; routeKey.style.left = `${140 + (levels[currentLevel].flippedRoute?.key ?? 19) * TILE_WIDTH}px`; routeKey.style.top = "170px"; routeKey.setAttribute("aria-label", "Flipped planet exit key"); world.append(routeKey); }
    
    // Secret portals - one per secret level, placed in hard-to-reach/obscured locations (y=80, reveal radius 50px)
    const secretPortals = levels[currentLevel].secretPortals ?? [];
    secretPortals.forEach((portal, portalIndex) => {
        const element = document.createElement("div");
        element.className = "secret-portal hidden";
        element.textContent = "";
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
            element.className = "portal hidden"; 
            element.textContent = "";
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
    playerY = FLOOR_Y;
    projectiles.forEach((projectile) => projectile.element.remove());
    projectiles = [];
    const room = document.createElement("section");
    room.className = "portal-key-room secret-boss-room";
    room.setAttribute("aria-live", "polite");
    room.innerHTML = `<div class="portal-key-room-warp"></div><div class="portal-room-boundary"></div><div class="portal-room-player player"></div><div class="portal-key-chamber"><p>SECRET ROOM</p><b>VOID WARDEN ARENA</b><div class="portal-key-room-key">⚿</div><small>LAND ON ITS HEAD OR USE CANNON FIRE TO SECURE THE KEY</small></div>`;
    document.querySelector(".game-frame")?.append(room);
    world.classList.add("portal-boss-room-active");
    statusLabel.textContent = "Portal transit complete. Defeat the Void Warden to secure the secret key.";
    secretBoss = { x: 590, y: 160, health: 8, maxHealth: 8, defeated: false };
    const bossElement = document.createElement("div");
    bossElement.className = "boss secret-boss void-warden";
    bossElement.style.left = `${secretBoss.x}px`;
    bossElement.style.top = `${secretBoss.y}px`;
    room.append(bossElement);
    room.classList.add("has-secret-boss");
    const roomPlayer = room.querySelector<HTMLElement>(".portal-room-player");
    if (roomPlayer) roomPlayer.style.transform = `translate(${playerX}px, ${playerY}px)`;
}

function exitSecretBossRoom() {
    if (!gameActive || !portalTravelInProgress) return;
    if (portalReturnX !== null) playerX = Math.max(20, Math.min(levels[currentLevel].length * TILE_WIDTH - playerWidth, portalReturnX + PORTAL_SIZE + 24));
    playerY = FLOOR_Y;
    verticalSpeed = 0;
    jumpCount = 0;
    portalCooldownUntil = performance.now() + 900;
    portalTravelInProgress = false;
    secretBossRoomActive = false;
    secretBoss = null;
    currentSecretPortalTarget = null;
    portalReturnX = null;
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
    // Exclude star powerup from HUD since it's not purchasable
    const purchasableKinds: PowerupKind[] = ["shield", "boost", "rapid", "cannon"];
    purchasableKinds.forEach((kind) => {
        const button = document.createElement("button");
        button.className = `hud-power ${kind}`;
        button.type = "button";
        button.addEventListener("click", () => useInventoryPowerup(kind));
        bar.append(button);
    });
    return bar;
}

function createButton(className: string, text: string, action: () => void) { const button = document.createElement("button"); button.className = `control-button ${className}`; button.type = "button"; button.textContent = text; button.setAttribute("aria-label", className === "exit" ? "Exit to mission select" : className === "jump" ? "Jump" : className === "shoot" ? "Fire cannon (E)" : `Move ${className}`); button.addEventListener("click", action); return button; }
function createHoldButton(className: string, text: string, action: () => void) { const button = createButton(className, text, action); button.addEventListener("pointerdown", () => { shootingHeld = true; }); ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => button.addEventListener(eventName, () => { shootingHeld = false; })); return button; }
function handleKeyDown(event: KeyboardEvent) { if (!gameActive) return; if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) event.preventDefault(); const key = event.key.toLowerCase(); if (pressedKeys.has(key)) return; pressedKeys.add(key); if (event.key === "ArrowUp" || event.key === " " || key === "w") jump(); if (event.key === "ArrowDown" || key === "s") moveDown(); if (key === "e") { shootingHeld = true; shoot(); } }
function handleKeyUp(event: KeyboardEvent) { pressedKeys.delete(event.key.toLowerCase()); if (event.key.toLowerCase() === "e") shootingHeld = false; }
function updateHeldMovement() { if (pressedKeys.has("arrowleft") || pressedKeys.has("a")) moveLeft(4); if (pressedKeys.has("arrowright") || pressedKeys.has("d")) moveRight(4); }
function moveLeft(distance = 38) { if (portalTravelInProgress) return; playerX = Math.max(20, playerX - distance * (boostTimer > 0 ? 1.7 : 1)); trailMovementFrames = 8; gameStarted = true; updatePlayerPosition(); }
function moveRight(distance = 38) { if (portalTravelInProgress) return; playerX = Math.min(levels[currentLevel].length * TILE_WIDTH, playerX + distance * (boostTimer > 0 ? 1.7 : 1)); trailMovementFrames = 8; gameStarted = true; updatePlayerPosition(); }
function playerBox(): Box { return { x: playerX, y: playerY, width: playerWidth, height: playerHeight }; }
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
        if (secretBossRoomActive && jumpCount < 2) { jumpCount++; verticalSpeed = jumpPower; }
        return;
    }
    if (jumpCount >= 2) return;
    const wasInFlipZone = isInGravityZone();
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
    gameStarted = true; updatePlayerPosition();
}

function startGameLoop() {
    if (!gameActive) return;
    animationFrame = requestAnimationFrame(startGameLoop);
    if (portalTravelInProgress) {
        if (secretBossRoomActive) updateSecretBossRoom();
        updateTrail();
        updatePlayerPosition();
        return;
    }
    updateHeldMovement(); previousPlayerY = playerY;
    const inGravity = isInGravityZone();
    if (shipFlipped && !inGravity && !inFlippedRoute) shipFlipped = false;
    playerLabel.classList.toggle("flipped", shipFlipped);
    if (gameStarted) { elapsedMilliseconds = performance.now() - levelStartedAt; timerLabel.textContent = formatTime(elapsedMilliseconds); }
    verticalSpeed += (shipFlipped ? -1 : 1) * (inGravity ? gravity * 1.55 : gravity); playerY += verticalSpeed;
    if (!shipFlipped && playerY >= FLOOR_Y) { playerY = FLOOR_Y; verticalSpeed = 0; jumpCount = 0; }
    if (shipFlipped && playerY <= CEILING_Y) { playerY = CEILING_Y; verticalSpeed = 0; jumpCount = 0; }
    projectileTimer++; trailTimer++; playerShotTimer = Math.max(0, playerShotTimer - 1); boostTimer = Math.max(0, boostTimer - 1); rapidTimer = Math.max(0, rapidUntil - performance.now()); rapidCannonUntil = rapidCannonUntil > performance.now() ? rapidCannonUntil : 0;
    // Star powerup timer
    if (starPowerupActive) {
        starPowerupTimer--;
        if (starPowerupTimer <= 0) {
            starPowerupActive = false;
            if (starPowerupElement) starPowerupElement.style.display = "none";
            playerLabel.classList.remove("star-invincible");
            statusLabel.textContent = "Rainbow Star faded.";
        }
    }
    if (shootingHeld || pressedKeys.has("e")) shoot();
    if (projectileTimer >= (rapidTimer > 0 ? 52 : reducedEffects ? 120 : 90)) { projectileTimer = 0; levelEnemies.forEach(fireProjectile); levelMiniBosses.forEach(fireMiniBossProjectile); if (boss && !boss.defeated) fireBossProjectile(); }
    trailMovementFrames = Math.max(0, trailMovementFrames - 1);
    const horizontal = pressedKeys.has("arrowleft") || pressedKeys.has("arrowright") || pressedKeys.has("a") || pressedKeys.has("d");
    if (lastJumpDirection !== 0) { trailDirection = lastJumpDirection; trailActive = true; trailPositions = []; lastJumpDirection = 0; }
    const airborne = Math.abs(verticalSpeed) > .2;
    const shouldTrail = trailActive && horizontal && airborne;
    if (shouldTrail && trailTimer >= 2) { trailTimer = 0; createTrail(true); }
    updateTrail(shouldTrail);
    updateProjectiles(); updatePlayerPosition(); updatePowerupHud(); checkCollisions();
}

function updatePlayerPosition() { playerLabel.style.transform = `translate(${playerX}px, ${playerY}px) rotate(${shipFlipped ? 180 : 0}deg)`; world.style.transform = `translateX(${-Math.max(0, playerX - 180)}px)`; levelLabel.textContent = `SECTOR 0${currentLevel + 1}`; }
function shoot() {
    const rapidCannonReady = rapidCannonUntil > performance.now();
    if (!gameActive || portalTravelInProgress || (cannonTimer <= 0 && !rapidCannonReady)) { if (gameActive && !portalTravelInProgress) statusLabel.textContent = "Cannon offline. Find the cannon power-up."; return; }
    if (playerShotTimer > 0) return;
    playerShotTimer = rapidUntil > performance.now() ? 8 : 20;
    const element = document.createElement("div"); element.className = "player-projectile"; world.append(element);
    projectiles.push({ x: playerX + playerWidth, y: playerY + 22, vx: 8, vy: 0, element, owner: "player" });
}
function fireProjectile(enemy: Enemy) {
    if (enemy.defeated) return;
    const startX = enemy.x + 18, startY = enemy.y + 25, directionX = playerX + 24 - startX, directionY = playerY + 28 - startY, distance = Math.max(1, Math.hypot(directionX, directionY)), element = document.createElement("div");
    element.className = "projectile"; world.append(element); projectiles.push({ x: startX, y: startY, vx: directionX / distance * 5, vy: directionY / distance * 5, element, owner: "enemy" });
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
function updateProjectiles() { projectiles = projectiles.filter((projectile) => { projectile.x += projectile.vx; projectile.y += projectile.vy; projectile.element.style.transform = `translate(${projectile.x}px, ${projectile.y}px)`; const box = { x: projectile.x, y: projectile.y, width: 16, height: 16 }; const obstacle = secretBossRoomActive ? undefined : levelObstacles.find((item) => intersects(box, item)); if (obstacle) { createSplash(projectile.x, projectile.y); projectile.element.remove(); return false; } if (projectile.owner === "player") { const enemy = secretBossRoomActive ? undefined : levelEnemies.find((item) => !item.defeated && intersects(box, { x: item.x, y: item.y, width: 48, height: 48 })); if (enemy) { enemy.defeated = true; document.querySelectorAll(".enemy")[levelEnemies.indexOf(enemy)]?.classList.add("defeated"); projectile.element.remove(); statusLabel.textContent = "Cannon hit. Sentry disabled."; return false; } const miniBoss = secretBossRoomActive ? undefined : levelMiniBosses.find((item) => !item.defeated && intersects(box, { x: item.x, y: item.y, width: 70, height: 70 })); if (miniBoss) { miniBoss.health--; projectile.element.remove(); if (miniBoss.health <= 0) { miniBoss.defeated = true; document.querySelectorAll(".mini-boss")[levelMiniBosses.indexOf(miniBoss)]?.classList.add("defeated"); statusLabel.textContent = "Cannon fire shattered the mini-boss."; } else statusLabel.textContent = `Cannon hit. ${miniBoss.health} hit remaining.`; return false; } if (!secretBossRoomActive && boss && !boss.defeated && intersects(box, { x: boss.x, y: boss.y, width: 128, height: 150 })) { projectile.element.remove(); damageBoss(); return false; } if (secretBossRoomActive && secretBoss && !secretBoss.defeated && intersects(box, { x: secretBoss.x, y: secretBoss.y, width: 128, height: 150 })) { projectile.element.remove(); damageSecretBoss(); return false; } } else if (intersects(box, { x: playerX, y: playerY, width: playerWidth, height: playerHeight })) { projectile.element.remove(); if (shieldCharges > 0) { shieldCharges--; statusLabel.textContent = "Shield absorbed the impact."; return false; } showGameOver("A sentry round cracked your hull."); return false; } if (projectile.x < playerX - 700 || projectile.x > playerX + 700 || projectile.y < -100 || projectile.y > 500) { projectile.element.remove(); return false; } return true; }); }
function createSplash(x: number, y: number) { const splash = document.createElement("div"); splash.className = "splash"; splash.style.left = `${x}px`; splash.style.top = `${y}px`; world.append(splash); window.setTimeout(() => splash.remove(), reducedEffects ? 180 : 350); }
function intersects(first: Box, second: Box) { return first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y; }

function checkCollisions() {
    levelObstacles.forEach((obstacle) => {
        const horizontal = playerX + playerWidth > obstacle.x && playerX < obstacle.x + obstacle.width;
        const vertical = playerY + playerHeight > obstacle.y && playerY < obstacle.y + obstacle.height;
        const wasAbove = previousPlayerY + playerHeight <= obstacle.y;
        const wasBelow = previousPlayerY >= obstacle.y + obstacle.height;
        const landed = shipFlipped
            ? (verticalSpeed >= 0 && wasAbove) || (verticalSpeed < 0 && wasBelow)
            : (verticalSpeed >= 0 && wasAbove) || (verticalSpeed < 0 && wasBelow);
        if (horizontal && vertical && landed) {
            if (verticalSpeed >= 0 && wasAbove) playerY = obstacle.y - playerHeight;
            else if (verticalSpeed < 0 && wasBelow) playerY = obstacle.y + obstacle.height;
            verticalSpeed = 0; jumpCount = 0;
        } else if (horizontal && vertical) {
            playerX = playerX < obstacle.x ? obstacle.x - playerWidth - 4 : obstacle.x + obstacle.width + 4;
            if (obstacle.goalLock) statusLabel.textContent = "ENDING LOCKED — enter a portal chamber to recover the required key.";
            updatePlayerPosition();
        }
    });
    levelHazards.forEach((hazard) => { if (hazard.kind === "spikes" && intersects({ x: playerX, y: playerY, width: playerWidth, height: playerHeight }, hazard)) { if (shieldCharges > 0) { shieldCharges--; playerY = 300; statusLabel.textContent = "Shield absorbed the spike hit."; } else showGameOver("The spike belt caught your ship."); } });
levelPowerups.forEach((powerup, index) => { if (!powerup.collected && intersects({ x: playerX, y: playerY, width: playerWidth, height: playerHeight }, { x: powerup.x, y: powerup.y, width: 38, height: 38 })) { powerup.collected = true; activatePowerup(powerup.kind); document.querySelectorAll(".powerup")[index]?.classList.add("collected"); } });
    
    // Handle secret portals - one per secret level, placed in specific levels
    const secretPortals = levels[currentLevel].secretPortals ?? [];
    secretPortals.forEach((portal, portalIndex) => {
        const portalBox = { x: 140 + portal.index * TILE_WIDTH, y: portal.y ?? PORTAL_Y, width: PORTAL_SIZE, height: PORTAL_SIZE };
        const distance = Math.hypot(playerX + playerWidth / 2 - (portalBox.x + PORTAL_SIZE / 2), playerY + playerHeight / 2 - (portalBox.y + PORTAL_SIZE / 2));
        const portalElement = document.querySelector(`.secret-portal[data-portal-index="${portalIndex}"]`);
        if (portalElement) {
            const visible = distance <= 50;
            portalElement.classList.toggle("hidden", !visible);
            portalElement.textContent = visible ? "⚡" : "";
        }
    });

    if (!portalTravelInProgress && performance.now() >= portalCooldownUntil) {
        secretPortals.some((portal) => {
            const portalBox = { x: 140 + portal.index * TILE_WIDTH, y: portal.y ?? PORTAL_Y, width: PORTAL_SIZE, height: PORTAL_SIZE };
            if (!intersects(playerBox(), portalBox)) return false;
            startPortalTransit(portal.index, portal.secretId);
            return true;
        });
    }
    
    // Regular portals (for flipped route travel)
    const portals = levels[currentLevel].portals ?? [];
    portals.forEach((index, portalIndex) => {
        const portalBox = { x: 140 + index * TILE_WIDTH, y: PORTAL_Y, width: PORTAL_SIZE, height: PORTAL_SIZE };
        const nearPortal = Math.abs(playerX - portalBox.x) < 50 && Math.abs(playerY - portalBox.y) < 50;
        const portalElement = document.querySelector(`.portal[data-portal-index="${portalIndex}"]`);
        if (portalElement && nearPortal) {
            portalElement.classList.remove("hidden");
            portalElement.textContent = "↔";
        } else if (portalElement && !nearPortal) {
            portalElement.classList.add("hidden");
            portalElement.textContent = "";
        }
    });
    
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
    if (levelKey && secretKeyRevealed && !levelKey.collected && intersects({ x: playerX, y: playerY, width: playerWidth, height: playerHeight }, { x: levelKey.x, y: levelKey.y, width: 38, height: 38 })) { 
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
    if (inFlippedRoute && !flippedRouteKeyCollected && intersects(playerBox(), { x: 140 + (levels[currentLevel].flippedRoute?.key ?? 19) * TILE_WIDTH, y: 170, width: 38, height: 38 })) { 
        flippedRouteKeyCollected = true; 
        document.querySelector(".flipped-route-key")?.classList.add("collected"); 
        statusLabel.textContent = "Exit key recovered. Double-tap Down in an anti-gravity zone to return."; 
    }
    levelEnemies.forEach((enemy, index) => {
        if (enemy.defeated) return;
        const enemyBox = { x: enemy.x, y: enemy.y, width: 48, height: 48 };
        const touchingEnemy = intersects({ x: playerX, y: playerY, width: playerWidth, height: playerHeight }, enemyBox);
        const landedOnHead = touchingEnemy && verticalSpeed >= 0 && previousPlayerY + playerHeight <= enemy.y + 15;
        if (landedOnHead) {
            enemy.defeated = true;
            playerY = enemy.y - playerHeight;
            verticalSpeed = jumpPower * 0.58;
            jumpCount = 1;
            playerLabel.classList.add("ground-pound");
            window.setTimeout(() => playerLabel.classList.remove("ground-pound"), 180);
            statusLabel.textContent = inFlippedRoute ? "Dark sentry crushed. Ground pound dominates." : "Sentry disabled. Nice landing.";
            document.querySelectorAll(".enemy")[index]?.classList.add("defeated");
        } else if (touchingEnemy) {
            if (shieldCharges > 0) { shieldCharges--; playerX = enemy.x - playerWidth - 8; statusLabel.textContent = "Shield absorbed the sentry impact."; }
            else showGameOver("You hit a sentry head-on.");
        }
    });
    levelMiniBosses.forEach((miniBoss, index) => {
        if (miniBoss.defeated) return;
        const miniBox = { x: miniBoss.x, y: miniBoss.y, width: 70, height: 70 };
        const touching = intersects({ x: playerX, y: playerY, width: playerWidth, height: playerHeight }, miniBox);
        const stomped = touching && verticalSpeed >= 0 && previousPlayerY + playerHeight <= miniBoss.y + 18;
        if (stomped) {
            miniBoss.health -= inFlippedRoute ? 2 : 1;
            playerY = miniBoss.y - playerHeight;
            verticalSpeed = jumpPower * (inFlippedRoute ? 0.75 : .62);
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
            if (shieldCharges > 0) { shieldCharges--; playerX = miniBoss.x - playerWidth - 8; statusLabel.textContent = "Shield absorbed the mini-boss impact."; }
            else showGameOver("A Dark Knight slammed into your hull.");
        }
    });
    levelAsteroids.forEach((asteroid, index) => { if (!asteroid.claimed && Math.abs(playerX + 24 - asteroid.x) < 42 && Math.abs(playerY + 28 - asteroid.y) < 58) { asteroid.claimed = true; const claimedAsteroids = getClaimedAsteroids(currentLevel); claimedAsteroids.add(index); saveClaimedAsteroids(currentLevel, claimedAsteroids); if (asteroid.special) { specialAsteroids++; localStorage.setItem("orbit-special-claims", String(specialAsteroids)); } else { asteroidsClaimed++; localStorage.setItem("orbit-claims", String(asteroidsClaimed)); } claimLabel.textContent = `${levelAsteroids.filter((item) => item.claimed).length} / ${levelAsteroids.length}`; statusLabel.textContent = asteroid.special ? "Special asteroid secured. Spend it in the roll wheel." : boss ? "Asteroid impact. Titan armor is cracking." : "Asteroid claimed. This one is secured permanently."; document.querySelectorAll(".asteroid")[index]?.classList.add("claimed"); damageBoss(); } });
    if (boss && playerX > boss.x - 120 && !boss.defeated) { playerX = boss.x - 125; statusLabel.textContent = "Titan Core blocks the beacon. Claim asteroids to break it."; updatePlayerPosition(); }
    // Check win condition: for prestige levels, require flipped route key; for others, just need key/unlocked
    const isPrestigeLevel = levels[currentLevel].prestige === true;
    const hasWinKey = isPrestigeLevel ? flippedRouteKeyCollected : (!endGoalLocked);
    if (playerX > levels[currentLevel].length * TILE_WIDTH - 100 && gameStarted && (!boss || boss.defeated) && hasWinKey) showWinScreen();
}

function activatePowerup(kind: PowerupKind) { 
    if (kind === "shield") { 
        shieldCharges += 1; 
        statusLabel.textContent = "Shield bubble online. One hit will be absorbed."; 
    } else if (kind === "boost") { 
        boostTimer = 420; 
        statusLabel.textContent = "Thruster boost online. Right movement is amplified."; 
    } else if (kind === "rapid") { 
        rapidUntil = Math.max(rapidUntil, performance.now() + 10000); 
        rapidTimer = Math.max(0, rapidUntil - performance.now()); 
        rapidCannonUntil = Math.max(rapidCannonUntil, rapidUntil); 
        statusLabel.textContent = "Rapid fire online for 10 seconds. Hold Shoot."; 
    } else if (kind === "cannon") { 
        cannonTimer = Number.POSITIVE_INFINITY; 
        statusLabel.textContent = "Cannon online until hull breach. Press E or Shoot."; 
    } else if (kind === "star") { 
        starPowerupActive = true; 
        starPowerupTimer = 600; // 10 seconds at 60fps
        // Create rainbow star visual effect on player
        if (!starPowerupElement) {
            starPowerupElement = document.createElement("div");
            starPowerupElement.className = "star-powerup-effect";
            starPowerupElement.innerHTML = `<div class="rainbow-star">★</div>`;
            playerLabel.append(starPowerupElement);
        }
        starPowerupElement.style.display = "block";
        playerLabel.classList.add("star-invincible");
        statusLabel.textContent = "RAINBOW STAR ACTIVE! Invincible for 10 seconds!";
        // Kill all enemies instantly
        levelEnemies.forEach((enemy) => { if (!enemy.defeated) { enemy.defeated = true; document.querySelectorAll(".enemy")[levelEnemies.indexOf(enemy)]?.classList.add("defeated"); } });
        levelMiniBosses.forEach((miniBoss) => { if (!miniBoss.defeated) { miniBoss.defeated = true; document.querySelectorAll(".mini-boss")[levelMiniBosses.indexOf(miniBoss)]?.classList.add("defeated"); } });
        if (boss && !boss.defeated) { boss.defeated = true; document.querySelector(".boss")?.classList.add("defeated"); }
        if (secretBoss && !secretBoss.defeated) { secretBoss.defeated = true; document.querySelector(".void-warden")?.classList.add("defeated"); }
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
        button.disabled = inventory[kind] < 1 && kind !== "star"; 
        button.classList.toggle("active", Boolean(timer)); 
    }); 
    playerLabel.classList.toggle("shielded", shieldCharges > 0); 
}
function damageBoss() { if (!boss || boss.defeated) return; boss.health--; bossLabel.textContent = `TITAN ${boss.health}/${boss.maxHealth}`; const bossElement = document.querySelector(".boss"); bossElement?.classList.add("hit"); window.setTimeout(() => bossElement?.classList.remove("hit"), 180); if (boss.health <= 0) { boss.defeated = true; bossElement?.classList.add("defeated"); statusLabel.textContent = "Titan Core shattered. Reach the beacon for your reward."; } }

function getPrestigeRequirement(level: number) { return { normal: 100 + level * 50, special: 10 + level * 5 }; }
function getNormalRouteCount() { return levels.filter((level) => !level.secret && !level.prestige).length; }
function getNormalCompletedLevelCount() { return levels.filter((level, index) => !level.secret && !level.prestige && localStorage.getItem(`orbit-level-complete-${index}`) === "1").length; }
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
function isSkinUnlocked(skin: { required: number; boss?: boolean; secret?: boolean; prestige?: number; golden?: boolean }) { return localStorage.getItem("orbit-unlock-skins") === "1" || (skin.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : skin.prestige !== undefined ? prestigeLevel >= skin.prestige : skin.boss ? localStorage.getItem("orbit-boss-defeated") === "1" : skin.secret ? localStorage.getItem("orbit-secret-unlocked") === "1" : asteroidsClaimed >= skin.required); }
function getUnlockedSkinCount() { return skins.filter(isSkinUnlocked).length; }
function isAvatarUnlocked(avatar: AvatarStyle) { return localStorage.getItem("orbit-unlock-avatars") === "1" || (avatar.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : avatar.prestige !== undefined ? prestigeLevel >= avatar.prestige : avatar.jackpot ? localStorage.getItem("orbit-jackpot-avatar") === "1" : true); }
function isTrailUnlocked(trail: TrailStyle) { return localStorage.getItem("orbit-unlock-trails") === "1" || (trail.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : trail.prestige !== undefined ? prestigeLevel >= trail.prestige : trail.boss ? localStorage.getItem("orbit-boss-defeated") === "1" : trail.secret ? localStorage.getItem("orbit-secret-unlocked") === "1" : asteroidsClaimed >= trail.required); }
function getUnlockedTrailCount() { return trails.filter(isTrailUnlocked).length; }
function formatTime(milliseconds: number) { const total = Math.max(0, Math.floor(milliseconds)); const minutes = Math.floor(total / 60000).toString().padStart(2, "0"); const seconds = Math.floor(total / 1000 % 60).toString().padStart(2, "0"); const millis = (total % 1000).toString().padStart(3, "0"); return `${minutes}:${seconds}.${millis}`; }
