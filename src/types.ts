export type Box = { x: number; y: number; width: number; height: number };
export type Obstacle = Box & { airborne?: boolean; barrier?: boolean; block?: boolean; goalLock?: boolean; boundary?: boolean };
export type Asteroid = { x: number; y: number; claimed: boolean; special: boolean };
export type Hazard = { x: number; y: number; width: number; height: number; kind: "spikes" | "gravity" };
export type Enemy = { x: number; y: number; defeated: boolean; attackTimer?: number };
export type Projectile = { x: number; y: number; vx: number; vy: number; angle?: number; element: HTMLElement; owner: "player" | "enemy" };
export type PowerupKind = "shield" | "boost" | "rapid" | "cannon" | "star";
export type Powerup = { x: number; y: number; kind: PowerupKind; collected: boolean };
export type LevelKey = { id: string; x: number; y: number; collected: boolean; requiresPortal: boolean };
export type Boss = { x: number; y: number; health: number; maxHealth: number; defeated: boolean; attackTimer?: number };
export type MiniBoss = { x: number; y: number; health: number; maxHealth: number; defeated: boolean; attackTimer?: number };
export type SkinStyle = { name: string; color: string; shape: "classic" | "dart" | "ring" | "blade"; required: number; image?: string; boss?: boolean; secret?: boolean; prestige?: number; golden?: boolean };
export type TrailStyle = { name: string; color: string; secondaryColor?: string; required: number; effect: "ember" | "comet" | "spark" | "ribbon" | "arc"; secret?: boolean; boss?: boolean; golden?: boolean; jackpot?: boolean; prestige?: number };
export type PrestigeShipArt = "stellar-guard" | "quantum-dancer" | "cosmic-queen" | "void-knight" | "eclipse-oracle" | "infinity-pilot" | "stellar-legend";
export type AvatarStyle = { name: string; color: string; shape: "classic" | "dart" | "ring" | "blade"; required: number; image?: string; cssArt?: PrestigeShipArt; defaultSkin: number; prestige?: number; golden?: boolean; jackpot?: boolean };
export type FlippedRoute = { walls: number[]; enemies: number[]; spikes: number[]; gravity: number[]; powerups?: { index: number; kind: PowerupKind }[]; key?: number };
export type SecretKeyPlacement = { id: string; index: number; y?: number; requiresPortal?: boolean };
export type SecretPortal = { id?: string; index: number; secretId: string; y?: number };
export type LevelMakerDraft = {
    name: string;
    briefing: string;
    prestige: boolean;
    prestigeRequirement?: number;
    tiles: string[];
    flippedTiles: string[];
    length?: number;
    customId?: string;
    sourceLevelIndex?: number;
};
export type UnflippedRouteSnapshot = {
    asteroids: Asteroid[];
    obstacles: Obstacle[];
    hazards: Hazard[];
    enemies: Enemy[];
    powerups: Powerup[];
    key: LevelKey | null;
    miniBosses: MiniBoss[];
    boss: Boss | null;
    playerX: number;
};
export type Level = { name: string; briefing: string; length: number; asteroids: number[]; walls: number[]; blocks?: number[]; enemies: number[]; spikes: number[]; gravity: number[]; portals?: number[]; secretPortals?: SecretPortal[]; flip?: number[]; flippedRoute?: FlippedRoute; powerups?: { index: number; kind: PowerupKind }[]; key?: number; secretKey?: SecretKeyPlacement; secretId?: string; specialAsteroids?: number[]; miniBosses?: number[]; boss?: boolean; bossIndex?: number; secret?: boolean; prestige?: boolean; prestigeRequirement?: number; type?: "normal" | "secret" | "prestige"; customId?: string; localOnly?: boolean };
export type ControlAction = "left" | "right" | "jump" | "down" | "shoot" | "restart" | "back" | "confirm" | "switchPlanet";
export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
export type CosmeticGroup = "skin" | "trail" | "avatar" | "color";
export type UserRole = "player" | "tester" | "moderator" | "admin" | "level-maker" | "developer" | "owner";
export type OnlineUser = { username: string; role: UserRole; mustChangePassword?: boolean; appearOffline?: boolean; leaderboardOptIn?: boolean; allowFriendRequests?: boolean; readReceipts?: boolean; typingIndicators?: boolean; humanVerified?: boolean; offlineOwnerEligible?: boolean };
export type ManagedUser = {
    id: string;
    username: string;
    role: UserRole;
    banned: boolean;
    chatMuted?: boolean;
    lastSeenIpAvailable?: boolean;
    ipBanned?: boolean;
    emailMasked?: string | null;
    emailSet?: boolean;
    emailBanned?: boolean;
    isOnline: boolean;
    createdAt: string;
    usernameChangedAt: string | null;
    passwordChangedAt: string | null;
    wipeVersion: number;
    hasRecoveryCode: boolean;
    recoveryCodeCreatedAt: string | null;
    recoveryAttempts: number;
    recoveryLockedUntil: string | null;
    recoveryLockState: "locked" | "clear";
    progress: Record<string, string>;
};
export type OnlineLeaderboardEntry = { id: string; userId: string; username: string; role?: OnlineUser["role"]; level: string; timeMs: number; abilities: string[]; achievedAt: string };
export type OnlinePlayerPresence = { id: string; username: string; role?: OnlineUser["role"] };
export type ProfileTitleRequirement = {
    type: "routes" | "golden" | "prestige" | "roulette" | "locked" | "enemies" | "bosses";
    amount: number;
};
export type TitleAnimation = "none" | "pulse" | "shimmer" | "rainbow" | "dark-matter" | "star-shimmer" | "comet-trail" | "nebula-drift" | "aurora-wave" | "solar-flare";
export type ProfileTitleStyle = { color?: string; animation?: TitleAnimation };
export type ProfileTitle = { id: string; name: string; routes: number; requirement?: ProfileTitleRequirement } & ProfileTitleStyle;
export type CodeReward =
    | { type: "claims" | "specialClaims"; amount: number }
    | { type: "powerup"; kind: PowerupKind; amount: number }
    | { type: "skin" | "trail" | "avatar"; index: number }
    | { type: "title"; titleId: string };
