import type { Box, Obstacle, Asteroid, Hazard, Enemy, Projectile, PowerupKind, Powerup, LevelKey, Boss, MiniBoss, TrailStyle, AvatarStyle, UnflippedRouteSnapshot, Level, LevelMakerDraft, ControlAction, Rarity, CosmeticGroup, OnlineUser, OnlineLeaderboardEntry, RouletteTier, RouletteWheelPocket, UpdateLogEntry, RouletteReward, OnlineSettings, WorldGameConfig, GameConfig, ProfileTitle, CodeReward } from "./types";
import { TILE_WIDTH, PORTAL_Y, PORTAL_SIZE, SECRET_LEVEL_COOLDOWN_MS, COOLDOWN_RESET_COST, CEILING_Y, FLOOR_Y, FLIPPED_WORLD_HEIGHT, SECRET_BOSS_HEIGHT, RARITY_ORDER, DEFAULT_GAME_CONFIG, DEFAULT_ROULETTE_TIERS, PROFILE_TITLES, powerupPrices, powerupLabels } from "./game-config";
import { STARTER_SHIP_COLORS, ROULETTE_SHIP_COLORS, skins, trails, avatars, getCosmeticRarity } from "./cosmetics";
import { levels, normalizeNonPrestigeLevels, normalizePrestigeLevels } from "./levels";
import { ApiError, apiRequest, setApiLocalOnlyMode } from "./api";
import { createMenuButton, createPasswordField, createTextButton, showActionDialog } from "./ui";
import { createShipArtMarkup, createCssShipArtMarkup } from "./ship-art";
import { drawTrailParticles } from "./trail";
import { createLevelMaker } from "./level-maker";
import { createTitleBadge } from "./title-style";
import { loadManagedUsers } from "./managed-users";
import { createCustomization } from "./customization";
import { createLeaderboard } from "./leaderboard";
import { createAccountRecovery } from "./account-recovery";
import { renderAdminChatFilterTools, renderAdminChatReports, renderAdminCodeTools, renderAdminMessageTools, renderAdminModerationLog, renderAdminUpdateLog } from "./admin-tools";
import { createControlNavigation, type ControlSection } from "./owner-panel";
import { createRouletteFields } from "./roulette-editor";
import { createChat } from "./chat";
import { acceptFriendRequest, blockUser, declineFriendRequest, loadBlockedUsers, loadFriends, removeFriend, unblockUser } from "./friends";

const playerLabel = document.createElement("div");
const world = document.createElement("main");
const claimLabel = document.createElement("span");
const levelLabel = document.createElement("span");
const statusLabel = document.createElement("p");
const bossLabel = document.createElement("span");
const timerLabel = document.createElement("span");
const areaLabel = document.createElement("span");

let gameConfig: GameConfig = structuredClone(DEFAULT_GAME_CONFIG);
let rouletteTiers: RouletteTier[] = structuredClone(DEFAULT_ROULETTE_TIERS);
let updateLogEntries: UpdateLogEntry[] = [];
let profileTitles: ProfileTitle[] = structuredClone(PROFILE_TITLES);
let accountDeletionNoticeShown = false;
let builtinLevelOverrides: Record<string, Level> = {};
let portalAssignments: Record<string, string> = {};
const secretPortalTargetLabels: Record<string, string> = {
    eclipse: "Eclipse Vault",
    nebula: "Nebula Hollow",
    archive: "Black Hole Archive",
    "stellar-sanctum": "Stellar Sanctum",
    "quantum-depths": "Quantum Depths",
    "infinity-spiral": "Infinity Spiral",
};
let selectedRouletteSpinAmount = Math.max(1, Number(localStorage.getItem("orbit-roulette-spin-amount") ?? "5") || 5);
const storedRouletteColorPreference = localStorage.getItem("orbit-roulette-color-preference");
let selectedRouletteColorPreference: "green" | "blue" | "yellow" = storedRouletteColorPreference === "blue" || storedRouletteColorPreference === "yellow" ? storedRouletteColorPreference : "green";
let rouletteWheelPockets: RouletteWheelPocket[] = [];
const testerSettingsDraft = new Map<string, string>();
let levelMakerPreviewReturn: (() => void) | null = null;
let isLevelMakerPreview = false;
let levelMakerPreviewLevelIndex = -1;
let playerX = 120;
let playerY = 300;
let verticalSpeed = 0;
let jumpCount = 0;
let asteroidsClaimed = Number(localStorage.getItem("orbit-claims") ?? "0");
let specialAsteroids = Number(localStorage.getItem("orbit-special-claims") ?? "0");
let prestigeLevel = Number(localStorage.getItem("orbit-prestige") ?? "0");
let prestigeMax = Number(localStorage.getItem("orbit-prestige-max") ?? "3");
let enemiesKilled = Number(localStorage.getItem("orbit-enemies-killed") ?? "0");
let bossesKilled = Number(localStorage.getItem("orbit-bosses-killed") ?? "0");
let currentLevel = 0;
let activeRunProof: { runId: string; levelName: string } | null = null;
let runProofSequence = 0;
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
let enemyAttackTimer = 0;
let miniBossAttackTimer = 0;
let bossAttackTimer = 0;
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
let selectedShipColor = localStorage.getItem("orbit-ship-color") ?? skins[selectedSkin]?.color ?? skins[0].color;
if (!/^#[0-9a-f]{6}$/i.test(selectedShipColor)) selectedShipColor = skins[selectedSkin]?.color ?? skins[0].color;
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
let unflippedRouteSnapshot: UnflippedRouteSnapshot | null = null;
let portalReturnState: { x: number; y: number; verticalSpeed: number; jumpCount: number; shipFlipped: boolean; trailActive: boolean; trailPositions: { x: number; y: number }[]; trailDirection: number } | null = null;
let currentOnlineUser: OnlineUser | null = null;
const offlineOwnerGrantKey = "jacer-offline-owner-grant";
const offlineOwnerPassphrase = "T3ster!";
let offlineOwnerMode = false;
let ownerBadgeObserver: MutationObserver | null = null;
let roleQuickPanel: HTMLElement | null = null;
let roleQuickPanelStartedAt = 0;
let accountNoticeTimer = 0;
let presenceHeartbeatTimer = 0;
let presenceHeartbeatInFlight = false;
let gameChatNotice: HTMLElement | null = null;
let accountNoticeOpen = false;
let goldenTimeLimitMs = 60000;
type MusicScene = "menu" | "normal" | "prestige" | "secret" | "boss";
type MusicTrackId = "original" | "out-in-space" | "space-adventure" | "out-there" | "crazy-space" | "spacelife-14";
type MusicTrack = { id: MusicTrackId; name: string; source?: string; credit: string };
const MUSIC_TRACKS: readonly MusicTrack[] = [
    { id: "original", name: "Original", credit: "Procedural Space Ambience — generated in-browser by Jacer" },
    { id: "out-in-space", name: "Out in Space", source: "/music/out-in-space.ogg", credit: "Out in Space by Agecaf — CC0 / OpenGameArt" },
    { id: "space-adventure", name: "Space Adventure", source: "/music/space-adventure.ogg", credit: "Space Adventure by MintoDog — CC0 / OpenGameArt" },
    { id: "out-there", name: "Out There", source: "/music/out-there.ogg", credit: "Space Music: Out There by yd — CC0 / OpenGameArt" },
    { id: "crazy-space", name: "Crazy Space", source: "/music/crazy-space.ogg", credit: "Crazy Space by rubberduck — CC0 / OpenGameArt" },
    { id: "spacelife-14", name: "Spacelife 14", source: "/music/spacelife-14.ogg", credit: "Spacelife #14 by yd — CC0 / OpenGameArt" },
];
const storedMusicTrack = localStorage.getItem("orbit-music-track") as MusicTrackId | null;
let selectedMusicTrackId: MusicTrackId = MUSIC_TRACKS.some((track) => track.id === storedMusicTrack) ? storedMusicTrack! : "original";
let musicContext: AudioContext | null = null;
let musicFilter: BiquadFilterNode | null = null;
let musicGain: GainNode | null = null;
let musicOscillators: OscillatorNode[] = [];
let externalMusicAudio: HTMLAudioElement | null = null;
let externalMusicSource: MediaElementAudioSourceNode | null = null;
let musicSequenceTimer: number | null = null;
let musicStep = 0;
let musicScene: MusicScene = "menu";
let musicVolume = Number(localStorage.getItem("orbit-music-volume") ?? "0.3");
let musicMuted = localStorage.getItem("orbit-music-muted") === "true";
let musicUnlocked = false;
if (!Number.isFinite(musicVolume) || musicVolume < 0 || musicVolume > 1) musicVolume = 0.3;
let usedAbilities = new Set<string>();
let lastJumpDirection = 0;
let starPowerupActive = false;
let starPowerupTimer = 0;
let powerupUsesThisLevel: Record<PowerupKind, number> = { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 0 };
let starPowerupElement: HTMLElement | null = null;
const pressedKeys = new Set<string>();
const DEFAULT_CONTROL_BINDINGS: Record<ControlAction, string> = {
    left: "arrowleft",
    right: "arrowright",
    jump: "arrowup",
    down: "arrowdown",
    shoot: "keye",
    restart: "keyr",
    back: "backspace",
    confirm: "enter",
    switchPlanet: "keyp",
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
let accountRedemptionInFlight = false;
let lastSyncedAccountProgress = "";
let loadedAccountProgressFor: string | null = null;
let onlineSessionVersion = 0;
let pendingFriendRequests = 0;
let chatController: ReturnType<typeof createChat> | null = null;

// The game is a single-page app, so the browser's history does not know about
// the screens rendered by the menus. Keep a small in-app stack so the Backspace
// control returns to the screen the player actually came from instead of always
// jumping to the home menu.
type AppPage = () => void;
const appPageHistory: AppPage[] = [];
let currentAppPage: AppPage | null = null;
let restoringAppPage = false;
function enterAppPage(page: AppPage) {
    if (restoringAppPage) {
        currentAppPage = page;
        return;
    }
    if (currentAppPage === page) return;
    const existingIndex = appPageHistory.lastIndexOf(page);
    if (existingIndex >= 0) appPageHistory.splice(existingIndex);
    else if (currentAppPage) appPageHistory.push(currentAppPage);
    currentAppPage = page;
}
function goToPreviousAppPage() {
    const previous = appPageHistory.pop();
    if (!previous) {
        if (!document.querySelector(".home-screen")) {
            restoringAppPage = true;
            showMenu();
            restoringAppPage = false;
        }
        return;
    }
    restoringAppPage = true;
    previous();
    restoringAppPage = false;
}
const gameAppPage: AppPage = () => startGame(currentLevel);

const OWNER_TEST_INVENTORY_AMOUNT = 100000;
// These helpers only decide which controls to show. The server repeats the
// same checks, so editing the browser cannot grant a staff permission.
function hasOwnerAccess() { return currentOnlineUser?.role === "owner" || currentOnlineUser?.role === "developer"; }
function hasTesterTools() { return hasOwnerAccess() || currentOnlineUser?.role === "admin" || currentOnlineUser?.role === "tester"; }
function hasModerationTools() { return hasOwnerAccess() || currentOnlineUser?.role === "admin" || currentOnlineUser?.role === "moderator"; }
function hasWorkshopTools() { return hasOwnerAccess() || currentOnlineUser?.role === "admin" || currentOnlineUser?.role === "level-maker"; }
function roleLabel(role: OnlineUser["role"]) {
    return role === "owner" ? "OWNER" : role === "developer" ? "DEVELOPER" : role === "admin" ? "ADMIN" : role === "moderator" ? "MOD" : role === "level-maker" ? "LEVEL MAKER" : role === "tester" ? "TESTER" : "PLAYER";
}

function accountIdentity(user: OnlineUser | null) {
    return user?.username.toLowerCase() ?? null;
}

function readOfflineOwnerGrant(): { username: string } | null {
    try {
        const grant: unknown = JSON.parse(localStorage.getItem(offlineOwnerGrantKey) ?? "null");
        if (!grant || typeof grant !== "object" || Array.isArray(grant)) return null;
        const username = (grant as { username?: unknown }).username;
        return typeof username === "string" && /^[A-Za-z0-9_]{3,20}$/.test(username) ? { username } : null;
    } catch {
        return null;
    }
}

function isOnlineServiceUnavailable(error: unknown) {
    return (error instanceof ApiError && error.status >= 500) || error instanceof TypeError;
}

function setOnlineUser(user: OnlineUser | null, sameAccount = false) {
    const previousIdentity = accountIdentity(currentOnlineUser);
    const nextIdentity = accountIdentity(user);
    if (previousIdentity !== nextIdentity) {
        onlineSessionVersion++;
        if (sameAccount && loadedAccountProgressFor === previousIdentity) loadedAccountProgressFor = nextIdentity;
        else {
            loadedAccountProgressFor = null;
            lastSyncedAccountProgress = "";
        }
    }
    currentOnlineUser = user;
    if (user?.role === "owner" && user.offlineOwnerEligible) {
        localStorage.setItem(offlineOwnerGrantKey, JSON.stringify({ username: user.username }));
    }
    chatController?.setUser(user);
}
const gravity = 0.7;
const jumpPower = -16;
const playerWidth = 48;
const playerHeight = 58;
const playerHitboxInsetX = 7;
const playerHitboxInsetY = 5;
const playerHitboxWidth = playerWidth - playerHitboxInsetX * 2;
const playerHitboxHeight = playerHeight - playerHitboxInsetY - 5;
const levelMakerRenderer = createLevelMaker({
    powerupLabels,
    configurePortalDistribution,
    showLevelMenu,
    showTesterPanel,
    canEditBuiltInLevels: () => hasOwnerAccess() || currentOnlineUser?.role === "admin",
    saveBuiltInLevel: async (index, level) => {
        const result = await apiRequest<{ level: Level; builtinLevelOverrides?: Record<string, Level> }>("/settings/builtin-level-overrides", {
            method: "PUT",
            body: JSON.stringify({ index, level }),
        });
        builtinLevelOverrides = result.builtinLevelOverrides ?? { ...builtinLevelOverrides, [String(index)]: result.level };
        const existing = levels[index];
        if (existing) {
            levels[index] = { ...existing, ...result.level, customId: existing.customId, localOnly: existing.localOnly };
            normalizeNonPrestigeLevels(levels);
            normalizePrestigeLevels(levels);
        }
        return levels[index] ?? result.level;
    },
    startPreview: (index, returnToEditor) => {
        isLevelMakerPreview = true;
        levelMakerPreviewLevelIndex = index;
        levelMakerPreviewReturn = () => {
            levels.splice(index, 1);
            isLevelMakerPreview = false;
            levelMakerPreviewLevelIndex = -1;
            levelMakerPreviewReturn = null;
            returnToEditor();
        };
        startGame(index);
    },
});
const showLevelMaker = (draft?: LevelMakerDraft) => {
    const page = draft ? () => showLevelMaker(draft) : showLevelMaker;
    enterAppPage(page);
    levelMakerRenderer(draft);
};
const prestigeRouteNames = ["Violet Meridian", "Moonfall Circuit", "Amethyst Rift", "Crown of Saturn", "Lilac Nebula", "Oracle's Reach", "Prismatic Grave", "The White Eclipse", "Sovereign Drift", "Astral Citadel", "Veil of Io", "Radiant Ruin", "Dusk Cathedral", "Nova Labyrinth", "Purple Eventide", "The Inverted Sea", "Halo of Ash", "Sable Aurora", "Titan's Throne", "Infinity Crown"];
const customizationController = createCustomization({
    getLoadout: () => ({ shipColor: selectedShipColor, avatar: selectedAvatar, skin: selectedSkin, trail: selectedTrail }),
    setLoadout: (changes) => {
        if (changes.shipColor !== undefined) { selectedShipColor = changes.shipColor; localStorage.setItem("orbit-ship-color", selectedShipColor); }
        if (changes.avatar !== undefined) { selectedAvatar = changes.avatar; localStorage.setItem("orbit-avatar", String(selectedAvatar)); }
        if (changes.skin !== undefined) { selectedSkin = changes.skin; localStorage.setItem("orbit-skin", String(selectedSkin)); }
        if (changes.trail !== undefined) { selectedTrail = changes.trail; localStorage.setItem("orbit-trail", String(selectedTrail)); }
    },
    isSkinUnlocked,
    isTrailUnlocked,
    isAvatarUnlocked,
    isSpinCosmeticUnlocked,
    showMenu,
    createPageCounter,
});
const showCustomization = () => {
    enterAppPage(showCustomization);
    customizationController.showCustomization();
};
const createShipPreview = customizationController.createShipPreview;


const leaderboardController = createLeaderboard({
    getCurrentUser: () => currentOnlineUser,
    showAccount,
    showLevelMenu,
    showMenu,
    sendPresenceHeartbeat,
    setCurrentOnlineUser: setOnlineUser,
    setGoldenTimeLimit: (limit) => { goldenTimeLimitMs = limit; },
    createShipPreview,
    formatTime,
});
const showLeaderboard = () => {
    enterAppPage(showLeaderboard);
    leaderboardController.showLeaderboard();
};
const showLeaderboardPlayerProfile = (playerId: string, returnTo: () => void = showLeaderboard) => {
    const page = () => showLeaderboardPlayerProfile(playerId, returnTo);
    enterAppPage(page);
    void sendPresenceHeartbeat();
    void leaderboardController.showLeaderboardPlayerProfile(playerId, returnTo);
};
const { getRoleBadge, formatAbilityName } = leaderboardController;

const accountRecoveryController = createAccountRecovery(showAccount);
const showRecoveryCodeOnce = (code: string, onContinue: () => void) => {
    const page = () => showRecoveryCodeOnce(code, onContinue);
    enterAppPage(page);
    accountRecoveryController.showRecoveryCodeOnce(code, onContinue);
};
const showForgotPassword = () => {
    enterAppPage(showForgotPassword);
    accountRecoveryController.showForgotPassword();
};

function readStoredLevels(key: string): Level[] {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
        if (!Array.isArray(stored)) return [];
        return stored.filter((value): value is Level => {
            if (!value || typeof value !== "object" || Array.isArray(value)) return false;
            const level = value as Partial<Level>;
            if (typeof level.name !== "string" || !level.name.trim() || /[<>]/.test(level.name)
                || typeof level.briefing !== "string" || /[<>]/.test(level.briefing)
                || !Number.isSafeInteger(level.length) || level.length! < 8 || level.length! > 100) return false;
            const validTiles = (tiles: unknown) => Array.isArray(tiles) && tiles.every((index) => Number.isSafeInteger(index) && index >= 1 && index < level.length!);
            if (![level.asteroids, level.walls, level.enemies, level.spikes, level.gravity].every(validTiles)) return false;
            if (![level.blocks, level.portals, level.specialAsteroids, level.miniBosses, level.flip].every((tiles) => tiles === undefined || validTiles(tiles))) return false;
            const validPowerups = (powerups: unknown) => Array.isArray(powerups) && powerups.every((item) => item && typeof item === "object"
                && Number.isSafeInteger(item.index) && item.index >= 1 && item.index < level.length!
                && Object.hasOwn(powerupLabels, item.kind));
            if (level.powerups !== undefined && !validPowerups(level.powerups)) return false;
            const route = level.flippedRoute;
            if (route && (![route.walls, route.enemies, route.spikes, route.gravity].every(validTiles)
                || route.powerups !== undefined && !validPowerups(route.powerups))) return false;
            return true;
        });
    } catch {
        return [];
    }
}

function loadCustomLevels() {
    const legacyLevels = readStoredLevels("orbit-custom-levels");
    const normalCount = levels.filter((level) => !level.secret && !level.prestige).length;
    for (let index = normalCount; index < 20; index++) {
        levels.splice(Math.min(index, levels.length), 0, { name: `Frontier ${index + 1}`, briefing: "A longer route on the blue planet. Reach the beacon and claim the whole lane.", length: 28 + index, asteroids: [3, 7, 11, 15, 19, 23], walls: [5, 9, 13, 17, 21, 25], enemies: [8, 16, 24], spikes: [6, 14, 22], gravity: [10, 20], portals: [12, 26], boss: index === 19 });
    }
    for (let index = 0; index < 20; index++) {
        levels.push({ name: prestigeRouteNames[index], briefing: "A longer route around the ringed planet. Planetary flip fields reveal the upper lane.", length: 38 + index, asteroids: [3, 8, 13, 18, 23, 28, 33], walls: [5, 10, 15, 20, 25, 30], enemies: [7, 17, 27, 35], spikes: [6, 14, 24, 32], gravity: [11, 21, 31], flip: [11, 31], boss: index === 19, prestige: true, prestigeRequirement: index < 5 ? 1 : index < 13 ? 2 : 3 });
    }
    const cachedLevels = readStoredLevels("orbit-global-level-cache");
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
    normalizeNonPrestigeLevels(levels);
    normalizePrestigeLevels(levels);
}

function getHiddenPortalIndex(level: Level) {
    const occupied = new Set([...level.walls, ...level.enemies, ...level.spikes, ...level.gravity, ...(level.portals ?? [])]);
    const candidates = Array.from({ length: Math.max(1, level.length - 4) }, (_, index) => index + 2).filter((index) => !occupied.has(index));
    return candidates[Math.floor(Math.random() * candidates.length)] ?? Math.max(2, Math.floor(level.length / 2));
}

function getPlacedPortalIndex(level: Level) {
    const portalIndex = (level.portals ?? []).find((index) => Number.isSafeInteger(index) && index >= 2 && index <= level.length - 2);
    return portalIndex ?? null;
}

function getLevelType(level: Level): "normal" | "secret" | "prestige" {
    return level.secret ? "secret" : level.prestige ? "prestige" : "normal";
}

function isPrestigeRouteLocked(level: Level) {
    if (hasOwnerAccess() || !level.prestige || level.secret) return false;
    const required = Math.min(level.prestigeRequirement ?? 1, prestigeMax);
    return prestigeLevel < required;
}

function getHiddenPortalY() {
    return [68, 82, 96][Math.floor(Math.random() * 3)];
}

function readClaimedSecretPortals() {
    try {
        const claimed = JSON.parse(localStorage.getItem("orbit-claimed-secret-portals") ?? "[]");
        return new Set<string>(Array.isArray(claimed) ? claimed.filter((id): id is string => typeof id === "string") : []);
    } catch (error) {
        console.error("Could not read claimed secret portals:", error);
        return new Set<string>();
    }
}

function isSecretPortalClaimed(secretId: string) {
    return readClaimedSecretPortals().has(`${secretId}-portal`) || localStorage.getItem(`orbit-key-${secretId}`) === "1";
}

function markSecretPortalClaimed(secretId: string) {
    const claimed = readClaimedSecretPortals();
    claimed.add(`${secretId}-portal`);
    localStorage.setItem("orbit-claimed-secret-portals", JSON.stringify([...claimed]));
    localStorage.setItem(`orbit-key-${secretId}`, "1");
}

function readSecretPortalLocation(secretId: string): { source: string; index: number; y: number } | null {
    try {
        const saved = JSON.parse(localStorage.getItem(`orbit-portal-location-${secretId}`) ?? "null");
        if (saved && typeof saved.source === "string" && Number.isSafeInteger(saved.index) && Number.isSafeInteger(saved.y)) return saved;
    } catch (error) {
        console.error(`Could not read portal location for ${secretId}:`, error);
    }
    return null;
}

async function sendPresenceHeartbeat() {
    if (offlineOwnerMode || !currentOnlineUser || presenceHeartbeatInFlight) return;
    presenceHeartbeatInFlight = true;
    try {
        const result = await apiRequest<{ pendingRequests?: number; unreadMessages?: number; chatNotification?: import("./types").ChatNotification | null }>("/presence/heartbeat", { method: "POST", body: "{}" });
        pendingFriendRequests = Math.max(0, Number(result?.pendingRequests) || 0);
        chatController?.setUnread(pendingFriendRequests, Math.max(0, Number(result?.unreadMessages) || 0), result.chatNotification);
    } catch (error) {
        if (currentOnlineUser) console.error("Could not update online status:", error);
    } finally {
        presenceHeartbeatInFlight = false;
    }
}

function showGameChatNotice(notification?: import("./types").ChatNotification) {
    if (!notification || !gameActive) return;
    gameChatNotice?.remove();
    const notice = document.createElement("aside");
    notice.className = "game-chat-notice";
    notice.innerHTML = "<strong></strong><p></p>";
    notice.querySelector("strong")!.textContent = notification.kind === "mention" ? `@ mention from ${notification.sender}` : `Message from ${notification.sender}`;
    notice.querySelector("p")!.textContent = notification.text || "Sent an attachment";
    const reply = createTextButton("Reply", () => { notice.remove(); chatController?.openNotification(notification); });
    const open = createTextButton("Open chat", () => { notice.remove(); chatController?.openNotification(notification); });
    notice.append(reply, open);
    notice.addEventListener("click", () => { notice.remove(); chatController?.openNotification(notification); });
    document.body.append(notice);
    gameChatNotice = notice;
    globalThis.setTimeout(() => { if (gameChatNotice === notice) { notice.remove(); gameChatNotice = null; } }, 9000);
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

function progressSnapshotKey(identity: string | null) { return identity ? `jacer-progress-snapshot-${identity}` : ""; }
function readProgressSnapshot(identity: string | null): Record<string, string> | null {
    const key = progressSnapshotKey(identity);
    if (!key) return null;
    try {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
        if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some((item) => typeof item !== "string")) return null;
        return value as Record<string, string>;
    } catch { return null; }
}
function rememberProgressSnapshot(identity: string | null, progress: Record<string, string>) {
    const key = progressSnapshotKey(identity);
    if (key) localStorage.setItem(key, serializeAccountProgress(progress));
}
function hasAccountProgress(progress: Record<string, string>) { return Object.keys(progress).some((key) => key.startsWith("orbit-")); }

function refreshProgressStateFromStorage() {
    const readCount = (key: string, fallback: number, minimum: number, maximum: number) => {
        const value = Number(localStorage.getItem(key) ?? fallback);
        return Number.isSafeInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
    };
    asteroidsClaimed = readCount("orbit-claims", 0, 0, 100000000);
    specialAsteroids = readCount("orbit-special-claims", 0, 0, 100000000);
    prestigeLevel = readCount("orbit-prestige", 0, 0, 100);
    prestigeMax = readCount("orbit-prestige-max", 3, 1, 100);
    enemiesKilled = readCount("orbit-enemies-killed", 0, 0, 100000000);
    bossesKilled = readCount("orbit-bosses-killed", 0, 0, 100000000);
    selectedSkin = readCount("orbit-skin", 0, 0, skins.length - 1);
    selectedTrail = readCount("orbit-trail", 0, 0, trails.length - 1);
    selectedAvatar = readCount("orbit-avatar", 0, 0, avatars.length - 1);
    if (!localStorage.getItem("orbit-skin") && avatars[selectedAvatar]) selectedSkin = avatars[selectedAvatar].defaultSkin;
    const savedShipColor = localStorage.getItem("orbit-ship-color");
    selectedShipColor = savedShipColor && /^#[0-9a-f]{6}$/i.test(savedShipColor) ? savedShipColor : skins[selectedSkin]?.color ?? skins[0].color;
    reducedEffects = localStorage.getItem("orbit-reduced-effects") === "true";
    const savedMusicVolume = Number(localStorage.getItem("orbit-music-volume") ?? "0.3");
    musicVolume = Number.isFinite(savedMusicVolume) && savedMusicVolume >= 0 && savedMusicVolume <= 1 ? savedMusicVolume : 0.3;
    musicMuted = localStorage.getItem("orbit-music-muted") === "true";
    if (musicUnlocked) fadeMusicTo(musicMuted ? 0 : getMusicOutputGain());
    controlBindings = readControlBindings();
}

const LOCAL_DEVICE_PREFERENCE_KEYS = new Set([
    "orbit-controls",
    "orbit-music-volume",
    "orbit-music-muted",
    "orbit-music-track",
    "orbit-reduced-effects",
    "orbit-global-level-cache",
]);

function clearLocalAccountData() {
    offlineOwnerMode = false;
    setApiLocalOnlyMode(false);
    localStorage.removeItem(offlineOwnerGrantKey);
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key): key is string => Boolean(key?.startsWith("orbit-") && !LOCAL_DEVICE_PREFERENCE_KEYS.has(key)))
        .forEach((key) => localStorage.removeItem(key));
    refreshProgressStateFromStorage();
    reloadLocalCustomLevels();
    activePlanet = "normal";
    testerSettingsDraft.clear();
    roleQuickPanel?.remove();
    roleQuickPanel = null;
    gameConfig = structuredClone(DEFAULT_GAME_CONFIG);
    rouletteTiers = structuredClone(DEFAULT_ROULETTE_TIERS);
    builtinLevelOverrides = {};
    portalAssignments = {};
    configurePortalDistribution();
}

function reloadLocalCustomLevels() {
    const savedLevels = readStoredLevels("orbit-custom-levels");
    levels.splice(0, levels.length, ...levels.filter((level) => !level.localOnly));
    savedLevels.forEach((level, index) => levels.push({
        ...level,
        localOnly: !level.customId || level.localOnly,
        ...(level.customId ? {} : { customId: `local-${index + 1}` }),
    }));
    normalizeNonPrestigeLevels(levels);
    normalizePrestigeLevels(levels);
    configurePortalDistribution();
}

function applySyncedProgress(sentProgress: Record<string, string>, serverProgress: Record<string, string>) {
    const previousCustomLevels = localStorage.getItem("orbit-custom-levels");
    const progressKeys = new Set([...Object.keys(sentProgress), ...Object.keys(serverProgress)]);
    progressKeys.forEach((key) => {
        const sentValue = Object.hasOwn(sentProgress, key) ? sentProgress[key] : null;
        const currentValue = localStorage.getItem(key);
        if (currentValue !== sentValue) {
            // Preserve currency earned or spent while this request was in flight,
            // on top of the latest balance returned by the server.
            const prestigeUnchanged = (sentProgress["orbit-prestige"] ?? "0") === (serverProgress["orbit-prestige"] ?? "0")
                && (sentProgress["orbit-prestige"] ?? "0") === (localStorage.getItem("orbit-prestige") ?? "0");
            if ((key === "orbit-claims" || key === "orbit-special-claims") && prestigeUnchanged) {
                const amounts = [sentValue ?? "0", currentValue ?? "0", serverProgress[key] ?? "0"];
                if (amounts.every((value) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 100000000)) {
                    const [sent, current, server] = amounts.map(Number);
                    localStorage.setItem(key, String(Math.max(0, Math.min(100000000, server + current - sent))));
                }
            }
            return;
        }
        const serverValue = serverProgress[key];
        if (serverValue === undefined) localStorage.removeItem(key);
        else if (serverValue !== sentValue) localStorage.setItem(key, serverValue);
    });
    refreshProgressStateFromStorage();
    if (previousCustomLevels !== localStorage.getItem("orbit-custom-levels")) reloadLocalCustomLevels();
}

function showAccountSyncConflict(message: string) {
    if (document.querySelector(".account-sync-warning")) return;
    const notice = document.createElement("aside");
    notice.className = "account-sync-warning";
    notice.setAttribute("role", "alert");
    const details = document.createElement("p");
    details.textContent = message;
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => notice.remove());
    notice.append(details, dismiss);
    document.body.append(notice);
}

async function syncAccountProgress(direction: "load" | "save", force = false) {
    if (!currentOnlineUser) return;
    while (accountRedemptionInFlight || accountProgressSyncing) {
        if (direction === "save" && !force) return;
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 20));
        if (!currentOnlineUser) return;
    }
    const identity = accountIdentity(currentOnlineUser);
    if (direction === "load") {
        const localOwner = localStorage.getItem("jacer-local-owner");
        if (localOwner && localOwner !== identity) clearLocalAccountData();
    }
    if (direction === "save" && loadedAccountProgressFor !== identity) {
        throw new Error("Account progress has not loaded yet, so cloud saving is paused. Sign in again to retry.");
    }
    const ensureSameAccount = () => {
        if (accountIdentity(currentOnlineUser) !== identity) throw new Error("The signed-in account changed during progress synchronization.");
    };
    accountProgressSyncing = true;
    try {
        if (direction === "load") {
            loadedAccountProgressFor = null;
            lastSyncedAccountProgress = "";
            const { progress } = await apiRequest<{ progress: Record<string, string> | null }>("/account/progress");
            ensureSameAccount();
            if (progress === null) {
                const localProgress = getLocalAccountProgress();
                const result = await apiRequest<{ progress: Record<string, string> }>("/account/progress", {
                    method: "PUT",
                    body: JSON.stringify({ progress: localProgress, baseProgress: null, initializeOnly: true }),
                });
                ensureSameAccount();
                applySyncedProgress(localProgress, result.progress);
                lastSyncedAccountProgress = serializeAccountProgress(result.progress);
                rememberProgressSnapshot(identity, result.progress);
                loadedAccountProgressFor = identity;
                localStorage.setItem("jacer-local-owner", identity ?? "");
                return;
            }
            const localProgress = getLocalAccountProgress();
            const storedSnapshot = readProgressSnapshot(identity);
            const canRecoverLocalChanges = localStorage.getItem("jacer-local-owner") === identity && hasAccountProgress(localProgress);
            // A page can close before the next background save. If this is the
            // same signed-in account and its local data differs from the last
            // confirmed snapshot, save it before replacing anything locally.
            if (canRecoverLocalChanges && storedSnapshot && serializeAccountProgress(localProgress) !== serializeAccountProgress(storedSnapshot)) {
                const result = await apiRequest<{ progress: Record<string, string> }>("/account/progress", {
                    method: "PUT",
                    body: JSON.stringify({ progress: localProgress, baseProgress: storedSnapshot }),
                });
                ensureSameAccount();
                applySyncedProgress(localProgress, result.progress);
                lastSyncedAccountProgress = serializeAccountProgress(result.progress);
                rememberProgressSnapshot(identity, result.progress);
                loadedAccountProgressFor = identity;
                return;
            }
            // Older accounts may not have a device snapshot yet. A completely
            // empty cloud record must never erase progress from that same device.
            if (canRecoverLocalChanges && !hasAccountProgress(progress)) {
                const result = await apiRequest<{ progress: Record<string, string> }>("/account/progress", {
                    method: "PUT",
                    body: JSON.stringify({ progress: localProgress, baseProgress: progress }),
                });
                ensureSameAccount();
                applySyncedProgress(localProgress, result.progress);
                lastSyncedAccountProgress = serializeAccountProgress(result.progress);
                rememberProgressSnapshot(identity, result.progress);
                loadedAccountProgressFor = identity;
                return;
            }
            Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
                .filter((key): key is string => Boolean(key?.startsWith("orbit-") && !LOCAL_DEVICE_PREFERENCE_KEYS.has(key)))
                .forEach((key) => localStorage.removeItem(key));
            Object.entries(progress).forEach(([key, value]) => localStorage.setItem(key, value));
            refreshProgressStateFromStorage();
            reloadLocalCustomLevels();
            lastSyncedAccountProgress = serializeAccountProgress(getLocalAccountProgress());
            rememberProgressSnapshot(identity, getLocalAccountProgress());
            loadedAccountProgressFor = identity;
            localStorage.setItem("jacer-local-owner", identity ?? "");
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
        ensureSameAccount();
        applySyncedProgress(localProgress, result.progress);
        lastSyncedAccountProgress = serializeAccountProgress(result.progress);
        rememberProgressSnapshot(identity, result.progress);
    } catch (error) {
        if (error instanceof ApiError && error.status === 403 && error.message.startsWith("Your account is being deleted:")) {
            clearLocalAccountData();
            setOnlineUser(null);
            if (!accountDeletionNoticeShown) {
                accountDeletionNoticeShown = true;
                void showActionDialog({
                    title: "Account is being deleted",
                    description: error.message.replace("Your account is being deleted: ", ""),
                    confirmLabel: "Return to menu",
                    danger: true,
                }).then(() => showMenu());
            }
        }
        if (direction === "save" && error instanceof ApiError && error.status === 409 && accountIdentity(currentOnlineUser) === identity) {
            loadedAccountProgressFor = null;
            showAccountSyncConflict(error.message);
        }
        throw error;
    } finally {
        accountProgressSyncing = false;
    }
}

async function refreshOnlineState() {
    const originalSessionVersion = onlineSessionVersion;
    const tasks = [
        (async () => {
            const session = await apiRequest<{ user: OnlineUser | null }>("/auth/session");
            // A login or logout while startup is pending must not be overwritten.
            if (onlineSessionVersion !== originalSessionVersion) return;
            setOnlineUser(session.user);
            if (!session.user && localStorage.getItem("jacer-local-owner")) clearLocalAccountData();
            void sendPresenceHeartbeat();
            updateOwnerAccountIndicator();
            try {
                if (session.user) await syncAccountProgress("load");
            } finally {
                if (document.querySelector(".home-screen")) showMenu();
            }
        })(),
        (async () => {
            const settings = await apiRequest<OnlineSettings>("/settings");
            goldenTimeLimitMs = settings.goldenTimeLimitMs;
            rouletteTiers = isUsableRouletteTiers(settings.rouletteTiers)
                ? structuredClone(settings.rouletteTiers)
                : structuredClone(DEFAULT_ROULETTE_TIERS);
            updateLogEntries = Array.isArray(settings.updateLog) ? settings.updateLog : [];
            if (isUsableProfileTitles(settings.profileTitles)) profileTitles = structuredClone(settings.profileTitles);
            if (settings.builtinLevelOverrides && typeof settings.builtinLevelOverrides === "object" && !Array.isArray(settings.builtinLevelOverrides)) {
                builtinLevelOverrides = Object.fromEntries(Object.entries(settings.builtinLevelOverrides).filter(([index, level]) => /^\d+$/.test(index) && level && typeof level === "object")) as Record<string, Level>;
            }
            if (settings.portalAssignments && typeof settings.portalAssignments === "object" && !Array.isArray(settings.portalAssignments)) {
                portalAssignments = Object.fromEntries(Object.entries(settings.portalAssignments).filter(([target, source]) => typeof target === "string" && typeof source === "string")) as Record<string, string>;
            }
            applyBuiltinLevelOverrides();
        })(),
        (async () => {
            const sharedConfig = await apiRequest<{ config: GameConfig }>("/game-config");
            gameConfig = sharedConfig.config;
        })(),
        (async () => {
            const sharedLevels = await apiRequest<{ levels: Level[] }>("/levels");
            levels.splice(0, levels.length, ...levels.filter((level) => !level.customId || level.localOnly), ...sharedLevels.levels.map((level) => ({ ...level, localOnly: false })));
            applyBuiltinLevelOverrides();
            localStorage.setItem("orbit-global-level-cache", JSON.stringify(sharedLevels.levels));
            configurePortalDistribution();
        })(),
    ];
    const results = await Promise.allSettled(tasks);
    results.forEach((result) => {
        if (result.status === "rejected") console.error("Could not load part of the online service:", result.reason);
    });
    if (currentOnlineUser?.role === "tester" || currentOnlineUser?.role === "admin") {
        const storedOverride = localStorage.getItem("orbit-tester-game-config");
        if (storedOverride) {
            try {
                const parsed = JSON.parse(storedOverride) as GameConfig;
                if (isUsableGameConfig(parsed)) gameConfig = parsed;
                else throw new Error("Stored tester settings are malformed.");
            } catch (error) {
                localStorage.removeItem("orbit-tester-game-config");
                console.error("Discarded invalid tester-only settings:", error);
            }
        }
        const storedRouletteOverride = localStorage.getItem("orbit-tester-roulette-tiers");
        if (storedRouletteOverride) {
            try {
                const parsed: unknown = JSON.parse(storedRouletteOverride);
                if (isUsableRouletteTiers(parsed)) rouletteTiers = parsed;
                else throw new Error("Stored tester roulette settings are malformed.");
            } catch (error) {
                localStorage.removeItem("orbit-tester-roulette-tiers");
                console.error("Discarded invalid tester-only roulette settings:", error);
            }
        }
    }
}

function applyBuiltinLevelOverrides() {
    Object.entries(builtinLevelOverrides).forEach(([index, override]) => {
        const levelIndex = Number(index);
        const base = levels[levelIndex];
        if (!base || base.customId || base.localOnly || !override || typeof override !== "object") return;
        levels[levelIndex] = { ...base, ...structuredClone(override), customId: undefined, localOnly: undefined };
    });
    normalizeNonPrestigeLevels(levels);
    normalizePrestigeLevels(levels);
    if (levels.length) configurePortalDistribution();
}

function configurePortalDistribution() {
    levels.forEach((level) => {
        level.type = getLevelType(level);
        if (!level.customId && !level.localOnly) {
            level.secretPortals = undefined;
        }
    });
    const portalTargets: Record<"normal" | "prestige", string[]> = {
        normal: ["eclipse", "nebula", "archive"],
        prestige: ["stellar-sanctum", "quantum-depths", "infinity-spiral"],
    };
    const secretLevels = levels.map((level, index) => ({ level, index })).filter(({ level }) => level.secret && !level.customId && !level.localOnly);
    secretLevels.forEach(({ level, index }) => {
        if (!level.secretId) level.secretId = `secret-level-${index + 1}`;
        level.secretPortals = undefined;
    });

    (['normal', 'prestige'] as const).forEach((world) => {
        const isPrestige = world === "prestige";
        const sources = levels.filter((candidate) => !candidate.secret && !candidate.customId && !candidate.localOnly && Boolean(candidate.prestige) === isPrestige);
        const eligibleTargets = secretLevels.filter(({ level }) => Boolean(level.prestige) === isPrestige && portalTargets[world].includes(level.secretId ?? ""));
        const usedSources = new Set<string>();
        eligibleTargets.forEach(({ level }) => {
            const secretId = level.secretId;
            // Owners need to be able to verify a new portal assignment even
            // after their test account has already claimed that secret route.
            if (!secretId || (isSecretPortalClaimed(secretId) && !hasOwnerAccess())) return;
            const assignedSourceName = portalAssignments[secretId];
            const saved = readSecretPortalLocation(secretId);
            const portalChance = getWorldConfig(isPrestige).portalSpawnChance;
            let source = assignedSourceName
                ? sources.find((candidate) => candidate.name === assignedSourceName)
                : saved ? sources.find((candidate) => candidate.name === saved.source) : undefined;
            if (!source) {
                if (Math.random() * 100 >= portalChance) return;
                const candidates = sources.filter((candidate) => !usedSources.has(candidate.name));
                source = candidates[Math.floor(Math.random() * candidates.length)];
                if (!source) return;
                localStorage.setItem(`orbit-portal-location-${secretId}`, JSON.stringify({ source: source.name, index: getHiddenPortalIndex(source), y: getHiddenPortalY() }));
            }
            const location = readSecretPortalLocation(secretId);
            const placedPortalIndex = source ? getPlacedPortalIndex(source) : null;
            const sameSource = Boolean(source && location?.source === source.name);
            const assignedLocation = assignedSourceName && source
                // Owner-selected placements must always be reachable. Older saves
                // used the random hidden height here, which could place a normal
                // planet portal above the playable route even though the source
                // level and assignment were correct.
                ? { source: source.name, index: placedPortalIndex ?? (sameSource ? location!.index : getHiddenPortalIndex(source)), y: PORTAL_Y }
                : location;
            if (!assignedLocation) return;
            if (assignedSourceName) localStorage.setItem(`orbit-portal-location-${secretId}`, JSON.stringify(assignedLocation));
            usedSources.add(source.name);
            source.secretPortals = [...(source.secretPortals ?? []).filter((item) => item.secretId !== secretId), {
                id: `${secretId}-portal`, index: assignedLocation.index, y: assignedLocation.y, secretId,
            }];
        });
    });
}

function getPortalPlacementLabel(level: Level) {
    const assignedTargets = Object.entries(portalAssignments)
        .filter(([, sourceName]) => sourceName === level.name)
        .map(([targetId]) => secretPortalTargetLabels[targetId] ?? targetId);
    const generatedTargets = (level.secretPortals ?? [])
        .map((portal) => secretPortalTargetLabels[portal.secretId] ?? portal.secretId);
    const targets = [...new Set([...assignedTargets, ...generatedTargets])];
    if (targets.length) return `SECRET PORTAL → ${targets.join(", ")}`;
    return level.portals?.length ? "PORTAL" : "NO PORTAL";
}

export function startApp() {
    refreshProgressStateFromStorage();
    loadCustomLevels();
    normalizeNonPrestigeLevels(levels);
    normalizePrestigeLevels(levels);
    configurePortalDistribution();
    document.body.innerHTML = "";
    chatController?.remove();
    chatController = createChat({ getUser: () => currentOnlineUser, onUnread: (pending) => { pendingFriendRequests = pending; updateOwnerAccountIndicator(); }, onMessage: (notification) => { playSound("message"); showGameChatNotice(notification); }, onProfile: (id) => showLeaderboardPlayerProfile(id, showLeaderboard) });
    const chatMountObserver = new MutationObserver(() => chatController?.mount());
    chatMountObserver.observe(document.body, { childList: true });
    ownerBadgeObserver ??= new MutationObserver(updateOwnerAccountIndicator);
    ownerBadgeObserver.observe(document.body, { childList: true });
    void refreshOnlineState().then(() => {
        if (document.querySelector(".home-screen")) showMenu();
    }).catch((error: unknown) => { console.error("Could not load shared game settings:", error); });
    if (!presenceHeartbeatTimer) presenceHeartbeatTimer = globalThis.setInterval(() => void sendPresenceHeartbeat(), 10_000);
    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("keyup", handleKeyUp);
    globalThis.addEventListener("blur", () => pressedKeys.clear());
    document.addEventListener("click", unlockMusic, { once: true });
    document.addEventListener("keydown", unlockMusic, { once: true });
    document.addEventListener("click", (event) => {
        if ((event.target as HTMLElement).closest("button, select, summary")) playSound("ui");
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && currentOnlineUser && !offlineOwnerMode) void sendPresenceHeartbeat();
        if (document.hidden && !offlineOwnerMode && currentOnlineUser && loadedAccountProgressFor === accountIdentity(currentOnlineUser)) {
            void syncAccountProgress("save", true).catch((error: unknown) => console.error("Could not save account progress while leaving the page:", error));
        }
        if (!musicContext) return;
        if (document.hidden) void musicContext.suspend();
        else if (musicUnlocked) void musicContext.resume().catch((error: unknown) => console.error("Could not resume background music:", error));
    });
    if (!accountProgressTimer) accountProgressTimer = globalThis.setInterval(() => {
        if (!offlineOwnerMode && currentOnlineUser && loadedAccountProgressFor === accountIdentity(currentOnlineUser)) void syncAccountProgress("save").catch((error: unknown) => console.error("Could not sync account progress:", error));
    }, 1000);
    if (!accountNoticeTimer) accountNoticeTimer = globalThis.setInterval(() => void refreshAccountNotices(), 7000);
    showMenu();
}

async function refreshAccountNotices() {
    try {
        const originalSessionVersion = onlineSessionVersion;
        const session = await apiRequest<{ user: OnlineUser | null }>("/auth/session");
        if (onlineSessionVersion !== originalSessionVersion) return;
        const previousRole = currentOnlineUser?.role;
        setOnlineUser(session.user);
        updateOwnerAccountIndicator();
        if (previousRole && currentOnlineUser && previousRole !== currentOnlineUser.role
            && document.querySelector(".tester-screen")
            && !(hasTesterTools() || hasModerationTools() || hasWorkshopTools())) {
            showMenu();
        }
        if (!currentOnlineUser || accountNoticeOpen) return;
        const response = await apiRequest<{ messages: { id: string; title: string; body: string; type: string; acknowledged: boolean }[] }>("/messages");
        const message = response.messages.find((candidate) => !candidate.acknowledged);
        if (message) showAccountNotice(message);
    } catch (error) {
        if (currentOnlineUser) console.error("Could not refresh player messages:", error);
    }
}

function showAccountNotice(message: { id: string; title: string; body: string; type: string }) {
    accountNoticeOpen = true;
    const overlay = document.createElement("div");
    overlay.className = `player-message-overlay message-${["info", "warning", "reward"].includes(message.type) ? message.type : "info"}`;
    const dialog = document.createElement("section");
    dialog.className = "player-message-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "player-message-title");
    const title = document.createElement("h2");
    title.id = "player-message-title";
    title.textContent = message.title;
    const body = document.createElement("p");
    body.textContent = message.body;
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    const acknowledge = document.createElement("button");
    acknowledge.className = "menu-button";
    acknowledge.textContent = "OK";
    acknowledge.addEventListener("click", async () => {
        acknowledge.disabled = true;
        status.textContent = "Saving...";
        try {
            await apiRequest(`/messages/${encodeURIComponent(message.id)}/ack`, { method: "POST", body: "{}" });
            overlay.remove();
            accountNoticeOpen = false;
            void refreshAccountNotices();
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Could not acknowledge this message. Try again.";
            acknowledge.disabled = false;
        }
    });
    dialog.append(title, body, status, acknowledge);
    overlay.append(dialog);
    document.documentElement.append(overlay);
}

function stopProceduralMusic() {
    musicOscillators.forEach((oscillator) => {
        try { oscillator.stop(); } catch { /* already stopped */ }
    });
    musicOscillators = [];
    stopMusicSequence();
}

function startProceduralMusic() {
    if (!musicContext || musicOscillators.length) return;
    [65.41, 98, 130.81].forEach((frequency, index) => {
        const oscillator = musicContext!.createOscillator();
        const voice = musicContext!.createGain();
        oscillator.type = index === 1 ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        voice.gain.value = index === 0 ? 0.24 : 0.08;
        oscillator.connect(voice);
        voice.connect(musicFilter!);
        oscillator.start();
        musicOscillators.push(oscillator);
    });
}

function stopExternalMusic(resetPosition = true) {
    externalMusicAudio?.pause();
    if (resetPosition && externalMusicAudio) externalMusicAudio.currentTime = 0;
    externalMusicSource?.disconnect();
    externalMusicSource = null;
    if (resetPosition) externalMusicAudio = null;
}

function configureExternalMusic() {
    const track = MUSIC_TRACKS.find((candidate) => candidate.id === selectedMusicTrackId);
    if (!musicContext || !musicFilter || !track?.source) return null;
    const sourceUrl = new URL(track.source, globalThis.location.href).href;
    if (!externalMusicAudio || externalMusicAudio.src !== sourceUrl) {
        stopExternalMusic();
        externalMusicAudio = new Audio(track.source);
        externalMusicAudio.loop = true;
        externalMusicAudio.preload = "auto";
    }
    if (!externalMusicSource) {
        externalMusicSource = musicContext.createMediaElementSource(externalMusicAudio);
        externalMusicSource.connect(musicFilter);
    }
    return externalMusicAudio;
}

function startExternalMusic() {
    const audio = configureExternalMusic();
    if (!audio || musicMuted) return;
    void audio.play().catch((error: unknown) => {
        console.warn("Could not start selected music track until the next user interaction:", error);
    });
}

function unlockMusic() {
    if (musicUnlocked || musicMuted) return;
    if (typeof AudioContext === "undefined") return;
    musicUnlocked = true;
    try {
        musicContext = new AudioContext();
        musicFilter = musicContext.createBiquadFilter();
        musicFilter.type = "lowpass";
        musicFilter.frequency.value = 1500;
        musicFilter.Q.value = 0.45;
        musicGain = musicContext.createGain();
        musicGain.gain.value = 0;
        musicFilter.connect(musicGain);
        musicGain.connect(musicContext.destination);
        if (selectedMusicTrackId === "original") startProceduralMusic();
        else configureExternalMusic();
        void musicContext.resume().then(() => {
            fadeMusicTo(musicMuted ? 0 : getMusicOutputGain());
            if (selectedMusicTrackId === "original") scheduleMusicStep(80);
            else startExternalMusic();
        }).catch((error: unknown) => {
            console.error("Could not resume background music:", error);
        });
    } catch (error) {
        musicSequenceTimer = null;
        musicFilter = null;
        musicGain = null;
        musicUnlocked = false;
        console.error("Could not initialize background music:", error);
    }
}

const MUSIC_STEP_MS = 390;
const MUSIC_PATTERNS: Record<MusicScene, readonly number[]> = {
    menu: [0, 2, 4, 7, 9, 7, 4, 2, 0, 4, 7, 9, 12, 9, 7, 4],
    normal: [0, 4, 7, 9, 12, 9, 7, 4, 0, 4, 7, 12, 9, 7, 4, 2],
    prestige: [2, 4, 7, 9, 12, 9, 7, 4, 2, 7, 9, 12, 14, 12, 9, 7],
    secret: [0, 2, 4, 7, 9, 12, 9, 7, 0, 4, 7, 9, 12, 14, 12, 9],
    boss: [0, 2, 4, 7, 9, 7, 4, 2, 0, 2, 7, 9, 7, 4, 2, 0],
};

function musicSceneRoot(scene: MusicScene) {
    return scene === "prestige" ? 73.42 : scene === "secret" ? 55 : scene === "boss" ? 49 : scene === "normal" ? 65.41 : 55;
}

function stopMusicSequence() {
    if (musicSequenceTimer !== null) {
        globalThis.clearTimeout(musicSequenceTimer);
        musicSequenceTimer = null;
    }
}

function scheduleMusicStep(delay = MUSIC_STEP_MS) {
    if (selectedMusicTrackId !== "original" || !musicUnlocked || musicMuted || !musicContext || musicSequenceTimer !== null) return;
    musicSequenceTimer = globalThis.setTimeout(() => {
        musicSequenceTimer = null;
        playMusicStep();
        scheduleMusicStep();
    }, delay);
}

function playMusicStep() {
    const context = musicContext;
    const filter = musicFilter;
    if (selectedMusicTrackId !== "original" || !musicUnlocked || musicMuted || !context || !filter) return;
    const pattern = MUSIC_PATTERNS[musicScene];
    const interval = pattern[musicStep % pattern.length];
    const octave = musicStep % 16 >= 8 ? 1 : 0;
    const frequency = musicSceneRoot(musicScene) * 2 ** ((interval + octave * 12) / 12);
    const oscillator = context.createOscillator();
    const voice = context.createGain();
    const now = context.currentTime;
    const duration = musicScene === "boss" ? 0.28 : 0.46;
    oscillator.type = musicScene === "boss" ? "triangle" : musicStep % 4 === 0 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.detune.setValueAtTime(musicScene === "secret" ? 2 : 0, now);
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.exponentialRampToValueAtTime(musicScene === "boss" ? 0.055 : 0.075, now + 0.035);
    voice.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(voice);
    voice.connect(filter);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
    // A soft low pulse gives the melody a beat without turning the calm
    // soundtrack into a harsh drum loop.
    const pulse = context.createOscillator();
    const pulseGain = context.createGain();
    const isDownbeat = musicStep % 4 === 0;
    pulse.type = "sine";
    pulse.frequency.setValueAtTime(isDownbeat ? musicSceneRoot(musicScene) : musicSceneRoot(musicScene) * 1.5, now);
    pulse.frequency.exponentialRampToValueAtTime(Math.max(35, musicSceneRoot(musicScene) * 0.5), now + 0.16);
    pulseGain.gain.setValueAtTime(0.0001, now);
    pulseGain.gain.exponentialRampToValueAtTime(isDownbeat ? 0.055 : 0.018, now + 0.012);
    pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    pulse.connect(pulseGain);
    pulseGain.connect(filter);
    pulse.start(now);
    pulse.stop(now + 0.23);
    musicStep++;
}

function getMusicOutputGain() {
    // A gentle curve makes the upper half of the settings slider clearly
    // louder while keeping low-volume listening comfortable.
    return Math.pow(Math.max(0, Math.min(1, musicVolume)), 0.82) * 0.52;
}

function fadeMusicTo(volume: number) {
    if (!musicContext || !musicGain) return;
    const now = musicContext.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(musicGain.gain.value, now);
    musicGain.gain.linearRampToValueAtTime(volume, now + 2);
}

function setMusicVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    musicVolume = Math.max(0, Math.min(1, volume));
    localStorage.setItem("orbit-music-volume", String(musicVolume));
    if (musicUnlocked) fadeMusicTo(musicMuted ? 0 : getMusicOutputGain());
}

function setMusicTrack(trackId: MusicTrackId) {
    if (!MUSIC_TRACKS.some((track) => track.id === trackId)) return;
    selectedMusicTrackId = trackId;
    localStorage.setItem("orbit-music-track", trackId);
    stopMusicSequence();
    stopProceduralMusic();
    stopExternalMusic();
    if (!musicUnlocked || musicMuted) return;
    if (selectedMusicTrackId === "original") {
        startProceduralMusic();
        scheduleMusicStep(80);
    } else {
        startExternalMusic();
    }
}

function setMusicMuted(muted: boolean) {
    musicMuted = muted;
    localStorage.setItem("orbit-music-muted", String(muted));
    if (muted) {
        stopMusicSequence();
        externalMusicAudio?.pause();
        fadeMusicTo(0);
    } else if (!musicUnlocked) unlockMusic();
    else {
        fadeMusicTo(getMusicOutputGain());
        if (selectedMusicTrackId === "original") scheduleMusicStep(80);
        else startExternalMusic();
    }
}

function setMusicScene(scene: MusicScene) {
    musicScene = scene;
    const rootFrequency = musicSceneRoot(scene);
    if (musicContext) {
        [rootFrequency, rootFrequency * 1.5, rootFrequency * 2].forEach((frequency, index) => {
            const oscillator = musicOscillators[index];
            if (oscillator) oscillator.frequency.setTargetAtTime(frequency, musicContext!.currentTime, 0.65);
        });
        musicFilter?.frequency.setTargetAtTime(scene === "boss" ? 1900 : scene === "secret" ? 1700 : 1500, musicContext.currentTime, 0.45);
    }
    scheduleMusicStep(120);
}

function playSound(kind: "shoot" | "enemy" | "explode" | "ability" | "ui" | "roulette" | "reward" | "lose" | "message") {
    if (!musicContext || musicMuted) return;
    try {
        const frequencies: Record<typeof kind, number> = {
            shoot: 420, enemy: 180, explode: 90, ability: 620, ui: 300,
            roulette: 260, reward: 880, lose: 70, message: 540,
        };
        const oscillator = musicContext.createOscillator();
        const gain = musicContext.createGain();
        const now = musicContext.currentTime;
        oscillator.type = kind === "explode" || kind === "lose" ? "sawtooth" : kind === "reward" || kind === "roulette" || kind === "message" ? "triangle" : "square";
        oscillator.frequency.setValueAtTime(frequencies[kind], now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequencies[kind] * (kind === "reward" ? 1.5 : kind === "message" ? 1.15 : 0.55)), now + (kind === "ui" ? 0.07 : 0.18));
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, musicVolume * 0.12), now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "explode" || kind === "lose" ? 0.38 : kind === "message" ? 0.24 : 0.16));
        oscillator.connect(gain);
        gain.connect(musicContext.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
    } catch (error) {
        console.error("Could not play game sound:", error);
    }
}

function updateOwnerAccountIndicator() {
    document.querySelectorAll<HTMLElement>(".pending-friend-badge").forEach((badge) => { badge.textContent = pendingFriendRequests ? String(pendingFriendRequests) : ""; badge.hidden = pendingFriendRequests === 0; });
    const existing = document.querySelector<HTMLElement>(".owner-account-indicator");
    if (currentOnlineUser && (hasTesterTools() || hasModerationTools() || hasWorkshopTools())) {
        const indicator = existing instanceof HTMLButtonElement ? existing : document.createElement("button");
        if (existing && existing !== indicator) existing.remove();
        indicator.className = `owner-account-indicator ${currentOnlineUser.role === "owner" ? "owner-role" : currentOnlineUser.role === "admin" ? "admin-role" : currentOnlineUser.role === "moderator" ? "moderator-role" : currentOnlineUser.role === "level-maker" ? "level-maker-role" : "tester-role"}`;
        indicator.type = "button";
        indicator.textContent = getRoleBadge(currentOnlineUser.role);
        indicator.setAttribute("aria-label", `Open ${currentOnlineUser.role} quick panel for ${currentOnlineUser.username}`);
        indicator.title = `${roleLabel(currentOnlineUser.role)} quick panel — ${currentOnlineUser.username}`;
        indicator.onclick = () => gameActive ? openRoleQuickPanel() : void showTesterPanel();
        if (!existing || existing !== indicator) document.body.prepend(indicator);
    } else {
        roleQuickPanel?.remove();
        roleQuickPanel = null;
        existing?.remove();
    }
}

function updateCurrencyHud() {
    const currency = document.querySelector<HTMLElement>(".asteroid-currency");
    if (currency) currency.textContent = `NORMAL ${asteroidsClaimed} / SPECIAL ${specialAsteroids}`;
}

function closeRoleQuickPanel() {
    roleQuickPanel?.remove();
    roleQuickPanel = null;
    if (!gameActive || !roleQuickPanelStartedAt) return;
    const pausedFor = Math.max(0, performance.now() - roleQuickPanelStartedAt);
    if (gameStarted) levelStartedAt += pausedFor;
    if (rapidUntil > roleQuickPanelStartedAt) rapidUntil += pausedFor;
    if (rapidCannonUntil > roleQuickPanelStartedAt) rapidCannonUntil += pausedFor;
    if (portalCooldownUntil > roleQuickPanelStartedAt) portalCooldownUntil += pausedFor;
    roleQuickPanelStartedAt = 0;
    lastFrameTimestamp = 0;
    pressedKeys.clear();
    shootingHeld = false;
    startGameLoop();
}

function openRoleQuickPanel() {
    if (!currentOnlineUser || !hasTesterTools()) return;
    if (roleQuickPanel) return;
    if (portalTravelInProgress) {
        statusLabel.textContent = "Finish the portal transition before opening quick tools.";
        return;
    }
    roleQuickPanelStartedAt = performance.now();
    cancelAnimationFrame(animationFrame);
    pressedKeys.clear();
    shootingHeld = false;
    const isOwner = currentOnlineUser.role === "owner";
    const overlay = document.createElement("div");
    overlay.className = `role-quick-overlay ${isOwner ? "owner-quick-overlay" : "tester-quick-overlay"}`;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "role-quick-title");
    const panel = document.createElement("section");
    panel.className = "role-quick-panel";
    const heading = document.createElement("h2");
    heading.id = "role-quick-title";
    heading.textContent = `${currentOnlineUser.role === "tester" ? "Tester" : roleLabel(currentOnlineUser.role)} quick tools`;
    const description = document.createElement("p");
    description.textContent = "Paused in this level. These shortcuts change your own test profile; shared rules are managed in the full control center.";
    const status = document.createElement("small");
    status.className = "role-quick-status";
    status.setAttribute("role", "status");
    const form = document.createElement("form");
    form.className = "role-quick-form";
    const field = (labelText: string, value: number, max = 100000000) => {
        const label = document.createElement("label");
        label.append(document.createTextNode(labelText));
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = String(max);
        input.step = "1";
        input.value = String(value);
        label.append(input);
        form.append(label);
        return input;
    };
    const claims = field("Normal asteroids", asteroidsClaimed);
    const special = field("Special asteroids", specialAsteroids);
    const inventory = getInventory();
    const powerupInputs = (Object.keys(powerupLabels) as PowerupKind[]).map((kind) => [kind, field(powerupLabels[kind], inventory[kind], 100000)] as const);
    const apply = document.createElement("button");
    apply.type = "submit";
    apply.className = "menu-button";
    apply.textContent = "Apply resources";
    form.append(apply);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const read = (input: HTMLInputElement, max: number) => Math.max(0, Math.min(max, Math.floor(Number(input.value) || 0)));
        asteroidsClaimed = read(claims, 100000000);
        specialAsteroids = read(special, 100000000);
        localStorage.setItem("orbit-claims", String(asteroidsClaimed));
        localStorage.setItem("orbit-special-claims", String(specialAsteroids));
        const nextInventory = { ...inventory };
        powerupInputs.forEach(([kind, input]) => { nextInventory[kind] = read(input, 100000); });
        saveInventory(nextInventory);
        updateCurrencyHud();
        updatePowerupHud();
        status.textContent = "Your resources were updated on this device.";
        if (currentOnlineUser) void syncAccountProgress("save", true).catch((error: unknown) => { status.textContent = `Saved locally; account sync failed: ${error instanceof Error ? error.message : "online service error"}`; });
    });
    const levelActions = document.createElement("div");
    levelActions.className = "role-quick-actions";
    const actionButton = (text: string, action: () => void, confirmText = "") => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "text-button";
        button.textContent = text;
        button.addEventListener("click", () => {
            if (confirmText) {
                void showActionDialog({ title: "Confirm action", description: confirmText, confirmLabel: text, danger: true }).then((dialog) => {
                    if (dialog.confirmed) action();
                });
                return;
            }
            action();
        });
        levelActions.append(button);
        return button;
    };
    actionButton("Collect all current asteroids", () => {
        let collected = 0;
        const claimed = getClaimedAsteroids(currentLevel);
        levelAsteroids.forEach((asteroid, index) => {
            if (asteroid.claimed) return;
            asteroid.claimed = true;
            claimed.add(index);
            collected++;
            if (asteroid.special) specialAsteroids++;
            else asteroidsClaimed++;
        });
        saveClaimedAsteroids(currentLevel, claimed);
        localStorage.setItem("orbit-claims", String(asteroidsClaimed));
        localStorage.setItem("orbit-special-claims", String(specialAsteroids));
        document.querySelectorAll<HTMLElement>(".asteroid").forEach((item) => item.classList.add("claimed"));
        claimLabel.textContent = `${levelAsteroids.length} / ${levelAsteroids.length}`;
        updateCurrencyHud();
        status.textContent = collected ? `Collected ${collected} asteroid${collected === 1 ? "" : "s"}.` : "All current asteroids were already collected.";
    }, "Collect every asteroid in this level?");
    actionButton("Grant current route keys", () => {
        const targets = levels[currentLevel].secretPortals ?? [];
        targets.forEach((portal) => markSecretPortalClaimed(portal.secretId));
        if (levels[currentLevel].secretId) localStorage.setItem(`orbit-key-${levels[currentLevel].secretId}`, "1");
        status.textContent = targets.length ? "Keys for this route are unlocked." : "This route has no secret key target.";
    });
    actionButton("Clear current enemies", () => {
        levelEnemies.forEach((enemy) => { enemy.defeated = true; });
        levelMiniBosses.forEach((miniBoss) => { miniBoss.defeated = true; });
        if (boss) boss.defeated = true;
        document.querySelectorAll<HTMLElement>(".enemy, .mini-boss, .boss").forEach((item) => item.classList.add("defeated"));
        status.textContent = "Current enemies and bosses marked defeated.";
    }, "Clear all enemies and bosses in this level?");
    const footer = document.createElement("div");
    footer.className = "role-quick-footer";
    const full = actionButton(isOwner ? "Open owner control center" : "Open control center", () => {
        closeRoleQuickPanel();
        gameActive = false;
        cancelAnimationFrame(animationFrame);
        void showTesterPanel();
    });
    full.classList.add("role-quick-full");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "text-button";
    close.textContent = "Return to level";
    close.addEventListener("click", closeRoleQuickPanel);
    footer.append(close);
    panel.append(heading, description, form, levelActions, status, footer);
    overlay.append(panel);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeRoleQuickPanel(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); closeRoleQuickPanel(); } });
    document.body.append(overlay);
    roleQuickPanel = overlay;
    close.focus();
}

function showOfflineOwnerUnlock() {
    const overlay = document.createElement("div");
    overlay.className = "offline-owner-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "offline-owner-heading");
    const panel = document.createElement("form");
    panel.className = "offline-owner-panel";
    const heading = document.createElement("h2");
    heading.id = "offline-owner-heading";
    heading.textContent = "Offline owner access";
    const copy = document.createElement("p");
    copy.textContent = "Enter the emergency phrase to open the local-only control center while the online service is unavailable.";
    const phrase = document.createElement("input");
    phrase.type = "password";
    phrase.name = "offline-owner-phrase";
    phrase.autocomplete = "off";
    phrase.placeholder = "Emergency phrase";
    phrase.required = true;
    phrase.setAttribute("aria-label", "Emergency phrase");
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    const actions = document.createElement("div");
    actions.className = "offline-owner-actions";
    const open = document.createElement("button");
    open.type = "submit";
    open.className = "menu-button";
    open.textContent = "Open local control center";
    const cancel = createTextButton("Cancel", () => overlay.remove());
    actions.append(open, cancel);
    panel.append(heading, copy, phrase, status, actions);
    panel.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (phrase.value !== offlineOwnerPassphrase) {
            status.textContent = "Emergency phrase not recognized.";
            phrase.select();
            return;
        }
        const grant = readOfflineOwnerGrant();
        if (!grant) {
            status.textContent = "This device has not been verified for offline owner access. Sign in online with the authorized owner email first.";
            return;
        }
        open.disabled = true;
        status.textContent = "Checking whether the online service is available...";
        try {
            const session = await apiRequest<{ user: OnlineUser | null }>("/auth/session");
            if (session.user) {
                setOnlineUser(session.user);
                updateOwnerAccountIndicator();
                overlay.remove();
                await showTesterPanel();
                return;
            }
            status.textContent = "The online service is available. Sign in to the owner account to continue.";
        } catch (error) {
            const unavailable = isOnlineServiceUnavailable(error);
            if (!unavailable) {
                status.textContent = error instanceof Error ? error.message : "Could not confirm online service status.";
                return;
            }
            offlineOwnerMode = true;
            setApiLocalOnlyMode(true);
            setOnlineUser({ username: grant.username, role: "owner", offlineOwnerEligible: true }, true);
            updateOwnerAccountIndicator();
            overlay.remove();
            await showTesterPanel();
        } finally {
            if (overlay.isConnected) open.disabled = false;
        }
    });
    overlay.append(panel);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
    document.body.append(overlay);
    phrase.focus();
}

function showMenu() {
    if (currentOnlineUser?.mustChangePassword) {
        showAccount("Change your temporary password before continuing.");
        return;
    }
    // The home screen is the root of the in-app navigation stack.
    appPageHistory.length = 0;
    currentAppPage = showMenu;
    gameActive = false;
    roleQuickPanel = null;
    roleQuickPanelStartedAt = 0;
    setMusicScene("menu");
    cancelAnimationFrame(animationFrame);
    pressedKeys.clear();
        const menu = document.createElement("main");
        menu.className = "menu-screen home-screen";
        menu.innerHTML = `<div class="brand-mark">JACER <span>/ 02</span></div><h1>Jacer</h1><p class="menu-copy">Pilot the claim ship through five dangerous sectors. Every asteroid you secure upgrades your flight.</p><div class="home-stats"><span><strong>${asteroidsClaimed}</strong> normal</span><span><strong>${specialAsteroids}</strong> special</span><span><strong>${prestigeLevel}</strong> prestige</span><span><strong>${getCompletedLevelCount()} / ${levels.length}</strong> routes complete</span><span><strong>${getUnlockedSkinCount()}</strong> skins online</span><span><strong>${getUnlockedTrailCount()}</strong> trails online</span></div><p class="prestige-requirement">NEXT PRESTIGE / COMPLETE ALL NORMAL ROUTES</p>`;
    const menuActions = document.createElement("nav"); menuActions.className = "menu-actions";
    menuActions.append(createMenuButton("Launch mission", showLevelMenu), createMenuButton("Customization", showCustomization), createMenuButton("Power-up shop", showShop), createMenuButton("Flight settings", showSettings));
    const accountRail = document.createElement("aside");
    accountRail.className = "account-rail";
    const accountButton = createTextButton(currentOnlineUser ? currentOnlineUser.username : "Account", () => showAccount());
    accountButton.classList.add("account-rail-button");
    const accountBadge = document.createElement("b");
    accountBadge.className = "pending-friend-badge";
    accountBadge.hidden = pendingFriendRequests === 0;
    accountBadge.textContent = pendingFriendRequests ? String(pendingFriendRequests) : "";
    accountButton.append(accountBadge);
    accountButton.setAttribute("aria-label", currentOnlineUser ? `Account: ${currentOnlineUser.username}` : "Open account");
    accountRail.append(accountButton);
    const updateRail = document.createElement("aside");
    updateRail.className = "update-log-rail";
    const updateButton = createTextButton("Updates", () => showCredits("updates"));
    updateButton.classList.add("update-log-rail-button");
    updateButton.setAttribute("aria-label", "Open update log");
    updateRail.append(updateButton);
    const secondaryActions = document.createElement("div"); secondaryActions.className = "secondary-actions"; secondaryActions.append(createTextButton("Special asteroid odds", showDropRates), createTextButton("Credits", showCredits));
    const offlineOwnerButton = createTextButton("Offline owner", showOfflineOwnerUnlock);
    offlineOwnerButton.classList.add("offline-owner-button");
    offlineOwnerButton.setAttribute("aria-label", "Open offline owner access");
    offlineOwnerButton.hidden = true;
    menu.append(updateRail, accountRail, menuActions, secondaryActions, offlineOwnerButton);
    menu.append(createPageCounter()); document.body.replaceChildren(menu);
    if (readOfflineOwnerGrant()) {
        const updateOfflineOwnerControl = async () => {
            try {
                await apiRequest("/health");
                if (menu.isConnected) offlineOwnerButton.hidden = true;
            } catch (error) {
                if (menu.isConnected && isOnlineServiceUnavailable(error)) offlineOwnerButton.hidden = false;
            }
        };
        void updateOfflineOwnerControl();
        const offlineOwnerCheck = globalThis.setInterval(() => {
            if (!menu.isConnected) return globalThis.clearInterval(offlineOwnerCheck);
            void updateOfflineOwnerControl();
        }, 10_000);
    }
}