export type PublicPlayerProfile = {
    id: string;
    username: string;
    role: OnlineUser["role"];
    asteroids: number;
    specialAsteroids: number;
    enemiesKilled: number;
    bossesKilled: number;
    prestige: number;
    routesCleared: number;
    shipColor: string;
    avatar: number;
    skin: number;
    trail: number;
    title: string;
    titleStyle?: ProfileTitleStyle | null;
    isOnline: boolean;
    limited?: boolean;
};
export type FriendEntry = { userId: string; username: string; role: OnlineUser["role"]; title: string; isOnline: boolean; unread: number; createdAt?: string };
export type FriendRequest = { id: string; userId: string; username: string; role: OnlineUser["role"]; title: string; createdAt: string; direction: "incoming" | "outgoing" };
export type ChatAttachment = { kind: "image" | "gif" | "video"; url: string; contentType: string; bytes: number };
export type ChatReaction = { emoji: string; count: number; reacted: boolean };
export type ChatMessage = { id: string; conversationId: string; senderId: string; sender: string; role: OnlineUser["role"]; text: string; attachment?: ChatAttachment; reactions?: ChatReaction[]; createdAt: string; readAt?: string | null; editedAt?: string | null; deletedAt?: string | null };
export type ChatConversation = { id: string; userId: string; username: string; role: OnlineUser["role"]; isOnline: boolean; lastMessagePreview: string; lastMessageAt: string | null; unread: number };
export type RouletteTier = {
    buyIn: 5 | 10 | 25;
    chances: Record<"claims" | "specialClaims" | "color" | "trail" | "avatar" | "title", number>;
    rewards: Record<"claims" | "specialClaims", readonly [number, number]>;
};
export type RouletteWheelPocket = { index: number; startAngle: number; endAngle: number };
export type UpdateLogEntry = { date: string; title: string; body: string };
export type RouletteReward = { title: string; description: string; rarity?: Rarity; collectionComplete: boolean; amount?: number; currencyLabel?: string };
export type OnlineSettings = { goldenTimeLimitMs: number; rouletteTiers: RouletteTier[]; updateLog: UpdateLogEntry[]; profileTitles?: ProfileTitle[]; builtinLevelOverrides?: Record<string, Level>; portalAssignments?: Record<string, string> };
export type WorldGameConfig = {
    rainbowStarChance: number;
    portalSpawnChance: number;
    rarityOdds: Record<Rarity, number>;
    rewardRanges: Record<Rarity, readonly [number, number]>;
    skinChances: Record<Rarity, number>;
    powerupSpawnChances: Record<PowerupKind, number>;
};
export type GameConfig = {
    normal: WorldGameConfig;
    prestige: WorldGameConfig;
    powerupEffects: {
        shield: { charges: number };
        boost: { durationSeconds: number; movementMultiplier: number };
        rapid: { durationSeconds: number };
        cannon: { durationSeconds: number };
        star: { durationSeconds: number; movementMultiplier?: number };
    };
    powerupRules: {
        oneActiveAtATime: boolean;
        rainbowStarInvincible: boolean;
        rainbowStarDefeatsEnemies: boolean;
        maxUsesPerLevel: Record<PowerupKind, number>;
        maxPickupsPerLevel: Record<PowerupKind, number>;
    };
    enemyRules: {
        attackIntervalFrames: number;
        prestigeAttackMultiplier: number;
        /** Optional per-prestige overrides; index 0 is prestige 1. */
        prestigeAttackMultipliers?: number[];
        secretAttackMultiplier: number;
        rapidAttackMultiplier: number;
        projectileSpeed: number;
        miniBossProjectileSpeed: number;
        bossProjectileSpeed: number;
        enemyTypes?: {
            sentry: { attackIntervalMultiplier: number; projectileSpeed: number };
            darkKnight: { attackIntervalMultiplier: number; projectileSpeed: number };
            titanCore: { attackIntervalMultiplier: number; projectileSpeed: number };
            voidWarden: { attackIntervalMultiplier: number; projectileSpeed: number };
        };
    };
};