function showLevelMenu() {
    enterAppPage(showLevelMenu);
    gameActive = false;
    roleQuickPanel = null;
    roleQuickPanelStartedAt = 0;
    setMusicScene(activePlanet === "prestige" ? "prestige" : "normal");
    cancelAnimationFrame(animationFrame);
    pressedKeys.clear();
    if (isLevelMakerPreview) {
        levelMakerPreviewReturn?.();
        return;
    }
        const menu = document.createElement("main");
        menu.className = "menu-screen level-menu";
        menu.innerHTML = `<p class="eyebrow">MISSION SELECT / ${activePlanet === "prestige" ? "RINGED PLANET" : "BLUE PLANET"}</p><h1>Choose your <em>sector</em></h1><p class="menu-copy">Claim the asteroids in order. New sectors unlock after the previous beacon is reached.</p>`;
        const planetButton = createMenuButton(activePlanet === "normal" ? `Fly to prestige planet (${formatControlBinding(controlBindings.switchPlanet)})` : `Return to blue planet (${formatControlBinding(controlBindings.switchPlanet)})`, switchPlanet);
        if (activePlanet === "normal" && !canVisitPrestigePlanet()) {
            planetButton.disabled = true;
            planetButton.textContent = "Prestige planet locked / reach prestige 1";
            planetButton.classList.add("locked");
        }
        menu.append(planetButton, createTextButton("Online leaderboard", showLeaderboard));
        if (activePlanet === "normal" && canClaimPrestige()) {
            menu.append(createMenuButton("Prestige now", showPrestigeConfirmation));
        }
    const levelList = document.createElement("div");
    levelList.className = "level-list";
    levels.forEach((level, index) => {
        if (level.secret || Boolean(level.prestige) !== (activePlanet === "prestige")) return;
        const visibleLevels = levels.filter((candidate) => !candidate.secret && Boolean(candidate.prestige) === (activePlanet === "prestige"));
        const routeIndex = visibleLevels.indexOf(level);
        const unlocked = hasOwnerAccess() || (level.secret ? isSecretLevelUnlocked(level) : Boolean(level.customId || level.localOnly) || routeIndex === 0 || Number(localStorage.getItem(`orbit-level-${index}`) ?? "0") === 1);
        const button = document.createElement("button");
        button.className = `level-button ${level.secret ? "secret-level" : ""} ${unlocked ? "" : "locked"}`;
        button.type = "button";
        button.disabled = !unlocked;
        const requiredPrestige = Math.min(level.prestigeRequirement ?? 1, prestigeMax);
        const prestigeLocked = activePlanet === "prestige" && isPrestigeRouteLocked(level);
        button.disabled = !unlocked || prestigeLocked;
        const lockMessage = prestigeLocked ? `LOCKED / reach prestige ${requiredPrestige}` : "LOCKED / clear the previous sector";
        const requirementTag = requiredPrestige > 1 ? ` / PRESTIGE ${requiredPrestige}+` : "";
        button.innerHTML = `<span><b>${String(routeIndex + 1).padStart(2, "0")}</b> ${level.name}</span><small>${button.disabled ? lockMessage : `${level.asteroids.length} asteroids${requirementTag} / ${level.briefing}`}</small>`;
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
    enterAppPage(showSecretLevels);
    gameActive = false;
    setMusicScene("secret");
    cancelAnimationFrame(animationFrame);
    const menu = document.createElement("main");
    menu.className = "menu-screen level-menu secret-menu";
    menu.innerHTML = `<p class="eyebrow">WHITE HOLE / ${activePlanet === "prestige" ? "PRESTIGE " : ""}HIDDEN ROUTES</p><h1>Secret <em>space</em></h1><p class="menu-copy">${activePlanet === "prestige" ? "Prestige keys open these harder ringed-planet routes." : "Special asteroids appear here. Defeat the keeper bosses to unlock unusual ships."}</p>`;
    const levelList = document.createElement("div");
    levelList.className = "level-list";
    levels.forEach((level, index) => {
        if (!level.secret || Boolean(level.prestige) !== (activePlanet === "prestige")) return;
        const unlocked = isSecretLevelUnlocked(level);
        const cooldownUntil = level.secretId ? Number(localStorage.getItem(`orbit-secret-cooldown-${level.secretId}`) ?? "0") + SECRET_LEVEL_COOLDOWN_MS : 0;
        const remainingMs = Math.max(0, cooldownUntil - Date.now());
        const button = document.createElement("button");
        button.className = `level-button secret-level ${unlocked ? "" : "locked"}`;
        button.type = "button";
        button.disabled = !unlocked || remainingMs > 0;
        const claimed = getClaimedAsteroids(index).size;
        const readyText = remainingMs <= 0 && claimed > 0 ? "SPECIAL ASTEROIDS READY" : "";
        const cooldownText = remainingMs > 0 ? `AVAILABLE IN ${formatCooldown(remainingMs)}` : readyText;
        button.innerHTML = `<span><b>??</b> ${level.name}</span><small>${!unlocked ? `LOCKED / find its ${level.prestige ? "prestige " : ""}key` : cooldownText || `${level.prestige ? "PRESTIGE SECRET / " : ""}${level.asteroids.length} special asteroids / ${level.briefing}`}</small>`;
        if (!button.disabled) button.addEventListener("click", () => startGame(index));
        levelList.append(button);
    });
    menu.append(levelList, createTextButton("Mission select", showLevelMenu), createTextButton("Main menu", showMenu), createPageCounter());
    document.body.replaceChildren(menu);
}

function formatCooldown(milliseconds: number) {
    const seconds = Math.ceil(milliseconds / 1000);
    return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function showSettings() {
    enterAppPage(showSettings);
    gameActive = false;
    roleQuickPanel = null;
    setMusicScene("menu");
    cancelAnimationFrame(animationFrame);
    pressedKeys.clear();
    const menu = document.createElement("main");
    menu.className = "menu-screen settings-screen player-settings-screen";

    const pageHeader = document.createElement("header");
    pageHeader.className = "tester-console-header player-settings-header";
    pageHeader.innerHTML = `<div><p class="eyebrow">FLIGHT SYSTEMS / PLAYER SETTINGS</p><h1>Ship <em>settings</em></h1><p class="menu-copy">Tune the cockpit for your setup. Each section keeps its own controls, and changes are saved on this device.</p></div>`;
    
    const effectsRow = document.createElement("label");
    effectsRow.className = "setting-row";
    effectsRow.innerHTML = `<span><b>Reduced effects</b><small>Calm the glow, trails, and motion.</small></span>`;
    const effectsInput = document.createElement("input");
    effectsInput.type = "checkbox";
    effectsInput.checked = reducedEffects;
    effectsInput.addEventListener("change", () => { reducedEffects = effectsInput.checked; localStorage.setItem("orbit-reduced-effects", String(reducedEffects)); });
    effectsRow.append(effectsInput);
    const musicToggleRow = document.createElement("label");
    musicToggleRow.className = "setting-row";
    musicToggleRow.innerHTML = `<span><b>Background music</b><small>Soft procedural space ambience. Starts after your first click or key press.</small></span>`;
    const musicToggle = document.createElement("input");
    musicToggle.type = "checkbox";
    musicToggle.checked = !musicMuted;
    musicToggle.addEventListener("change", () => setMusicMuted(!musicToggle.checked));
    musicToggleRow.append(musicToggle);
    const musicTrackRow = document.createElement("label");
    musicTrackRow.className = "setting-row music-track-row";
    musicTrackRow.innerHTML = `<span><b>Music selection</b><small>Choose a calm space track. Your choice is saved on this device.</small></span>`;
    const musicTrackSelect = document.createElement("select");
    musicTrackSelect.setAttribute("aria-label", "Music selection");
    MUSIC_TRACKS.forEach((track) => {
        const option = document.createElement("option");
        option.value = track.id;
        option.textContent = track.name;
        option.selected = track.id === selectedMusicTrackId;
        musicTrackSelect.append(option);
    });
    musicTrackSelect.addEventListener("change", () => setMusicTrack(musicTrackSelect.value as MusicTrackId));
    musicTrackRow.append(musicTrackSelect);
    const musicVolumeRow = document.createElement("label");
    musicVolumeRow.className = "setting-row music-volume-row";
    musicVolumeRow.innerHTML = `<span><b>Music volume</b><small>Saved on this device and applied live.</small></span>`;
    const musicVolumeInput = document.createElement("input");
    musicVolumeInput.type = "range";
    musicVolumeInput.min = "0";
    musicVolumeInput.max = "1";
    musicVolumeInput.step = "0.01";
    musicVolumeInput.value = String(musicVolume);
    musicVolumeInput.setAttribute("aria-label", "Background music volume");
    musicVolumeInput.addEventListener("input", () => setMusicVolume(Number(musicVolumeInput.value)));
    musicVolumeRow.append(musicVolumeInput);
    const codeSection = document.createElement("section");
    codeSection.className = "settings-code-section";
    codeSection.innerHTML = `<h2>Redeem a code</h2><p>Enter a code to claim its reward. Each code can only be used as allowed by its rules.</p>`;
    const codeForm = document.createElement("form");
    codeForm.className = "account-profile-form";
    const codeLabel = document.createElement("label");
    codeLabel.textContent = "Code";
    const codeInput = document.createElement("input");
    codeInput.type = "text";
    codeInput.autocomplete = "off";
    codeInput.maxLength = 40;
    codeInput.pattern = "[A-Za-z0-9!?@#$%&*+=._~()\\-]{8,40}";
    codeInput.title = "Use 8-40 letters, numbers, or ! ? @ # $ % & * + = . _ ~ ( ) -";
    codeInput.required = true;
    codeLabel.append(codeInput);
    const codeStatus = document.createElement("small");
    codeStatus.setAttribute("role", "status");
    const redeem = document.createElement("button");
    redeem.className = "menu-button";
    redeem.type = "submit";
    redeem.textContent = "Redeem";
    if (!currentOnlineUser) {
        redeem.disabled = true;
        codeStatus.textContent = "Sign in to redeem a code.";
    }
    codeForm.append(codeLabel, redeem, codeStatus);
    codeForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!currentOnlineUser) {
            codeStatus.textContent = "Sign in to redeem a code.";
            return;
        }
        redeem.disabled = true;
        codeStatus.textContent = "Saving progress before checking the code...";
        let redemptionIdentity: string | null = null;
        let redemptionStarted = false;
        try {
            await syncAccountProgress("save", true);
            if (!currentOnlineUser) throw new Error("Sign in to redeem a code.");
            redemptionIdentity = accountIdentity(currentOnlineUser);
            const sentProgress = getLocalAccountProgress();
            accountRedemptionInFlight = true;
            redemptionStarted = true;
            codeStatus.textContent = "Checking code...";
            const result = await apiRequest<{ reward: CodeReward }>("/codes/redeem", {
                method: "POST",
                body: JSON.stringify({ code: codeInput.value.trim().toUpperCase() }),
            });
            codeInput.value = "";
            try {
                const { progress } = await apiRequest<{ progress: Record<string, string> | null }>("/account/progress");
                if (!progress || accountIdentity(currentOnlineUser) !== redemptionIdentity) throw new Error("The updated account progress could not be loaded.");
                applySyncedProgress(sentProgress, progress);
                lastSyncedAccountProgress = serializeAccountProgress(progress);
                rememberProgressSnapshot(redemptionIdentity, progress);
                loadedAccountProgressFor = redemptionIdentity;
                codeStatus.textContent = `Success: ${describeCodeReward(result.reward)} added to your account.`;
            } catch (error) {
                if (accountIdentity(currentOnlineUser) === redemptionIdentity) {
                    loadedAccountProgressFor = null;
                    lastSyncedAccountProgress = "";
                }
                console.error("Could not refresh the redeemed code reward:", error);
                codeStatus.textContent = `Success: ${describeCodeReward(result.reward)} saved online. Cloud saving is paused; sign in again to refresh this device.`;
            }
        } catch (error) {
            const definiteRejection = error instanceof ApiError && error.status >= 400 && error.status < 500;
            if (redemptionStarted && !definiteRejection && accountIdentity(currentOnlineUser) === redemptionIdentity) {
                loadedAccountProgressFor = null;
                lastSyncedAccountProgress = "";
                codeStatus.textContent = "Could not confirm whether the code was redeemed. Cloud saving is paused; sign in again to refresh your account before retrying.";
            } else {
                codeStatus.textContent = error instanceof Error ? error.message : "Could not redeem this code.";
            }
        } finally {
            accountRedemptionInFlight = false;
            redeem.disabled = !currentOnlineUser;
        }
    });
    codeSection.append(codeForm);
    const controlsSection = document.createElement("section");
    controlsSection.className = "custom-controls-settings";
    controlsSection.innerHTML = `<h2>Keyboard controls</h2><p>Choose a key for each action. Your bindings are saved on this device.</p>`;
    const controlsStatus = document.createElement("small");
    controlsStatus.setAttribute("role", "status");
    const controlLabels: Record<ControlAction, string> = {
        left: "Move left",
        right: "Move right",
        jump: "Jump",
        down: "Move down",
        shoot: "Fire cannon",
        restart: "Restart level",
        back: "Back / exit menu",
        confirm: "Select level",
        switchPlanet: "Switch normal / prestige planet",
    };
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
            globalThis.addEventListener("keydown", captureKey, { once: true });
        });
        controlsSection.append(button);
    });
    controlsSection.append(createTextButton("Reset keyboard controls", () => {
        controlBindings = { ...DEFAULT_CONTROL_BINDINGS };
        localStorage.setItem("orbit-controls", JSON.stringify(controlBindings));
        showSettings();
    }), controlsStatus);
    // Completion times display.
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
    
    const gameplayPanel = document.createElement("section");
    gameplayPanel.className = "player-settings-category";
    gameplayPanel.dataset.controlSection = "gameplay";
    gameplayPanel.hidden = true;
    gameplayPanel.append(effectsRow);

    const audioPanel = document.createElement("section");
    audioPanel.className = "player-settings-category";
    audioPanel.dataset.controlSection = "audio";
    audioPanel.hidden = true;
    audioPanel.append(musicToggleRow, musicTrackRow, musicVolumeRow);

    const progressPanel = document.createElement("section");
    progressPanel.className = "player-settings-category";
    progressPanel.dataset.controlSection = "progress";
    progressPanel.hidden = true;
    progressPanel.append(codeSection, timesSection);

    const controlsPanel = document.createElement("section");
    controlsPanel.className = "player-settings-category";
    controlsPanel.dataset.controlSection = "controls";
    controlsPanel.hidden = true;
    controlsPanel.append(controlsSection);

    const sections: ControlSection[] = [
        { id: "gameplay", title: "Gameplay", group: "Flight setup", description: "Adjust visual effects for your flight.", panel: gameplayPanel },
        { id: "audio", title: "Audio", group: "Flight setup", description: "Turn the procedural soundtrack on or off and set its volume.", panel: audioPanel },
        { id: "controls", title: "Controls", group: "Flight setup", description: "Remap movement and combat actions to the keys that feel natural to you.", panel: controlsPanel },
        { id: "progress", title: "Progress & codes", group: "Pilot data", description: "Redeem rewards and review your best times without crowding the flight controls.", panel: progressPanel },
    ];

    if (currentOnlineUser && (hasTesterTools() || hasModerationTools() || hasWorkshopTools())) {
        const testerRow = document.createElement("div");
        testerRow.className = "tester-entry";
        testerRow.innerHTML = `<span><b>${roleLabel(currentOnlineUser.role)} panel</b><small>Open the tools authorized for this role.</small></span>`;
        testerRow.append(createTextButton("Open", () => void showTesterPanel()));
        const toolsPanel = document.createElement("section");
        toolsPanel.className = "player-settings-category";
        toolsPanel.dataset.controlSection = "tools";
        toolsPanel.hidden = true;
        toolsPanel.append(testerRow);
        sections.push({ id: "tools", title: `${roleLabel(currentOnlineUser.role)} tools`, group: "Authorized tools", description: "Open the role-specific control center for quick testing and management.", panel: toolsPanel });
    }

    const content = document.createElement("div");
    content.className = "tester-console-content player-settings-content";
    const sectionHeader = document.createElement("div");
    sectionHeader.className = "tester-section-header";
    const sectionGroup = document.createElement("p");
    sectionGroup.className = "eyebrow";
    const sectionTitle = document.createElement("h2");
    const sectionDescription = document.createElement("p");
    sectionHeader.append(sectionGroup, sectionTitle, sectionDescription);
    const panelContainer = document.createElement("div");
    panelContainer.className = "player-settings-panels";
    sections.forEach((section) => panelContainer.append(section.panel));
    content.append(sectionHeader, panelContainer);

    const navigation = createControlNavigation(sections, (section) => selectSection(section.id));
    function selectSection(id: string) {
        const selected = sections.find((section) => section.id === id);
        if (!selected) return;
        sections.forEach((section) => { section.panel.hidden = section !== selected; });
        sectionGroup.textContent = selected.group.toUpperCase();
        sectionTitle.textContent = selected.title;
        sectionDescription.textContent = selected.description;
        navigation.select(id);
        localStorage.setItem("orbit-player-settings-tab", id);
    }

    const consoleLayout = document.createElement("div");
    consoleLayout.className = "tester-console player-settings-console";
    consoleLayout.append(navigation.nav, content);
    const settingsActions = document.createElement("div");
    settingsActions.className = "settings-actions";
    settingsActions.append(
        createMenuButton("Restart current level", () => startGame(currentLevel)),
        createTextButton("Back", showMenu),
    );
    menu.append(pageHeader, consoleLayout, settingsActions, createPageCounter());
    document.body.replaceChildren(menu);

    const previousSection = localStorage.getItem("orbit-player-settings-tab");
    selectSection(sections.some((section) => section.id === previousSection) ? previousSection! : "gameplay");
}

function createProgressArea() {
    const section = document.createElement("section");
    section.className = "account-progress";
    const normalTotal = getNormalRouteCount();
    const normalDone = getNormalRouteCompletionCount();
    const prestigeTarget = Math.max(1, prestigeMax);
    const secretKeys = levels.filter((level) => level.secret && level.secretId && isSecretLevelUnlocked(level)).length;
    const secretTotal = levels.filter((level) => level.secret && level.secretId).length;
    const values = [
        { label: "Normal routes", value: normalDone, total: normalTotal },
        { label: "Prestige", value: prestigeLevel, total: prestigeTarget },
        { label: "Secret keys", value: secretKeys, total: secretTotal },
        { label: "Prestige Gate", value: hasClearedPrestigeGate() ? 1 : 0, total: 1 },
    ];
    const pct = (value: number, total: number) => total > 0 ? Math.min(100, value / total * 100) : 0;
    const overall = Math.round(values.reduce((sum, item) => sum + pct(item.value, item.total), 0) / values.length);
    section.innerHTML = `<h2>Progress</h2>`;
    values.forEach(({ label, value, total }) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "account-progress-row";
        const title = document.createElement("span");
        title.textContent = `${label}: ${value}/${total}`;
        const progress = document.createElement("progress");
        progress.max = 100;
        progress.value = pct(value, total);
        progress.setAttribute("aria-label", title.textContent);
        row.append(title, progress);
        row.addEventListener("click", () => {
            const existing = row.querySelector(".progress-detail");
            if (existing) { existing.remove(); return; }
            const detail = document.createElement("small");
            detail.className = "progress-detail";
            detail.textContent = label === "Normal routes"
                ? `${normalTotal - normalDone} normal route${normalTotal - normalDone === 1 ? "" : "s"} remain before the next prestige.`
                : label === "Prestige"
                    ? `Prestige ${prestigeLevel} of ${prestigeTarget}. Reach prestige 1 to enter the prestige planet; later routes may require more.`
                    : label === "Secret keys"
                        ? `${secretKeys} of ${secretTotal} secret keys or portal routes discovered.`
                        : hasClearedPrestigeGate() ? "The Prestige Gate is cleared." : "Complete every normal route to open the Prestige Gate.";
            row.append(detail);
        });
        section.append(row);
    });
    const overallLabel = document.createElement("p");
    overallLabel.textContent = `Overall prestige progress: ${overall}%`;
    section.append(overallLabel);
    if (canClaimPrestige()) {
        const ready = document.createElement("strong");
        ready.className = "prestige-ready";
        ready.textContent = "Ready to prestige. Enter the Prestige Gate to claim it.";
        section.append(ready);
    }
    const goldenProgress = pct(normalDone, normalTotal);
    const goldenHeading = document.createElement("h3");
    goldenHeading.textContent = "Golden Body";
    const goldenText = document.createElement("p");
    goldenText.textContent = `Complete each normal route in ${formatTime(goldenTimeLimitMs)} or less: ${normalDone}/${normalTotal} (${Math.round(goldenProgress)}%).`;
    const goldenBar = document.createElement("progress");
    goldenBar.max = 100;
    goldenBar.value = goldenProgress;
    goldenBar.setAttribute("aria-label", "Golden Body unlock progress");
    section.append(goldenHeading, goldenText, goldenBar);
    return section;
}

function showCredits(view: "credits" | "updates" = "credits") {
    enterAppPage(showCredits);
    const menu = document.createElement("main"); menu.className = "menu-screen credits-screen";
    if (view === "credits") {
        menu.innerHTML = `<p class="eyebrow">ORBIT RUN / CREDITS</p><h1>Made by <em>the crew</em></h1><p class="menu-copy">A small flight team built every route, ship, and secret.</p><section class="credits-list"><b>vslxped</b><b>Mr. Cline</b><b>riverwth (#1 sql hater)</b></section><p class="music-credit">Music: Original procedural ambience by Jacer, plus CC0 space tracks from OpenGameArt. Choose a soundtrack in Settings.</p>`;
        menu.append(createTextButton("Back", showMenu));
        document.body.replaceChildren(menu);
        return;
    }
    menu.innerHTML = `<p class="eyebrow">ORBIT RUN / FLIGHT UPDATES</p><h1>Update <em>log</em></h1><p class="menu-copy">See the latest additions, fixes, and changes to Jacer.</p>`;
    const updates = document.createElement("section");
    updates.className = "credits-updates";
    const heading = document.createElement("h2");
    heading.textContent = "Update log";
    updates.append(heading);
    if (!updateLogEntries.length) {
        const empty = document.createElement("p");
        empty.textContent = "No updates have been posted yet.";
        updates.append(empty);
    } else {
        let sortedUpdates = [...updateLogEntries].sort((first, second) => second.date.localeCompare(first.date));
        const canEditUpdates = currentOnlineUser?.role === "owner";
        const selectorLabel = document.createElement("label");
        selectorLabel.className = "credits-update-picker";
        selectorLabel.append(document.createTextNode("Browse update history"));
        const selector = document.createElement("select");
        selector.setAttribute("aria-label", "Browse update history");
        sortedUpdates.forEach((entry, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = `${entry.date} — ${entry.title}`;
            selector.append(option);
        });
        selectorLabel.append(selector);
        const updateArticle = document.createElement("article");
        const drawUpdate = (entry: UpdateLogEntry) => {
            const date = document.createElement("time");
            date.dateTime = entry.date;
            date.textContent = entry.date;
            const title = document.createElement("h3");
            title.textContent = entry.title;
            const body = document.createElement("p");
            body.textContent = entry.body;
            updateArticle.replaceChildren(date, title, body);
            if (canEditUpdates) {
                const edit = createTextButton("Edit entry in real time", () => beginInlineUpdateEdit(entry, date, title, body));
                edit.className = "credits-update-edit";
                edit.setAttribute("aria-label", `Edit ${entry.title} in real time`);
                updateArticle.append(edit);
            }
        };
        const beginInlineUpdateEdit = (entry: UpdateLogEntry, date: HTMLTimeElement, title: HTMLElement, body: HTMLElement) => {
            const editor = document.createElement("form");
            editor.className = "credits-update-live-editor";
            const dateInput = document.createElement("input");
            dateInput.type = "date";
            dateInput.value = entry.date;
            dateInput.required = true;
            dateInput.setAttribute("aria-label", "Update date");
            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.value = entry.title;
            titleInput.maxLength = 80;
            titleInput.required = true;
            titleInput.placeholder = "Update title";
            titleInput.setAttribute("aria-label", "Update title");
            const bodyInput = document.createElement("textarea");
            bodyInput.value = entry.body;
            bodyInput.maxLength = 20_000;
            bodyInput.rows = 8;
            bodyInput.required = true;
            bodyInput.placeholder = "Update details";
            bodyInput.setAttribute("aria-label", "Update details");
            const liveStatus = document.createElement("small");
            liveStatus.textContent = "Changes appear above immediately. Save when ready.";
            const syncPreview = () => {
                date.textContent = dateInput.value || "Choose a date";
                date.dateTime = dateInput.value;
                title.textContent = titleInput.value || "Untitled update";
                body.textContent = bodyInput.value;
                liveStatus.textContent = `${bodyInput.value.length.toLocaleString()} / 20,000 characters. Changes appear above immediately.`;
            };
            [dateInput, titleInput, bodyInput].forEach((input) => input.addEventListener("input", syncPreview));
            const save = document.createElement("button");
            save.type = "submit";
            save.className = "menu-button";
            save.textContent = "Save entry";
            const cancel = createTextButton("Cancel edit", () => drawUpdate(entry));
            editor.append(dateInput, titleInput, bodyInput, liveStatus, save, cancel);
            updateArticle.append(editor);
            titleInput.focus();
            editor.addEventListener("submit", async (event) => {
                event.preventDefault();
                if (!dateInput.value || !titleInput.value.trim() || !bodyInput.value.trim()) {
                    liveStatus.textContent = "Date, title, and update details are required.";
                    return;
                }
                const entryIndex = updateLogEntries.indexOf(entry);
                if (entryIndex < 0) {
                    liveStatus.textContent = "This entry is stale. Refresh the update log and try again.";
                    return;
                }
                save.disabled = true;
                cancel.disabled = true;
                liveStatus.textContent = "Saving update entry...";
                try {
                    const nextEntries = updateLogEntries.map((candidate, index) => index === entryIndex
                        ? { date: dateInput.value, title: titleInput.value.trim(), body: bodyInput.value }
                        : { ...candidate });
                    const result = await apiRequest<{ updateLog: UpdateLogEntry[] }>("/settings/update-log", {
                        method: "PUT",
                        body: JSON.stringify({ entries: nextEntries }),
                    });
                    updateLogEntries = result.updateLog;
                    sortedUpdates = [...updateLogEntries].sort((first, second) => second.date.localeCompare(first.date));
                    const updatedEntry = sortedUpdates.find((candidate) => candidate.date === dateInput.value && candidate.title === titleInput.value.trim() && candidate.body === bodyInput.value) ?? sortedUpdates[0];
                    selector.replaceChildren();
                    sortedUpdates.forEach((candidate, index) => {
                        const option = document.createElement("option");
                        option.value = String(index);
                        option.textContent = `${candidate.date} — ${candidate.title}`;
                        option.selected = candidate === updatedEntry;
                        selector.append(option);
                    });
                    drawUpdate(updatedEntry);
                } catch (error) {
                    liveStatus.textContent = error instanceof Error ? error.message : "Could not save this update entry.";
                    save.disabled = false;
                    cancel.disabled = false;
                }
            });
        };
        selector.addEventListener("change", () => drawUpdate(sortedUpdates[Number(selector.value)] ?? sortedUpdates[0]));
        updates.append(selectorLabel, updateArticle);
        drawUpdate(sortedUpdates[0]);
    }
    menu.append(updates);
    menu.append(createTextButton("Back", showMenu)); document.body.replaceChildren(menu);
}

function showAccount(initialMessage = "") {
    enterAppPage(showAccount);
    let registrationMode = false;
    const render = (messageText = initialMessage) => {
        const menu = document.createElement("main");
        menu.className = "menu-screen account-screen";
        menu.innerHTML = `<p class="eyebrow">ONLINE ACCOUNT / PLAYER DATA</p><h1>${currentOnlineUser ? "Your" : registrationMode ? "Create an" : "Sign in to your"} <em>account</em></h1><p class="menu-copy">${currentOnlineUser ? "Your account is signed in on this device." : "Choose a unique username and password. Email is optional and can be added later."}</p>`;
        if (currentOnlineUser) {
            const signedIn = document.createElement("p");
            signedIn.textContent = `Signed in as ${currentOnlineUser.username} / ${roleLabel(currentOnlineUser.role)}.`;
            if (messageText) {
                const message = document.createElement("small");
                message.className = "online-service-status";
                message.setAttribute("role", "status");
                message.textContent = messageText;
                menu.append(signedIn, message);
            } else menu.append(signedIn);
            const dashboard = document.createElement("section");
            dashboard.className = "account-dashboard account-settings-dashboard";
            const statsHeading = document.createElement("h2");
            statsHeading.textContent = "Pilot stats";
            const stats = document.createElement("div");
            stats.className = "account-stats";
            [
                ["Asteroids", String(asteroidsClaimed)],
                ["Special currency", String(specialAsteroids)],
                ["Enemies defeated", String(enemiesKilled)],
                ["Bosses defeated", String(bossesKilled)],
                ["Prestige", `${prestigeLevel} / ${prestigeMax}`],
                ["Routes cleared", `${getCompletedLevelCount()} / ${levels.length}`],
                ["Normal routes", `${getNormalRouteCompletionCount()} / ${getNormalRouteCount()}`],
                ["Golden Body", `${getNormalCompletedLevelCount()} / ${getNormalRouteCount()} under ${formatTime(goldenTimeLimitMs)}`],
                ["Prestige Gate", hasClearedPrestigeGate() ? "Cleared" : "Not cleared"],
                ["Next gate", canClaimPrestige() ? "Ready" : "Complete every normal route"],
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
            const emailLabel = document.createElement("label");
            emailLabel.textContent = "Email address";
            const emailInput = document.createElement("input");
            emailInput.type = "email";
            emailInput.autocomplete = "email";
            emailInput.placeholder = "Add an email address";
            emailInput.setAttribute("aria-label", "Email address");
            emailLabel.append(emailInput);
            const emailStatus = document.createElement("small");
            emailStatus.setAttribute("role", "status");
            const saveEmail = createTextButton("Save email", async () => {
                saveEmail.disabled = true;
                emailStatus.textContent = "Saving email...";
                try {
                    const result = await apiRequest<{ emailMasked: string | null; emailSet: boolean }>("/account/email", { method: "PUT", body: JSON.stringify({ email: emailInput.value }) });
                    emailInput.value = "";
                    emailInput.placeholder = result.emailMasked ? `Saved: ${result.emailMasked}` : "Add an email address";
                    emailStatus.textContent = result.emailSet ? "Email saved." : "Email removed.";
                } catch (error) {
                    emailStatus.textContent = error instanceof Error ? error.message : "Could not save email.";
                } finally { saveEmail.disabled = false; }
            });
            const privacyRow = document.createElement("label");
            privacyRow.className = "account-presence-setting";
            privacyRow.innerHTML = `<span><b>Appear offline</b><small>Hide your online status from the leaderboard, player profiles, and owner player list.</small></span>`;
            const privacyInput = document.createElement("input");
            privacyInput.type = "checkbox";
            privacyInput.checked = Boolean(currentOnlineUser.appearOffline);
            privacyInput.setAttribute("aria-label", "Appear offline");
            const privacyStatus = document.createElement("small");
            privacyStatus.className = "presence-setting-status";
            privacyStatus.setAttribute("role", "status");
            privacyInput.addEventListener("change", async () => {
                const previousValue = Boolean(currentOnlineUser?.appearOffline);
                privacyInput.disabled = true;
                privacyStatus.textContent = "Saving online visibility...";
                try {
                    const result = await apiRequest<{ appearOffline: boolean }>("/account/presence", {
                        method: "PUT",
                        body: JSON.stringify({ appearOffline: privacyInput.checked }),
                    });
                    if (currentOnlineUser) setOnlineUser({ ...currentOnlineUser, appearOffline: result.appearOffline });
                    privacyStatus.textContent = result.appearOffline ? "You will appear offline to other players." : "Your online status is visible to other players.";
                } catch (error) {
                    privacyInput.checked = previousValue;
                    privacyStatus.textContent = error instanceof Error ? error.message : "Could not save online visibility.";
                } finally {
                    privacyInput.disabled = !currentOnlineUser;
                }
            });
            privacyRow.append(privacyInput);
            const friendRequestsRow = document.createElement("label");
            friendRequestsRow.className = "account-presence-setting";
            friendRequestsRow.innerHTML = `<span><b>Allow friend requests</b><small>Let other pilots send you requests from profiles and the online list.</small></span>`;
            const friendRequestsInput = document.createElement("input");
            friendRequestsInput.type = "checkbox";
            friendRequestsInput.checked = currentOnlineUser.allowFriendRequests !== false;
            friendRequestsInput.setAttribute("aria-label", "Allow friend requests");
            const friendRequestsStatus = document.createElement("small");
            friendRequestsStatus.className = "presence-setting-status";
            friendRequestsStatus.setAttribute("role", "status");
            friendRequestsInput.addEventListener("change", async () => {
                const previousValue = currentOnlineUser?.allowFriendRequests !== false;
                friendRequestsInput.disabled = true;
                friendRequestsStatus.textContent = "Saving friend request preference...";
                try {
                    const result = await apiRequest<{ allowFriendRequests: boolean }>("/account/friend-requests", { method: "PUT", body: JSON.stringify({ allowFriendRequests: friendRequestsInput.checked }) });
                    if (currentOnlineUser) setOnlineUser({ ...currentOnlineUser, allowFriendRequests: result.allowFriendRequests });
                    friendRequestsStatus.textContent = result.allowFriendRequests ? "Friend requests are enabled." : "New friend requests are disabled.";
                } catch (error) {
                    friendRequestsInput.checked = previousValue;
                    friendRequestsStatus.textContent = error instanceof Error ? error.message : "Could not save friend request preference.";
                } finally { friendRequestsInput.disabled = !currentOnlineUser; }
            });
            friendRequestsRow.append(friendRequestsInput);
            const readReceiptsRow = document.createElement("label");
            readReceiptsRow.className = "account-presence-setting";
            readReceiptsRow.innerHTML = `<span><b>Show read receipts</b><small>Let friends see when you read their direct messages.</small></span>`;
            const readReceiptsInput = document.createElement("input");
            readReceiptsInput.type = "checkbox";
            readReceiptsInput.checked = currentOnlineUser.readReceipts !== false;
            readReceiptsInput.setAttribute("aria-label", "Show read receipts");
            const readReceiptsStatus = document.createElement("small");
            readReceiptsStatus.className = "presence-setting-status";
            readReceiptsStatus.setAttribute("role", "status");
            const typingIndicatorsRow = document.createElement("label");
            typingIndicatorsRow.className = "account-presence-setting";
            typingIndicatorsRow.innerHTML = `<span><b>Show typing indicators</b><small>Share and see when friends are typing in a direct chat.</small></span>`;
            const typingIndicatorsInput = document.createElement("input");
            typingIndicatorsInput.type = "checkbox";
            typingIndicatorsInput.checked = currentOnlineUser.typingIndicators !== false;
            typingIndicatorsInput.setAttribute("aria-label", "Show typing indicators");
            const typingIndicatorsStatus = document.createElement("small");
            typingIndicatorsStatus.className = "presence-setting-status";
            typingIndicatorsStatus.setAttribute("role", "status");
            const saveChatPreferences = async (status: HTMLElement, previousRead: boolean, previousTyping: boolean) => {
                readReceiptsInput.disabled = true;
                typingIndicatorsInput.disabled = true;
                status.textContent = "Saving chat privacy settings...";
                try {
                    const result = await apiRequest<{ readReceipts: boolean; typingIndicators: boolean }>("/account/chat-preferences", {
                        method: "PUT",
                        body: JSON.stringify({ readReceipts: readReceiptsInput.checked, typingIndicators: typingIndicatorsInput.checked }),
                    });
                    if (currentOnlineUser) setOnlineUser({ ...currentOnlineUser, readReceipts: result.readReceipts, typingIndicators: result.typingIndicators });
                    status.textContent = "Chat privacy settings saved.";
                } catch (error) {
                    readReceiptsInput.checked = previousRead;
                    typingIndicatorsInput.checked = previousTyping;
                    status.textContent = error instanceof Error ? error.message : "Could not save chat privacy settings.";
                } finally {
                    readReceiptsInput.disabled = !currentOnlineUser;
                    typingIndicatorsInput.disabled = !currentOnlineUser;
                }
            };
            readReceiptsInput.addEventListener("change", () => void saveChatPreferences(readReceiptsStatus, !readReceiptsInput.checked, typingIndicatorsInput.checked));
            typingIndicatorsInput.addEventListener("change", () => void saveChatPreferences(typingIndicatorsStatus, readReceiptsInput.checked, !typingIndicatorsInput.checked));
            readReceiptsRow.append(readReceiptsInput);
            typingIndicatorsRow.append(typingIndicatorsInput);
            let humanVerificationSection: HTMLElement | null = null;
            if (currentOnlineUser.role === "player" && currentOnlineUser.humanVerified === false) {
                humanVerificationSection = document.createElement("section");
                humanVerificationSection.className = "human-verification-setting";
                const heading = document.createElement("b");
                heading.textContent = "Human verification required";
                const copy = document.createElement("small");
                copy.textContent = "Complete this quick check before starting online levels.";
                const question = document.createElement("small");
                question.className = "human-check-status";
                question.textContent = "Loading human check...";
                const answer = document.createElement("input");
                answer.inputMode = "numeric";
                answer.maxLength = 3;
                answer.placeholder = "Answer";
                answer.disabled = true;
                const verify = document.createElement("button");
                verify.type = "button";
                verify.className = "menu-button";
                verify.textContent = "Verify and unlock online play";
                verify.disabled = true;
                const status = document.createElement("small");
                status.setAttribute("role", "status");
                let challenge: { token: string; question: string } | null = null;
                void apiRequest<{ token: string; question: string }>("/auth/human-challenge")
                    .then((nextChallenge) => {
                        challenge = nextChallenge;
                        question.textContent = nextChallenge.question;
                        answer.disabled = false;
                        verify.disabled = false;
                    })
                    .catch((error) => { question.textContent = error instanceof Error ? error.message : "Human check unavailable."; });
                const verificationForm = document.createElement("div");
                verificationForm.className = "human-verification-form";
                verificationForm.append(question, answer, verify, status);
                verify.addEventListener("click", async () => {
                    if (!challenge) return;
                    verify.disabled = true;
                    status.textContent = "Checking...";
                    try {
                        await apiRequest<{ humanVerified: boolean }>("/account/human-verify", {
                            method: "POST",
                            body: JSON.stringify({ humanChallenge: { token: challenge.token, answer: answer.value } }),
                        });
                        if (currentOnlineUser) setOnlineUser({ ...currentOnlineUser, humanVerified: true });
                        heading.textContent = "Human verification complete";
                        copy.textContent = "Online levels are unlocked for this account.";
                        verificationForm.remove();
                    } catch (error) {
                        status.textContent = error instanceof Error ? error.message : "Human verification failed.";
                        verify.disabled = false;
                    }
                });
                humanVerificationSection.append(heading, copy, verificationForm);
            }
            let leaderboardRow: HTMLElement | null = null;
            let leaderboardStatus: HTMLElement | null = null;
            if (currentOnlineUser.role === "player") {
                leaderboardRow = document.createElement("label");
                leaderboardRow.className = "account-presence-setting";
                leaderboardRow.innerHTML = `<span><b>Submit leaderboard runs</b><small>Choose whether completed runs can be saved to the public online leaderboard.</small></span>`;
                const leaderboardInput = document.createElement("input");
                leaderboardInput.type = "checkbox";
                leaderboardInput.checked = currentOnlineUser.leaderboardOptIn !== false;
                leaderboardInput.setAttribute("aria-label", "Submit leaderboard runs");
                const status = document.createElement("small");
                leaderboardStatus = status;
                status.className = "presence-setting-status";
                status.setAttribute("role", "status");
                leaderboardInput.addEventListener("change", async () => {
                    const previousValue = currentOnlineUser?.leaderboardOptIn !== false;
                    leaderboardInput.disabled = true;
                    status.textContent = "Saving leaderboard preference...";
                    try {
                        const result = await apiRequest<{ leaderboardOptIn: boolean }>("/account/leaderboard-preference", {
                            method: "PUT",
                            body: JSON.stringify({ leaderboardOptIn: leaderboardInput.checked }),
                        });
                        if (currentOnlineUser) setOnlineUser({ ...currentOnlineUser, leaderboardOptIn: result.leaderboardOptIn });
                        status.textContent = result.leaderboardOptIn ? "Completed runs will be submitted." : "Completed runs will stay off the online leaderboard.";
                    } catch (error) {
                        leaderboardInput.checked = previousValue;
                        status.textContent = error instanceof Error ? error.message : "Could not save leaderboard preference.";
                    } finally {
                        leaderboardInput.disabled = !currentOnlineUser;
                    }
                });
                leaderboardRow.append(leaderboardInput);
            }
            const allTitlesGranted = hasOwnerAccess() || (currentOnlineUser.role === "tester" && localStorage.getItem("orbit-all-titles") === "1");
            const earnedTitles = allTitlesGranted ? profileTitles : profileTitles.filter(isProfileTitleUnlocked);
            const titleRow = document.createElement("label");
            titleRow.className = "account-title-setting";
            titleRow.innerHTML = `<span><b>Pilot title</b><small>Earn titles through their listed requirements. Your chosen title appears on your public profile.</small></span>`;
            const titleSelect = document.createElement("select");
            titleSelect.setAttribute("aria-label", "Pilot title");
            const noTitle = document.createElement("option");
            noTitle.value = "";
            noTitle.textContent = "No title";
            titleSelect.append(noTitle);
            earnedTitles.forEach((title) => {
                const option = document.createElement("option");
                option.value = title.id;
                option.textContent = title.name;
                titleSelect.append(option);
            });
            const savedTitle = localStorage.getItem("orbit-title") ?? "";
            titleSelect.value = earnedTitles.some((title) => title.id === savedTitle) ? savedTitle : "";
            const titlePreview = document.createElement("span");
            titlePreview.className = "account-title-preview";
            const updateTitlePreview = () => {
                titlePreview.replaceChildren();
                const selectedTitle = earnedTitles.find((title) => title.id === titleSelect.value);
                if (selectedTitle) titlePreview.append(createTitleBadge(selectedTitle.name, selectedTitle));
            };
            updateTitlePreview();
            const titleStatus = document.createElement("small");
            titleStatus.className = "presence-setting-status";
            titleStatus.setAttribute("role", "status");
            titleSelect.addEventListener("change", () => {
                localStorage.setItem("orbit-title", titleSelect.value);
                updateTitlePreview();
                titleStatus.textContent = "Saving pilot title...";
                void syncAccountProgress("save", true).then(() => {
                    titleStatus.textContent = "Pilot title saved to your account.";
                }).catch((error: unknown) => {
                    titleStatus.textContent = `Title saved on this device, but account sync failed: ${error instanceof Error ? error.message : "online service error"}`;
                    console.error("Could not sync selected pilot title:", error);
                });
            });
            titleRow.append(titleSelect, titlePreview);
            const saveProfile = document.createElement("button");
            saveProfile.className = "menu-button";
            saveProfile.type = "submit";
            saveProfile.textContent = "Save profile";
            profileForm.append(usernameLabel, saveProfile, profileHint, emailLabel, saveEmail, emailStatus, privacyRow, privacyStatus, friendRequestsRow, friendRequestsStatus, readReceiptsRow, readReceiptsStatus, typingIndicatorsRow, typingIndicatorsStatus, ...(humanVerificationSection ? [humanVerificationSection] : []), ...(leaderboardRow ? [leaderboardRow] : []), ...(leaderboardStatus ? [leaderboardStatus] : []), titleRow, titleStatus);
            profileForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                saveProfile.disabled = true;
                profileHint.textContent = "Saving profile...";
                try {
                    const updated = await apiRequest<{ user: { username: string }; usernameChangedAt: string | null }>("/account/profile", {
                        method: "PATCH",
                        body: JSON.stringify({ username: usernameInput.value }),
                    });
                    setOnlineUser({ ...currentOnlineUser!, username: updated.user.username }, true);
                    updateOwnerAccountIndicator();
                    render("Profile updated.");
                } catch (error) {
                    profileHint.textContent = error instanceof Error ? error.message : "Could not update your profile.";
                    saveProfile.disabled = false;
                }
            });
            const passwordSection = document.createElement("section");
            passwordSection.className = "account-security-section";
            const passwordHeading = document.createElement("h2");
            passwordHeading.textContent = "Change password";
            const passwordForm = document.createElement("form");
            passwordForm.className = "account-profile-form";
            const passwordFields = [
                { label: "Current password", autocomplete: "current-password" },
                { label: "New password", autocomplete: "new-password" },
                { label: "Repeat new password", autocomplete: "new-password" },
            ] as const;
            const passwordInputs = passwordFields.map(({ label, autocomplete }) => {
                const fieldLabel = document.createElement("label");
                fieldLabel.textContent = label;
                const input = document.createElement("input");
                input.type = "password";
                input.autocomplete = autocomplete;
                input.minLength = 10;
                input.maxLength = 128;
                input.required = true;
                fieldLabel.append(createPasswordField(input));
                passwordForm.append(fieldLabel);
                return input;
            });
            const passwordStatus = document.createElement("small");
            passwordStatus.setAttribute("role", "status");
            const passwordSubmit = document.createElement("button");
            passwordSubmit.className = "menu-button";
            passwordSubmit.type = "submit";
            passwordSubmit.textContent = "Change password";
            passwordForm.append(passwordSubmit, passwordStatus);
            if (currentOnlineUser.role === "owner") {
                passwordSubmit.disabled = true;
                passwordStatus.textContent = "Owner passwords are managed through deployment secrets.";
            } else if (currentOnlineUser.mustChangePassword) {
                passwordStatus.textContent = "Choose a new password before continuing.";
            }
            passwordForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                if (passwordInputs[1].value !== passwordInputs[2].value) {
                    passwordStatus.textContent = "The new passwords do not match.";
                    return;
                }
                if (passwordInputs[0].value === passwordInputs[1].value) {
                    passwordStatus.textContent = "Choose a password different from your current password.";
                    return;
                }
                passwordSubmit.disabled = true;
                passwordStatus.textContent = "Changing password...";
                try {
                    await apiRequest<{ ok: true }>("/account/password", {
                        method: "POST",
                        body: JSON.stringify({ currentPassword: passwordInputs[0].value, newPassword: passwordInputs[1].value }),
                    });
                    setOnlineUser(null);
                    render("Password changed. Sign in again with your new password.");
                } catch (error) {
                    passwordStatus.textContent = error instanceof Error ? error.message : "Could not change password.";
                    passwordSubmit.disabled = false;
                } finally {
                    passwordInputs.forEach((field) => { field.value = ""; });
                }
            });
            passwordSection.append(passwordHeading, passwordForm);

            const overviewPanel = document.createElement("section");
            overviewPanel.className = "account-settings-category";
            overviewPanel.dataset.controlSection = "overview";
            overviewPanel.hidden = true;
            overviewPanel.append(statsHeading, stats, createProgressArea());
            const loadoutPanel = document.createElement("section");
            loadoutPanel.className = "account-settings-category";
            loadoutPanel.dataset.controlSection = "loadout";
            loadoutPanel.hidden = true;
            loadoutPanel.append(createShipPreview(), inventoryHeading, itemList, loadout);
            const profilePanel = document.createElement("section");
            profilePanel.className = "account-settings-category";
            profilePanel.dataset.controlSection = "profile";
            profilePanel.hidden = true;
            profilePanel.append(profileHeading, profileForm);
            const securityPanel = document.createElement("section");
            securityPanel.className = "account-settings-category";
            securityPanel.dataset.controlSection = "security";
            securityPanel.hidden = true;
            securityPanel.append(passwordSection);
            const inboxPanel = document.createElement("section");
            inboxPanel.className = "account-settings-category";
            inboxPanel.dataset.controlSection = "inbox";
            inboxPanel.hidden = true;
            const inboxHeading = document.createElement("h2");
            inboxHeading.textContent = pendingFriendRequests ? `Inbox (${pendingFriendRequests})` : "Inbox";
            const inboxStatus = document.createElement("small");
            inboxStatus.className = "presence-setting-status";
            inboxStatus.setAttribute("role", "status");
            const inboxContent = document.createElement("div");
            inboxContent.className = "account-inbox-list";
            inboxPanel.append(inboxHeading, inboxStatus, inboxContent);
            const blockedPanel = document.createElement("section");
            blockedPanel.className = "account-settings-category";
            blockedPanel.dataset.controlSection = "blocked";
            blockedPanel.hidden = true;
            const blockedHeading = document.createElement("h2");
            blockedHeading.textContent = "Blocked players";
            const blockedStatus = document.createElement("small");
            blockedStatus.setAttribute("role", "status");
            const blockedContent = document.createElement("div");
            blockedContent.className = "account-inbox-list";
            const drawBlocked = async () => {
                blockedStatus.textContent = "Loading blocked players...";
                try {
                    const data = await loadBlockedUsers();
                    blockedContent.replaceChildren();
                    if (!data.blocked.length) blockedContent.textContent = "You have not blocked any players.";
                    data.blocked.forEach((player) => {
                        const row = document.createElement("article"); row.className = "account-inbox-row";
                        const label = document.createElement("span"); label.textContent = `${player.username} / ${roleLabel(player.role as OnlineUser["role"])} · blocked`;
                        const unblock = createTextButton("Unblock", async () => { unblock.disabled = true; await unblockUser(player.id); await drawBlocked(); });
                        row.append(label, unblock); blockedContent.append(row);
                    });
                    blockedStatus.textContent = data.blocked.length ? `${data.blocked.length} blocked player${data.blocked.length === 1 ? "" : "s"}.` : "";
                } catch (error) { blockedStatus.textContent = error instanceof Error ? error.message : "Could not load blocked players."; }
            };
            blockedPanel.append(blockedHeading, blockedStatus, blockedContent);
            const drawInbox = async () => {
                inboxContent.textContent = "Loading friend requests...";
                try {
                    const data = await loadFriends();
                    pendingFriendRequests = data.incoming.length;
                    inboxHeading.textContent = pendingFriendRequests ? `Inbox (${pendingFriendRequests})` : "Inbox";
                    updateOwnerAccountIndicator();
                    inboxContent.replaceChildren();
                    if (!data.incoming.length && !data.outgoing.length) { inboxContent.textContent = "No friend requests right now."; return; }
                    const incomingHeading = document.createElement("h3"); incomingHeading.textContent = "Requests for you"; inboxContent.append(incomingHeading);
                    data.incoming.forEach((request) => {
                        const row = document.createElement("article"); row.className = "account-inbox-row";
                        const label = document.createElement("span"); label.textContent = `${request.username} / ${roleLabel(request.role)} · sent ${request.createdAt ? new Date(request.createdAt).toLocaleString() : "recently"}`;
                        const accept = createTextButton("Accept", async () => { await acceptFriendRequest(request.id); await drawInbox(); });
                        const decline = createTextButton("Decline", async () => { await declineFriendRequest(request.id); await drawInbox(); });
                        const block = createTextButton("Block", async () => { await blockUser(request.userId); await drawInbox(); });
                        const profile = createTextButton("View profile", () => void showLeaderboardPlayerProfile(request.userId, showLeaderboard));
                        row.append(label, accept, decline, block, profile); inboxContent.append(row);
                    });
                    const outgoingHeading = document.createElement("h3"); outgoingHeading.textContent = "Requests you sent"; inboxContent.append(outgoingHeading);
                    data.outgoing.forEach((request) => { const row = document.createElement("article"); row.className = "account-inbox-row"; const label = document.createElement("span"); label.textContent = `${request.username} · waiting`; const cancel = createTextButton("Cancel", async () => { await removeFriend(request.userId); await drawInbox(); }); row.append(label, cancel); inboxContent.append(row); });
                } catch (error) { inboxContent.textContent = error instanceof Error ? error.message : "Could not load friend requests."; }
            };
            const accountSections: ControlSection[] = [
                { id: "overview", title: "Pilot overview", group: "Player settings", description: "See your current progress, route completion, and prestige status at a glance.", panel: overviewPanel },
                { id: "loadout", title: "Items & loadout", group: "Player settings", description: "Review your inventory and the ship cosmetics currently equipped.", panel: loadoutPanel },
                { id: "profile", title: "Profile", group: "Account", description: "Change your display name, online visibility, and earned pilot title.", panel: profilePanel },
                { id: "security", title: "Security", group: "Account", description: "Change your password or create a recovery code for this account.", panel: securityPanel },
                { id: "inbox", title: pendingFriendRequests ? `Inbox (${pendingFriendRequests})` : "Inbox", group: "Account", description: "Friend requests sent to you, and requests you have sent.", panel: inboxPanel },
                { id: "blocked", title: "Blocked players", group: "Account", description: "Manage players you have blocked. Blocks hide each other’s global chat, online status, messages, and friend requests.", panel: blockedPanel },
            ];
            const accountContent = document.createElement("div");
            accountContent.className = "account-settings-content";
            const accountHeader = document.createElement("div");
            accountHeader.className = "account-settings-header";
            const accountGroup = document.createElement("p");
            accountGroup.className = "eyebrow";
            const accountTitle = document.createElement("h2");
            const accountDescription = document.createElement("p");
            accountHeader.append(accountGroup, accountTitle, accountDescription);
            const accountPanels = document.createElement("div");
            accountPanels.className = "account-settings-panels";
            accountSections.forEach((section) => accountPanels.append(section.panel));
            accountContent.append(accountHeader, accountPanels);
            const accountNavigation = createControlNavigation(accountSections, (section) => selectAccountSection(section.id));
            function selectAccountSection(id: string) {
                const selected = accountSections.find((section) => section.id === id);
                if (!selected) return;
                accountSections.forEach((section) => { section.panel.hidden = section !== selected; });
                accountGroup.textContent = selected.group.toUpperCase();
                accountTitle.textContent = selected.title;
                accountDescription.textContent = selected.description;
                accountNavigation.select(id);
                localStorage.setItem("orbit-account-tab", id);
                if (id === "inbox") void drawInbox();
                if (id === "blocked") void drawBlocked();
            }
            dashboard.append(accountNavigation.nav, accountContent);
            const previousAccountSection = localStorage.getItem("orbit-account-tab");
            selectAccountSection(accountSections.some((section) => section.id === previousAccountSection) ? previousAccountSection! : "overview");
            if (currentOnlineUser.role !== "owner") {
                const recoverySection = document.createElement("section");
                recoverySection.className = "account-security-section";
                recoverySection.innerHTML = `<h2>Recovery code</h2><p class="menu-copy">A recovery code is the safest way to regain access if you forget your password. It is shown once when created.</p>`;
                const recoveryStatus = document.createElement("small");
                recoveryStatus.setAttribute("role", "status");
                const recoveryForm = document.createElement("form");
                recoveryForm.className = "account-profile-form";
                const currentPasswordLabel = document.createElement("label");
                currentPasswordLabel.textContent = "Current password to make a new code";
                const currentPassword = document.createElement("input");
                currentPassword.type = "password";
                currentPassword.autocomplete = "current-password";
                currentPassword.required = true;
                currentPasswordLabel.append(createPasswordField(currentPassword));
                const makeCode = document.createElement("button");
                makeCode.className = "menu-button";
                makeCode.type = "submit";
                makeCode.textContent = "Generate / replace recovery code";
                recoveryForm.append(currentPasswordLabel, makeCode, recoveryStatus);
                recoveryForm.addEventListener("submit", async (event) => {
                    event.preventDefault();
                    makeCode.disabled = true;
                    recoveryStatus.textContent = "Creating a new recovery code...";
                    try {
                        const result = await apiRequest<{ recoveryCode: string }>("/account/recovery-code", {
                            method: "POST",
                            body: JSON.stringify({ currentPassword: currentPassword.value }),
                        });
                        showRecoveryCodeOnce(result.recoveryCode, () => render("Your new recovery code was saved."));
                    } catch (error) {
                        recoveryStatus.textContent = error instanceof Error ? error.message : "Could not create a recovery code.";
                        makeCode.disabled = false;
                    } finally {
                        currentPassword.value = "";
                    }
                });
                recoverySection.append(recoveryForm);
                securityPanel.append(recoverySection);
                void apiRequest<{ hasRecoveryCode: boolean; recoveryCodeCreatedAt: string | null }>("/account/profile")
                    .then((profile) => {
                        if (!recoverySection.isConnected) return;
                        recoveryStatus.textContent = profile.hasRecoveryCode
                            ? `Recovery code set on ${profile.recoveryCodeCreatedAt ? new Date(profile.recoveryCodeCreatedAt).toLocaleDateString() : "an earlier date"}. The existing code cannot be displayed again; generate a replacement if you lost it.`
                            : "No recovery code yet. Generate one now so you can get back into your account.";
                    })
                    .catch((error: unknown) => {
                        if (recoverySection.isConnected) recoveryStatus.textContent = error instanceof Error ? error.message : "Could not load recovery-code status.";
                    });
            }
            menu.append(dashboard);
            void apiRequest<{ role: OnlineUser["role"]; nextUsernameChangeAt: string | null; mustChangePassword?: boolean; emailMasked?: string | null }>("/account/profile")
                .then((profile) => {
                    if (!menu.isConnected) return;
                    if (profile.emailMasked) emailInput.placeholder = `Saved: ${profile.emailMasked}`;
                    if (profile.role === "owner") {
                        usernameInput.disabled = true;
                        saveProfile.disabled = true;
                        profileHint.textContent = "Owner usernames are managed through deployment account settings.";
                    } else if (profile.nextUsernameChangeAt && new Date(profile.nextUsernameChangeAt) > new Date()) {
                        const availableDate = new Date(profile.nextUsernameChangeAt);
                        saveProfile.disabled = true;
                        profileHint.textContent = `Username editing unlocks ${availableDate.toLocaleString()}.`;
                    } else profileHint.textContent = "Username changes are limited to once every 7 days.";
                    if (profile.mustChangePassword && currentOnlineUser) currentOnlineUser.mustChangePassword = true;
                })
                .catch((error: unknown) => {
                    if (menu.isConnected) profileHint.textContent = error instanceof Error ? error.message : "Could not load profile settings.";
                });
            const signOut = createTextButton("Sign out", async () => {
                try {
                    let syncWarning = "";
                    let syncFailed = false;
                    try {
                        await syncAccountProgress("save", true);
                    } catch (error) {
                        syncFailed = true;
                        syncWarning = ` You are signed out, but the latest progress could not sync: ${error instanceof Error ? error.message : "online service error"}`;
                        console.error("Could not save account progress before sign-out:", error);
                    }
                    if (syncFailed) {
                        const dialog = await showActionDialog({ title: "Sign out without saving?", description: "We could not save your latest progress. Signing out now may lose it.", confirmLabel: "Sign out", danger: true });
                        if (!dialog.confirmed) return;
                    }
                    await apiRequest<void>("/auth/logout", { method: "POST" });
                    setOnlineUser(null);
                    clearLocalAccountData();
                    localStorage.removeItem("jacer-local-owner");
                    render(`You have signed out.${syncWarning}`);
                } catch (error) {
                    render(error instanceof Error ? error.message : "Could not sign out.");
                }
            });
            if (!currentOnlineUser.mustChangePassword) menu.append(signOut);
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
            let email: HTMLInputElement | null = null;
            let emailLabel: HTMLLabelElement | null = null;
            let humanChallenge: { token: string; question: string } | null = null;
            let humanAnswer: HTMLInputElement | null = null;
            let humanChallengeStatus: HTMLElement | null = null;
            let botTrap: HTMLInputElement | null = null;
            let humanLabel: HTMLLabelElement | null = null;
            let trapLabel: HTMLLabelElement | null = null;
            if (registrationMode) {
                emailLabel = document.createElement("label");
                emailLabel.textContent = "Email address (optional)";
                email = document.createElement("input");
                email.name = "email";
                email.type = "email";
                email.autocomplete = "email";
                email.required = false;
                email.maxLength = 254;
                email.placeholder = "you@example.com";
                email.title = "Enter a valid email address.";
                emailLabel.append(email);
                humanLabel = document.createElement("label");
                humanLabel.textContent = "Human check";
                humanAnswer = document.createElement("input");
                humanAnswer.name = "human-answer";
                humanAnswer.inputMode = "numeric";
                humanAnswer.autocomplete = "off";
                humanAnswer.maxLength = 3;
                humanAnswer.placeholder = "Loading check...";
                humanAnswer.disabled = true;
                humanLabel.append(humanAnswer);
                humanChallengeStatus = document.createElement("small");
                humanChallengeStatus.className = "human-check-status";
                humanChallengeStatus.textContent = "Loading a quick human check...";
                trapLabel = document.createElement("label");
                trapLabel.className = "bot-trap";
                trapLabel.textContent = "Website";
                botTrap = document.createElement("input");
                botTrap.name = "website";
                botTrap.tabIndex = -1;
                botTrap.autocomplete = "off";
                botTrap.setAttribute("aria-hidden", "true");
                trapLabel.append(botTrap);
                void apiRequest<{ token: string; question: string }>("/auth/human-challenge")
                    .then((challenge) => {
                        humanChallenge = challenge;
                        if (humanAnswer) {
                            humanAnswer.disabled = false;
                            humanAnswer.required = true;
                            humanAnswer.placeholder = "Answer";
                        }
                        submit.disabled = false;
                        if (humanChallengeStatus) humanChallengeStatus.textContent = challenge.question;
                    })
                    .catch(() => {
                        if (humanChallengeStatus) humanChallengeStatus.textContent = "Human check is unavailable right now. Retry in a moment to create an account.";
                    });
            }
            const passwordLabel = document.createElement("label");
            passwordLabel.textContent = "Password";
            const password = document.createElement("input");
            password.name = "password";
            password.type = "password";
            password.autocomplete = registrationMode ? "new-password" : "current-password";
            password.minLength = 10;
            password.maxLength = 128;
            password.required = true;
            passwordLabel.append(createPasswordField(password));
            const message = document.createElement("small");
            message.className = "online-service-status";
            message.setAttribute("role", "status");
            message.textContent = messageText;
            const submit = document.createElement("button");
            submit.className = "menu-button";
            submit.type = "submit";
            submit.textContent = registrationMode ? "Create account" : "Sign in";
            submit.disabled = registrationMode;
            const switchMode = createTextButton(registrationMode ? "I already have an account" : "Create a new account", () => { registrationMode = !registrationMode; render(); });
            form.append(usernameLabel, ...(emailLabel ? [emailLabel] : []), ...(humanLabel ? [humanLabel] : []), ...(humanChallengeStatus ? [humanChallengeStatus] : []), ...(trapLabel ? [trapLabel] : []), passwordLabel, submit, message);
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                submit.disabled = true;
                message.textContent = "Connecting to the account service...";
                try {
                    const wasRegistration = registrationMode;
                    const credentials: Record<string, unknown> = { username: username.value, password: password.value };
                    if (wasRegistration && email) credentials.email = email.value;
                    if (wasRegistration && botTrap) credentials.website = botTrap.value;
                    if (wasRegistration && humanChallenge && humanAnswer) credentials.humanChallenge = { token: humanChallenge.token, answer: humanAnswer.value };
                    const response = await apiRequest<{ user: OnlineUser; recoveryCode?: string }>(`/auth/${wasRegistration ? "register" : "login"}`, {
                        method: "POST",
                        body: JSON.stringify(credentials),
                    });
                    setOnlineUser(response.user);
                    if (wasRegistration) {
                        // Guest rewards and unlocks must never become the new
                        // account's progression. Keep device preferences only.
                        clearLocalAccountData();
                    }
                    void sendPresenceHeartbeat();
                    updateOwnerAccountIndicator();
                    let progressWarning = "";
                    try {
                        await syncAccountProgress("load");
                    } catch (error) {
                        progressWarning = `Signed in, but account progress could not load. Cloud saving is paused: ${error instanceof Error ? error.message : "online service error"}`;
                    }
                    if (wasRegistration && response.recoveryCode) {
                        showRecoveryCodeOnce(response.recoveryCode, () => showAccount(progressWarning || "Account created. Save your recovery code somewhere private."));
                        return;
                    }
                    if (progressWarning) {
                        render(progressWarning);
                        return;
                    }
                    showAccount();
                } catch (error) {
                    message.textContent = error instanceof Error ? error.message : "The account service could not complete the request.";
                    submit.disabled = false;
                }
            });
            menu.append(form, switchMode);
            if (!registrationMode) menu.append(createTextButton("Forgot password?", showForgotPassword));
        }
        if (!currentOnlineUser?.mustChangePassword) menu.append(createTextButton("Back", showMenu));
        document.body.replaceChildren(menu);
    };
    render();
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
    restart: [],
    back: [],
    confirm: [],
    switchPlanet: [],
};
function controlKeysFor(action: ControlAction) {
    return controlBindings[action] === DEFAULT_CONTROL_BINDINGS[action]
        ? [controlBindings[action], ...secondaryControlKeys[action]]
        : [controlBindings[action]];
}

function getInventory(): Record<PowerupKind, number> {
    if (hasOwnerAccess() || currentOnlineUser?.role === "admin" || currentOnlineUser?.role === "tester") return { shield: OWNER_TEST_INVENTORY_AMOUNT, boost: OWNER_TEST_INVENTORY_AMOUNT, rapid: OWNER_TEST_INVENTORY_AMOUNT, cannon: OWNER_TEST_INVENTORY_AMOUNT, star: OWNER_TEST_INVENTORY_AMOUNT };
    try { return { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 0, ...JSON.parse(localStorage.getItem("orbit-powerups") ?? "{}") }; }
    catch { return { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 0 }; }
}

function hasActivePowerup() {
    return shieldCharges > 0 || boostTimer > 0 || rapidUntil > performance.now() || cannonTimer > 0 || starPowerupActive;
}

function canActivatePowerup(kind: PowerupKind) {
    if (!gameConfig.powerupRules.oneActiveAtATime || !hasActivePowerup()) return true;
    statusLabel.textContent = `Finish the active power-up before using ${powerupLabels[kind]}.`;
    return false;
}

function isStarInvincible() { return starPowerupActive && gameConfig.powerupRules.rainbowStarInvincible; }
function isStarContactDamageActive() { return starPowerupActive && gameConfig.powerupRules.rainbowStarDefeatsEnemies; }
function getMovementMultiplier() {
    const boostMultiplier = boostTimer > 0 ? gameConfig.powerupEffects.boost.movementMultiplier : 1;
    const configuredStarMultiplier = gameConfig.powerupEffects.star.movementMultiplier ?? DEFAULT_GAME_CONFIG.powerupEffects.star.movementMultiplier ?? 1;
    const starMultiplier = starPowerupActive && Number.isFinite(configuredStarMultiplier) ? Math.max(1, configuredStarMultiplier) : 1;
    return boostMultiplier * starMultiplier;
}

function saveInventory(inventory: Record<PowerupKind, number>) { localStorage.setItem("orbit-powerups", JSON.stringify(inventory)); }

function showShop() {
    enterAppPage(showShop);
    gameActive = false;
    cancelAnimationFrame(animationFrame);
    const menu = document.createElement("main");
    menu.className = "menu-screen shop-screen";
    menu.innerHTML = `<p class="eyebrow">FLIGHT SUPPLY / SHOP</p><h1>Stock your <em>ship</em></h1><p class="menu-copy">Buy single-use power-ups with claimed asteroids, or spend special asteroids on a collection wheel.</p>`;
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
    const wheelPointer = document.createElement("i");
    wheelPointer.className = "wheel-pointer";
    wheelPointer.setAttribute("aria-hidden", "true");
    const wheelRing = document.createElement("div");
    wheelRing.className = "wheel-ring";
    wheelRing.setAttribute("role", "img");
    wheelRing.setAttribute("aria-label", "Roulette wheel with numbered pockets from 0 to 36");
    const wheelHub = document.createElement("div");
    wheelHub.className = "wheel-hub";
    wheelHub.setAttribute("aria-hidden", "true");
    wheelHub.textContent = "✦";
    const wheelTitle = document.createElement("b");
    wheelTitle.textContent = "ASTEROID ROLL";
    const customSpinLabel = document.createElement("label");
    customSpinLabel.className = "wheel-tier-label custom-spin-label";
    customSpinLabel.append(document.createTextNode("Special asteroids to spend"));
    const customSpinAmount = document.createElement("input");
    customSpinAmount.type = "number";
    customSpinAmount.min = "1";
    customSpinAmount.step = "1";
    customSpinAmount.value = String(selectedRouletteSpinAmount);
    customSpinAmount.setAttribute("aria-label", "Special asteroids to spend on this spin");
    customSpinLabel.append(customSpinAmount);
    const colorPreferenceLabel = document.createElement("label");
    colorPreferenceLabel.className = "wheel-tier-label color-preference-label";
    colorPreferenceLabel.append(document.createTextNode("Color preference"));
    const colorPreference = document.createElement("select");
    colorPreference.setAttribute("aria-label", "Roulette color preference");
    (["green", "blue", "yellow"] as const).forEach((color) => {
        const option = document.createElement("option");
        option.value = color;
        option.textContent = `${color[0].toUpperCase()}${color.slice(1)} (preference)`;
        option.selected = selectedRouletteColorPreference === color;
        colorPreference.append(option);
    });
    colorPreferenceLabel.append(colorPreference);
    const wheelStatus = document.createElement("small");
    wheelStatus.className = "wheel-status";
    wheelStatus.setAttribute("role", "status");
    const collectionComplete = document.createElement("small");
    collectionComplete.className = "wheel-collection-complete";
    const wheelControls = document.createElement("div");
    wheelControls.className = "wheel-stage";
    wheelControls.append(wheelRing, wheelHub, wheelPointer);
    const roll = document.createElement("button");
    roll.className = "text-button shop-buy";
    roll.type = "button";
    roll.textContent = "Spin";
    const drawWheel = () => {
        const amount = Math.max(1, Math.floor(Number(customSpinAmount.value) || 1));
        selectedRouletteSpinAmount = amount;
        currency.textContent = `NORMAL ${asteroidsClaimed}  /  SPECIAL ${specialAsteroids}`;
        const pocketCount = 37;
        const pocketAngle = 360 / pocketCount;
        const colors = ["#167d83", "#2550a2"];
        const gradients: string[] = [];
        wheelRing.replaceChildren();
        rouletteWheelPockets = [];
        for (let index = 0; index < pocketCount; index++) {
            const start = index * pocketAngle;
            const end = start + pocketAngle;
            const color = index === 0 ? "#c79736" : colors[index % colors.length];
            gradients.push(`${color} ${start + 0.55}deg ${end - 0.55}deg`);
            const label = document.createElement("span");
            label.className = "wheel-pocket-label";
            label.textContent = String(index);
            const midpoint = (start + end) / 2;
            label.style.transform = `translate(-50%, -50%) rotate(${midpoint}deg) translateY(-102px) rotate(${-midpoint}deg)`;
            wheelRing.append(label);
            rouletteWheelPockets.push({ index, startAngle: start, endAngle: end });
        }
        wheelRing.style.background = `conic-gradient(${gradients.join(", ")})`;
        collectionComplete.textContent = areRouletteCosmeticsComplete() ? "Collection complete — only asteroid prizes remain." : "";
        roll.disabled = specialAsteroids < amount || spinInProgress;
        roll.textContent = `Spin / ${amount.toLocaleString()} special`;
        wheelStatus.textContent = spinInProgress
            ? `The ${amount.toLocaleString()}-asteroid wheel is spinning...`
            : `Available: ${specialAsteroids} special asteroids. More spend increases your preferred reward odds.`;
    };
    customSpinAmount.addEventListener("input", () => {
        const amount = Math.max(1, Math.floor(Number(customSpinAmount.value) || 1));
        selectedRouletteSpinAmount = amount;
        localStorage.setItem("orbit-roulette-spin-amount", String(amount));
        drawWheel();
    });
    colorPreference.addEventListener("change", () => {
        selectedRouletteColorPreference = colorPreference.value as "green" | "blue" | "yellow";
        localStorage.setItem("orbit-roulette-color-preference", selectedRouletteColorPreference);
    });
    roll.addEventListener("click", () => {
        const amount = Math.max(1, Math.floor(Number(customSpinAmount.value) || 1));
        const tier = getRouletteTierForSpend(amount);
        const segments = getRouletteSegments(tier, amount, selectedRouletteColorPreference);
        if (specialAsteroids < amount || spinInProgress || !segments.length) return;
        spinInProgress = true;
        playSound("roulette");
        specialAsteroids -= amount;
        localStorage.setItem("orbit-special-claims", String(specialAsteroids));
        const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
        let targetWeight = Math.random() * totalWeight;
        const chosenSegment = segments.find((segment) => {
            targetWeight -= segment.weight;
            return targetWeight < 0;
        }) ?? segments[segments.length - 1];
        const reward = getRouletteReward(chosenSegment.type, tier, selectedRouletteColorPreference);
        const chosenPocket = rouletteWheelPockets[Math.floor(Math.random() * rouletteWheelPockets.length)];
        const midpoint = (chosenPocket.startAngle + chosenPocket.endAngle) / 2;
        const duration = reward.rarity === "Legendary" ? 7400 : reward.rarity === "Epic" ? 6800 : 6000;
        const finalRotation = 6 * 360 + ((360 - midpoint) % 360);
        const startedAt = performance.now();
        const currentRotation = 0;
        roll.disabled = true;
        wheel.classList.add("spinning");
        wheelStatus.textContent = `The ${amount.toLocaleString()}-asteroid wheel is spinning...`;
        drawWheel();
        roll.disabled = true;
        let savedAccountError = "";
        if (currentOnlineUser) {
            void syncAccountProgress("save", true).catch((error: unknown) => {
                console.error("Could not sync roulette reward:", error);
                savedAccountError = " It is saved on this device; account sync failed and will retry.";
            });
        }
        let lastRouletteTick = startedAt;
        const animate = (now: number) => {
            if (!menu.isConnected) {
                spinInProgress = false;
                return;
            }
            const progress = Math.min(1, (now - startedAt) / duration);
            const accelerationEnd = 0.17;
            const cruiseEnd = 0.5;
            const angle = progress < accelerationEnd
                ? 540 * ((progress / accelerationEnd) ** 2)
                : progress < cruiseEnd
                    ? 540 + (2160 - 540) * ((progress - accelerationEnd) / (cruiseEnd - accelerationEnd))
                    : 2160 + (finalRotation - 2160) * (1 - (1 - (progress - cruiseEnd) / (1 - cruiseEnd)) ** 4);
            const nearMiss = progress > 0.9 ? Math.sin(((progress - 0.9) / 0.1) * Math.PI) * 8 : 0;
            wheelRing.style.transform = `rotate(${currentRotation + angle + nearMiss}deg)`;
            if (progress < 1 && now - lastRouletteTick >= 130) {
                playSound("roulette");
                lastRouletteTick = now;
            }
            if (progress < 1) {
                requestAnimationFrame(animate);
                return;
            }
            wheelRing.style.transform = `rotate(${finalRotation}deg)`;
            spinInProgress = false;
            wheel.classList.remove("spinning");
            playSound("reward");
            drawWheel();
            const result = document.createElement("div");
            result.className = "spin-result";
            result.setAttribute("role", "dialog");
            result.setAttribute("aria-modal", "true");
            const card = document.createElement("div");
            card.className = `spin-result-card${reward.rarity === "Epic" || reward.rarity === "Legendary" ? " rare-win" : ""}`;
            const eyebrow = document.createElement("p");
            eyebrow.className = "eyebrow";
            eyebrow.textContent = reward.collectionComplete ? "COLLECTION COMPLETE" : "ROLL COMPLETE";
            const heading = document.createElement("h2");
            heading.textContent = reward.title;
            if (reward.amount !== undefined && reward.currencyLabel) {
                const countStartedAt = performance.now();
                const countUp = (timestamp: number) => {
                    if (!heading.isConnected) return;
                    const ratio = Math.min(1, (timestamp - countStartedAt) / 1000);
                    const displayed = Math.round(reward.amount! * ratio);
                    heading.textContent = `+${displayed} ${reward.currencyLabel}`;
                    if (ratio < 1) requestAnimationFrame(countUp);
                };
                requestAnimationFrame(countUp);
            }
            const description = document.createElement("p");
            description.textContent = `${reward.description}${savedAccountError}`;
            card.append(eyebrow);
            if (reward.rarity) {
                const badge = document.createElement("span");
                badge.className = `rarity-badge rarity-${reward.rarity.toLowerCase()}`;
                badge.textContent = reward.rarity;
                card.append(badge);
            }
            card.append(heading, description);
            const close = document.createElement("button");
            close.className = "menu-button";
            close.type = "button";
            close.textContent = "Continue";
            close.addEventListener("click", () => showShop());
            card.append(close);
            result.append(card);
            menu.append(result);
        };
        requestAnimationFrame(animate);
    });
    wheel.append(wheelControls, wheelTitle, customSpinLabel, colorPreferenceLabel, collectionComplete, roll, wheelStatus);
    drawWheel();
    const cooldownReset = document.createElement("article");
    cooldownReset.className = "shop-card cooldown-reset-card";
    const cooldownTitle = document.createElement("b");
    cooldownTitle.textContent = "COOLDOWN RESET";
    const cooldownDescription = document.createElement("small");
    const resettableSecretIndexes = levels.map((level, index) => ({ level, index })).filter(({ level, index }) => Boolean(level.secretId) && (Number(localStorage.getItem(`orbit-secret-cooldown-${level.secretId}`) ?? "0") > 0 || getClaimedAsteroids(index).size > 0));
    cooldownDescription.textContent = "Costs 1,000 normal asteroids. Clears every secret-level cooldown and brings back their special asteroids.";
    const cooldownBuy = document.createElement("button");
    cooldownBuy.type = "button";
    cooldownBuy.className = "text-button shop-buy";
    cooldownBuy.textContent = `Reset / ${COOLDOWN_RESET_COST.toLocaleString()} asteroids`;
    cooldownBuy.disabled = asteroidsClaimed < COOLDOWN_RESET_COST || resettableSecretIndexes.length === 0;
    if (!resettableSecretIndexes.length) cooldownDescription.textContent = "Nothing to reset right now.";
    cooldownBuy.addEventListener("click", async () => {
        const balance = Number(localStorage.getItem("orbit-claims") ?? asteroidsClaimed);
        if (!Number.isSafeInteger(balance) || balance < COOLDOWN_RESET_COST || !resettableSecretIndexes.length) return;
        const dialog = await showActionDialog({ title: "Reset secret cooldowns?", description: `Spend ${COOLDOWN_RESET_COST.toLocaleString()} normal asteroids to reset every secret-level cooldown.`, confirmLabel: "Spend and reset", danger: true });
        if (!dialog.confirmed) return;
        asteroidsClaimed = balance - COOLDOWN_RESET_COST;
        localStorage.setItem("orbit-claims", String(asteroidsClaimed));
        resettableSecretIndexes.forEach(({ level, index }) => {
            if (level.secretId) localStorage.removeItem(`orbit-secret-cooldown-${level.secretId}`);
            respawnSecretAsteroids(index);
        });
        if (currentOnlineUser) void syncAccountProgress("save", true).then(() => showShop()).catch((error: unknown) => console.error("Could not sync cooldown reset:", error));
        else showShop();
    });
    cooldownReset.append(cooldownTitle, cooldownDescription, cooldownBuy);
    menu.append(currency, grid, wheel, cooldownReset, createTextButton("Mission select", showLevelMenu), createTextButton("Main menu", showMenu), createPageCounter());
    document.body.replaceChildren(menu);
}

function cosmeticUnlockKey(group: CosmeticGroup, index: number) { return `orbit-spin-${group}-${index}`; }
function isSpinCosmeticUnlocked(group: CosmeticGroup, index: number) { return hasOwnerAccess() || localStorage.getItem(cosmeticUnlockKey(group, index)) === "1"; }
function unlockSpinCosmetic(group: CosmeticGroup, index: number) { localStorage.setItem(cosmeticUnlockKey(group, index), "1"); }

function getAvailableRouletteCosmetics(type: "color"): { color: string; index: number }[];
function getAvailableRouletteCosmetics(type: "trail"): { item: TrailStyle; index: number }[];
function getAvailableRouletteCosmetics(type: "avatar"): { item: AvatarStyle; index: number }[];
function getAvailableRouletteCosmetics(type: "color" | "trail" | "avatar"): ({ color: string; index: number } | { item: TrailStyle | AvatarStyle; index: number })[];
function getAvailableRouletteCosmetics(type: "color" | "trail" | "avatar") {
    if (type === "color") {
        return ROULETTE_SHIP_COLORS.map((color, offset) => ({ color, index: STARTER_SHIP_COLORS.length + offset }))
            .filter(({ index }) => !isSpinCosmeticUnlocked("color", index));
    }
    if (type === "trail") return trails.map((item, index) => ({ item, index })).filter(({ item, index }) => !isTrailUnlocked(item) && !isSpinCosmeticUnlocked("trail", index));
    return avatars.map((item, index) => ({ item, index })).filter(({ item, index }) => !isAvatarUnlocked(item) && !isSpinCosmeticUnlocked("avatar", index));
}

function getAvailableRouletteTitles() {
    if (hasOwnerAccess()) return [];
    return profileTitles.filter((title) => (title.requirement?.type ?? "routes") === "roulette"
        && localStorage.getItem(`orbit-title-unlock-${title.id}`) !== "1");
}

function areRouletteCosmeticsComplete() {
    return !getAvailableRouletteCosmetics("color").length
        && !getAvailableRouletteCosmetics("trail").length
        && !getAvailableRouletteCosmetics("avatar").length;
}

function getRouletteTierForSpend(spend: number): RouletteTier {
    const ordered = [...rouletteTiers].sort((first, second) => first.buyIn - second.buyIn);
    return [...ordered].reverse().find((tier) => spend >= tier.buyIn) ?? ordered[0] ?? DEFAULT_ROULETTE_TIERS[0];
}

function chooseRouletteCosmetic<T>(candidates: T[], rarityFor: (candidate: T) => Rarity, tier: RouletteTier, colorPreference?: "green" | "blue" | "yellow") {
    const tierBoost = tier.buyIn === 25 ? 2 : tier.buyIn === 10 ? 1 : 0;
    const weighted = candidates.map((candidate) => {
        const rarityIndex = RARITY_ORDER.indexOf(rarityFor(candidate));
        const color = typeof candidate === "object" && candidate !== null && "color" in candidate
            ? String((candidate as { color?: string }).color ?? "")
            : typeof candidate === "object" && candidate !== null && "item" in candidate
                ? String(((candidate as { item?: { color?: string } }).item?.color) ?? "")
                : "";
        const colorBoost = colorPreference && matchesRouletteColorPreference(color, colorPreference)
            ? 1 + Math.max(0, rarityIndex) * 0.55
            : 1;
        return { candidate, weight: (0.55 ** rarityIndex) * (1 + tierBoost * rarityIndex * 0.3) * colorBoost };
    });
    let random = Math.random() * weighted.reduce((sum, entry) => sum + entry.weight, 0);
    return weighted.find((entry) => (random -= entry.weight) < 0)?.candidate ?? weighted[weighted.length - 1].candidate;
}

function matchesRouletteColorPreference(color: string, preference: "green" | "blue" | "yellow") {
    const match = color.match(/^#([0-9a-f]{6})$/i);
    if (!match) return false;
    const red = parseInt(match[1].slice(0, 2), 16);
    const green = parseInt(match[1].slice(2, 4), 16);
    const blue = parseInt(match[1].slice(4, 6), 16);
    if (preference === "yellow") return red > 130 && green > 90 && blue < Math.min(red, green) * 0.8;
    if (preference === "blue") return blue >= red && blue >= green;
    return green >= red && green >= blue;
}

function getRouletteSegments(tier: RouletteTier, spend: number = tier.buyIn, colorPreference: "green" | "blue" | "yellow" = "green") {
    const labels: Record<keyof RouletteTier["chances"], string> = {
        claims: "Asteroids",
        specialClaims: "Special",
        color: "Color",
        trail: "Trail",
        avatar: "Avatar",
        title: "Profile title",
    };
    return (Object.keys(tier.chances) as (keyof RouletteTier["chances"])[])
        .filter((type) => (tier.chances[type] ?? 0) > 0 && (type === "claims" || type === "specialClaims" || type === "title" ? (type === "title" ? getAvailableRouletteTitles().length > 0 : true) : getAvailableRouletteCosmetics(type).length > 0))
        .map((type) => ({
            type,
            label: labels[type],
            // Spending above a tier's normal buy-in scales the desired
            // cosmetic categories while keeping the owner-configured base
            // percentages intact.
            weight: (tier.chances[type] ?? 0) * (spend > tier.buyIn && (type === "color" || type === "trail" || type === "avatar" || type === "title") ? Math.min(12, spend / tier.buyIn) : 1)
                * (type === "color" ? colorPreference === "yellow" ? 1.25 : colorPreference === "blue" ? 1.12 : 1.05 : 1),
            startAngle: 0,
            endAngle: 0,
        }));
}

function getRouletteReward(type: keyof RouletteTier["chances"], tier: RouletteTier, colorPreference: "green" | "blue" | "yellow" = "green"): RouletteReward {
    if (type === "claims" || type === "specialClaims") {
        const [minimum, maximum] = tier.rewards[type];
        const amount = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
        if (type === "claims") {
            asteroidsClaimed += amount;
            localStorage.setItem("orbit-claims", String(asteroidsClaimed));
        } else {
            specialAsteroids += amount;
            localStorage.setItem("orbit-special-claims", String(specialAsteroids));
        }
        return {
            title: `+${amount} ${type === "claims" ? "asteroids" : "special asteroids"}`,
            description: areRouletteCosmeticsComplete()
                ? "Collection complete — asteroid prizes only. The reward was added before the wheel animation began."
                : "The reward was added before the wheel animation began.",
            collectionComplete: areRouletteCosmeticsComplete(),
            amount,
            currencyLabel: type === "claims" ? "asteroids" : "special asteroids",
        };
    }
    if (type === "color") {
        const candidates = getAvailableRouletteCosmetics("color");
        if (!candidates.length) return getRouletteReward("claims", tier, colorPreference);
        const preferred = candidates.filter(({ color }) => matchesRouletteColorPreference(color, colorPreference));
        const chosen = chooseRouletteCosmetic(preferred.length ? preferred : candidates, () => getCosmeticRarity({ required: 30 }), tier, colorPreference);
        unlockSpinCosmetic(type, chosen.index);
        const color = chosen.color;
        selectedShipColor = color;
        localStorage.setItem("orbit-ship-color", color);
        return { title: `${color} ship color`, description: "New color unlocked and equipped.", rarity: getCosmeticRarity({ required: 30 }), collectionComplete: false };
    }
    if (type === "trail") {
        const candidates = getAvailableRouletteCosmetics("trail");
        if (!candidates.length) return getRouletteReward("claims", tier);
        const chosen = chooseRouletteCosmetic(candidates, ({ item }) => getCosmeticRarity(item), tier, colorPreference);
        unlockSpinCosmetic(type, chosen.index);
        return { title: `${chosen.item.name} trail`, description: "New trail unlocked. Equip it from Customization.", rarity: getCosmeticRarity(chosen.item), collectionComplete: false };
    }
    if (type === "title") {
        const candidates = getAvailableRouletteTitles();
        if (!candidates.length) return getRouletteReward("claims", tier, colorPreference);
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        localStorage.setItem(`orbit-title-unlock-${chosen.id}`, "1");
        if (!localStorage.getItem("orbit-title")) localStorage.setItem("orbit-title", chosen.id);
        return { title: `${chosen.name} title`, description: "New profile title unlocked. Equip it from Account settings.", collectionComplete: false };
    }
    const candidates = getAvailableRouletteCosmetics("avatar");
    if (!candidates.length) return getRouletteReward("claims", tier);
    const chosen = chooseRouletteCosmetic(candidates, ({ item }) => getCosmeticRarity(item), tier, colorPreference);
    unlockSpinCosmetic(type, chosen.index);
    return {
        title: `${chosen.item.name} avatar`,
        description: "New avatar unlocked. Equip it from Customization.",
        rarity: getCosmeticRarity(chosen.item),
        collectionComplete: false,
    };
}

function showDropRates() {
    enterAppPage(showDropRates);
    gameActive = false;
    cancelAnimationFrame(animationFrame);
    const menu = document.createElement("main");
    menu.className = "menu-screen drop-rates-screen";
    menu.innerHTML = `<p class="eyebrow">SPECIAL ASTEROID / DROP RATES</p><h1>Know the <em>odds</em></h1><p class="menu-copy">Roulette probabilities are listed here by buy-in. The wheel itself only shows numbered pockets.</p>`;
    const rouletteOdds = document.createElement("section");
    rouletteOdds.className = "roulette-odds";
    const rouletteHeading = document.createElement("h2");
    rouletteHeading.textContent = "Roulette odds";
    rouletteOdds.append(rouletteHeading);
    const rouletteOddsGrid = document.createElement("div");
    rouletteOddsGrid.className = "roulette-odds-grid";
    const rewardLabels: Record<keyof RouletteTier["chances"], string> = {
        claims: "Asteroids",
        specialClaims: "Special asteroids",
        color: "Ship color",
        trail: "Trail",
        avatar: "Avatar",
        title: "Profile title",
    };
    const rewardTypes = Object.keys(rewardLabels) as (keyof RouletteTier["chances"])[];
    const rouletteTitles = profileTitles.filter((profileTitle) => profileTitle.requirement?.type === "roulette");
    [...rouletteTiers].sort((first, second) => first.buyIn - second.buyIn).forEach((tier) => {
        const card = document.createElement("article");
        card.className = "roulette-odds-card";
        const title = document.createElement("h3");
        title.textContent = `${tier.buyIn} special asteroid buy-in`;
        const rows = document.createElement("dl");
        rewardTypes.forEach((type) => {
            const row = document.createElement("div");
            const label = document.createElement("dt");
            label.textContent = rewardLabels[type];
            const value = document.createElement("dd");
            value.textContent = `${(tier.chances[type] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
            row.append(label, value);
            if (type === "claims" || type === "specialClaims") {
                const [minimum, maximum] = tier.rewards[type];
                const range = document.createElement("small");
                range.textContent = `Reward: ${minimum.toLocaleString()}-${maximum.toLocaleString()}`;
                row.append(range);
            }
            if (type === "title") {
                const titleDetails = document.createElement("small");
                const chance = tier.chances.title ?? 0;
                titleDetails.textContent = rouletteTitles.length
                    ? `${rouletteTitles.map((profileTitle) => profileTitle.name).join(" or ")} · ${chance}% total${chance ? `, up to ${(chance / rouletteTitles.length).toLocaleString(undefined, { maximumFractionDigits: 2 })}% each while available` : ""}`
                    : "No roulette titles are configured.";
                row.append(titleDetails);
            }
            rows.append(row);
        });
        card.append(title, rows);
        rouletteOddsGrid.append(card);
    });
    const oddsNote = document.createElement("p");
    oddsNote.className = "roulette-odds-note";
    oddsNote.textContent = "These are the configured odds. If a cosmetic collection is complete, its reward type is excluded and the remaining odds are normalized.";
    rouletteOdds.append(rouletteOddsGrid, oddsNote);
    menu.append(rouletteOdds, createTextButton("Back to main menu", showMenu), createPageCounter());
    document.body.replaceChildren(menu);
}

function canVisitPrestigePlanet() { return prestigeLevel >= 1 || hasOwnerAccess(); }

function switchPlanet() {
    if (activePlanet === "normal" && !canVisitPrestigePlanet()) {
        showLevelMenu();
        return;
    }
    activePlanet = activePlanet === "normal" ? "prestige" : "normal";
    document.body.classList.toggle("prestige-theme", activePlanet === "prestige");
    showLevelMenu();
    const transition = document.createElement("div");
    transition.className = `planet-transition ${activePlanet}`;
    transition.innerHTML = `<span>${activePlanet === "prestige" ? "ENTERING PRESTIGE ORBIT" : "RETURNING TO BLUE PLANET"}</span>`;
    document.body.append(transition);
    globalThis.setTimeout(() => transition.remove(), 1100);
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

function respawnSecretAsteroids(levelIndex: number) {
    localStorage.removeItem(`orbit-asteroids-${levelIndex}`);
    localStorage.removeItem(`orbit-level-claims-${levelIndex}`);
}

function getActiveSecretPortals(level: Level) {
    return (level.secretPortals ?? []).filter((portal) => hasOwnerAccess() || !isSecretPortalClaimed(portal.secretId));
}

function isSecretLevelUnlocked(level: Level) {
    if (hasOwnerAccess()) return true;
    if (level.secretId === "prestige-gate") return localStorage.getItem("orbit-key-prestige-gate") === "1" || getNormalRouteCompletionCount() >= getNormalRouteCount();
    return level.secretId === "eclipse" ? localStorage.getItem("orbit-key-eclipse") === "1" || localStorage.getItem("orbit-secret-unlocked") === "1" : level.secretId ? localStorage.getItem(`orbit-key-${level.secretId}`) === "1" : localStorage.getItem("orbit-secret-unlocked") === "1";
}

function createPageCounter() {
    const counter = document.createElement("div");
    counter.className = "page-counter";
    counter.innerHTML = `<span>ASTEROIDS IN FLEET</span><strong>${asteroidsClaimed}</strong>`;
    return counter;
}

function showTesterLogin() {
    enterAppPage(showTesterLogin);
    const menu = document.createElement("main");
    menu.className = "menu-screen tester-screen";
    menu.innerHTML = `<p class="eyebrow">FLIGHT SYSTEMS / STAFF LOGIN</p><h1>Sign in to <em>manage</em></h1><p class="menu-copy">Sign in with an authorized owner, admin, moderator, tester, or level-maker account to open its permitted tools.</p>`;
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
    submit.textContent = "Sign in";
    const passwordField = document.createElement("label");
    passwordField.textContent = "Password";
    passwordField.append(createPasswordField(password));
    form.append(username, passwordField, submit, message);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submit.disabled = true;
        message.textContent = "Checking staff account...";
        try {
            const response = await apiRequest<{ user: OnlineUser }>("/auth/login", {
                method: "POST",
                body: JSON.stringify({ username: username.value, password: password.value }),
            });
            setOnlineUser(response.user);
            void sendPresenceHeartbeat();
            updateOwnerAccountIndicator();
            if (!(response.user.role === "owner" || response.user.role === "developer" || response.user.role === "admin" || response.user.role === "moderator" || response.user.role === "level-maker" || response.user.role === "tester")) {
                message.textContent = "This account does not have staff access.";
                submit.disabled = false;
                return;
            }
            await syncAccountProgress("load");
            await showTesterPanel();
        } catch (error) {
            message.textContent = error instanceof Error ? error.message : "The staff account could not be verified.";
            submit.disabled = false;
        }
    });
    menu.append(form, createTextButton("Back to settings", showSettings));
    document.body.replaceChildren(menu);
    username.focus();
}

function bindTesterSetting(input: HTMLInputElement, key: string, world?: "normal" | "prestige" | (() => "normal" | "prestige")) {
    const draftKey = () => {
        const currentWorld = typeof world === "function" ? world() : world;
        return currentWorld ? `${currentWorld}.${key}` : key;
    };
    const draftValue = testerSettingsDraft.get(draftKey());
    if (draftValue !== undefined) input.value = draftValue;
    input.addEventListener("input", () => testerSettingsDraft.set(draftKey(), input.value));
}

function readTesterSetting(key: string, fallback: number, world?: "normal" | "prestige") {
    const draftValue = testerSettingsDraft.get(world ? `${world}.${key}` : key);
    return draftValue === undefined ? fallback : Number(draftValue);
}

async function showTesterPanel(selectedWorld: "normal" | "prestige" = activePlanet) {
    enterAppPage(showTesterPanel);
    let user = currentOnlineUser;
    try {
        if (!user) user = (await apiRequest<{ user: OnlineUser | null }>("/auth/session")).user;
    } catch (error) {
        showTesterLogin();
        console.error("Could not verify owner account:", error);
        return;
    }
    if (!user || !(user.role === "owner" || user.role === "developer" || user.role === "admin" || user.role === "moderator" || user.role === "level-maker" || user.role === "tester")) {
        showTesterLogin();
        return;
    }
    setOnlineUser(user);
    updateOwnerAccountIndicator();
    const isOwner = user.role === "owner" || user.role === "developer";
    const isAdmin = user.role === "admin";
    const isModerator = user.role === "moderator";
    const isLevelMaker = user.role === "level-maker";
    const isOfflineOwner = offlineOwnerMode && isOwner;
    const canTest = isOwner || isAdmin || user.role === "tester";
    const canModerate = isOwner || isAdmin || isModerator;
    const canWorkshop = isOwner || isAdmin || isLevelMaker;
    const menu = document.createElement("main");
    menu.className = "menu-screen tester-screen";
    const pageHeader = document.createElement("div");
    pageHeader.className = "tester-console-header";
    pageHeader.innerHTML = `<div><p class="eyebrow">FLIGHT SYSTEMS / ${roleLabel(user.role)}</p><h1>Control <em>center</em></h1><p class="menu-copy">${isOfflineOwner ? "Offline owner mode is local-only. Changes stay on this device until you reconnect." : isOwner ? "Manage your game and pilots from one place." : isAdmin ? "Manage approved content, levels, messages, and local test tools." : isModerator ? "Review accounts and enforce bans without access to player rewards." : isLevelMaker ? "Build and playtest workshop levels." : "Test game settings and progression on this device."}</p></div><span class="tester-scope-badge">${isOfflineOwner ? "OFFLINE / LOCAL ONLY" : isOwner ? "OWNER ACCESS" : user.role === "tester" ? "LOCAL TEST MODE" : `${roleLabel(user.role)} ACCESS`}</span>`;
    const worldTabs = document.createElement("nav");
    worldTabs.className = "tester-world-tabs";
    worldTabs.setAttribute("aria-label", "World settings");
    const normalTab = createTextButton("Normal world", () => selectWorld("normal"));
    const prestigeTab = createTextButton("Prestige world", () => selectWorld("prestige"));
    normalTab.classList.toggle("selected", selectedWorld === "normal");
    prestigeTab.classList.toggle("selected", selectedWorld === "prestige");
    normalTab.setAttribute("aria-pressed", String(selectedWorld === "normal"));
    prestigeTab.setAttribute("aria-pressed", String(selectedWorld === "prestige"));
    worldTabs.append(normalTab, prestigeTab);
    const form = document.createElement("form");
    form.className = "tester-panel";
    form.noValidate = true;
    const accountManagement = document.createElement("section");
    accountManagement.className = "tester-player-management";
    accountManagement.hidden = true;
    const codeManagement = document.createElement("section");
    codeManagement.className = "tester-player-management";
    codeManagement.hidden = true;
    const messageManagement = document.createElement("section");
    messageManagement.className = "tester-player-management";
    messageManagement.hidden = true;
    const chatFilterManagement = document.createElement("section");
    chatFilterManagement.className = "tester-player-management";
    chatFilterManagement.hidden = true;
    const reportManagement = document.createElement("section");
    reportManagement.className = "tester-player-management";
    reportManagement.hidden = true;
    const moderationLogManagement = document.createElement("section");
    moderationLogManagement.className = "tester-player-management";
    moderationLogManagement.hidden = true;
    const updateLogManagement = document.createElement("section");
    updateLogManagement.className = "tester-player-management";
    updateLogManagement.hidden = true;
    const titleManagement = document.createElement("section");
    titleManagement.className = "tester-player-management title-management";
    titleManagement.hidden = true;
    const drawTitleManagement = () => {
        titleManagement.replaceChildren();
        const heading = document.createElement("h2");
        heading.textContent = "Profile titles";
        const description = document.createElement("p");
        description.textContent = "Create titles with route, Golden Body, prestige, or roulette requirements. Add an optional color and animation so rare titles stand out on profiles.";
        const list = document.createElement("div");
        list.className = "title-management-list";
        const status = document.createElement("small");
        status.setAttribute("role", "status");
        const readDraftTitles = () => Array.from(list.querySelectorAll<HTMLElement>(".title-management-row")).map((row) => ({
            id: row.querySelector<HTMLInputElement>("[data-title-id]")!.value,
            name: row.querySelector<HTMLInputElement>("[data-title-name]")!.value,
            routes: Number(row.querySelector<HTMLInputElement>("[data-title-routes]")!.value),
            requirement: {
                type: row.querySelector<HTMLSelectElement>("[data-title-requirement]")!.value as "routes" | "golden" | "prestige" | "roulette" | "locked" | "enemies" | "bosses",
                amount: Number(row.querySelector<HTMLInputElement>("[data-title-requirement-amount]")!.value),
            },
            ...(row.querySelector<HTMLInputElement>("[data-title-color]")!.value.trim() ? { color: row.querySelector<HTMLInputElement>("[data-title-color]")!.value.trim() } : {}),
            ...(row.querySelector<HTMLSelectElement>("[data-title-animation]")!.value !== "none" ? { animation: row.querySelector<HTMLSelectElement>("[data-title-animation]")!.value as "pulse" | "shimmer" | "rainbow" | "dark-matter" | "star-shimmer" | "comet-trail" | "nebula-drift" | "aurora-wave" | "solar-flare" } : {}),
        }));
        profileTitles.forEach((title, index) => {
            const row = document.createElement("div");
            row.className = "title-management-row";
            const createTitleField = (labelText: string, control: HTMLElement) => {
                const field = document.createElement("label");
                field.className = "title-management-field";
                const label = document.createElement("span");
                label.textContent = labelText;
                field.append(label, control);
                return field;
            };
            const id = document.createElement("input");
            id.value = title.id;
            id.maxLength = 40;
            id.pattern = "[a-z0-9-]{1,40}";
            id.required = true;
            id.dataset.titleId = String(index);
            id.setAttribute("aria-label", `Title ${index + 1} id`);
            const name = document.createElement("input");
            name.value = title.name;
            name.maxLength = 50;
            name.required = true;
            name.dataset.titleName = String(index);
            name.setAttribute("aria-label", `Title ${index + 1} name`);
            const color = document.createElement("input");
            color.type = "text";
            color.value = title.color ?? "";
            color.placeholder = "#f6c46e";
            color.maxLength = 7;
            color.pattern = "#[0-9a-fA-F]{6}";
            color.dataset.titleColor = String(index);
            color.setAttribute("aria-label", `Title ${index + 1} color`);
            const animation = document.createElement("select");
            animation.dataset.titleAnimation = String(index);
            animation.setAttribute("aria-label", `Title ${index + 1} animation`);
            [["none", "No animation"], ["pulse", "Pulse glow"], ["shimmer", "Shimmer"], ["rainbow", "Rainbow shift"], ["dark-matter", "Dark matter orbit"], ["star-shimmer", "Star shimmer"], ["comet-trail", "Comet trail"], ["nebula-drift", "Nebula drift"], ["aurora-wave", "Aurora wave"], ["solar-flare", "Solar flare"]].forEach(([value, labelText]) => { const option = document.createElement("option"); option.value = value; option.textContent = labelText; animation.append(option); });
            animation.value = title.animation ?? "none";
            const routes = document.createElement("input");
            routes.type = "number";
            routes.min = "0";
            routes.max = "100000";
            routes.step = "1";
            routes.value = String(title.routes);
            routes.required = true;
            routes.dataset.titleRoutes = String(index);
            routes.setAttribute("aria-label", `Title ${index + 1} route requirement`);
            const requirement = document.createElement("select");
            requirement.dataset.titleRequirement = String(index);
            requirement.setAttribute("aria-label", `Title ${index + 1} requirement type`);
            [["routes", "Routes cleared"], ["enemies", "Enemies defeated"], ["bosses", "Bosses defeated"], ["golden", "Golden Body routes"], ["prestige", "Prestige level"], ["roulette", "Roulette prize"], ["locked", "Unobtainable (owner or code only)"]].forEach(([value, labelText]) => { const option = document.createElement("option"); option.value = value; option.textContent = labelText; requirement.append(option); });
            requirement.value = title.requirement?.type ?? "routes";
            const requirementAmount = document.createElement("input");
            requirementAmount.type = "number";
            requirementAmount.min = "0";
            requirementAmount.max = "100000";
            requirementAmount.step = "1";
            requirementAmount.value = String(title.requirement?.amount ?? title.routes);
            requirementAmount.dataset.titleRequirementAmount = String(index);
            requirementAmount.setAttribute("aria-label", `Title ${index + 1} requirement amount`);
            const syncRequirementEditor = () => { requirementAmount.hidden = requirement.value === "locked"; if (requirement.value === "locked") requirementAmount.value = "0"; };
            requirement.addEventListener("change", syncRequirementEditor);
            syncRequirementEditor();
            const remove = createTextButton("Remove", () => {
                void showActionDialog({ title: "Remove profile title?", description: `Remove ${title.name} from the shared catalog?`, confirmLabel: "Remove title", danger: true }).then((dialog) => {
                    if (!dialog.confirmed) return;
                    profileTitles = readDraftTitles().filter((_, titleIndex) => titleIndex !== index);
                    drawTitleManagement();
                });
            });
            remove.classList.add("title-management-remove");
            const rowHeader = document.createElement("div");
            rowHeader.className = "title-management-row-header";
            const rowTitle = document.createElement("strong");
            rowTitle.textContent = `Title ${index + 1}`;
            rowHeader.append(rowTitle, remove);
            const fields = document.createElement("div");
            fields.className = "title-management-fields";
            fields.append(
                createTitleField("ID", id),
                createTitleField("Display name", name),
                createTitleField("Color (optional)", color),
                createTitleField("Animation", animation),
                createTitleField("Routes", routes),
                createTitleField("Requirement", requirement),
                createTitleField("Amount", requirementAmount),
            );
            row.append(rowHeader, fields);
            list.append(row);
        });
        const add = createTextButton("Add title", () => {
            const draft = readDraftTitles();
            profileTitles = [{ id: `title-${draft.length + 1}`, name: "New title", routes: 1, requirement: { type: "routes", amount: 1 } }, ...draft];
            drawTitleManagement();
        });
        const save = createTextButton("Save titles for everyone", async () => {
            const nextTitles: ProfileTitle[] = readDraftTitles();
            save.disabled = true;
            status.textContent = "Saving titles for every player...";
            try {
                const response = await apiRequest<{ profileTitles: ProfileTitle[] }>("/settings/profile-titles", {
                    method: "PUT",
                    body: JSON.stringify({ profileTitles: nextTitles }),
                });
                profileTitles = response.profileTitles;
                status.textContent = "Profile titles saved for every player.";
                drawTitleManagement();
            } catch (error) {
                status.textContent = error instanceof Error ? error.message : "Could not save profile titles.";
                save.disabled = false;
            }
        });
        const grant = document.createElement("select");
        grant.setAttribute("aria-label", "Title to equip on my account");
        const noGrant = document.createElement("option");
        noGrant.value = "";
        noGrant.textContent = "Choose a title to equip on my account";
        grant.append(noGrant);
        profileTitles.forEach((title) => {
            const option = document.createElement("option");
            option.value = title.id;
            const requirement = title.requirement?.type === "golden" ? `${title.requirement.amount} Golden Body routes` : title.requirement?.type === "prestige" ? `prestige ${title.requirement.amount}` : title.requirement?.type === "roulette" ? "roulette prize" : title.requirement?.type === "locked" ? "owner or code only" : `${title.requirement?.amount ?? title.routes} routes`;
            option.textContent = `${title.name} / ${requirement}`;
            grant.append(option);
        });
        const grantButton = createTextButton("Equip selected title on my account", () => {
            if (!grant.value) return;
            localStorage.setItem("orbit-title", grant.value);
            localStorage.setItem(`orbit-title-unlock-${grant.value}`, "1");
            void syncAccountProgress("save", true).then(() => { status.textContent = "Selected title saved to your account."; }).catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : "Could not sync title."; });
        });
        const grantAllButton = createTextButton("Grant all titles on my account", () => {
            localStorage.setItem("orbit-all-titles", "1");
            if (!localStorage.getItem("orbit-title") && profileTitles[0]) localStorage.setItem("orbit-title", profileTitles[0].id);
            void syncAccountProgress("save", true).then(() => { status.textContent = "All titles are now available on your account."; }).catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : "Could not sync title unlocks."; });
        });
        const catalogActions = document.createElement("div");
        catalogActions.className = "title-management-actions";
        catalogActions.append(add, save, status);
        const accountTools = document.createElement("div");
        accountTools.className = "title-management-account-tools";
        const accountToolsHeading = document.createElement("h3");
        accountToolsHeading.textContent = "My test account";
        accountTools.append(accountToolsHeading, grant, grantButton, grantAllButton);
        list.append(catalogActions, accountTools);
        titleManagement.append(heading, description, list);
    };
    drawTitleManagement();
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
    const pilotFields: HTMLElement[] = [claimsLabel, specialLabel, prestigeLabel, prestigeMaxLabel];
    const inventory = getInventory();
    (Object.keys(powerupPrices) as PowerupKind[]).forEach((kind) => {
        const label = document.createElement("label");
        label.innerHTML = `<span>${powerupLabels[kind]}</span>`;
        const input = document.createElement("input");
        input.type = "number"; input.min = "0"; input.value = String(inventory[kind]); input.dataset.powerup = kind;
        label.append(input); form.append(label); pilotFields.push(label);
    });
    const rewardSettings = document.createElement("section");
    rewardSettings.className = "tester-reward-settings";
    rewardSettings.innerHTML = `<p class="setting-title">${selectedWorld === "prestige" ? "Prestige" : "Normal"} world percentages</p><p class="menu-copy">Configure portal, Rainbow Star, and power-up spawns for this world. Roulette rarity odds are managed in the Roulette tab.</p>`;
    const starChanceLabel = document.createElement("label");
    starChanceLabel.innerHTML = `<span>Rainbow Star chance per level (%)</span>`;
    const starChanceInput = document.createElement("input");
    starChanceInput.type = "number";
    starChanceInput.min = "0";
    starChanceInput.max = "100";
    starChanceInput.step = "1";
    starChanceInput.value = String(selectedConfig.rainbowStarChance);
    starChanceInput.dataset.rainbowStarChance = "true";
    bindTesterSetting(starChanceInput, "rainbowStarChance", () => selectedWorld);
    starChanceLabel.append(starChanceInput);
    rewardSettings.append(starChanceLabel);
    const portalChanceLabel = document.createElement("label");
    portalChanceLabel.innerHTML = `<span>Secret portal spawn chance (%)</span>`;
    const portalChanceInput = document.createElement("input");
    portalChanceInput.type = "number";
    portalChanceInput.min = "0";
    portalChanceInput.max = "100";
    portalChanceInput.step = "1";
    portalChanceInput.value = String(selectedConfig.portalSpawnChance);
    portalChanceInput.dataset.portalSpawnChance = "true";
    bindTesterSetting(portalChanceInput, "portalSpawnChance", () => selectedWorld);
    portalChanceLabel.append(portalChanceInput);
    rewardSettings.append(portalChanceLabel);
    // Keep the rarity values in the shared config without exposing the old
    // rarity editor in this world-settings section. Roulette owns that UI.
    const rarityCompatibility = document.createElement("div");
    rarityCompatibility.hidden = true;
    RARITY_ORDER.forEach((rarity) => {
        const oddsInput = document.createElement("input");
        oddsInput.type = "number"; oddsInput.value = String(selectedConfig.rarityOdds[rarity]); oddsInput.dataset.rollOdds = rarity;
        bindTesterSetting(oddsInput, `rarityOdds.${rarity}`, () => selectedWorld);
        const minimumInput = document.createElement("input");
        minimumInput.type = "number"; minimumInput.value = String(selectedConfig.rewardRanges[rarity][0]); minimumInput.dataset.rewardMin = rarity;
        bindTesterSetting(minimumInput, `rewardMin.${rarity}`, () => selectedWorld);
        const maximumInput = document.createElement("input");
        maximumInput.type = "number"; maximumInput.value = String(selectedConfig.rewardRanges[rarity][1]); maximumInput.dataset.rewardMax = rarity;
        bindTesterSetting(maximumInput, `rewardMax.${rarity}`, () => selectedWorld);
        const skinInput = document.createElement("input");
        skinInput.type = "number"; skinInput.value = String(selectedConfig.skinChances[rarity]); skinInput.dataset.skinChance = rarity;
        bindTesterSetting(skinInput, `skinChance.${rarity}`, () => selectedWorld);
        rarityCompatibility.append(oddsInput, minimumInput, maximumInput, skinInput);
    });
    rewardSettings.append(rarityCompatibility);
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
        bindTesterSetting(input, `powerupSpawn.${kind}`, () => selectedWorld);
        label.append(input);
        rewardSettings.append(label);
    });
    const rewardSettingsError = document.createElement("small");
    rewardSettingsError.className = "tester-save-status";
    rewardSettingsError.setAttribute("role", "status");
    const setSaveStatus = (message: string, error = false) => {
        rewardSettingsError.textContent = message;
        rewardSettingsError.classList.toggle("tester-error", error);
    };
    rewardSettings.append(rewardSettingsError);
    form.append(rewardSettings);
    function selectWorld(world: "normal" | "prestige") {
        selectedWorld = world;
        const config = gameConfig[world];
        normalTab.classList.toggle("selected", world === "normal");
        prestigeTab.classList.toggle("selected", world === "prestige");
        normalTab.setAttribute("aria-pressed", String(world === "normal"));
        prestigeTab.setAttribute("aria-pressed", String(world === "prestige"));
        rewardSettings.querySelector(".setting-title")!.textContent = `${world === "prestige" ? "Prestige" : "Normal"} world percentages`;
        starChanceInput.value = String(readTesterSetting("rainbowStarChance", config.rainbowStarChance, world));
        portalChanceInput.value = String(readTesterSetting("portalSpawnChance", config.portalSpawnChance, world));
        RARITY_ORDER.forEach((rarity) => {
            rewardSettings.querySelector<HTMLInputElement>(`input[data-roll-odds="${rarity}"]`)!.value = String(readTesterSetting(`rarityOdds.${rarity}`, config.rarityOdds[rarity], world));
            rewardSettings.querySelector<HTMLInputElement>(`input[data-reward-min="${rarity}"]`)!.value = String(readTesterSetting(`rewardMin.${rarity}`, config.rewardRanges[rarity][0], world));
            rewardSettings.querySelector<HTMLInputElement>(`input[data-reward-max="${rarity}"]`)!.value = String(readTesterSetting(`rewardMax.${rarity}`, config.rewardRanges[rarity][1], world));
            rewardSettings.querySelector<HTMLInputElement>(`input[data-skin-chance="${rarity}"]`)!.value = String(readTesterSetting(`skinChance.${rarity}`, config.skinChances[rarity], world));
        });
        (["shield", "boost", "rapid", "cannon"] as const).forEach((kind) => {
            rewardSettings.querySelector<HTMLInputElement>(`input[data-powerup-spawn="${kind}"]`)!.value = String(readTesterSetting(`powerupSpawn.${kind}`, config.powerupSpawnChances[kind], world));
        });
    }
    const rouletteSettings = document.createElement("section");
    rouletteSettings.className = "tester-reward-settings roulette-settings-editor";
    const rouletteHeading = document.createElement("p");
    rouletteHeading.className = "setting-title";
    rouletteHeading.textContent = "Roulette buy-in and prize chances";
    const rouletteDescription = document.createElement("p");
    rouletteDescription.className = "menu-copy";
    rouletteDescription.textContent = "Adjust each tier's prize chances and asteroid rewards. Titles marked as roulette prizes join the wheel. Chances in each tier must add up to 100%.";
    const rouletteEditor = createRouletteFields(rouletteTiers);
    const rouletteStatus = document.createElement("small");
    rouletteStatus.setAttribute("role", "status");
    const saveRoulette = createTextButton("Save roulette tiers", async () => {
        const invalid = Array.from(rouletteEditor.element.querySelectorAll<HTMLInputElement>("input")).find((input) => !input.checkValidity());
        if (invalid) {
            rouletteStatus.textContent = "Check the highlighted value before saving.";
            invalid.focus();
            invalid.reportValidity();
            return;
        }
        const parsed = rouletteEditor.read();
        if (!isUsableRouletteTiers(parsed)) {
            rouletteStatus.textContent = "Each tier needs its fixed buy-in, valid reward chances totaling 100%, and bounded reward ranges.";
            return;
        }
        saveRoulette.disabled = true;
        try {
            if (isOwner) {
                const response = await apiRequest<{ rouletteTiers: RouletteTier[] }>("/settings/roulette-tiers", {
                    method: "PUT",
                    body: JSON.stringify({ tiers: parsed }),
                });
                rouletteTiers = response.rouletteTiers;
            } else {
                rouletteTiers = structuredClone(parsed);
                localStorage.setItem("orbit-tester-roulette-tiers", JSON.stringify(rouletteTiers));
            }
            rouletteEditor.draw(rouletteTiers);
            rouletteStatus.textContent = isOwner ? "Roulette tiers saved for all players." : "Tester-only roulette tiers saved on this device.";
        } catch (error) {
            rouletteStatus.textContent = error instanceof Error ? error.message : "Could not save roulette tiers.";
        } finally {
            saveRoulette.disabled = false;
        }
    });
    const resetRoulette = createTextButton("Reset roulette defaults", () => {
        rouletteEditor.draw(DEFAULT_ROULETTE_TIERS);
        rouletteStatus.textContent = "Defaults loaded. Save roulette tiers to apply them.";
    });
    rouletteSettings.append(rouletteHeading, rouletteDescription, rouletteEditor.element, saveRoulette, resetRoulette, rouletteStatus);
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
    addEffectInput("Rainbow Star movement multiplier", "star-multiplier", gameConfig.powerupEffects.star.movementMultiplier ?? DEFAULT_GAME_CONFIG.powerupEffects.star.movementMultiplier!, 1, 4, 0.1);
    const addRuleToggle = (labelText: string, key: "oneActiveAtATime" | "rainbowStarInvincible" | "rainbowStarDefeatsEnemies") => {
        const label = document.createElement("label");
        label.append(document.createTextNode(labelText));
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = gameConfig.powerupRules[key];
        input.dataset.powerupRule = key;
        input.addEventListener("change", () => testerSettingsDraft.set(`rule.${key}`, input.checked ? "1" : "0"));
        label.append(input);
        effectSettings.append(label);
    };
    addRuleToggle("Allow only one active power-up", "oneActiveAtATime");
    addRuleToggle("Rainbow Star grants invincibility", "rainbowStarInvincible");
    addRuleToggle("Rainbow Star defeats enemies on contact", "rainbowStarDefeatsEnemies");
    const limitHeading = document.createElement("p");
    limitHeading.className = "setting-title";
    limitHeading.textContent = "Per-level power-up limits";
    effectSettings.append(limitHeading);
    (Object.keys(powerupLabels) as PowerupKind[]).forEach((kind) => {
        const addLimit = (labelText: string, key: "maxPickups" | "maxUses", value: number, max: number) => {
            const label = document.createElement("label");
            label.append(document.createTextNode(labelText));
            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.max = String(max);
            input.step = "1";
            input.value = String(value);
            input.dataset.powerupLimit = `${key}.${kind}`;
            bindTesterSetting(input, `rule.${key}.${kind}`);
            label.append(input);
            effectSettings.append(label);
        };
        addLimit(`${powerupLabels[kind]} pickups per level`, "maxPickups", gameConfig.powerupRules.maxPickupsPerLevel[kind], 20);
        addLimit(`${powerupLabels[kind]} inventory uses per level`, "maxUses", gameConfig.powerupRules.maxUsesPerLevel[kind], 99);
    });
    const enemySettings = document.createElement("section");
    enemySettings.className = "tester-reward-settings tester-enemy-settings";
    enemySettings.innerHTML = `<p class="setting-title">Enemy behavior</p><p class="menu-copy">Tune attack cadence and projectile speed. A higher interval means enemies fire less often; multipliers apply to prestige, secret, and Rapid Fire states.</p>`;
    const addEnemyInput = (title: string, key: string, value: number, min: number, max: number, step = 1) => {
        const label = document.createElement("label");
        label.append(document.createTextNode(title));
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        input.dataset.enemyRule = key;
        bindTesterSetting(input, `enemy.${key}`);
        label.append(input);
        enemySettings.append(label);
    };
    addEnemyInput("Base attack interval (frames)", "attackIntervalFrames", gameConfig.enemyRules.attackIntervalFrames, 15, 600);
    addEnemyInput("Default prestige attack speed multiplier", "prestigeAttackMultiplier", gameConfig.enemyRules.prestigeAttackMultiplier, 0.25, 2, 0.01);
    const prestigeMultipliers = gameConfig.enemyRules.prestigeAttackMultipliers?.length
        ? [...gameConfig.enemyRules.prestigeAttackMultipliers]
        : [gameConfig.enemyRules.prestigeAttackMultiplier];
    const prestigeDifficultyCount = Math.max(1, Math.min(100, Math.max(prestigeMax, prestigeMultipliers.length)));
    const prestigeDifficultyTitle = document.createElement("p");
    prestigeDifficultyTitle.className = "setting-title";
    prestigeDifficultyTitle.textContent = "Prestige difficulty by level";
    enemySettings.append(prestigeDifficultyTitle);
    const prestigeDifficultyHelp = document.createElement("p");
    prestigeDifficultyHelp.className = "menu-copy";
    prestigeDifficultyHelp.textContent = "Set the attack-speed multiplier for each prestige. Lower values make enemies fire faster; higher values give pilots more time.";
    enemySettings.append(prestigeDifficultyHelp);
    for (let index = 0; index < prestigeDifficultyCount; index += 1) {
        const fallback = prestigeMultipliers[index] ?? prestigeMultipliers[prestigeMultipliers.length - 1] ?? gameConfig.enemyRules.prestigeAttackMultiplier;
        addEnemyInput(`Prestige ${index + 1} attack speed multiplier`, `prestigeAttack.${index + 1}`, fallback, 0.25, 2, 0.01);
    }
    addEnemyInput("Secret attack speed multiplier", "secretAttackMultiplier", gameConfig.enemyRules.secretAttackMultiplier, 0.25, 2, 0.01);
    addEnemyInput("Rapid Fire attack speed multiplier", "rapidAttackMultiplier", gameConfig.enemyRules.rapidAttackMultiplier, 0.25, 1, 0.01);
    addEnemyInput("Enemy projectile speed", "projectileSpeed", gameConfig.enemyRules.projectileSpeed, 0.5, 12, 0.1);
    addEnemyInput("Mini-boss projectile speed", "miniBossProjectileSpeed", gameConfig.enemyRules.miniBossProjectileSpeed, 0.5, 16, 0.1);
    addEnemyInput("Boss projectile speed", "bossProjectileSpeed", gameConfig.enemyRules.bossProjectileSpeed, 0.5, 16, 0.1);
    const enemyRosterHeading = document.createElement("p");
    enemyRosterHeading.className = "setting-title";
    enemyRosterHeading.textContent = "Enemy roster";
    enemySettings.append(enemyRosterHeading);
    const enemyRosterHelp = document.createElement("p");
    enemyRosterHelp.className = "menu-copy";
    enemyRosterHelp.textContent = "Every enemy used by the level builder is listed below. Tune each enemy's cadence and projectile speed without changing the global defaults.";
    enemySettings.append(enemyRosterHelp);
    const enemyRoster = document.createElement("div");
    enemyRoster.className = "enemy-roster";
    const hasConfiguredEnemyProfiles = Boolean(gameConfig.enemyRules.enemyTypes);
    const enemyProfiles = structuredClone(gameConfig.enemyRules.enemyTypes ?? DEFAULT_GAME_CONFIG.enemyRules.enemyTypes!);
    if (!hasConfiguredEnemyProfiles) {
        enemyProfiles.sentry.projectileSpeed = gameConfig.enemyRules.projectileSpeed;
        enemyProfiles.darkKnight.projectileSpeed = gameConfig.enemyRules.miniBossProjectileSpeed;
        enemyProfiles.titanCore.projectileSpeed = gameConfig.enemyRules.bossProjectileSpeed;
    }
    const enemyDefinitions = [
        { key: "sentry" as const, name: "Sentry", description: "Regular route enemy", color: "#f6c46e" },
        { key: "darkKnight" as const, name: "Dark Knight", description: "Mini-boss guardian", color: "#b991ff" },
        { key: "titanCore" as const, name: "Titan Core", description: "Route boss", color: "#ed7657" },
        { key: "voidWarden" as const, name: "Void Warden", description: "Secret portal boss", color: "#6ecbff" },
    ];
    enemyDefinitions.forEach(({ key, name, description, color }) => {
        const profile = enemyProfiles[key];
        const card = document.createElement("article");
        card.className = "enemy-roster-card";
        card.style.setProperty("--enemy-accent", color);
        const heading = document.createElement("h3");
        heading.textContent = name;
        const copy = document.createElement("p");
        copy.textContent = description;
        card.append(heading, copy);
        const addProfileInput = (labelText: string, field: "attackIntervalMultiplier" | "projectileSpeed", value: number, min: number, max: number, step: number) => {
            const label = document.createElement("label");
            label.append(document.createTextNode(labelText));
            const input = document.createElement("input");
            input.type = "number";
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.dataset.enemyProfile = `${key}.${field}`;
            bindTesterSetting(input, `enemy.profile.${key}.${field}`);
            label.append(input);
            card.append(label);
        };
        addProfileInput("Cadence multiplier", "attackIntervalMultiplier", profile.attackIntervalMultiplier, 0.25, 2, 0.01);
        addProfileInput("Projectile speed", "projectileSpeed", profile.projectileSpeed, 0.5, 16, 0.01);
        enemyRoster.append(card);
    });
    enemySettings.append(enemyRoster);
    effectSettings.append(enemySettings);
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
        unlocks.querySelector<HTMLInputElement>('input[data-unlock="skins"]')!.checked = true;
    });
    const unlockAllTitles = createTextButton("Grant all profile titles", () => {
        localStorage.setItem("orbit-all-titles", "1");
        statusLabel.textContent = "All profile titles unlocked for this test account.";
        if (currentOnlineUser) void syncAccountProgress("save", true).catch((error: unknown) => console.error("Could not sync title unlocks:", error));
    });
    form.append(unlockEverySkin, unlockAllTitles);
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
        form.querySelectorAll<HTMLInputElement>("input[data-level]").forEach((input) => {
            const index = Number(input.dataset.level);
            const level = levels[index];
            if (matches(level)) input.checked = level.secret ? isSecretLevelUnlocked(level) : true;
        });
        if (localStorage.getItem("orbit-key-prestige-gate") === "1") prestigeGateInput.checked = true;
    };
    const normalUnlock = createTextButton("Unlock normal levels", () => unlockLevels((level) => !level.secret && !level.prestige));
    const secretUnlock = createTextButton("Unlock secret levels", () => { localStorage.setItem("orbit-secret-unlocked", "1"); unlockLevels((level) => Boolean(level.secret)); });
    const prestigeUnlock = createTextButton("Unlock prestige levels", () => { unlockLevels((level) => Boolean(level.prestige)); prestigeLevel = Math.max(prestigeLevel, 2); prestigeInput.value = String(prestigeLevel); localStorage.setItem("orbit-prestige", String(prestigeLevel)); });
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
            input.addEventListener("change", () => {
                levelChoices.querySelectorAll<HTMLInputElement>("input[data-level]").forEach((other) => {
                    if (other.dataset.level === input.dataset.level) other.checked = input.checked;
                });
                if (levels[Number(input.dataset.level)]?.secretId === "prestige-gate") prestigeGateInput.checked = input.checked;
            });
            const name = document.createElement("span");
            name.textContent = level.name;
            const metadata = document.createElement("small");
            metadata.className = "tester-level-meta";
            metadata.textContent = `${getPortalPlacementLabel(level)} / RAINBOW STAR ${getConfiguredRainbowStarChance(Boolean(level.prestige))}%`;
            label.append(input, name, metadata); groupPanel.append(label);
        });
        levelChoices.append(groupPanel);
    });
    prestigeGateInput.addEventListener("change", () => {
        levelChoices.querySelectorAll<HTMLInputElement>("input[data-level]").forEach((input) => {
            if (levels[Number(input.dataset.level)]?.secretId === "prestige-gate") input.checked = prestigeGateInput.checked;
        });
    });
    form.append(levelChoices);
    let portalAssignmentPanel: HTMLElement | undefined;
    if (isOwner) {
        portalAssignmentPanel = document.createElement("section");
        portalAssignmentPanel.className = "tester-reward-settings portal-assignment-settings";
        const portalHeading = document.createElement("p");
        portalHeading.className = "setting-title";
        portalHeading.textContent = "Secret portal placement";
        const portalDescription = document.createElement("p");
        portalDescription.className = "menu-copy";
        portalDescription.textContent = "Choose the normal or prestige level where each secret portal can appear. If that level has a Portal tile, the secret portal uses the first placed tile; otherwise it uses a stable portal slot at a playable height. Empty assignments use automatic placement.";
        portalAssignmentPanel.append(portalHeading, portalDescription);
        const portalTargets: Record<"normal" | "prestige", string[]> = {
            normal: ["eclipse", "nebula", "archive"],
            prestige: ["stellar-sanctum", "quantum-depths", "infinity-spiral"],
        };
        (Object.entries(portalTargets) as ["normal" | "prestige", string[]][]).forEach(([world, targetIds]) => {
            const group = document.createElement("div");
            group.className = "portal-assignment-group";
            const groupTitle = document.createElement("b");
            groupTitle.textContent = `${world === "prestige" ? "Prestige" : "Normal"} secret portals`;
            group.append(groupTitle);
            const sourceLevels = levels.filter((level) => !level.secret && !level.customId && !level.localOnly && Boolean(level.prestige) === (world === "prestige"));
            targetIds.forEach((targetId) => {
                const label = document.createElement("label");
                label.textContent = `${secretPortalTargetLabels[targetId] ?? targetId} portal appears in`;
                const select = document.createElement("select");
                select.dataset.portalAssignment = targetId;
                select.setAttribute("aria-label", `${secretPortalTargetLabels[targetId] ?? targetId} portal source level`);
                const automatic = document.createElement("option");
                automatic.value = "";
                automatic.textContent = "Automatic placement";
                select.append(automatic);
                sourceLevels.forEach((source) => {
                    const option = document.createElement("option");
                    option.value = source.name;
                    option.textContent = source.name;
                    select.append(option);
                });
                select.value = portalAssignments[targetId] ?? "";
                label.append(select);
                group.append(label);
            });
            portalAssignmentPanel!.append(group);
        });
        const portalStatus = document.createElement("small");
        portalStatus.className = "portal-assignment-status";
        portalStatus.setAttribute("role", "status");
        const savePortalAssignments = createTextButton("Save portal placement", async () => {
            const assignments: Record<string, string> = {};
            portalAssignmentPanel!.querySelectorAll<HTMLSelectElement>("select[data-portal-assignment]").forEach((select) => {
                if (select.value) assignments[select.dataset.portalAssignment!] = select.value;
            });
            savePortalAssignments.disabled = true;
            portalStatus.textContent = "Saving portal placement for every player...";
            try {
                const previousAssignments = { ...portalAssignments };
                const response = await apiRequest<{ portalAssignments: Record<string, string> }>("/settings/portal-assignments", {
                    method: "PUT",
                    body: JSON.stringify({ assignments }),
                });
                portalAssignments = response.portalAssignments;
                ["eclipse", "nebula", "archive", "stellar-sanctum", "quantum-depths", "infinity-spiral"].forEach((secretId) => {
                    if (previousAssignments[secretId] !== response.portalAssignments[secretId]) localStorage.removeItem(`orbit-portal-location-${secretId}`);
                });
                configurePortalDistribution();
                renderPortalObjects();
                levelChoices.querySelectorAll<HTMLInputElement>("input[data-level]").forEach((input) => {
                    const level = levels[Number(input.dataset.level)];
                    const metadata = input.parentElement?.querySelector<HTMLElement>(".tester-level-meta");
                    if (level && metadata) metadata.textContent = `${getPortalPlacementLabel(level)} / RAINBOW STAR ${getConfiguredRainbowStarChance(Boolean(level.prestige))}%`;
                });
                portalStatus.textContent = "Portal placement saved for every player.";
            } catch (error) {
                portalStatus.textContent = error instanceof Error ? error.message : "Could not save portal placement.";
            } finally {
                savePortalAssignments.disabled = false;
            }
        });
        portalAssignmentPanel.append(savePortalAssignments, portalStatus);
        form.append(portalAssignmentPanel);
    }
    const customTitle = document.createElement("p");
    customTitle.className = "setting-title";
    customTitle.textContent = "Shared workshop levels";
    form.append(customTitle);
    const sharedLevels = document.createElement("div");
    sharedLevels.className = "tester-custom-levels";
    const workshopStatus = document.createElement("small");
    workshopStatus.className = "tester-error";
    workshopStatus.setAttribute("role", "status");
    const serverCustomLevels = levels.map((level, index) => ({ level, index })).filter(({ level }) => Boolean(level.customId) && !level.localOnly);
    if (!serverCustomLevels.length) {
        const empty = document.createElement("small");
        empty.textContent = "No shared workshop levels yet. Create one in the level maker.";
        sharedLevels.append(empty);
    }
    serverCustomLevels.forEach(({ level }) => {
        const row = document.createElement("div");
        row.className = "tester-custom-level-row";
        const name = document.createElement("span");
        name.textContent = `${level.name} / ${level.prestige ? "PRESTIGE" : "NORMAL"}`;
        const remove = createTextButton("Delete", async () => {
            if (!level.customId) return;
            const dialog = await showActionDialog({ title: "Delete workshop level?", description: `Delete the shared workshop level “${level.name}” for every player?`, confirmLabel: "Delete level", danger: true });
            if (!dialog.confirmed) return;
            remove.disabled = true;
            try {
                await apiRequest<void>(`/levels/${encodeURIComponent(level.customId)}`, { method: "DELETE" });
                const deletedIndex = levels.findIndex((item) => item.customId === level.customId && !item.localOnly);
                if (deletedIndex >= 0) {
                    levels.splice(deletedIndex, 1);
                    levelChoices.querySelectorAll<HTMLInputElement>("input[data-level]").forEach((input) => {
                        const index = Number(input.dataset.level);
                        if (index === deletedIndex) input.closest("label")?.remove();
                        else if (index > deletedIndex) input.dataset.level = String(index - 1);
                    });
                }
                localStorage.setItem("orbit-global-level-cache", JSON.stringify(levels.filter((item) => item.customId && !item.localOnly)));
                row.remove();
                if (!sharedLevels.querySelector(".tester-custom-level-row")) {
                    const empty = document.createElement("small");
                    empty.textContent = "No shared workshop levels yet. Create one in the level maker.";
                    sharedLevels.append(empty);
                }
            } catch (error) {
                workshopStatus.textContent = error instanceof Error ? error.message : "Could not delete the shared level.";
                remove.disabled = false;
            }
        });
        remove.classList.add("danger");
        row.append(name);
        if (canWorkshop) row.append(remove);
        sharedLevels.append(row);
    });
    form.append(sharedLevels, workshopStatus);
    const tryPrestige = createTextButton("Try prestige planet", () => { if (activePlanet === "normal") switchPlanet(); else showLevelMenu(); });
    const openMaker = createTextButton("Open level maker", () => showLevelMaker());
    form.append(tryPrestige, openMaker);
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
    resetButton.addEventListener("click", async () => {
        const dialog = await showActionDialog({ title: "Reset this device's game data?", description: "This clears local progress, unlocks, cached levels, and inventory. Shared settings and workshop levels remain.", confirmLabel: "Reset device", danger: true });
        if (!dialog.confirmed) return;
        Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith("orbit-"))).forEach((key) => localStorage.removeItem(key));
        globalThis.location.reload();
    });
    resetPanel.append(resetButton);
    form.append(resetTitle, resetPanel);
    const apply = document.createElement("button");
    apply.className = "menu-button"; apply.type = "submit"; apply.textContent = "Save settings";
    const saveFooter = document.createElement("div");
    saveFooter.className = "tester-save-footer";
    const saveExplanation = document.createElement("small");
    saveExplanation.textContent = isOwner ? "Saves shared game rules and this device's test progress." : "Saves tester settings and progress on this device only.";
    saveFooter.append(saveExplanation, apply, rewardSettingsError);
    form.append(saveFooter);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const invalidInput = Array.from(form.querySelectorAll<HTMLInputElement>("input")).find((input) => !input.closest(".roulette-settings-editor") && !input.checkValidity());
        if (invalidInput) {
            const sectionId = invalidInput.closest<HTMLElement>("[data-control-section]")?.dataset.controlSection;
            if (sectionId) selectSection(sectionId);
            setSaveStatus("Check the highlighted value before saving.", true);
            invalidInput.focus();
            invalidInput.reportValidity();
            return;
        }
        const nextConfig = structuredClone(gameConfig);
        let invalidWorld = "";
        (["normal", "prestige"] as const).forEach((world) => {
            const worldConfig = nextConfig[world];
            worldConfig.rainbowStarChance = readTesterSetting("rainbowStarChance", worldConfig.rainbowStarChance, world);
            worldConfig.portalSpawnChance = readTesterSetting("portalSpawnChance", worldConfig.portalSpawnChance, world);
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
            const isPercentage = (value: number) => Number.isInteger(value) && value >= 0 && value <= 100;
            if (oddsTotal !== 100 || !isPercentage(worldConfig.rainbowStarChance) || !isPercentage(worldConfig.portalSpawnChance)
                || !Object.values(worldConfig.rarityOdds).every(isPercentage)
                || !Object.values(worldConfig.skinChances).every(isPercentage)
                || !Object.values(worldConfig.powerupSpawnChances).every(isPercentage)) invalidWorld = world;
        });
        if (invalidWorld) {
            selectWorld(invalidWorld as "normal" | "prestige");
            selectSection("rewards");
            const oddsTotal = RARITY_ORDER.reduce((total, rarity) => total + nextConfig[invalidWorld as "normal" | "prestige"].rarityOdds[rarity], 0);
            setSaveStatus(oddsTotal !== 100
                ? `${invalidWorld} world rarity chances total ${oddsTotal}%. Set them to exactly 100%.`
                : `${invalidWorld} world reward ranges and percentages are invalid.`, true);
            return;
        }
        nextConfig.powerupEffects.shield.charges = readTesterSetting("effect.shield-charges", nextConfig.powerupEffects.shield.charges);
        nextConfig.powerupEffects.boost.durationSeconds = readTesterSetting("effect.boost-duration", nextConfig.powerupEffects.boost.durationSeconds);
        nextConfig.powerupEffects.boost.movementMultiplier = readTesterSetting("effect.boost-multiplier", nextConfig.powerupEffects.boost.movementMultiplier);
        nextConfig.powerupEffects.rapid.durationSeconds = readTesterSetting("effect.rapid-duration", nextConfig.powerupEffects.rapid.durationSeconds);
        nextConfig.powerupEffects.cannon.durationSeconds = readTesterSetting("effect.cannon-duration", nextConfig.powerupEffects.cannon.durationSeconds);
        nextConfig.powerupEffects.star.durationSeconds = readTesterSetting("effect.star-duration", nextConfig.powerupEffects.star.durationSeconds);
        nextConfig.powerupEffects.star.movementMultiplier = readTesterSetting("effect.star-multiplier", nextConfig.powerupEffects.star.movementMultiplier ?? DEFAULT_GAME_CONFIG.powerupEffects.star.movementMultiplier!);
        (["oneActiveAtATime", "rainbowStarInvincible", "rainbowStarDefeatsEnemies"] as const).forEach((key) => {
            const draft = testerSettingsDraft.get(`rule.${key}`);
            if (draft !== undefined) nextConfig.powerupRules[key] = draft === "1";
        });
        (Object.keys(powerupLabels) as PowerupKind[]).forEach((kind) => {
            nextConfig.powerupRules.maxPickupsPerLevel[kind] = readTesterSetting(`rule.maxPickups.${kind}`, nextConfig.powerupRules.maxPickupsPerLevel[kind]);
            nextConfig.powerupRules.maxUsesPerLevel[kind] = readTesterSetting(`rule.maxUses.${kind}`, nextConfig.powerupRules.maxUsesPerLevel[kind]);
        });
        const enemyRules = nextConfig.enemyRules;
        (['attackIntervalFrames', 'prestigeAttackMultiplier', 'secretAttackMultiplier', 'rapidAttackMultiplier', 'projectileSpeed', 'miniBossProjectileSpeed', 'bossProjectileSpeed'] as const).forEach((key) => {
            const value = readTesterSetting(`enemy.${key}`, enemyRules[key]);
            enemyRules[key] = value;
        });
        const currentPrestigeMultipliers = enemyRules.prestigeAttackMultipliers?.length
            ? enemyRules.prestigeAttackMultipliers
            : [enemyRules.prestigeAttackMultiplier];
        const prestigeMultiplierCount = Math.max(1, Math.min(100, Math.max(prestigeMax, currentPrestigeMultipliers.length)));
        enemyRules.prestigeAttackMultipliers = Array.from({ length: prestigeMultiplierCount }, (_, index) => {
            const fallback = currentPrestigeMultipliers[index] ?? currentPrestigeMultipliers[currentPrestigeMultipliers.length - 1] ?? enemyRules.prestigeAttackMultiplier;
            return readTesterSetting(`enemy.prestigeAttack.${index + 1}`, fallback);
        });
        const enemyProfiles = enemyRules.enemyTypes ?? structuredClone(DEFAULT_GAME_CONFIG.enemyRules.enemyTypes!);
        const enemyProfileKeys = ["sentry", "darkKnight", "titanCore", "voidWarden"] as const;
        if (testerSettingsDraft.get("enemy.profile.sentry.projectileSpeed") === undefined) enemyProfiles.sentry.projectileSpeed = enemyRules.projectileSpeed;
        if (testerSettingsDraft.get("enemy.profile.darkKnight.projectileSpeed") === undefined) enemyProfiles.darkKnight.projectileSpeed = enemyRules.miniBossProjectileSpeed;
        if (testerSettingsDraft.get("enemy.profile.titanCore.projectileSpeed") === undefined) enemyProfiles.titanCore.projectileSpeed = enemyRules.bossProjectileSpeed;
        enemyProfileKeys.forEach((type) => {
            const profile = enemyProfiles[type];
            profile.attackIntervalMultiplier = readTesterSetting(`enemy.profile.${type}.attackIntervalMultiplier`, profile.attackIntervalMultiplier);
            profile.projectileSpeed = readTesterSetting(`enemy.profile.${type}.projectileSpeed`, profile.projectileSpeed);
        });
        enemyRules.enemyTypes = enemyProfiles;
        const enemyRuleValid = Number.isInteger(enemyRules.attackIntervalFrames) && enemyRules.attackIntervalFrames >= 15 && enemyRules.attackIntervalFrames <= 600
            && [enemyRules.prestigeAttackMultiplier, enemyRules.secretAttackMultiplier].every((value) => Number.isFinite(value) && value >= 0.25 && value <= 2)
            && enemyRules.prestigeAttackMultipliers.every((value) => Number.isFinite(value) && value >= 0.25 && value <= 2)
            && Number.isFinite(enemyRules.rapidAttackMultiplier) && enemyRules.rapidAttackMultiplier >= 0.25 && enemyRules.rapidAttackMultiplier <= 1
            && [enemyRules.projectileSpeed, enemyRules.miniBossProjectileSpeed, enemyRules.bossProjectileSpeed].every((value) => Number.isFinite(value) && value >= 0.5 && value <= 16)
            && enemyProfileKeys.every((type) => Number.isFinite(enemyProfiles[type].attackIntervalMultiplier) && enemyProfiles[type].attackIntervalMultiplier >= 0.25 && enemyProfiles[type].attackIntervalMultiplier <= 2
                && Number.isFinite(enemyProfiles[type].projectileSpeed) && enemyProfiles[type].projectileSpeed >= 0.5 && enemyProfiles[type].projectileSpeed <= 16);
        if (!enemyRuleValid) {
            selectSection("abilities");
            setSaveStatus("Enemy behavior values are invalid. Check the allowed ranges and try again.", true);
            return;
        }
        setSaveStatus(isOwner ? "Saving shared settings..." : "Saving tester settings...");
        apply.disabled = true;
        try {
            if (isOwner) {
                const response = await apiRequest<{ config: GameConfig }>("/game-config", {
                    method: "PUT",
                    body: JSON.stringify({ config: nextConfig }),
                });
                gameConfig = response.config;
            } else {
                localStorage.setItem("orbit-tester-game-config", JSON.stringify(nextConfig));
                gameConfig = nextConfig;
            }
            configurePortalDistribution();
            testerSettingsDraft.clear();
        } catch (error) {
            setSaveStatus(error instanceof Error ? error.message : "Could not save shared game settings.", true);
            apply.disabled = false;
            return;
        }
        setSaveStatus(isOwner ? "Shared game settings saved for all players." : "Tester-only settings saved on this device.");
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
    const settingPanel = (id: string, elements: HTMLElement[]) => {
        const panel = document.createElement("section");
        panel.className = "tester-settings-category";
        panel.dataset.controlSection = id;
        panel.hidden = true;
        panel.append(...elements);
        return panel;
    };
    const roulettePanel = settingPanel("roulette", [rouletteSettings]);
    let sections: ControlSection[] = [
        { id: "rewards", title: "World chances & rewards", group: "Game settings", description: "Tune world drops, rarity chances, power-up spawns, and reward ranges separately for each world.", panel: settingPanel("rewards", [rewardSettings]) },
        { id: "abilities", title: "Power-ups & enemies", group: "Game settings", description: "Set power-up strength, limits, and enemy attack behavior.", panel: settingPanel("abilities", [effectSettings]) },
        { id: "roulette", title: "Roulette & spinning", group: "Game settings", description: "Configure wheel buy-ins, spin prize chances, and asteroid rewards.", panel: roulettePanel },
        { id: "profile", title: "Resources", group: "Your test profile", description: "Adjust the progress and inventory on this device, not other players' accounts.", panel: settingPanel("profile", pilotFields) },
        { id: "cosmetics", title: "Cosmetics", group: "Your test profile", description: "Manage cosmetic unlocks for this device.", panel: settingPanel("cosmetics", [customizationTitle, unlocks, unlockEverySkin]) },
        { id: "levels", title: "Levels & prestige", group: "Your test profile", description: "Quick unlock buttons apply immediately. Save checkbox changes when you're ready.", panel: settingPanel("levels", [levelTitle, levelActions, prestigeGateLabel, levelChoices, ...(portalAssignmentPanel ? [portalAssignmentPanel] : []), tryPrestige]) },
        { id: "workshop", title: "Level workshop", group: "Your test profile", description: isOwner ? "Build routes or manage shared workshop levels." : "Playtest routes. Publishing or deleting shared levels requires owner access.", panel: settingPanel("workshop", [customTitle, sharedLevels, workshopStatus, openMaker]) },
        { id: "reset", title: "Device reset", group: "Your test profile", description: "Reset this device's game data without deleting shared settings.", panel: settingPanel("reset", [resetTitle, resetPanel]) },
    ];
    if (!canTest) sections = sections.filter((section) => section.id === "workshop");
    if (!canWorkshop) sections = sections.filter((section) => section.id !== "workshop");
    worldTabs.hidden = !canTest;
    const settingsIds = new Set(sections.map((section) => section.id));
    const saveIds = new Set(["rewards", "abilities", "profile", "cosmetics", "levels"]);
    const initialized = new Set<string>();
    const loadOnce = (id: string, panel: HTMLElement, load: () => Promise<void>) => {
        if (initialized.has(id)) return;
        initialized.add(id);
        panel.textContent = "Loading...";
        void load().catch((error: unknown) => {
            initialized.delete(id);
            const message = document.createElement("p");
            message.className = "tester-error";
            message.textContent = error instanceof Error ? error.message : "Could not load this section.";
            const retry = createTextButton("Try again", () => loadOnce(id, panel, load));
            panel.replaceChildren(message, retry);
        });
    };
    if (canModerate) sections.push(
        { id: "players", title: "Player accounts", group: isOwner ? "Owner management" : "Moderation", description: isOwner ? "Review accounts, progress, roles, and access." : "Review accounts and enforce bans without editing rewards or saved progress.", panel: accountManagement, onOpen: () => loadOnce("players", accountManagement, () => loadManagedUsers(accountManagement, { canEditProfiles: isOwner, canManageRoles: isOwner, canManageSensitive: isOwner })) },
        { id: "reports", title: "Chat reports", group: "Moderation", description: "Review reports submitted from global chat and direct messages.", panel: reportManagement, onOpen: () => loadOnce("reports", reportManagement, () => renderAdminChatReports(reportManagement)) },
        { id: "moderation-log", title: "Moderation log", group: "Moderation", description: "Review bans, locks, and their recorded reasons.", panel: moderationLogManagement, onOpen: () => loadOnce("moderation-log", moderationLogManagement, () => renderAdminModerationLog(moderationLogManagement)) },
    );
    if (isAdmin || isOwner) sections.push(
        { id: "codes", title: "Reward codes", group: "Content management", description: "Create and manage redeemable asteroid, power-up, cosmetic, and title rewards.", panel: codeManagement, onOpen: () => loadOnce("codes", codeManagement, () => renderAdminCodeTools(codeManagement, profileTitles)) },
        { id: "messages", title: "Messages", group: "Content management", description: "Send announcements and review message history.", panel: messageManagement, onOpen: () => loadOnce("messages", messageManagement, () => renderAdminMessageTools(messageManagement)) },
        { id: "updates", title: "Update log", group: "Content management", description: "Publish the changes shown to players in Credits.", panel: updateLogManagement, onOpen: () => loadOnce("updates", updateLogManagement, () => renderAdminUpdateLog(updateLogManagement, updateLogEntries, (entries) => { updateLogEntries = entries; })) },
    );
    if (isOwner) sections.push(
        { id: "chat-filter", title: "Chat word filter", group: "Owner management", description: "Mask hateful and abusive words in global and direct messages.", panel: chatFilterManagement, onOpen: () => loadOnce("chat-filter", chatFilterManagement, () => renderAdminChatFilterTools(chatFilterManagement)) },
        { id: "titles", title: "Profile titles", group: "Owner management", description: "Create shared titles with route, Golden Body, prestige, or roulette requirements.", panel: titleManagement },
    );
    const content = document.createElement("div");
    content.className = "tester-console-content";
    const sectionHeader = document.createElement("div");
    sectionHeader.className = "tester-section-header";
    const sectionGroup = document.createElement("p");
    sectionGroup.className = "eyebrow";
    const sectionTitle = document.createElement("h2");
    const sectionDescription = document.createElement("p");
    sectionHeader.append(sectionGroup, sectionTitle, sectionDescription);
    form.replaceChildren(...sections.filter((section) => settingsIds.has(section.id)).map((section) => section.panel), saveFooter);
    content.append(sectionHeader, worldTabs, form, accountManagement, reportManagement, moderationLogManagement, codeManagement, messageManagement, chatFilterManagement, updateLogManagement, titleManagement);
    const navigation = createControlNavigation(sections, (section) => selectSection(section.id));
    function selectSection(id: string) {
        const selected = sections.find((section) => section.id === id);
        if (!selected) return;
        sections.forEach((section) => { section.panel.hidden = section !== selected; });
        form.hidden = !settingsIds.has(id);
        worldTabs.hidden = id !== "rewards";
        saveFooter.hidden = !saveIds.has(id);
        sectionGroup.textContent = selected.group.toUpperCase();
        sectionTitle.textContent = selected.title;
        sectionDescription.textContent = selected.description;
        navigation.select(id);
        localStorage.setItem("orbit-owner-panel-tab", id);
        selected.onOpen?.();
    }
    const consoleLayout = document.createElement("div");
    consoleLayout.className = "tester-console";
    consoleLayout.append(navigation.nav, content);
    const exit = createTextButton("Back to game", () => { testerSettingsDraft.clear(); showMenu(); });
    exit.classList.add("tester-console-exit");
    menu.append(pageHeader, consoleLayout, exit);
    document.body.replaceChildren(menu);
    const previousSection = localStorage.getItem("orbit-owner-panel-tab");
    const legacySections: Record<string, string> = { General: "profile", Economy: "rewards", Abilities: "abilities", Cosmetics: "cosmetics", Levels: "levels", Prestige: "profile", Workshop: "workshop", roulette: "roulette" };
    const initialSection = previousSection ? legacySections[previousSection] ?? previousSection : "rewards";
    selectSection(sections.some((section) => section.id === initialSection) ? initialSection : sections[0]?.id ?? "players");
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

function isUsableGameConfig(value: unknown): value is GameConfig {
    if (!value || typeof value !== "object") return false;
    const config = value as Partial<GameConfig>;
    const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
        Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);
    for (const world of ["normal", "prestige"] as const) {
        const settings = config[world] as WorldGameConfig | undefined;
        if (!isRecord(settings) || !isRecord(settings.rarityOdds) || !isRecord(settings.rewardRanges)
            || !isRecord(settings.skinChances) || !isRecord(settings.powerupSpawnChances)) return false;
        if (![settings.rainbowStarChance, ...RARITY_ORDER.map((rarity) => settings.rarityOdds[rarity]),
            ...RARITY_ORDER.flatMap((rarity) => settings.rewardRanges[rarity] ?? []),
            ...RARITY_ORDER.map((rarity) => settings.skinChances[rarity]),
            settings.portalSpawnChance,
            ...Object.values(settings.powerupSpawnChances)].every((item) => typeof item === "number" && Number.isFinite(item))) return false;
    }
    const effects = config.powerupEffects;
    const rules = config.powerupRules;
    const enemies = config.enemyRules;
    if (!isRecord(rules) || !isRecord(rules.maxUsesPerLevel) || !isRecord(rules.maxPickupsPerLevel) || !isRecord(enemies)) return false;
    return isRecord(effects)
        && isRecord(effects.shield) && Number.isFinite(effects.shield.charges)
        && isRecord(effects.boost) && Number.isFinite(effects.boost.durationSeconds) && Number.isFinite(effects.boost.movementMultiplier)
        && isRecord(effects.rapid) && Number.isFinite(effects.rapid.durationSeconds)
        && isRecord(effects.cannon) && Number.isFinite(effects.cannon.durationSeconds)
        && isRecord(effects.star) && Number.isFinite(effects.star.durationSeconds)
        && (effects.star.movementMultiplier === undefined || (Number.isFinite(effects.star.movementMultiplier) && effects.star.movementMultiplier >= 1 && effects.star.movementMultiplier <= 4))
        && typeof rules.oneActiveAtATime === "boolean"
        && typeof rules.rainbowStarInvincible === "boolean"
        && typeof rules.rainbowStarDefeatsEnemies === "boolean"
        && (Object.keys(powerupLabels) as PowerupKind[]).every((kind) => Number.isInteger(rules.maxUsesPerLevel[kind]) && rules.maxUsesPerLevel[kind] >= 0 && rules.maxUsesPerLevel[kind] <= 99)
        && (Object.keys(powerupLabels) as PowerupKind[]).every((kind) => Number.isInteger(rules.maxPickupsPerLevel[kind]) && rules.maxPickupsPerLevel[kind] >= 0 && rules.maxPickupsPerLevel[kind] <= 20)
        && Number.isInteger(enemies.attackIntervalFrames) && enemies.attackIntervalFrames >= 15 && enemies.attackIntervalFrames <= 600
        && [enemies.prestigeAttackMultiplier, enemies.secretAttackMultiplier].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0.25 && value <= 2)
        && (enemies.prestigeAttackMultipliers === undefined
            || (Array.isArray(enemies.prestigeAttackMultipliers) && enemies.prestigeAttackMultipliers.length >= 1 && enemies.prestigeAttackMultipliers.length <= 100
                && enemies.prestigeAttackMultipliers.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0.25 && value <= 2)))
        && typeof enemies.rapidAttackMultiplier === "number" && Number.isFinite(enemies.rapidAttackMultiplier) && enemies.rapidAttackMultiplier >= 0.25 && enemies.rapidAttackMultiplier <= 1
        && [enemies.projectileSpeed, enemies.miniBossProjectileSpeed, enemies.bossProjectileSpeed].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0.5 && value <= 16)
        && (enemies.enemyTypes === undefined || (isRecord(enemies.enemyTypes)
            && (["sentry", "darkKnight", "titanCore", "voidWarden"] as const).every((type) => {
                const profile = enemies.enemyTypes?.[type];
                return isRecord(profile)
                    && typeof profile.attackIntervalMultiplier === "number" && Number.isFinite(profile.attackIntervalMultiplier) && profile.attackIntervalMultiplier >= 0.25 && profile.attackIntervalMultiplier <= 2
                    && typeof profile.projectileSpeed === "number" && Number.isFinite(profile.projectileSpeed) && profile.projectileSpeed >= 0.5 && profile.projectileSpeed <= 16;
            })));
}

function isUsableProfileTitles(value: unknown): value is ProfileTitle[] {
    if (!Array.isArray(value) || value.length > 100) return false;
    const ids = new Set<string>();
    return value.every((title) => {
        if (!title || typeof title !== "object") return false;
        const candidate = title as Partial<ProfileTitle>;
        const requirement = candidate.requirement;
        if (typeof candidate.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(candidate.id) || ids.has(candidate.id)
            || typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.trim().length > 50 || /[<>]/.test(candidate.name)
            || candidate.color !== undefined && (typeof candidate.color !== "string" || !/^#[0-9a-f]{6}$/i.test(candidate.color))
            || candidate.animation !== undefined && !["none", "pulse", "shimmer", "rainbow", "dark-matter", "star-shimmer", "comet-trail", "nebula-drift", "aurora-wave", "solar-flare"].includes(candidate.animation)
            || typeof candidate.routes !== "number" || !Number.isSafeInteger(candidate.routes) || candidate.routes < 0 || candidate.routes > 100000
            || requirement !== undefined && (typeof requirement !== "object" || !["routes", "golden", "prestige", "roulette", "locked", "enemies", "bosses"].includes(requirement.type) || !Number.isSafeInteger(requirement.amount) || requirement.amount < 0 || requirement.amount > 100000)) return false;
        ids.add(candidate.id);
        return true;
    });
}

function isUsableRouletteTiers(value: unknown): value is RouletteTier[] {
    if (!Array.isArray(value) || value.length !== 3) return false;
    const keys = ["claims", "specialClaims", "color", "trail", "avatar", "title"] as const;
    return value.every((tier, index) => {
        if (!tier || typeof tier !== "object") return false;
        const candidate = tier as Partial<RouletteTier>;
        const chances = candidate.chances;
        const rewards = candidate.rewards;
        if (!chances || !rewards) return false;
        return candidate.buyIn === [5, 10, 25][index]
            && keys.every((key) => Number.isSafeInteger(chances[key] ?? (key === "title" ? 0 : undefined)) && (chances[key] ?? 0) >= 0 && (chances[key] ?? 0) <= 100)
            && keys.reduce((total, key) => total + (chances[key] ?? 0), 0) === 100
            && Boolean(rewards)
            && (["claims", "specialClaims"] as const).every((key) => Array.isArray(rewards[key])
                && rewards[key].length === 2
                && Number.isSafeInteger(rewards[key][0])
                && Number.isSafeInteger(rewards[key][1])
                && rewards[key][0] >= 1
                && rewards[key][1] >= rewards[key][0]
                && rewards[key][1] <= 1000000);
    });
}

function describeCodeReward(reward: CodeReward) {
    if (reward.type === "claims") return `+${reward.amount} asteroids`;
    if (reward.type === "specialClaims") return `+${reward.amount} special asteroids`;
    if (reward.type === "powerup") return `+${reward.amount} ${powerupLabels[reward.kind]} power-up${reward.amount === 1 ? "" : "s"}`;
    if (reward.type === "title") return `the ${profileTitles.find((title) => title.id === reward.titleId)?.name ?? reward.titleId} title`;
    const cosmetic = reward as Extract<CodeReward, { type: "skin" | "trail" | "avatar" }>;
    const collection = cosmetic.type === "skin" ? skins : cosmetic.type === "trail" ? trails : avatars;
    return `${collection[cosmetic.index]?.name ?? cosmetic.type} ${cosmetic.type} unlocked`;
}

function getConfiguredRainbowStarChance(prestige = activePlanet === "prestige") {
    return getWorldConfig(prestige).rainbowStarChance;
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

/** Add safe, low-profile cover to long authored gaps so a playable route never
 * renders as an accidentally empty stretch. Workshop previews stay untouched
 * so creators can still start from a true blank base plate. */
function fillLevelGaps(levelLength: number, obstacleIndices: number[], occupiedIndices: number[]) {
    if (isLevelMakerPreview || levelMakerPreviewLevelIndex === currentLevel) return [...new Set(obstacleIndices)].sort((first, second) => first - second);
    const occupied = new Set(occupiedIndices.filter((index) => Number.isInteger(index) && index > 0 && index < levelLength));
    const filled = new Set(obstacleIndices.filter((index) => Number.isInteger(index) && index > 0 && index < levelLength));
    const anchors = [...occupied, ...filled].sort((first, second) => first - second);
    let gapStart = 2;
    const addGapFill = (gapEnd: number) => {
        const gapLength = gapEnd - gapStart;
        if (gapLength < 4) return;
        for (let index = gapStart + 1; index < gapEnd; index += 3) {
            if (!occupied.has(index)) filled.add(index);
        }
    };
    anchors.forEach((anchor) => {
        addGapFill(anchor);
        gapStart = anchor;
    });
    addGapFill(levelLength - 2);
    return [...filled].sort((first, second) => first - second);
}

function createLevelPowerups(level: Level, positions: { index: number; kind: PowerupKind }[], blockedTiles: number[]) {
    const worldConfig = gameConfig[level.prestige ? "prestige" : "normal"];
    const limits = gameConfig.powerupRules.maxPickupsPerLevel;
    const positionCounts: Record<PowerupKind, number> = { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 0 };
    const cappedPositions = positions.filter((powerup) => {
        positionCounts[powerup.kind]++;
        return positionCounts[powerup.kind] <= limits[powerup.kind];
    });
    positions.splice(0, positions.length, ...cappedPositions);
    // Workshop routes are authored tile-by-tile. Do not add shared random
    // pickups to a blank base plate or to a playtest preview; only the
    // power-ups explicitly placed in the editor should appear there.
    if (level.customId || isLevelMakerPreview || levelMakerPreviewLevelIndex === currentLevel) {
        return positions.map((powerup) => ({ x: 140 + powerup.index * TILE_WIDTH, y: 170, kind: powerup.kind, collected: false }));
    }
    const available = Array.from({ length: Math.max(0, level.length - 3) }, (_, offset) => offset + 2)
        .filter((index) => !blockedTiles.includes(index) && !positions.some((powerup) => powerup.index === index));
    (["shield", "boost", "rapid", "cannon"] as const).forEach((kind) => {
        const existing = positions.filter((powerup) => powerup.kind === kind).length;
        const maximum = Math.max(0, limits[kind]);
        for (let count = existing; count < maximum; count++) {
            if (Math.random() * 100 >= worldConfig.powerupSpawnChances[kind]) break;
            const candidateIndex = available.findIndex((index) => !positions.some((powerup) => powerup.index === index));
            if (candidateIndex < 0) break;
            const [index] = available.splice(candidateIndex, 1);
            positions.push({ index, kind });
        }
    });
    const existingStars = positions.filter((powerup) => powerup.kind === "star").length;
    for (let count = existingStars; count < Math.max(0, limits.star); count++) {
        if (Math.random() * 100 >= worldConfig.rainbowStarChance) break;
        const candidateIndex = Math.floor(Math.random() * available.length);
        if (available[candidateIndex] === undefined) break;
        positions.push({ index: available.splice(candidateIndex, 1)[0], kind: "star" });
    }
    return positions.map((powerup) => ({ x: 140 + powerup.index * TILE_WIDTH, y: 170, kind: powerup.kind, collected: false }));
}

function buildLevel(levelIndex: number) {
    const level = levels[levelIndex];
    const claimedAsteroids = getClaimedAsteroids(levelIndex);
    levelAsteroids = level.asteroids.map((index, asteroidIndex) => ({ x: 140 + index * TILE_WIDTH, y: 215 - (index % 2) * 55, claimed: claimedAsteroids.has(asteroidIndex), special: Boolean(level.secret) || (level.specialAsteroids ?? []).includes(index) }));
    const authoredObstacleIndices = getLevelObstacleIndices(level);
    const enemyIndices = getLevelEnemyIndices(level);
    const obstacleIndices = fillLevelGaps(level.length, authoredObstacleIndices, [
        ...level.asteroids,
        ...enemyIndices,
        ...level.spikes,
        ...level.gravity,
    ]);
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
    // Anchor each spike strip to the floor surface rather than an independent
    // screen coordinate, so it remains flush with the ground if ship sizing changes.
    const floorSpikeHeight = 30;
    const floorSpikeY = FLOOR_Y + playerHeight - floorSpikeHeight;
    levelHazards = [...level.spikes.map((index) => ({ x: 140 + index * TILE_WIDTH, y: floorSpikeY, width: 76, height: floorSpikeHeight, kind: "spikes" as const })), ...level.gravity.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 110, width: 115, height: 250, kind: "gravity" as const }))];
    levelEnemies = enemyIndices.map((index) => ({ x: 140 + index * TILE_WIDTH, y: 285, defeated: false, attackTimer: 0 }));
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
    const difficultyMultiplier = level.prestige ? Math.max(1.35, getPrestigeDifficultyMultiplier()) : level.secret ? 1.2 : 1.1;
    const miniBossHealth = Math.ceil(2 * difficultyMultiplier);
    levelMiniBosses = (level.miniBosses ?? []).map((index) => ({ x: 140 + index * TILE_WIDTH, y: 245, health: miniBossHealth, maxHealth: miniBossHealth, defeated: false, attackTimer: 0 }));
separateActorsFromObstacles();
    const bossHealth = Math.ceil(level.asteroids.length * difficultyMultiplier);
    boss = (level.boss || level.secret) ? { x: 140 + (level.bossIndex ?? level.length - 2) * TILE_WIDTH, y: 205, health: bossHealth, maxHealth: bossHealth, defeated: false, attackTimer: 0 } : null;
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
    unflippedRouteSnapshot = null;
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
    if (portalTransitTimer) globalThis.clearTimeout(portalTransitTimer);
    portalTransitTimer = 0;
    projectiles.forEach((projectile) => projectile.element.remove());
    projectiles = [];
    portalTravelInProgress = false;
    secretBossRoomActive = false;
    secretBoss = null;
    currentSecretPortalTarget = null;
    portalReturnX = null;
    portalReturnState = null;
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
    if (leftHeld) playerX -= 5 * currentFrameScale * getMovementMultiplier();
    if (rightHeld) playerX += 5 * currentFrameScale * getMovementMultiplier();
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
        if (!secretBoss.defeated) {
            const chaseTarget = playerX + playerWidth / 2 - 64;
            secretBoss.x += Math.sign(chaseTarget - secretBoss.x) * Math.min(Math.abs(chaseTarget - secretBoss.x), 1.2 * currentFrameScale);
            secretBoss.x = Math.max(36, Math.min(roomWidth - 164, secretBoss.x));
            secretBoss.y = Math.max(54, secretRoomFloorY - SECRET_BOSS_HEIGHT - (playerY < secretRoomFloorY - 120 ? 34 : 0));
        }
        if (bossElement) { bossElement.style.left = `${secretBoss.x}px`; bossElement.style.top = `${secretBoss.y}px`; }
        if (!secretBoss.defeated) {
            const bossBox = { x: secretBoss.x, y: secretBoss.y, width: 128, height: SECRET_BOSS_HEIGHT };
            if (intersects(playerBox(), bossBox)) {
                if (isStarContactDamageActive()) {
                    while (secretBoss && !secretBoss.defeated) damageSecretBoss();
                    statusLabel.textContent = "Rainbow Star shattered the Void Warden on contact.";
                } else {
                    const landedOnHead = verticalSpeed >= 0 && previousPlayerY + playerHeight <= bossBox.y + 18;
                    if (landedOnHead) {
                    damageSecretBoss();
                    playerY = bossBox.y - playerHeight;
                    verticalSpeed = jumpPower * 0.65;
                    jumpCount = 1;
                    roomPlayer?.classList.add("ground-pound");
                    globalThis.setTimeout(() => roomPlayer?.classList.remove("ground-pound"), 180);
                    statusLabel.textContent = "Void Warden crushed. Ground pound landed!";
                    } else if (isStarInvincible()) {
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
            }
            if (shootingHeld || controlKeysFor("shoot").some((key) => pressedKeys.has(key))) shootSecretBoss();
            projectileTimer += currentFrameScale;
            const secondPhase = secretBoss.health <= secretBoss.maxHealth / 2;
            const profile = getEnemyProfile("voidWarden");
            const attackInterval = Math.max(15, Math.round((secondPhase ? 48 : rapidTimer > 0 ? 56 : reducedEffects ? 96 : 72) * profile.attackIntervalMultiplier));
            if (projectileTimer >= attackInterval) {
                projectileTimer = 0;
                if (secondPhase) [-0.3, 0, 0.3].forEach((spread) => fireSecretBossProjectile(spread));
                else fireSecretBossProjectile();
            }
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

function fireSecretBossProjectile(spread = 0) {
    if (!secretBoss || secretBoss.defeated) return;
    const directionX = playerX + 24 - (secretBoss.x + 64);
    const directionY = playerY + 28 - (secretBoss.y + SECRET_BOSS_HEIGHT / 2);
    const angle = Math.atan2(directionY, directionX) + spread;
    const element = document.createElement("div");
    element.className = "boss-projectile secret-boss-projectile";
    document.querySelector(".portal-key-room")?.append(element);
    const speed = getEnemyProfile("voidWarden").projectileSpeed;
    projectiles.push({ x: secretBoss.x + 64, y: secretBoss.y + SECRET_BOSS_HEIGHT / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, element, owner: "enemy" });
}

function damageSecretBoss() {
    if (!secretBoss || secretBoss.defeated) return;
    secretBoss.health--;
    const room = document.querySelector<HTMLElement>(".portal-key-room");
    const bossElement = room?.querySelector(".void-warden");
    bossElement?.classList.add("hit");
    globalThis.setTimeout(() => bossElement?.classList.remove("hit"), 180);
    if (secretBoss.health > 0) {
        const healthLabel = room?.querySelector<HTMLElement>(".portal-boss-health");
        if (healthLabel) healthLabel.textContent = `${secretBoss.health} HITS LEFT`;
        statusLabel.textContent = `Void Warden damaged. ${secretBoss.health} hit remaining.`;
        return;
    }
    secretBoss.defeated = true;
    recordKill("boss");
    bossElement?.classList.add("defeated");
    if (room) createEnemyExplosion(room, secretBoss.x + 64, secretBoss.y + SECRET_BOSS_HEIGHT / 2, "#6ecbff");
    const keyId = currentSecretPortalTarget;
    if (keyId) {
        markSecretPortalClaimed(keyId);
        hideSecretPortal(keyId);
        localStorage.setItem(`orbit-key-${keyId}`, "1");
        if (keyId === "eclipse") localStorage.setItem("orbit-secret-unlocked", "1");
        if (levelKey && !levelKey.collected) { levelKey.collected = true; secretKeyRevealed = true; localStorage.setItem(`orbit-key-${levelKey.id}`, "1"); unlockEndGoal(); }
        if (levelKey?.id === keyId) { levelKey.collected = true; secretKeyRevealed = true; }
    }
    room?.classList.add("key-collected");
    const smallEl = room?.querySelector<HTMLElement>(".portal-boss-health");
    if (smallEl) smallEl.textContent = keyId ? `${keyId.toUpperCase()} KEY SECURED` : "SECRET KEY SECURED";
    statusLabel.textContent = "Void Warden defeated. Secret key claimed!";
    portalTransitTimer = globalThis.setTimeout(() => exitSecretBossRoom(), 1500);
}

function redrawRouteObjects() {
    Array.from(world.children).forEach((element) => { if (element !== playerLabel) element.remove(); });
    createWorldObjects();
}

function enterFlippedRoute() {
    if (inFlippedRoute || !isFlippedPlanetLevel()) return;
    unflippedRouteSnapshot = {
        asteroids: levelAsteroids.map((asteroid) => ({ ...asteroid })),
        obstacles: levelObstacles,
        hazards: levelHazards,
        enemies: levelEnemies,
        powerups: levelPowerups,
        key: levelKey,
        miniBosses: levelMiniBosses,
        boss,
        playerX,
    };
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
    const routeWallIndices = isLevelMakerPreview
        ? [...new Set(route.walls)].filter(validTile)
        : fillLevelGaps(level.length, [...new Set(route.walls)].filter(validTile), [
            ...level.asteroids,
            ...route.enemies,
            ...route.spikes,
            ...route.gravity,
        ]);
    const wallTiles = new Set(routeWallIndices);
    const routeEnemyTiles = getLevelEnemyIndices({ ...level, enemies: route.enemies }).filter(validTile);
    const routeWalls = [...wallTiles].map((index) => ({
        x: 140 + index * TILE_WIDTH,
        y: 20,
        width: 96,
        height: 54,
    }));
    levelObstacles = routeWalls;
    // The flipped planet's ceiling is its ground: place spike strips directly on
    // that surface so they extend down into the route instead of floating below it.
    const ceilingSpikeHeight = 30;
    levelHazards = [
        ...[...new Set(route.spikes)].filter(validTile).map((index) => ({ x: 140 + index * TILE_WIDTH, y: CEILING_Y, width: 76, height: ceilingSpikeHeight, kind: "spikes" as const })),
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
    if (unflippedRouteSnapshot) {
        levelAsteroids = unflippedRouteSnapshot.asteroids.map((asteroid, index) => ({
            ...asteroid,
            claimed: asteroid.claimed || Boolean(levelAsteroids[index]?.claimed),
        }));
        levelObstacles = unflippedRouteSnapshot.obstacles;
        levelHazards = unflippedRouteSnapshot.hazards;
        levelEnemies = unflippedRouteSnapshot.enemies;
        levelPowerups = unflippedRouteSnapshot.powerups;
        levelKey = unflippedRouteSnapshot.key;
        levelMiniBosses = unflippedRouteSnapshot.miniBosses;
        boss = unflippedRouteSnapshot.boss;
        playerX = Math.max(120, Math.min(levels[currentLevel].length * TILE_WIDTH - playerWidth, unflippedRouteSnapshot.playerX));
        unflippedRouteSnapshot = null;
    } else {
        buildLevel(currentLevel);
        playerX = Math.max(120, 140 + (levels[currentLevel].flip?.[0] ?? 2) * TILE_WIDTH + 140);
    }
    playerY = FLOOR_Y; verticalSpeed = 0; jumpCount = 0;
    areaLabel.textContent = "AREA / PRESTIGE ORBIT";
    statusLabel.textContent = "Exit key secured. You returned to the main route.";
    redrawRouteObjects();
    showPlanetaryTransition("RETURNING TO MAIN ORBIT");
}

function showPlanetaryTransition(text: string) {
    const transition = document.createElement("div"); transition.className = "planet-transition prestige"; transition.innerHTML = `<span>${text}</span>`; document.body.append(transition); globalThis.setTimeout(() => transition.remove(), 1100);
}

async function requestRunProof(levelName: string, sequence: number) {
    try {
        const response = await apiRequest<{ runId: string }>('/runs/start', {
            method: "POST",
            body: JSON.stringify({ level: levelName }),
        });
        if (sequence !== runProofSequence || levels[currentLevel]?.name !== levelName || typeof response.runId !== "string") return;
        activeRunProof = { runId: response.runId, levelName };
    } catch (error) {
        if (sequence === runProofSequence) console.warn("Online run verification is unavailable:", error);
    }
}

function getRunProofId(levelName: string) {
    return activeRunProof?.levelName === levelName ? activeRunProof.runId : undefined;
}

async function waitForRunProof(levelName: string, timeoutMs = 3000) {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
        const proofId = getRunProofId(levelName);
        if (proofId) return proofId;
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 40));
    }
    return getRunProofId(levelName);
}

function startGame(levelIndex = currentLevel) {
    const level = levels[levelIndex];
    if (!level) return;
    if (!isLevelMakerPreview && currentOnlineUser?.role === "player" && currentOnlineUser.humanVerified === false) {
        showAccount("Complete the human check in Player settings before playing online levels.");
        return;
    }
    if (isPrestigeRouteLocked(level)) {
        const required = Math.min(level.prestigeRequirement ?? 1, prestigeMax);
        const screen = document.createElement("main");
        screen.className = "menu-screen";
        screen.innerHTML = `<p class="eyebrow">PRESTIGE ROUTE / REQUIREMENTS</p><h1>Route <em>sealed</em></h1>`;
        const message = document.createElement("p");
        message.className = "menu-copy";
        message.textContent = `Reach prestige ${required} to enter this route.`;
        screen.append(message, createTextButton("Mission select", showLevelMenu));
        document.body.replaceChildren(screen);
        return;
    }
    if (level.secret && level.secretId) {
        const cooldownKey = `orbit-secret-cooldown-${level.secretId}`;
        const completedAt = Number(localStorage.getItem(cooldownKey) ?? "0");
        const cooldownUntil = completedAt + SECRET_LEVEL_COOLDOWN_MS;
        if (completedAt > 0 && cooldownUntil <= Date.now()) {
            respawnSecretAsteroids(levelIndex);
            localStorage.removeItem(cooldownKey);
            if (currentOnlineUser) void syncAccountProgress("save", true).catch((error: unknown) => console.error("Could not sync secret asteroid respawn:", error));
        }
        if (cooldownUntil > Date.now()) {
            showSecretLevels();
            return;
        }
    }
    if (level.secretId === "prestige-gate") {
        const gateError = getPrestigeGateAccessError();
        if (gateError) {
            const screen = document.createElement("main");
            screen.className = "menu-screen";
            screen.innerHTML = `<p class="eyebrow">PRESTIGE GATE / REQUIREMENTS</p><h1>Gate <em>sealed</em></h1>`;
            const message = document.createElement("p");
            message.className = "menu-copy";
            message.textContent = gateError;
            screen.append(message, createTextButton("Secret space", showSecretLevels), createTextButton("Mission select", showLevelMenu));
            document.body.replaceChildren(screen);
            return;
        }
    }
    setMusicScene(level.secret ? "secret" : level.boss ? "boss" : level.prestige ? "prestige" : "normal");
    cancelPortalTransit();
    currentLevel = levelIndex;
    enterAppPage(gameAppPage);
    if (currentOnlineUser && !level.localOnly && !level.customId) {
        localStorage.setItem("orbit-last-level", level.name);
        void syncAccountProgress("save").catch((error: unknown) => console.error("Could not save the last started level:", error));
    }
    buildLevel(currentLevel);
    playerX = 120; playerY = FLOOR_Y; verticalSpeed = 0; jumpCount = 0; projectiles = []; trailElement = []; trailPositions = []; trailDirection = 1; trailActive = false; projectileTimer = 0; enemyAttackTimer = 0; miniBossAttackTimer = 0; bossAttackTimer = 0; trailTimer = 0; playerShotTimer = 0; shieldCharges = 0; boostTimer = 0; rapidTimer = 0; rapidUntil = 0; rapidCannonUntil = 0; cannonTimer = 0; gameStarted = false; gameActive = true; previousPlayerY = playerY; levelStartedAt = performance.now(); elapsedMilliseconds = 0; usedAbilities = new Set<string>(); powerupUsesThisLevel = { shield: 0, boost: 0, rapid: 0, cannon: 0, star: 0 }; starPowerupActive = false; starPowerupTimer = 0; starPowerupElement = null; resetFlippedVisualState(); portalCooldownUntil = 0; lastFrameTimestamp = 0; currentFrameScale = 1; hudUpdateFrames = 0;
    activeRunProof = null;
    const proofSequence = ++runProofSequence;
    if (!isLevelMakerPreview && currentOnlineUser) void requestRunProof(level.name, proofSequence);
    chatController?.setGameActive(true);
    document.body.innerHTML = "";
    createGameShell(); createPlayer(); createWorldObjects(); createTrail(false); createControls(); startGameLoop();
}

function showWinScreen() {
    gameActive = false; chatController?.setGameActive(false); cancelAnimationFrame(animationFrame);
    if (isLevelMakerPreview) {
        const screen = document.createElement("main");
        screen.className = "win-screen win-screen-animation";
        screen.innerHTML = `<p class="eyebrow">WORKSHOP PLAYTEST</p><h1>Route <em>cleared</em></h1><p class="time-result">${formatTime(elapsedMilliseconds)}</p><p class="menu-copy">This was only a draft playtest. The level has not been published or saved.</p>`;
        screen.append(createMenuButton("Playtest again", () => startGame(currentLevel)), createTextButton("Back to level maker", () => showLevelMenu()));
        document.body.replaceChildren(screen);
        return;
    }
    const level = levels[currentLevel];
    localStorage.setItem(`orbit-level-claims-${currentLevel}`, String(levelAsteroids.length));
    localStorage.setItem(`orbit-level-complete-${currentLevel}`, "1");
    const previousBest = Number(localStorage.getItem(`orbit-best-${currentLevel}`) ?? "0");
    if (!previousBest || elapsedMilliseconds < previousBest) localStorage.setItem(`orbit-best-${currentLevel}`, String(elapsedMilliseconds));
    if (!level.secret && !level.prestige && elapsedMilliseconds <= goldenTimeLimitMs) localStorage.setItem(`orbit-golden-level-${currentLevel}`, "1");
    if (level.secret && level.secretId) localStorage.setItem(`orbit-secret-cooldown-${level.secretId}`, String(Date.now()));
    const nextLevel = getNextRouteIndex(currentLevel);
    if (nextLevel >= 0) localStorage.setItem(`orbit-level-${nextLevel}`, "1");
    if (levels[currentLevel].boss) localStorage.setItem("orbit-boss-defeated", "1");
    if (levels[currentLevel].secretId === "prestige-gate") localStorage.setItem("orbit-level-complete-prestige-gate", "1");
    const screen = document.createElement("main");
        screen.className = "win-screen win-screen-animation";
    const prestigeGateCleared = levels[currentLevel].secretId === "prestige-gate";
    const reward = prestigeGateCleared ? "Prestige Gate cleared. Return to the main menu to claim your prestige." : levels[currentLevel].boss ? "Titan Core skin unlocked. The fleet has a new legend." : levels[currentLevel].secret ? "The Eclipse skin has joined your collection." : `Every asteroid secured. Total fleet claims: ${asteroidsClaimed}.`;
    screen.innerHTML = `<p class="eyebrow">BEACON REACHED / ${levels[currentLevel].secret ? "SECRET" : `SECTOR 0${currentLevel + 1}`}</p><h1>Claim <em>complete</em></h1><p class="time-result">${formatTime(elapsedMilliseconds)}</p><p class="menu-copy">${reward}</p>`;
    if (level.secret && !prestigeGateCleared) {
        screen.append(createMenuButton("Leave", showLevelMenu));
        document.body.replaceChildren(screen);
        return;
    }
    const runStatus = document.createElement("p");
    runStatus.className = "menu-copy online-service-status";
    runStatus.setAttribute("role", "status");
    const runTime = Math.round(elapsedMilliseconds);
    const runAbilities = [...usedAbilities];
    const ownerCanChoose = currentOnlineUser?.role === "owner";
    runStatus.textContent = ownerCanChoose
        ? `Abilities used: ${runAbilities.length ? runAbilities.map(formatAbilityName).join(", ") : "None"}. This owner run is private until you choose to submit it.`
        : `Abilities used: ${runAbilities.length ? runAbilities.map(formatAbilityName).join(", ") : "None"}. Saving online score...`;
    if (!level.secret || ownerCanChoose) screen.append(runStatus);
    if (ownerCanChoose) {
        const submitOwnerRun = createMenuButton("Submit this run publicly", () => {
            submitOwnerRun.disabled = true;
            submitOwnerRun.textContent = "Submitting run...";
            void submitLeaderboardRun(runStatus, levels[currentLevel].name, runTime, runAbilities, true);
        });
        submitOwnerRun.setAttribute("aria-label", "Submit this owner run to the public leaderboard");
        screen.append(submitOwnerRun);
    } else {
        void submitLeaderboardRun(runStatus, levels[currentLevel].name, runTime, runAbilities);
    }
    if (level.secret) {
        if (prestigeGateCleared) {
            const prestige = createMenuButton("Prestige", showPrestigeConfirmation);
            prestige.disabled = !canClaimPrestige();
            screen.append(prestige, createTextButton("Leave", showLevelMenu));
        } else {
            screen.append(createMenuButton("Leave", showLevelMenu));
        }
        document.body.replaceChildren(screen);
        return;
    }
    if (nextLevel >= 0 && isPrestigeRouteLocked(levels[nextLevel])) {
        const required = Math.min(levels[nextLevel].prestigeRequirement ?? 1, prestigeMax);
        const next = createMenuButton(`Next sector needs prestige ${required}`, () => undefined);
        next.disabled = true;
        screen.append(next);
    } else {
        screen.append(createMenuButton(nextLevel >= 0 ? "Next sector" : "Replay sector", () => nextLevel >= 0 ? startGame(nextLevel) : startGame(currentLevel)));
    }
    screen.append(createTextButton("Mission select", showLevelMenu), createPageCounter());
    document.body.replaceChildren(screen);
}

async function submitLeaderboardRun(status: HTMLElement, levelName: string, timeMs: number, abilities: string[], submitOwner = false, proofId?: string) {
    try {
        const session = await apiRequest<{ user: OnlineUser | null }>("/auth/session");
        setOnlineUser(session.user);
        if (!session.user) {
            status.textContent = "Sign in or create an account to submit this run to the online leaderboard.";
            return;
        }
        if (session.user.role === "owner" && !submitOwner) {
            status.textContent = "Owner runs stay private unless you choose Submit this run publicly.";
            return;
        }
        if (session.user.role === "player" && session.user.leaderboardOptIn === false) {
            status.textContent = "Leaderboard submission is turned off in your account settings. This run was not submitted.";
            return;
        }
        proofId ??= await waitForRunProof(levelName);
        if (!proofId) {
            status.textContent = "This run could not be verified online. Start the level again while connected to submit it.";
            return;
        }
        const result = await apiRequest<{ entry: OnlineLeaderboardEntry | null; improved: boolean; ignored?: boolean; reason?: string }>("/runs", {
            method: "POST",
            body: JSON.stringify({ level: levelName, timeMs, abilities, proofId, ...(submitOwner ? { submitOwner: true } : {}) }),
        });
        if (result.ignored) {
            status.textContent = result.reason === "opted-out"
                ? "Leaderboard submission is turned off in your account settings. This run was not submitted."
                : "Owner and tester runs stay private unless the owner chooses to submit the run.";
            return;
        }
        if (!result.entry) throw new Error("The leaderboard did not return a saved run.");
        status.textContent = result.improved
            ? `Online leaderboard saved for ${session.user.username}. Abilities used: ${abilities.length ? abilities.map(formatAbilityName).join(", ") : "None"}.`
            : `Your fastest online ${levelName} record is ${formatTime(result.entry.timeMs)}.`;
    } catch (error) {
        status.textContent = `Online score was not saved: ${error instanceof Error ? error.message : "unknown service error"}`;
    }
}

function showGameOver(reason = "Your hull took a hit.") {
    if (!gameActive) return;
    playSound("lose");
    gameActive = false; chatController?.setGameActive(false); cancelAnimationFrame(animationFrame); pressedKeys.clear(); cancelPortalTransit();
    resetFlippedVisualState();
    const screen = document.createElement("main");
    screen.className = "win-screen game-over-screen";
    screen.innerHTML = `<p class="eyebrow">SIGNAL LOST</p><h1>Hull <em>breach</em></h1><p class="menu-copy">${reason} The sector is still waiting.</p>`;
    const quickRestart = createMenuButton(isLevelMakerPreview ? "Quick restart playtest" : "Quick restart", () => startGame(currentLevel));
    quickRestart.setAttribute("aria-label", "Quickly restart the current level");
    screen.append(quickRestart);
    const restartHint = document.createElement("small");
    restartHint.className = "restart-hint";
    restartHint.textContent = `Press ${formatControlBinding(controlBindings.restart)} to restart instantly`;
    screen.append(restartHint);
    if (isLevelMakerPreview) screen.append(createTextButton("Back to level maker", () => showLevelMenu()));
    else screen.append(createTextButton("Mission select", showLevelMenu), createPageCounter());
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
    const game = document.createElement("section"); game.className = "game-frame"; game.append(world);
    game.addEventListener("pointermove", updateMouseAim);
    game.addEventListener("pointerdown", (event) => {
        if ((event.target as HTMLElement).closest(".controls, button")) return;
        shootingHeld = true;
        shoot();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => game.addEventListener(eventName, () => { shootingHeld = false; }));
    const gameFooter = document.createElement("div");
    gameFooter.className = "game-footer";
    gameFooter.append(statusLabel);
    document.body.append(header, game, gameFooter);
}

function createPlayer() {
    const skin = skins[selectedSkin] ?? skins[0];
    const avatar = avatars[selectedAvatar] ?? avatars[0];
    const shipArt = avatar.image ?? skin.image;
    const hasCustomArt = Boolean(avatar.cssArt || shipArt);
    playerLabel.className = `player ${hasCustomArt ? "" : `ship-${skin.shape}`} avatar-${selectedAvatar}`;
    playerLabel.style.setProperty("--ship-color", selectedShipColor);
    playerLabel.innerHTML = `${avatar.cssArt ? createCssShipArtMarkup(avatar.cssArt, avatar.name, selectedShipColor) : shipArt ? createShipArtMarkup(shipArt, avatar.name, selectedShipColor) : "<span class=\"ship-window\"></span>"}<span class="ship-gun"></span><span class="ship-flame"></span>`;
    world.append(playerLabel);
    updatePlayerPosition();
}

function renderPortalObjects() {
    world.querySelectorAll<HTMLElement>(".secret-portal, .portal").forEach((element) => element.remove());
    const level = levels[currentLevel];
    if (!level || level.secret) return;
    const secretPortals = getActiveSecretPortals(level);
    secretPortals.forEach((portal, portalIndex) => {
        const element = document.createElement("div");
        element.className = "secret-portal";
        element.textContent = "⚡";
        element.style.left = `${140 + portal.index * TILE_WIDTH}px`;
        element.style.top = `${portal.y ?? PORTAL_Y}px`;
        element.setAttribute("aria-label", `Hidden portal to ${portal.secretId}`);
        element.dataset.portalIndex = portalIndex.toString();
        element.dataset.secretId = portal.secretId;
        world.append(element);
    });
    const secretPortalIndexes = new Set(secretPortals.map((portal) => portal.index));
    (level.portals ?? []).forEach((index, portalIndex) => {
        if (secretPortalIndexes.has(index)) return;
        const element = document.createElement("div");
        element.className = "portal";
        element.textContent = "↔";
        element.style.left = `${140 + index * TILE_WIDTH}px`;
        element.style.top = `${PORTAL_Y}px`;
        element.setAttribute("aria-label", "Hidden level portal");
        element.dataset.portalIndex = portalIndex.toString();
        world.append(element);
    });
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
    levelEnemies.forEach((enemy) => { const element = document.createElement("div"); element.className = `enemy${enemy.defeated ? " defeated" : ""}`; element.style.left = `${enemy.x}px`; element.style.top = `${enemy.y}px`; world.append(element); });
    levelMiniBosses.forEach((miniBoss) => { const element = document.createElement("div"); element.className = `mini-boss dark-knight${miniBoss.defeated ? " defeated" : ""}`; element.setAttribute("aria-label", "Dark Knight guardian"); element.style.left = `${miniBoss.x}px`; element.style.top = `${miniBoss.y}px`; world.append(element); });
    levelPowerups.forEach((powerup) => { const element = document.createElement("div"); element.className = `powerup ${powerup.kind}`; element.textContent = powerup.kind === "shield" ? "◇" : powerup.kind === "rapid" ? "ϟ" : powerup.kind === "cannon" ? "✦" : "»"; element.style.left = `${powerup.x}px`; element.style.top = `${powerup.y}px`; element.setAttribute("aria-label", `${powerup.kind} powerup`); world.append(element); });
createLevelKeyObject();
    if (inFlippedRoute && !flippedRouteKeyCollected) { const routeKey = document.createElement("div"); routeKey.className = "level-key flipped-route-key"; routeKey.textContent = "⚿"; routeKey.style.left = `${140 + Math.min(levels[currentLevel].length - 2, Math.max(2, levels[currentLevel].flippedRoute?.key ?? levels[currentLevel].length - 3)) * TILE_WIDTH}px`; routeKey.style.top = `${flippedRouteKeyY}px`; routeKey.setAttribute("aria-label", "Flipped planet exit key"); world.append(routeKey); }
    
    renderPortalObjects();
    
    // Only show boss if unlocked (key obtained or no key required)
    const bossUnlocked = !levelKey || levelKey.collected || levels[currentLevel].secret;
    if (boss && bossUnlocked) { 
        const element = document.createElement("div"); 
        element.className = `boss${boss.defeated ? " defeated" : ""}`;
        element.style.left = `${boss.x}px`; 
        element.style.top = `${boss.y}px`; 
        world.append(element); 
    }
    
    if (!inFlippedRoute) {
        const beacon = document.createElement("div");
        beacon.className = "beacon";
        beacon.style.left = `${(levels[currentLevel].length - 1) * TILE_WIDTH + 140}px`;
        world.append(beacon);
    }
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

function hideSecretPortal(secretId: string) {
    world.querySelectorAll<HTMLElement>(".secret-portal").forEach((element) => {
        if (element.dataset.secretId === secretId) element.remove();
    });
}

function startPortalTransit(target: number, secretId?: string) {
    if (portalTravelInProgress) return;
    if (secretId && !hasOwnerAccess() && isSecretPortalClaimed(secretId)) return;
    usedAbilities.add("portal");
    const sourceLevel = levels[currentLevel];
    const targetLevel = levels.find((level) => level.secretId === secretId);
    if (targetLevel?.prestige && !sourceLevel.prestige) return;
    if (secretId === "prestige-gate") {
        const gateError = getPrestigeGateAccessError();
        if (gateError) {
            statusLabel.textContent = gateError;
            return;
        }
    }
    portalTravelInProgress = true;
    setMusicScene("boss");
    secretBossRoomActive = true;
    currentSecretPortalTarget = secretId ?? `secret-room-${currentLevel + 1}-${target}`;
    portalReturnX = playerX;
    portalReturnState = {
        x: playerX,
        y: playerY,
        verticalSpeed,
        jumpCount,
        shipFlipped,
        trailActive,
        trailPositions: [...trailPositions],
        trailDirection,
    };
    shipFlipped = false;
    verticalSpeed = 0;
    jumpCount = 0;
    playerX = 36;
    playerY = FLOOR_Y;
    projectiles.forEach((projectile) => projectile.element.remove());
    projectiles = [];
    projectileTimer = 0;
    enemyAttackTimer = 0;
    miniBossAttackTimer = 0;
    bossAttackTimer = 0;
    const skin = skins[selectedSkin] ?? skins[0];
    const avatar = avatars[selectedAvatar] ?? avatars[0];
    const room = document.createElement("section");
    room.className = "portal-key-room secret-boss-room";
    room.setAttribute("aria-live", "polite");
    room.innerHTML = `<div class="portal-key-room-warp"></div><div class="portal-room-boundary"></div><div class="portal-room-floor"></div><div class="portal-key-chamber"><p>PORTAL KEY ARENA</p><b>DEFEAT THE VOID WARDEN</b><div class="portal-key-room-key">⚿</div><small class="portal-boss-health">12 HITS LEFT / JUMP ON ITS HEAD OR USE CANNON</small></div>`;
    const roomPlayer = document.createElement("div");
    roomPlayer.className = `portal-room-player player ${avatar.cssArt || avatar.image || skin.image ? "" : `ship-${skin.shape}`} avatar-${selectedAvatar}`;
    roomPlayer.style.setProperty("--ship-color", selectedShipColor);
    roomPlayer.innerHTML = playerLabel.innerHTML;
    room.append(roomPlayer);
    document.querySelector(".game-frame")?.append(room);
    world.classList.add("portal-boss-room-active");
    secretRoomFloorY = Math.max(170, room.clientHeight - playerHeight - 26);
    playerX = 36;
    playerY = secretRoomFloorY;
    previousPlayerY = playerY;
    statusLabel.textContent = "Portal arena entered. Defeat the Void Warden to claim its key.";
    const bossX = Math.max(112, Math.min(room.clientWidth - 152, room.clientWidth * 0.68));
    secretBoss = { x: bossX, y: secretRoomFloorY - SECRET_BOSS_HEIGHT, health: 12, maxHealth: 12, defeated: false, attackTimer: 0 };
    const bossElement = document.createElement("div");
    bossElement.className = "boss secret-boss void-warden";
    bossElement.style.left = `${secretBoss.x}px`;
    bossElement.style.top = `${secretBoss.y}px`;
    room.append(bossElement);
    room.classList.add("has-secret-boss");
    roomPlayer.style.transform = `translate(${playerX}px, ${playerY}px)`;
    updateTrail(false);
}

function exitSecretBossRoom() {
    if (!gameActive || !portalTravelInProgress) return;
    if (portalReturnState) {
        playerX = portalReturnState.x;
        playerY = portalReturnState.y;
        verticalSpeed = portalReturnState.verticalSpeed;
        jumpCount = portalReturnState.jumpCount;
        shipFlipped = portalReturnState.shipFlipped;
        trailActive = portalReturnState.trailActive;
        trailPositions = [...portalReturnState.trailPositions];
        trailDirection = portalReturnState.trailDirection;
    } else {
        if (portalReturnX !== null) playerX = Math.max(20, Math.min(levels[currentLevel].length * TILE_WIDTH - playerWidth, portalReturnX + PORTAL_SIZE + 24));
        playerY = FLOOR_Y;
        verticalSpeed = 0;
        jumpCount = 0;
    }
    previousPlayerY = playerY;
    portalCooldownUntil = performance.now() + 900;
    portalTravelInProgress = false;
    secretBossRoomActive = false;
    secretBoss = null;
    currentSecretPortalTarget = null;
    portalReturnX = null;
    portalReturnState = null;
    secretRoomFloorY = FLOOR_Y;
    world.classList.remove("portal-boss-room-active");
    document.querySelector(".portal-key-room")?.remove();
    redrawRouteObjects();
    updatePlayerPosition();
}

function createControls() {
    const controls = document.createElement("nav"); controls.className = "controls"; controls.setAttribute("aria-label", "Game controls");
    controls.append(createButton("left", "←", moveLeft), createButton("jump", "↑", jump), createButton("down", "↓", moveDown), createButton("right", "→", moveRight), createHoldButton("shoot", "✦", shoot), createButton("restart", "↻", () => startGame(currentLevel)), createButton("exit", "Exit", showLevelMenu));
    const hint = document.createElement("small");
    hint.className = "controls-key-hint";
    hint.textContent = `Controls: Left ${formatControlBinding(controlBindings.left)} · Right ${formatControlBinding(controlBindings.right)} · Jump ${formatControlBinding(controlBindings.jump)} · Down ${formatControlBinding(controlBindings.down)} · Shoot ${formatControlBinding(controlBindings.shoot)} · Restart ${formatControlBinding(controlBindings.restart)} · Back ${formatControlBinding(controlBindings.back)}`;
    controls.append(hint);
    document.querySelector(".game-footer")?.append(controls);
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

function createButton(className: string, text: string, action: () => void) { const button = document.createElement("button"); button.className = `control-button ${className}`; button.type = "button"; button.textContent = text; button.setAttribute("aria-label", className === "exit" ? "Back to mission select" : className === "restart" ? "Restart current level" : className === "jump" ? "Jump" : className === "shoot" ? `Fire cannon (${formatControlBinding("shoot")})` : `Move ${className}`); button.addEventListener("click", () => action()); return button; }
function createHoldButton(className: string, text: string, action: () => void) { const button = createButton(className, text, action); button.addEventListener("pointerdown", () => { shootingHeld = true; }); ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => button.addEventListener(eventName, () => { shootingHeld = false; })); return button; }
function handleKeyDown(event: KeyboardEvent) {
    const targetElement = event.target instanceof HTMLElement ? event.target : null;
    if (targetElement?.matches("input, textarea, select, [contenteditable]")) return;
    const key = event.code.toLowerCase();
    if (controlKeysFor("back").includes(key)) {
        event.preventDefault();
        if (gameActive) {
            gameActive = false;
            chatController?.setGameActive(false);
            cancelAnimationFrame(animationFrame);
            pressedKeys.clear();
            cancelPortalTransit();
            resetFlippedVisualState();
        }
        goToPreviousAppPage();
        return;
    }
    if (controlKeysFor("confirm").includes(key) && !gameActive && document.querySelector(".level-menu")) {
        const firstAvailable = document.querySelector<HTMLButtonElement>(".level-list .level-button:not([disabled])");
        if (firstAvailable) { event.preventDefault(); firstAvailable.click(); }
        return;
    }
    if (controlKeysFor("switchPlanet").includes(key) && !gameActive && document.querySelector(".level-menu")) {
        event.preventDefault();
        switchPlanet();
        return;
    }
    if (controlKeysFor("restart").includes(key) && !gameActive && document.querySelector(".game-over-screen")) {
        event.preventDefault();
        startGame(currentLevel);
        return;
    }
    if (!gameActive) return;
    if (controlKeysFor("restart").includes(key)) {
        event.preventDefault();
        startGame(currentLevel);
        return;
    }
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
    const targetElement = event.target instanceof HTMLElement ? event.target : null;
    if (targetElement?.matches("input, textarea, select, [contenteditable]")) return;
    const key = event.code.toLowerCase();
    pressedKeys.delete(key);
    if (controlKeysFor("shoot").includes(key)) shootingHeld = false;
}
function updateHeldMovement() {
    const direction = Number(controlKeysFor("right").some((key) => pressedKeys.has(key))) - Number(controlKeysFor("left").some((key) => pressedKeys.has(key)));
    if (!direction) return;
    playerX = Math.max(20, Math.min(levels[currentLevel].length * TILE_WIDTH, playerX + direction * 4 * currentFrameScale * getMovementMultiplier()));
    trailMovementFrames = 8;
    gameStarted = true;
}
function moveLeft(distance = 38) { if (portalTravelInProgress) return; playerX = Math.max(20, playerX - distance * getMovementMultiplier()); trailMovementFrames = 8; gameStarted = true; updatePlayerPosition(); }
function moveRight(distance = 38) { if (portalTravelInProgress) return; playerX = Math.min(levels[currentLevel].length * TILE_WIDTH, playerX + distance * getMovementMultiplier()); trailMovementFrames = 8; gameStarted = true; updatePlayerPosition(); }
function playerBox(): Box {
    return {
        x: playerX + playerHitboxInsetX,
        y: playerY + playerHitboxInsetY,
        width: playerHitboxWidth,
        height: playerHitboxHeight,
    };
}
function isInGravityZone() { return levelHazards.some((hazard) => hazard.kind === "gravity" && intersects(playerBox(), hazard)); }
function applyGravityPull(frameScale: number) {
    const ship = playerBox();
    const well = levelHazards.find((hazard) => hazard.kind === "gravity" && intersects(ship, hazard));
    if (!well) return;
    const shipCenterX = ship.x + ship.width / 2;
    const shipCenterY = ship.y + ship.height / 2;
    const wellCenterX = well.x + well.width / 2;
    const wellCenterY = well.y + well.height / 2;
    const offsetX = wellCenterX - shipCenterX;
    const offsetY = wellCenterY - shipCenterY;
    const distance = Math.max(1, Math.hypot(offsetX, offsetY));
    const proximity = Math.max(0, Math.min(1, 1 - distance / 220));
    const horizontalStrength = 0.003 + proximity * 0.005;
    const verticalStrength = 0.0015 + proximity * 0.0025;
    // The pull is deliberately gentle and only exists while inside the zone,
    // so holding left/right or jumping can still carry the ship back out.
    playerX = Math.max(20, Math.min(levels[currentLevel].length * TILE_WIDTH - playerWidth, playerX + Math.max(-1.4, Math.min(1.4, offsetX * horizontalStrength)) * frameScale));
    playerY += Math.max(-0.85, Math.min(0.85, offsetY * verticalStrength)) * frameScale;
}
function moveDown(distance = 36) {
    if (portalTravelInProgress) return;
    const now = performance.now();
    const doubleDown = now - lastDownPressAt < 300;
    lastDownPressAt = now;
    // A double-down exits the flipped route only while the ship is actually
    // inside the black-hole/gravity field. Outside that field a second press
    // remains a normal downward move.
    if (inFlippedRoute && doubleDown && isInGravityZone()) { leaveFlippedRoute(); return; }
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

function getPrestigeAttackMultiplier() {
    const configured = gameConfig.enemyRules.prestigeAttackMultipliers;
    const prestigeIndex = Math.max(0, prestigeLevel - 1);
    const configuredValue = configured?.[Math.min(prestigeIndex, Math.max(0, (configured?.length ?? 1) - 1))];
    return typeof configuredValue === "number" && Number.isFinite(configuredValue)
        ? configuredValue
        : gameConfig.enemyRules.prestigeAttackMultiplier;
}

type EnemyTypeKey = "sentry" | "darkKnight" | "titanCore" | "voidWarden";
function getEnemyProfile(type: EnemyTypeKey) {
    const configured = gameConfig.enemyRules.enemyTypes?.[type];
    const legacySpeed = type === "sentry" ? gameConfig.enemyRules.projectileSpeed : type === "darkKnight" ? gameConfig.enemyRules.miniBossProjectileSpeed : type === "titanCore" ? gameConfig.enemyRules.bossProjectileSpeed : DEFAULT_GAME_CONFIG.enemyRules.enemyTypes!.voidWarden.projectileSpeed;
    const fallback = { ...DEFAULT_GAME_CONFIG.enemyRules.enemyTypes![type], projectileSpeed: legacySpeed };
    return configured && Number.isFinite(configured.attackIntervalMultiplier) && Number.isFinite(configured.projectileSpeed)
        ? configured
        : fallback;
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
    applyGravityPull(currentFrameScale);
    if (shipFlipped && !inGravity && !inFlippedRoute) shipFlipped = false;
    playerLabel.classList.toggle("flipped", shipFlipped);
    if (gameStarted) { elapsedMilliseconds = performance.now() - levelStartedAt; timerLabel.textContent = formatTime(elapsedMilliseconds); }
    verticalSpeed += (shipFlipped ? -1 : 1) * (inGravity ? gravity * 1.55 : gravity) * currentFrameScale; playerY += verticalSpeed * currentFrameScale;
    if (!shipFlipped && playerY >= FLOOR_Y) { playerY = FLOOR_Y; verticalSpeed = 0; jumpCount = 0; }
    if (shipFlipped && playerY <= CEILING_Y) { playerY = CEILING_Y; verticalSpeed = 0; jumpCount = 0; }
    trailTimer += currentFrameScale; playerShotTimer = Math.max(0, playerShotTimer - currentFrameScale); boostTimer = Math.max(0, boostTimer - currentFrameScale); cannonTimer = cannonTimer === Number.POSITIVE_INFINITY ? cannonTimer : Math.max(0, cannonTimer - currentFrameScale); rapidTimer = Math.max(0, rapidUntil - performance.now()); rapidCannonUntil = rapidCannonUntil > performance.now() ? rapidCannonUntil : 0;
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
    const enemyRules = gameConfig.enemyRules;
    const enemyDifficulty = levels[currentLevel].prestige
        ? getPrestigeAttackMultiplier()
        : levels[currentLevel].secret ? enemyRules.secretAttackMultiplier : 1;
    const rapidAttackMultiplier = rapidTimer > 0 ? enemyRules.rapidAttackMultiplier : 1;
    const projectileInterval = reducedEffects
        ? Math.max(15, Math.round(enemyRules.attackIntervalFrames * 1.33))
        : Math.max(15, Math.round(enemyRules.attackIntervalFrames * enemyDifficulty * rapidAttackMultiplier));
    const sentryInterval = Math.max(15, Math.round(projectileInterval * getEnemyProfile("sentry").attackIntervalMultiplier));
    const darkKnightInterval = Math.max(15, Math.round(projectileInterval * getEnemyProfile("darkKnight").attackIntervalMultiplier));
    const titanCoreInterval = Math.max(15, Math.round(projectileInterval * getEnemyProfile("titanCore").attackIntervalMultiplier));
    enemyAttackTimer += currentFrameScale;
    miniBossAttackTimer += currentFrameScale;
    bossAttackTimer += currentFrameScale;
    if (enemyAttackTimer >= sentryInterval) { enemyAttackTimer -= sentryInterval; levelEnemies.forEach(fireProjectile); }
    if (miniBossAttackTimer >= darkKnightInterval) { miniBossAttackTimer -= darkKnightInterval; levelMiniBosses.forEach(fireMiniBossProjectile); }
    if (boss && !boss.defeated && bossAttackTimer >= titanCoreInterval) { bossAttackTimer -= titanCoreInterval; fireBossProjectile(); }
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
    playSound("shoot");
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
    playSound("enemy");
    const startX = enemy.x + 18, startY = enemy.y + 25, directionX = playerX + 24 - startX, directionY = playerY + 28 - startY, distance = Math.max(1, Math.hypot(directionX, directionY)), element = document.createElement("div");
    element.className = "projectile"; world.append(element); const speed = getEnemyProfile("sentry").projectileSpeed; projectiles.push({ x: startX, y: startY, vx: directionX / distance * speed, vy: directionY / distance * speed, element, owner: "enemy" });
}
function fireBossProjectile() { if (!boss) return; playSound("enemy"); const directionX = playerX + 24 - boss.x, directionY = playerY + 28 - boss.y, distance = Math.max(1, Math.hypot(directionX, directionY)), element = document.createElement("div"); element.className = "boss-projectile"; world.append(element); const speed = getEnemyProfile("titanCore").projectileSpeed; projectiles.push({ x: boss.x, y: boss.y + 50, vx: directionX / distance * speed, vy: directionY / distance * speed, element, owner: "enemy" }); }
function fireMiniBossProjectile(miniBoss: MiniBoss) { if (miniBoss.defeated) return; playSound("enemy"); const directionX = playerX + 24 - miniBoss.x, directionY = playerY + 28 - miniBoss.y, distance = Math.max(1, Math.hypot(directionX, directionY)), element = document.createElement("div"); element.className = "mini-projectile"; world.append(element); const speed = getEnemyProfile("darkKnight").projectileSpeed; projectiles.push({ x: miniBoss.x, y: miniBoss.y + 36, vx: directionX / distance * speed, vy: directionY / distance * speed, element, owner: "enemy" }); }
function createTrail(visible = true) {
    const trail = trails[selectedTrail] ?? trails[0];
    if (trailElement.length === 0) {
        trailElement = Array.from({ length: 5 }, (_, index) => {
            const element = document.createElement("i");
            element.className = `trail-particle trail-effect-${trail.effect}${trail.secondaryColor ? " trail-duotone" : ""} ${index === 0 ? "trail-head" : ""}`;
            element.style.setProperty("--trail-delay", `${index * 60}ms`);
            element.style.opacity = "0";
            world.append(element);
            return element;
        });
    }
    trailElement.forEach((element) => {
        element.style.setProperty("--trail-color", trail.color);
        if (trail.secondaryColor) element.style.setProperty("--trail-secondary-color", trail.secondaryColor);
        else element.style.removeProperty("--trail-secondary-color");
    });
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
    // Keep the lead particle tethered to the ship's core. The rest of the trail uses
    // prior core positions, so it follows movement like a tail instead of falling off
    // the top or bottom of the ship.
    const anchor = { x: playerX + playerWidth / 2, y: playerY + playerHeight / 2 };
    const last = trailPositions[0];
    if (last && anchor.x !== last.x) trailDirection = anchor.x > last.x ? 1 : -1;
    if (!last || last.x !== anchor.x || last.y !== anchor.y) trailPositions.unshift(anchor);
    trailPositions = trailPositions.slice(0, 24);
    drawTrailParticles(trailElement, trailPositions, anchor, trailDirection, shipFlipped);
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
                recordKill("enemy");
                document.querySelectorAll(".enemy")[levelEnemies.indexOf(enemy)]?.classList.add("defeated");
                createEnemyExplosion(world, enemy.x + 24, enemy.y + 24);
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
                    recordKill("enemy");
                    document.querySelectorAll(".mini-boss")[levelMiniBosses.indexOf(miniBoss)]?.classList.add("defeated");
                    createEnemyExplosion(world, miniBoss.x + 35, miniBoss.y + 35, "#b991ff");
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
            if (isStarInvincible()) return false;
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
function createSplash(x: number, y: number) { const splash = document.createElement("div"); splash.className = "splash"; splash.style.left = `${x}px`; splash.style.top = `${y}px`; world.append(splash); globalThis.setTimeout(() => splash.remove(), reducedEffects ? 180 : 350); }
function createEnemyExplosion(container: HTMLElement, x: number, y: number, color = "#f6c46e") {
    playSound("explode");
    const burst = document.createElement("div");
    burst.className = "enemy-explosion";
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    burst.style.setProperty("--explosion-color", color);
    const fragmentCount = reducedEffects ? 4 : 8;
    for (let index = 0; index < fragmentCount; index++) {
        const fragment = document.createElement("i");
        fragment.style.setProperty("--explosion-angle", `${index * (360 / fragmentCount)}deg`);
        burst.append(fragment);
    }
    container.append(burst);
    globalThis.setTimeout(() => burst.remove(), reducedEffects ? 360 : 720);
}
function recordKill(kind: "enemy" | "boss") {
    const key = kind === "boss" ? "orbit-bosses-killed" : "orbit-enemies-killed";
    const current = kind === "boss" ? bossesKilled : enemiesKilled;
    const next = Math.min(100000000, Math.max(0, current + 1));
    if (kind === "boss") bossesKilled = next;
    else enemiesKilled = next;
    localStorage.setItem(key, String(next));
}
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
    levelHazards.forEach((hazard) => { if (!isStarInvincible() && hazard.kind === "spikes" && intersects(playerBox(), hazard)) { if (shieldCharges > 0) { shieldCharges--; playerY = 300; statusLabel.textContent = "Shield absorbed the spike hit."; } else showGameOver("The spike belt caught your ship."); } });
    levelPowerups.forEach((powerup, index) => { if (!powerup.collected && intersects(playerBox(), { x: powerup.x, y: powerup.y, width: 38, height: 38 }) && canActivatePowerup(powerup.kind)) { powerup.collected = true; activatePowerup(powerup.kind); document.querySelectorAll(".powerup")[index]?.classList.add("collected"); } });
    
    const secretPortals = getActiveSecretPortals(levels[currentLevel]);
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
            playerX = Math.max(20, Math.min(levels[currentLevel].length * TILE_WIDTH - playerWidth, 140 + target * TILE_WIDTH + 12));
            portalCooldownUntil = performance.now() + 900;
            statusLabel.textContent = `Portal transit complete. Emerged at sector marker ${target}.`;
            updatePlayerPosition();
            return true;
        });
    }
if (portalTravelInProgress) return;
    if (levelKey && secretKeyRevealed && !levelKey.collected && intersects(playerBox(), { x: levelKey.x, y: levelKey.y, width: 38, height: 38 })) {
        levelKey.collected = true;
        localStorage.setItem(`orbit-key-${levelKey.id}`, "1"); 
        if (levelKey.id === "eclipse") localStorage.setItem("orbit-secret-unlocked", "1"); 
        hideSecretPortal(levelKey.id);
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
        const touchingEnemy = intersects(playerBox(), enemyBox);
        if (touchingEnemy && isStarContactDamageActive()) {
            enemy.defeated = true;
            recordKill("enemy");
            createEnemyExplosion(world, enemy.x + 24, enemy.y + 24);
            document.querySelectorAll(".enemy")[index]?.classList.add("defeated");
            statusLabel.textContent = "Rainbow Star contact hit. Sentry disabled.";
            return;
        }
        const landedOnHead = touchingEnemy && (shipFlipped
            ? verticalSpeed < 0 && previousPlayerY >= enemy.y + enemyBox.height - 15
            : verticalSpeed >= 0 && previousPlayerY + playerHitboxInsetY + playerHitboxHeight <= enemy.y + 15);
        if (landedOnHead) {
            enemy.defeated = true;
            recordKill("enemy");
            createEnemyExplosion(world, enemy.x + 24, enemy.y + 24);
            playerY = shipFlipped ? enemy.y + enemyBox.height - playerHitboxInsetY : enemy.y - playerHitboxInsetY - playerHitboxHeight;
            verticalSpeed = shipFlipped ? Math.abs(jumpPower) * 0.58 : jumpPower * 0.58;
            jumpCount = 1;
            playerLabel.classList.add("ground-pound");
            globalThis.setTimeout(() => playerLabel.classList.remove("ground-pound"), 180);
            statusLabel.textContent = inFlippedRoute ? "Dark sentry crushed. Ground pound dominates." : "Sentry disabled. Nice landing.";
            document.querySelectorAll(".enemy")[index]?.classList.add("defeated");
        } else if (touchingEnemy) {
            if (isStarInvincible()) { playerX = Math.max(20, enemy.x - playerHitboxInsetX - playerHitboxWidth - 8); statusLabel.textContent = "Rainbow Star absorbed the sentry impact."; }
            else if (shieldCharges > 0) { shieldCharges--; playerX = enemy.x - playerHitboxInsetX - playerHitboxWidth - 8; statusLabel.textContent = "Shield absorbed the sentry impact."; }
            else showGameOver("You hit a sentry head-on.");
        }
    });
    levelMiniBosses.forEach((miniBoss, index) => {
        if (miniBoss.defeated) return;
        const miniBox = { x: miniBoss.x, y: miniBoss.y, width: 70, height: 70 };
        const touching = intersects(playerBox(), miniBox);
        if (touching && isStarContactDamageActive()) {
            miniBoss.defeated = true;
            recordKill("enemy");
            document.querySelectorAll(".mini-boss")[index]?.classList.add("defeated");
            createEnemyExplosion(world, miniBoss.x + 35, miniBoss.y + 35, "#b991ff");
            statusLabel.textContent = "Rainbow Star contact hit. Dark Knight shattered.";
            return;
        }
        const stomped = touching && (shipFlipped
            ? verticalSpeed < 0 && previousPlayerY >= miniBoss.y + miniBox.height - 18
            : verticalSpeed >= 0 && previousPlayerY + playerHitboxInsetY + playerHitboxHeight <= miniBoss.y + 18);
        if (stomped) {
            miniBoss.health -= inFlippedRoute ? 2 : 1;
            playerY = shipFlipped ? miniBoss.y + miniBox.height - playerHitboxInsetY : miniBoss.y - playerHitboxInsetY - playerHitboxHeight;
            verticalSpeed = shipFlipped ? Math.abs(jumpPower) * (inFlippedRoute ? 0.75 : .62) : jumpPower * (inFlippedRoute ? 0.75 : .62);
            jumpCount = 1;
            playerLabel.classList.add("ground-pound");
            globalThis.setTimeout(() => playerLabel.classList.remove("ground-pound"), 180);
            document.querySelectorAll(".mini-boss")[index]?.classList.add("hit");
            globalThis.setTimeout(() => document.querySelectorAll(".mini-boss")[index]?.classList.remove("hit"), 180);
            if (miniBoss.health <= 0) {
                miniBoss.defeated = true;
                recordKill("enemy");
                document.querySelectorAll(".mini-boss")[index]?.classList.add("defeated");
                createEnemyExplosion(world, miniBoss.x + 35, miniBoss.y + 35, "#b991ff");
                statusLabel.textContent = inFlippedRoute ? "Dark Knight crushed. Ground pound supremacy!" : "Dark Knight shattered. The route is clear.";
            } else {
                statusLabel.textContent = inFlippedRoute ? `Dark Knight staggered. ${miniBoss.health} hit remaining.` : `Dark Knight damaged. ${miniBoss.health} hit remaining.`;
            }
        } else if (touching) {
            if (isStarInvincible()) { playerX = Math.max(20, miniBoss.x - playerHitboxInsetX - playerHitboxWidth - 8); statusLabel.textContent = "Rainbow Star absorbed the mini-boss impact."; }
            else if (shieldCharges > 0) { shieldCharges--; playerX = miniBoss.x - playerHitboxInsetX - playerHitboxWidth - 8; statusLabel.textContent = "Shield absorbed the mini-boss impact."; }
            else showGameOver("A Dark Knight slammed into your hull.");
        }
    });
    levelAsteroids.forEach((asteroid, index) => { if (!asteroid.claimed && Math.abs(playerX + 24 - asteroid.x) < 42 && Math.abs(playerY + 28 - asteroid.y) < 58) { asteroid.claimed = true; const claimedAsteroids = getClaimedAsteroids(currentLevel); claimedAsteroids.add(index); saveClaimedAsteroids(currentLevel, claimedAsteroids); if (asteroid.special) { specialAsteroids++; localStorage.setItem("orbit-special-claims", String(specialAsteroids)); } else { asteroidsClaimed++; localStorage.setItem("orbit-claims", String(asteroidsClaimed)); } claimLabel.textContent = `${levelAsteroids.filter((item) => item.claimed).length} / ${levelAsteroids.length}`; statusLabel.textContent = asteroid.special ? "Special asteroid secured. Spend it in the roll wheel." : "Asteroid claimed. This one is secured permanently."; document.querySelectorAll(".asteroid")[index]?.classList.add("claimed"); } });
    if (boss && playerX > boss.x - 120 && !boss.defeated) {
        if (isStarContactDamageActive()) {
            while (boss && !boss.defeated) damageBoss();
            statusLabel.textContent = "Rainbow Star shattered the Titan Core on contact.";
        } else {
            playerX = boss.x - 125;
            statusLabel.textContent = "Titan Core blocks the beacon. Claim asteroids to break it.";
            updatePlayerPosition();
        }
    }
    // Check win condition: for prestige levels, require flipped route key; for others, just need key/unlocked
    const isPrestigeLevel = levels[currentLevel].prestige === true;
    const hasWinKey = isPrestigeLevel ? flippedRouteKeyCollected : (!endGoalLocked);
    if (!inFlippedRoute && playerX > levels[currentLevel].length * TILE_WIDTH - 100 && gameStarted && (!boss || boss.defeated) && hasWinKey) showWinScreen();
}

function activatePowerup(kind: PowerupKind) {
    if (!canActivatePowerup(kind)) return;
    playSound("ability");
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
        const movementMultiplier = gameConfig.powerupEffects.star.movementMultiplier ?? DEFAULT_GAME_CONFIG.powerupEffects.star.movementMultiplier ?? 1;
        starPowerupTimer = durationSeconds * 60;
        // Create rainbow star visual effect on player
        if (!starPowerupElement) {
            starPowerupElement = document.createElement("div");
            starPowerupElement.className = "star-powerup-effect";
            starPowerupElement.innerHTML = `<div class="rainbow-star">★</div>`;
            playerLabel.append(starPowerupElement);
        }
        starPowerupElement.style.display = "grid";
        playerLabel.classList.toggle("star-invincible", gameConfig.powerupRules.rainbowStarInvincible);
        statusLabel.textContent = gameConfig.powerupRules.rainbowStarInvincible
            ? `RAINBOW STAR ACTIVE! Invincible for ${durationSeconds} seconds at ${movementMultiplier}x movement. Touch enemies to defeat them.`
            : `RAINBOW STAR ACTIVE for ${durationSeconds} seconds at ${movementMultiplier}x movement. Touch enemies to defeat them.`;
    } 
    updatePowerupHud(); 
}
function useInventoryPowerup(kind: PowerupKind) {
    const inventory = getInventory();
    if (inventory[kind] < 1) { statusLabel.textContent = `No ${powerupLabels[kind]} power-ups in the hold.`; return; }
    const maximum = gameConfig.powerupRules.maxUsesPerLevel[kind];
    if (powerupUsesThisLevel[kind] >= maximum) { statusLabel.textContent = `${powerupLabels[kind]} has reached its per-level use limit.`; return; }
    if (!canActivatePowerup(kind)) return;
    inventory[kind]--;
    powerupUsesThisLevel[kind]++;
    saveInventory(inventory);
    activatePowerup(kind);
    statusLabel.textContent = `${powerupLabels[kind]} launched from the hold.`;
}
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
function damageBoss() { if (!boss || boss.defeated) return; boss.health--; bossLabel.textContent = `TITAN ${boss.health}/${boss.maxHealth}`; const bossElement = document.querySelector(".boss"); bossElement?.classList.add("hit"); globalThis.setTimeout(() => bossElement?.classList.remove("hit"), 180); if (boss.health <= 0) { boss.defeated = true; recordKill("boss"); bossElement?.classList.add("defeated"); createEnemyExplosion(world, boss.x + 64, boss.y + 75, "#ed7657"); statusLabel.textContent = "Titan Core shattered. Reach the beacon for your reward."; } }

function getNormalRouteCount() { return levels.filter((level) => !level.secret && !level.prestige).length; }
function getNormalRouteCompletionCount() { return levels.filter((level, index) => !level.secret && !level.prestige && localStorage.getItem(`orbit-level-complete-${index}`) === "1").length; }
function getNormalCompletedLevelCount() { return levels.filter((level, index) => { const bestTime = Number(localStorage.getItem(`orbit-best-${index}`) ?? "0"); return !level.secret && !level.prestige && localStorage.getItem(`orbit-level-complete-${index}`) === "1" && bestTime > 0 && bestTime <= goldenTimeLimitMs; }).length; }
function getCompletedLevelCount() { return levels.filter((_, index) => localStorage.getItem(`orbit-level-complete-${index}`) === "1").length; }
function isProfileTitleUnlocked(title: ProfileTitle) {
    if (hasOwnerAccess() || localStorage.getItem("orbit-all-titles") === "1") return true;
    if (localStorage.getItem(`orbit-title-unlock-${title.id}`) === "1") return true;
    const requirement = title.requirement ?? { type: "routes" as const, amount: title.routes };
    if (requirement.type === "locked") return false;
    if (requirement.type === "golden") return getNormalCompletedLevelCount() >= requirement.amount;
    if (requirement.type === "prestige") return prestigeLevel >= requirement.amount;
    if (requirement.type === "enemies") return enemiesKilled >= requirement.amount;
    if (requirement.type === "bosses") return bossesKilled >= requirement.amount;
    if (requirement.type === "roulette") return false;
    return getCompletedLevelCount() >= requirement.amount;
}
function hasClearedPrestigeGate() { return localStorage.getItem("orbit-level-complete-prestige-gate") === "1" || levels.some((level, index) => level.secretId === "prestige-gate" && localStorage.getItem(`orbit-level-complete-${index}`) === "1"); }
function getPrestigeGateAccessError() {
    const normalComplete = getNormalRouteCompletionCount();
    if (prestigeLevel >= prestigeMax) return "You have reached the configured prestige limit.";
    if (normalComplete < getNormalRouteCount()) return `Clear every normal route (${normalComplete}/${getNormalRouteCount()} complete).`;
    return "";
}
function canClaimPrestige() { return !hasOwnerAccess() && !getPrestigeGateAccessError(); }
function getPrestigeDifficultyMultiplier() { return Math.min(2, 1 + 0.05 * Math.max(0, prestigeLevel)); }

function getNextRouteIndex(currentIndex: number) {
    const current = levels[currentIndex];
    if (!current || current.localOnly || current.customId) return -1;
    const routeType = getLevelType(current);
    if (routeType === "secret") return -1;
    return levels.findIndex((level, index) => index > currentIndex
        && !level.localOnly
        && !level.customId
        && getLevelType(level) === routeType
        && Boolean(level.prestige) === Boolean(current.prestige));
}

function showPrestigeConfirmation() {
    const screen = document.createElement("main");
    screen.className = "win-screen prestige-confirmation";
    screen.innerHTML = `<p class="eyebrow">PRESTIGE / CONFIRM RESET</p><h1>Begin a <em>new run?</em></h1><p class="menu-copy">This can't be undone. Your skins, asteroids, power-ups, and level unlocks will reset. Claimed secret portals and cooldowns will remain.</p>`;
    const confirm = createMenuButton("Confirm prestige", () => {
        const error = getPrestigeGateAccessError();
        if (error) {
            showLevelMenu();
            return;
        }
        if (tryPrestige()) showMenu();
        else showLevelMenu();
    });
    confirm.disabled = !canClaimPrestige();
    screen.append(confirm, createTextButton("Cancel", showLevelMenu));
    document.body.replaceChildren(screen);
}

function tryPrestige() {
    if (!canClaimPrestige()) return false;
    prestigeLevel++;
    localStorage.setItem("orbit-claims", "0");
    localStorage.setItem("orbit-special-claims", "0");
    localStorage.setItem("orbit-prestige", String(prestigeLevel));
    localStorage.setItem("orbit-prestige-world-unlocked", "1");
    localStorage.setItem("orbit-level-0", "1");
    levels.forEach((_level, index) => {
        localStorage.removeItem(`orbit-level-${index}`);
        localStorage.removeItem(`orbit-level-complete-${index}`);
        localStorage.removeItem(`orbit-level-claims-${index}`);
        localStorage.removeItem(`orbit-asteroids-${index}`);
    });
    localStorage.setItem("orbit-level-0", "1");
    [
        "orbit-boss-defeated",
        "orbit-jackpot-avatar",
        "orbit-secret-unlocked",
        "orbit-level-complete-prestige-gate",
        "orbit-powerups",
        "orbit-unlock-skins",
        "orbit-unlock-avatars",
        "orbit-unlock-trails",
        "orbit-skin",
        "orbit-avatar",
        "orbit-trail",
    ].forEach((key) => localStorage.removeItem(key));
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key): key is string => Boolean(key && (/^orbit-spin-(skin|trail|avatar)-\d+$/.test(key) || /^orbit-golden-level-\d+$/.test(key))))
        .forEach((key) => localStorage.removeItem(key));
    refreshProgressStateFromStorage();
    return true;
}
function isSkinUnlocked(skin: { required: number; boss?: boolean; secret?: boolean; prestige?: number; golden?: boolean }, index?: number) { return hasOwnerAccess() || localStorage.getItem("orbit-unlock-skins") === "1" || (index !== undefined && isSpinCosmeticUnlocked("skin", index)) || (skin.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : skin.prestige !== undefined ? prestigeLevel >= skin.prestige : skin.boss ? localStorage.getItem("orbit-boss-defeated") === "1" : skin.secret ? localStorage.getItem("orbit-secret-unlocked") === "1" : asteroidsClaimed >= skin.required); }
function getUnlockedSkinCount() { return skins.filter(isSkinUnlocked).length; }
function isAvatarUnlocked(avatar: AvatarStyle) { const index = avatars.indexOf(avatar); return hasOwnerAccess() || localStorage.getItem("orbit-unlock-avatars") === "1" || (index >= 0 && isSpinCosmeticUnlocked("avatar", index)) || (avatar.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : avatar.prestige !== undefined ? prestigeLevel >= avatar.prestige : avatar.jackpot ? localStorage.getItem("orbit-jackpot-avatar") === "1" : true); }
function isTrailUnlocked(trail: TrailStyle) { const index = trails.indexOf(trail); return hasOwnerAccess() || localStorage.getItem("orbit-unlock-trails") === "1" || (index >= 0 && isSpinCosmeticUnlocked("trail", index)) || (trail.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : trail.prestige !== undefined ? prestigeLevel >= trail.prestige : trail.boss ? localStorage.getItem("orbit-boss-defeated") === "1" : trail.secret ? localStorage.getItem("orbit-secret-unlocked") === "1" : asteroidsClaimed >= trail.required); }
function getUnlockedTrailCount() { return trails.filter(isTrailUnlocked).length; }
function formatTime(milliseconds: number) { const total = Math.max(0, Math.floor(milliseconds)); const minutes = Math.floor(total / 60000).toString().padStart(2, "0"); const seconds = Math.floor(total / 1000 % 60).toString().padStart(2, "0"); const millis = (total % 1000).toString().padStart(3, "0"); return `${minutes}:${seconds}.${millis}`; }
