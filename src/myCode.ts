import type { Box, Obstacle, Asteroid, Hazard, Enemy, Projectile, PowerupKind, Powerup, LevelKey, Boss, MiniBoss, TrailStyle, AvatarStyle, UnflippedRouteSnapshot, Level, ControlAction, Rarity, CosmeticGroup, OnlineUser, OnlineLeaderboardEntry, RouletteTier, RouletteWheelPocket, UpdateLogEntry, RouletteReward, OnlineSettings, WorldGameConfig, GameConfig } from "./types";
import { TILE_WIDTH, PORTAL_Y, PORTAL_SIZE, SECRET_LEVEL_COOLDOWN_MS, CEILING_Y, FLOOR_Y, FLIPPED_WORLD_HEIGHT, SECRET_BOSS_HEIGHT, RARITY_ORDER, DEFAULT_GAME_CONFIG, DEFAULT_ROULETTE_TIERS, PROFILE_TITLES, powerupPrices, powerupLabels } from "./game-config";
import { STARTER_SHIP_COLORS, ROULETTE_SHIP_COLORS, skins, trails, avatars, getCosmeticRarity, createRarityBadge } from "./cosmetics";
import { levels } from "./levels";
import { ApiError, apiRequest } from "./api";
import { createMenuButton, createTextButton } from "./ui";
import { createShipArtMarkup, createCssShipArtMarkup } from "./ship-art";
import { drawTrailParticles } from "./trail";
import { createLevelMaker } from "./level-maker";
import { loadManagedUsers } from "./managed-users";
import { createCustomization } from "./customization";
import { createLeaderboard } from "./leaderboard";
import { createAccountRecovery } from "./account-recovery";
import { renderAdminCodeTools, renderAdminMessageTools, renderAdminUpdateLog } from "./admin-tools";
import { createControlNavigation, type ControlSection } from "./owner-panel";
import { createRouletteFields } from "./roulette-editor";

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
let selectedRouletteBuyIn: RouletteTier["buyIn"] = 5;
let rouletteWheelPockets: RouletteWheelPocket[] = [];
const testerSettingsDraft = new Map<string, string>();
let levelMakerPreviewReturn: (() => void) | null = null;
let isLevelMakerPreview = false;
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
let ownerBadgeObserver: MutationObserver | null = null;
let roleQuickPanel: HTMLElement | null = null;
let roleQuickPanelStartedAt = 0;
let accountNoticeTimer = 0;
let presenceHeartbeatTimer = 0;
let presenceHeartbeatInFlight = false;
let accountNoticeOpen = false;
let goldenTimeLimitMs = 60000;
let musicContext: AudioContext | null = null;
let musicGain: GainNode | null = null;
let musicOscillators: OscillatorNode[] = [];
let musicVolume = Number(localStorage.getItem("orbit-music-volume") ?? "0.3");
let musicMuted = localStorage.getItem("orbit-music-muted") === "true";
let musicUnlocked = false;
if (!Number.isFinite(musicVolume) || musicVolume < 0 || musicVolume > 1) musicVolume = 0.3;
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
let accountRedemptionInFlight = false;
let lastSyncedAccountProgress = "";
let loadedAccountProgressFor: string | null = null;
let onlineSessionVersion = 0;

function accountIdentity(user: OnlineUser | null) {
    return user?.username.toLowerCase() ?? null;
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
}
const gravity = 0.7;
const jumpPower = -16;
const playerWidth = 48;
const playerHeight = 58;
const playerHitboxInsetX = 7;
const playerHitboxInsetY = 5;
const playerHitboxWidth = playerWidth - playerHitboxInsetX * 2;
const playerHitboxHeight = playerHeight - playerHitboxInsetY - 5;
const showLevelMaker = createLevelMaker({
    powerupLabels,
    configurePortalDistribution,
    showLevelMenu,
    showTesterPanel,
    startPreview: (index, returnToEditor) => {
        isLevelMakerPreview = true;
        levelMakerPreviewReturn = () => {
            levels.splice(index, 1);
            isLevelMakerPreview = false;
            levelMakerPreviewReturn = null;
            returnToEditor();
        };
        startGame(index);
    },
});
const prestigeRouteNames = ["Violet Meridian", "Moonfall Circuit", "Amethyst Rift", "Crown of Saturn", "Lilac Nebula", "Oracle's Reach", "Prismatic Grave", "The White Eclipse", "Sovereign Drift", "Astral Citadel", "Veil of Io", "Radiant Ruin", "Dusk Cathedral", "Nova Labyrinth", "Purple Eventide", "The Inverted Sea", "Halo of Ash", "Sable Aurora", "Titan's Throne", "Infinity Crown"];
const { showCustomization, createShipPreview } = createCustomization({
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


const { showLeaderboard, getRoleBadge, formatAbilityName } = createLeaderboard({
    showAccount,
    showLevelMenu,
    showMenu,
    sendPresenceHeartbeat,
    setCurrentOnlineUser: setOnlineUser,
    setGoldenTimeLimit: (limit) => { goldenTimeLimitMs = limit; },
    createShipPreview,
    formatTime,
});

const { showRecoveryCodeOnce, showForgotPassword } = createAccountRecovery(showAccount);

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
        levels.push({ name: prestigeRouteNames[index], briefing: "A longer route around the ringed planet. Planetary flip fields reveal the upper lane.", length: 38 + index, asteroids: [3, 8, 13, 18, 23, 28, 33], walls: [5, 10, 15, 20, 25, 30], enemies: [7, 17, 27, 35], spikes: [6, 14, 24, 32], gravity: [11, 21, 31], flip: [11, 31], boss: index === 19, prestige: true });
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
}

function getHiddenPortalIndex(level: Level) {
    const occupied = new Set([...level.walls, ...level.enemies, ...level.spikes, ...level.gravity]);
    const candidates = Array.from({ length: Math.max(1, level.length - 4) }, (_, index) => index + 2).filter((index) => !occupied.has(index));
    return candidates[Math.floor(Math.random() * candidates.length)] ?? Math.max(2, Math.floor(level.length / 2));
}

function getLevelType(level: Level): "normal" | "secret" | "prestige" {
    return level.secret ? "secret" : level.prestige ? "prestige" : "normal";
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
    if (!currentOnlineUser || presenceHeartbeatInFlight) return;
    presenceHeartbeatInFlight = true;
    try {
        await apiRequest<void>("/presence/heartbeat", { method: "POST", body: "{}" });
    } catch (error) {
        if (currentOnlineUser) console.error("Could not update online status:", error);
    } finally {
        presenceHeartbeatInFlight = false;
    }
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
    const savedShipColor = localStorage.getItem("orbit-ship-color");
    selectedShipColor = savedShipColor && /^#[0-9a-f]{6}$/i.test(savedShipColor) ? savedShipColor : skins[selectedSkin]?.color ?? skins[0].color;
    reducedEffects = localStorage.getItem("orbit-reduced-effects") === "true";
    const savedMusicVolume = Number(localStorage.getItem("orbit-music-volume") ?? "0.3");
    musicVolume = Number.isFinite(savedMusicVolume) && savedMusicVolume >= 0 && savedMusicVolume <= 1 ? savedMusicVolume : 0.3;
    musicMuted = localStorage.getItem("orbit-music-muted") === "true";
    if (musicUnlocked) fadeMusicTo(musicMuted ? 0 : musicVolume * 0.24);
    controlBindings = readControlBindings();
}

function reloadLocalCustomLevels() {
    const savedLevels = readStoredLevels("orbit-custom-levels");
    levels.splice(0, levels.length, ...levels.filter((level) => !level.localOnly));
    savedLevels.forEach((level, index) => levels.push({
        ...level,
        localOnly: !level.customId || level.localOnly,
        ...(level.customId ? {} : { customId: `local-${index + 1}` }),
    }));
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
        await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
        if (!currentOnlineUser) return;
    }
    const identity = accountIdentity(currentOnlineUser);
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
                loadedAccountProgressFor = identity;
                return;
            }
            Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
                .filter((key): key is string => Boolean(key?.startsWith("orbit-") && key !== "orbit-global-level-cache"))
                .forEach((key) => localStorage.removeItem(key));
            Object.entries(progress).forEach(([key, value]) => localStorage.setItem(key, value));
            refreshProgressStateFromStorage();
            reloadLocalCustomLevels();
            lastSyncedAccountProgress = serializeAccountProgress(getLocalAccountProgress());
            loadedAccountProgressFor = identity;
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
    } catch (error) {
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
        })(),
        (async () => {
            const sharedConfig = await apiRequest<{ config: GameConfig }>("/game-config");
            gameConfig = sharedConfig.config;
        })(),
        (async () => {
            const sharedLevels = await apiRequest<{ levels: Level[] }>("/levels");
            levels.splice(0, levels.length, ...levels.filter((level) => !level.customId || level.localOnly), ...sharedLevels.levels.map((level) => ({ ...level, localOnly: false })));
            localStorage.setItem("orbit-global-level-cache", JSON.stringify(sharedLevels.levels));
            configurePortalDistribution();
        })(),
    ];
    const results = await Promise.allSettled(tasks);
    results.forEach((result) => {
        if (result.status === "rejected") console.error("Could not load part of the online service:", result.reason);
    });
    if (currentOnlineUser?.role === "tester") {
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

function configurePortalDistribution() {
    levels.forEach((level) => {
        level.type = getLevelType(level);
        if (!level.customId && !level.localOnly) {
            level.portals = [];
            level.secretPortals = undefined;
        }
    });
    const secretLevels = levels.map((level, index) => ({ level, index })).filter(({ level }) => level.secret && !level.customId && !level.localOnly);
    secretLevels.forEach(({ level, index }) => {
        if (!level.secretId) level.secretId = `secret-level-${index + 1}`;
        level.secretPortals = undefined;
    });

    const sources = levels.filter((level) => !level.secret && !level.customId && !level.localOnly);
    const availableSources = new Set(sources);
    secretLevels.forEach(({ level }) => {
        const secretId = level.secretId;
        if (!secretId || isSecretPortalClaimed(secretId)) return;
        const saved = readSecretPortalLocation(secretId);
        let source = saved ? sources.find((candidate) => candidate.name === saved.source) : undefined;
        if (!source || !availableSources.has(source)) {
            const candidates = sources.filter((candidate) => availableSources.has(candidate) && Boolean(candidate.prestige) === Boolean(level.prestige));
            source = candidates[Math.floor(Math.random() * candidates.length)];
            if (!source) return;
            const location = { source: source.name, index: getHiddenPortalIndex(source), y: getHiddenPortalY() };
            localStorage.setItem(`orbit-portal-location-${secretId}`, JSON.stringify(location));
        }
        availableSources.delete(source);
        const location = readSecretPortalLocation(secretId);
        if (!location) return;
        source.secretPortals = [{
            id: `${secretId}-portal`,
            index: location.index,
            y: location.y,
            secretId,
        }];
    });
}

export function startApp() {
    refreshProgressStateFromStorage();
    loadCustomLevels();
    configurePortalDistribution();
    document.body.innerHTML = "";
    ownerBadgeObserver ??= new MutationObserver(updateOwnerAccountIndicator);
    ownerBadgeObserver.observe(document.body, { childList: true });
    void refreshOnlineState().then(() => {
        if (document.querySelector(".home-screen")) showMenu();
    }).catch((error: unknown) => { console.error("Could not load shared game settings:", error); });
    if (!presenceHeartbeatTimer) presenceHeartbeatTimer = window.setInterval(() => void sendPresenceHeartbeat(), 30_000);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", () => pressedKeys.clear());
    document.addEventListener("click", unlockMusic, { once: true });
    document.addEventListener("keydown", unlockMusic, { once: true });
    document.addEventListener("visibilitychange", () => {
        if (!musicContext) return;
        if (document.hidden) void musicContext.suspend();
        else if (musicUnlocked) void musicContext.resume().catch((error: unknown) => console.error("Could not resume background music:", error));
    });
    if (!accountProgressTimer) accountProgressTimer = window.setInterval(() => {
        if (currentOnlineUser && loadedAccountProgressFor === accountIdentity(currentOnlineUser)) void syncAccountProgress("save").catch((error: unknown) => console.error("Could not sync account progress:", error));
    }, 2500);
    if (!accountNoticeTimer) accountNoticeTimer = window.setInterval(() => void refreshAccountNotices(), 7000);
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
            && currentOnlineUser.role !== "owner" && currentOnlineUser.role !== "tester") {
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

function unlockMusic() {
    if (musicUnlocked || musicMuted) return;
    musicUnlocked = true;
    try {
        musicContext = new AudioContext();
        const filter = musicContext.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 430;
        musicGain = musicContext.createGain();
        musicGain.gain.value = 0;
        filter.connect(musicGain);
        musicGain.connect(musicContext.destination);
        [55, 82.41, 110].forEach((frequency, index) => {
            const oscillator = musicContext!.createOscillator();
            const voice = musicContext!.createGain();
            oscillator.type = index === 1 ? "triangle" : "sine";
            oscillator.frequency.value = frequency;
            voice.gain.value = index === 0 ? 0.55 : 0.18;
            oscillator.connect(voice);
            voice.connect(filter);
            oscillator.start();
            musicOscillators.push(oscillator);
        });
        void musicContext.resume().then(() => fadeMusicTo(musicMuted ? 0 : musicVolume * 0.24));
    } catch (error) {
        musicUnlocked = false;
        console.error("Could not initialize background music:", error);
    }
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
    if (musicUnlocked) fadeMusicTo(musicMuted ? 0 : musicVolume * 0.24);
}

function setMusicMuted(muted: boolean) {
    musicMuted = muted;
    localStorage.setItem("orbit-music-muted", String(muted));
    if (muted) fadeMusicTo(0);
    else if (!musicUnlocked) unlockMusic();
    else fadeMusicTo(musicVolume * 0.24);
}

function setMusicScene(scene: "menu" | "normal" | "prestige" | "secret" | "boss") {
    const rootFrequency = scene === "prestige" ? 46.25 : scene === "secret" ? 65.41 : scene === "boss" ? 58.27 : 55;
    if (musicContext) {
        [rootFrequency, rootFrequency * 1.5, rootFrequency * 2].forEach((frequency, index) => {
            const oscillator = musicOscillators[index];
            if (oscillator) oscillator.frequency.setTargetAtTime(frequency, musicContext!.currentTime, 0.65);
        });
    }
}

function updateOwnerAccountIndicator() {
    const existing = document.querySelector<HTMLElement>(".owner-account-indicator");
    if (currentOnlineUser?.role === "owner" || currentOnlineUser?.role === "tester") {
        const indicator = existing instanceof HTMLButtonElement ? existing : document.createElement("button");
        if (existing && existing !== indicator) existing.remove();
        indicator.className = `owner-account-indicator ${currentOnlineUser.role === "owner" ? "owner-role" : "tester-role"}`;
        indicator.type = "button";
        indicator.textContent = getRoleBadge(currentOnlineUser.role);
        indicator.setAttribute("aria-label", `Open ${currentOnlineUser.role} quick panel for ${currentOnlineUser.username}`);
        indicator.title = `${currentOnlineUser.role === "owner" ? "Owner" : "Tester"} quick panel — ${currentOnlineUser.username}`;
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
    if (!currentOnlineUser || (currentOnlineUser.role !== "owner" && currentOnlineUser.role !== "tester")) return;
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
    heading.textContent = `${isOwner ? "Owner" : "Tester"} quick tools`;
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
            if (confirmText && !window.confirm(confirmText)) return;
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
    const full = actionButton(isOwner ? "Open owner control center" : "Open tester panel", () => {
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

function showMenu() {
    if (currentOnlineUser?.mustChangePassword) {
        showAccount("Change your temporary password before continuing.");
        return;
    }
    gameActive = false;
    roleQuickPanel = null;
    roleQuickPanelStartedAt = 0;
    setMusicScene("menu");
    cancelAnimationFrame(animationFrame);
    pressedKeys.clear();
        const menu = document.createElement("main");
        menu.className = "menu-screen home-screen";
        menu.innerHTML = `<div class="brand-mark">JACER <span>/ 02</span></div><h1>Jacer</h1><p class="menu-copy">Pilot the claim ship through five dangerous sectors. Every asteroid you secure upgrades your flight.</p><div class="home-stats"><span><strong>${asteroidsClaimed}</strong> normal</span><span><strong>${specialAsteroids}</strong> special</span><span><strong>${prestigeLevel}</strong> prestige</span><span><strong>${getCompletedLevelCount()} / ${levels.length}</strong> routes complete</span><span><strong>${getUnlockedSkinCount()}</strong> skins online</span><span><strong>${getUnlockedTrailCount()}</strong> trails online</span></div><p class="prestige-requirement">NEXT PRESTIGE / ${getPrestigeRequirement(prestigeLevel).normal} NORMAL + ${getPrestigeRequirement(prestigeLevel).special} SPECIAL</p>`;
    const menuActions = document.createElement("nav"); menuActions.className = "menu-actions";
    menuActions.append(createMenuButton("Launch mission", showLevelMenu), createMenuButton("Customization", showCustomization), createMenuButton("Power-up shop", showShop), createMenuButton("Flight settings", showSettings));
    const accountRail = document.createElement("aside");
    accountRail.className = "account-rail";
    const accountButton = createTextButton(currentOnlineUser ? currentOnlineUser.username : "Account", () => showAccount());
    accountButton.classList.add("account-rail-button");
    accountButton.setAttribute("aria-label", currentOnlineUser ? `Account: ${currentOnlineUser.username}` : "Open account");
    accountRail.append(accountButton);
    const secondaryActions = document.createElement("div"); secondaryActions.className = "secondary-actions"; secondaryActions.append(createTextButton("Special asteroid odds", showDropRates), createTextButton("Credits", showCredits));
    menu.append(accountRail, menuActions, secondaryActions);
    menu.append(createPageCounter()); document.body.replaceChildren(menu);
}

function showLevelMenu() {
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
        const planetButton = createMenuButton(activePlanet === "normal" ? "Fly to prestige planet" : "Return to blue planet", switchPlanet);
        if (activePlanet === "normal" && prestigeLevel < 1) {
            planetButton.disabled = true;
            planetButton.textContent = "Prestige planet locked / reach prestige 1";
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
        const prestigeUnlocked = prestigeLevel >= 1 || routeIndex === 0;
        const prestigeLocked = activePlanet === "prestige" && !prestigeUnlocked;
        button.disabled = !unlocked || prestigeLocked;
        const lockMessage = prestigeLocked ? "LOCKED / reach prestige 1" : "LOCKED / clear the previous sector";
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
    setMusicScene("secret");
    cancelAnimationFrame(animationFrame);
    const menu = document.createElement("main");
    menu.className = "menu-screen level-menu secret-menu";
    menu.innerHTML = `<p class="eyebrow">WHITE HOLE / HIDDEN ROUTES</p><h1>Secret <em>space</em></h1><p class="menu-copy">Special asteroids appear here. Defeat the keeper bosses to unlock unusual ships.</p>`;
    const levelList = document.createElement("div");
    levelList.className = "level-list";
    levels.forEach((level, index) => {
        if (!level.secret) return;
        const unlocked = isSecretLevelUnlocked(level);
        const cooldownUntil = level.secretId ? Number(localStorage.getItem(`orbit-secret-cooldown-${level.secretId}`) ?? "0") + SECRET_LEVEL_COOLDOWN_MS : 0;
        const remainingMs = Math.max(0, cooldownUntil - Date.now());
        const button = document.createElement("button");
        button.className = `level-button secret-level ${unlocked ? "" : "locked"}`;
        button.type = "button";
        button.disabled = !unlocked || remainingMs > 0;
        const cooldownText = remainingMs > 0 ? `AVAILABLE IN ${formatCooldown(remainingMs)}` : "";
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

    const musicToggleRow = document.createElement("label");
    musicToggleRow.className = "setting-row";
    musicToggleRow.innerHTML = `<span><b>Background music</b><small>Soft procedural space ambience. Starts after your first click or key press.</small></span>`;
    const musicToggle = document.createElement("input");
    musicToggle.type = "checkbox";
    musicToggle.checked = !musicMuted;
    musicToggle.addEventListener("change", () => setMusicMuted(!musicToggle.checked));
    musicToggleRow.append(musicToggle);
    panel.append(musicToggleRow);

    const musicVolumeRow = document.createElement("label");
    musicVolumeRow.className = "setting-row music-volume-row";
    musicVolumeRow.innerHTML = `<span><b>Music volume</b><small>Saved to your account and applied live.</small></span>`;
    const musicVolumeInput = document.createElement("input");
    musicVolumeInput.type = "range";
    musicVolumeInput.min = "0";
    musicVolumeInput.max = "1";
    musicVolumeInput.step = "0.01";
    musicVolumeInput.value = String(musicVolume);
    musicVolumeInput.setAttribute("aria-label", "Background music volume");
    musicVolumeInput.addEventListener("input", () => setMusicVolume(Number(musicVolumeInput.value)));
    musicVolumeRow.append(musicVolumeInput);
    panel.append(musicVolumeRow);

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
            const result = await apiRequest<{ reward: { type: "claims" | "specialClaims"; amount: number } }>("/codes/redeem", {
                method: "POST",
                body: JSON.stringify({ code: codeInput.value.trim().toUpperCase() }),
            });
            codeInput.value = "";
            try {
                const { progress } = await apiRequest<{ progress: Record<string, string> | null }>("/account/progress");
                if (!progress || accountIdentity(currentOnlineUser) !== redemptionIdentity) throw new Error("The updated account progress could not be loaded.");
                applySyncedProgress(sentProgress, progress);
                lastSyncedAccountProgress = serializeAccountProgress(progress);
                loadedAccountProgressFor = redemptionIdentity;
                codeStatus.textContent = `Success: ${result.reward.amount} ${result.reward.type === "claims" ? "asteroids" : "special asteroids"} added to your account.`;
            } catch (error) {
                if (accountIdentity(currentOnlineUser) === redemptionIdentity) {
                    loadedAccountProgressFor = null;
                    lastSyncedAccountProgress = "";
                }
                console.error("Could not refresh the redeemed code reward:", error);
                codeStatus.textContent = `Success: ${result.reward.amount} ${result.reward.type === "claims" ? "asteroids" : "special asteroids"} saved online. Cloud saving is paused; sign in again to refresh this device.`;
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
    panel.append(codeSection);
    
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
    
    if (currentOnlineUser?.role === "owner" || currentOnlineUser?.role === "tester") {
        const testerRow = document.createElement("div");
        testerRow.className = "tester-entry";
        testerRow.innerHTML = `<span><b>${currentOnlineUser.role === "owner" ? "Owner panel" : "Tester tools"}</b><small>Open authorized game testing controls.</small></span>`;
        testerRow.append(createTextButton("Open", () => void showTesterPanel()));
        panel.append(testerRow);
    }
    
    menu.append(panel, createTextButton("Back", showMenu), createPageCounter());
    document.body.replaceChildren(menu);
}

function createProgressArea() {
    const section = document.createElement("section");
    section.className = "account-progress";
    const normalTotal = getNormalRouteCount();
    const normalDone = getNormalCompletedLevelCount();
    const requirement = getPrestigeRequirement(prestigeLevel);
    const values = [
        { label: "Normal routes", value: normalDone, total: normalTotal },
        { label: "Asteroids", value: asteroidsClaimed, total: requirement.normal },
        { label: "Special asteroids", value: specialAsteroids, total: requirement.special },
        { label: "Prestige Gate", value: hasClearedPrestigeGate() ? 1 : 0, total: 1 },
    ];
    const pct = (value: number, total: number) => total > 0 ? Math.min(100, value / total * 100) : 0;
    const overall = Math.round(values.reduce((sum, item) => sum + pct(item.value, item.total), 0) / values.length);
    section.innerHTML = `<h2>Progress</h2>`;
    values.forEach(({ label, value, total }) => {
        const row = document.createElement("label");
        row.className = "account-progress-row";
        const title = document.createElement("span");
        title.textContent = `${label}: ${value}/${total}`;
        const progress = document.createElement("progress");
        progress.max = 100;
        progress.value = pct(value, total);
        progress.setAttribute("aria-label", title.textContent);
        row.append(title, progress);
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

function showCredits() {
    const menu = document.createElement("main"); menu.className = "menu-screen credits-screen";
    menu.innerHTML = `<p class="eyebrow">ORBIT RUN / CREDITS</p><h1>Made by <em>the crew</em></h1><p class="menu-copy">A small flight team built every route, ship, and secret.</p><section class="credits-list"><b>vslxped</b><b>Mr. Cline</b><b>riverwth (#1 sql hater)</b></section><p class="music-credit">Music: Procedural Space Ambience / generated in-browser by Jacer / no external track or license.</p>`;
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
        [...updateLogEntries].sort((first, second) => second.date.localeCompare(first.date)).forEach((entry) => {
            const item = document.createElement("article");
            const date = document.createElement("time");
            date.dateTime = entry.date;
            date.textContent = entry.date;
            const title = document.createElement("h3");
            title.textContent = entry.title;
            const body = document.createElement("p");
            body.textContent = entry.body;
            item.append(date, title, body);
            updates.append(item);
        });
    }
    menu.append(updates);
    menu.append(createTextButton("Back", showMenu)); document.body.replaceChildren(menu);
}

function showAccount(initialMessage = "") {
    let registrationMode = false;
    const render = (messageText = initialMessage) => {
        const menu = document.createElement("main");
        menu.className = "menu-screen account-screen";
        menu.innerHTML = `<p class="eyebrow">ONLINE ACCOUNT / PLAYER DATA</p><h1>${currentOnlineUser ? "Your" : registrationMode ? "Create an" : "Sign in to your"} <em>account</em></h1><p class="menu-copy">${currentOnlineUser ? "Your account is signed in on this device." : "Choose a unique username and password. Passwords are salted and hashed on the server."}</p>`;
        if (currentOnlineUser) {
            const signedIn = document.createElement("p");
            signedIn.textContent = `Signed in as ${currentOnlineUser.username}${currentOnlineUser.role === "owner" ? " / OWNER" : currentOnlineUser.role === "tester" ? " / TESTER" : ""}.`;
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
                ["Normal routes", `${getNormalCompletedLevelCount()} / ${getNormalRouteCount()}`],
                ["Golden Body", `${getNormalCompletedLevelCount()} / ${getNormalRouteCount()} under ${formatTime(goldenTimeLimitMs)}`],
                ["Prestige Gate", hasClearedPrestigeGate() ? "Cleared" : "Not cleared"],
                ["Next gate cost", `${getPrestigeRequirement(prestigeLevel).normal} normal / ${getPrestigeRequirement(prestigeLevel).special} special`],
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
            const earnedTitles = PROFILE_TITLES.filter((title) => getCompletedLevelCount() >= title.routes);
            const titleRow = document.createElement("label");
            titleRow.className = "account-title-setting";
            titleRow.innerHTML = `<span><b>Pilot title</b><small>Earn titles by completing routes. Your chosen title appears on your public profile.</small></span>`;
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
            const titleStatus = document.createElement("small");
            titleStatus.className = "presence-setting-status";
            titleStatus.setAttribute("role", "status");
            titleSelect.addEventListener("change", () => {
                localStorage.setItem("orbit-title", titleSelect.value);
                titleStatus.textContent = "Saving pilot title...";
                void syncAccountProgress("save", true).then(() => {
                    titleStatus.textContent = "Pilot title saved to your account.";
                }).catch((error: unknown) => {
                    titleStatus.textContent = `Title saved on this device, but account sync failed: ${error instanceof Error ? error.message : "online service error"}`;
                    console.error("Could not sync selected pilot title:", error);
                });
            });
            titleRow.append(titleSelect);
            const saveProfile = document.createElement("button");
            saveProfile.className = "menu-button";
            saveProfile.type = "submit";
            saveProfile.textContent = "Save profile";
            profileForm.append(usernameLabel, saveProfile, profileHint, privacyRow, privacyStatus, titleRow, titleStatus);
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
                fieldLabel.append(input);
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
            dashboard.append(statsHeading, stats, createShipPreview(), createProgressArea(), inventoryHeading, itemList, loadout, profileHeading, profileForm, passwordSection);
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
                currentPasswordLabel.append(currentPassword);
                const makeCode = document.createElement("button");
                makeCode.className = "menu-button";
                makeCode.type = "submit";
                makeCode.textContent = "Make a new recovery code";
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
                dashboard.append(recoverySection);
                void apiRequest<{ hasRecoveryCode: boolean; recoveryCodeCreatedAt: string | null }>("/account/profile")
                    .then((profile) => {
                        if (!recoverySection.isConnected) return;
                        recoveryStatus.textContent = profile.hasRecoveryCode
                            ? `Recovery code set on ${profile.recoveryCodeCreatedAt ? new Date(profile.recoveryCodeCreatedAt).toLocaleDateString() : "an earlier date"}.`
                            : "No recovery code yet. Make one now so you can get back into your account.";
                    })
                    .catch((error: unknown) => {
                        if (recoverySection.isConnected) recoveryStatus.textContent = error instanceof Error ? error.message : "Could not load recovery-code status.";
                    });
            }
            menu.append(dashboard);
            void apiRequest<{ role: "player" | "tester" | "owner"; nextUsernameChangeAt: string | null; mustChangePassword?: boolean }>("/account/profile")
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
                    if (profile.mustChangePassword && currentOnlineUser) currentOnlineUser.mustChangePassword = true;
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
                    setOnlineUser(null);
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
                    const wasRegistration = registrationMode;
                    const response = await apiRequest<{ user: OnlineUser; recoveryCode?: string }>(`/auth/${wasRegistration ? "register" : "login"}`, {
                        method: "POST",
                        body: JSON.stringify({ username: username.value, password: password.value }),
                    });
                    setOnlineUser(response.user);
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
};
function controlKeysFor(action: ControlAction) {
    return controlBindings[action] === DEFAULT_CONTROL_BINDINGS[action]
        ? [controlBindings[action], ...secondaryControlKeys[action]]
        : [controlBindings[action]];
}

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
    const tierLabel = document.createElement("label");
    tierLabel.className = "wheel-tier-label";
    tierLabel.append(document.createTextNode("Buy-in"));
    const tierSelect = document.createElement("select");
    tierSelect.setAttribute("aria-label", "Roulette buy-in");
    rouletteTiers.forEach((tier) => {
        const option = document.createElement("option");
        option.value = String(tier.buyIn);
        option.textContent = `${tier.buyIn} special asteroids`;
        option.selected = tier.buyIn === selectedRouletteBuyIn;
        tierSelect.append(option);
    });
    tierLabel.append(tierSelect);
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
        const tier = rouletteTiers.find((item) => item.buyIn === selectedRouletteBuyIn) ?? rouletteTiers[0];
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
        roll.disabled = specialAsteroids < tier.buyIn || spinInProgress;
        roll.textContent = `Spin / ${tier.buyIn} special`;
        wheelStatus.textContent = spinInProgress
            ? `The ${tier.buyIn}-asteroid wheel is spinning...`
            : `Available: ${specialAsteroids} special asteroids`;
    };
    tierSelect.addEventListener("change", () => {
        selectedRouletteBuyIn = Number(tierSelect.value) as RouletteTier["buyIn"];
        drawWheel();
    });
    roll.addEventListener("click", () => {
        const tier = rouletteTiers.find((item) => item.buyIn === selectedRouletteBuyIn) ?? rouletteTiers[0];
        const segments = getRouletteSegments(tier);
        if (specialAsteroids < tier.buyIn || spinInProgress || !segments.length) return;
        spinInProgress = true;
        specialAsteroids -= tier.buyIn;
        localStorage.setItem("orbit-special-claims", String(specialAsteroids));
        const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
        let targetWeight = Math.random() * totalWeight;
        const chosenSegment = segments.find((segment) => {
            targetWeight -= segment.weight;
            return targetWeight < 0;
        }) ?? segments[segments.length - 1];
        const reward = getRouletteReward(chosenSegment.type, tier);
        const chosenPocket = rouletteWheelPockets[Math.floor(Math.random() * rouletteWheelPockets.length)];
        const midpoint = (chosenPocket.startAngle + chosenPocket.endAngle) / 2;
        const duration = reward.rarity === "Legendary" ? 7400 : reward.rarity === "Epic" ? 6800 : 6000;
        const finalRotation = 6 * 360 + ((360 - midpoint) % 360);
        const startedAt = performance.now();
        const currentRotation = 0;
        tierSelect.disabled = true;
        roll.disabled = true;
        wheel.classList.add("spinning");
        wheelStatus.textContent = `The ${tier.buyIn}-asteroid wheel is spinning...`;
        drawWheel();
        tierSelect.disabled = true;
        roll.disabled = true;
        let savedAccountError = "";
        if (currentOnlineUser) {
            void syncAccountProgress("save", true).catch((error: unknown) => {
                console.error("Could not sync roulette reward:", error);
                savedAccountError = " It is saved on this device; account sync failed and will retry.";
            });
        }
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
            if (progress < 1) {
                requestAnimationFrame(animate);
                return;
            }
            wheelRing.style.transform = `rotate(${finalRotation}deg)`;
            spinInProgress = false;
            wheel.classList.remove("spinning");
            tierSelect.disabled = false;
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
    wheel.append(wheelControls, wheelTitle, tierLabel, collectionComplete, roll, wheelStatus);
    drawWheel();
    menu.append(currency, grid, wheel, createTextButton("Mission select", showLevelMenu), createTextButton("Main menu", showMenu), createPageCounter());
    document.body.replaceChildren(menu);
}

function cosmeticUnlockKey(group: CosmeticGroup, index: number) { return `orbit-spin-${group}-${index}`; }
function isSpinCosmeticUnlocked(group: CosmeticGroup, index: number) { return localStorage.getItem(cosmeticUnlockKey(group, index)) === "1"; }
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

function areRouletteCosmeticsComplete() {
    return !getAvailableRouletteCosmetics("color").length
        && !getAvailableRouletteCosmetics("trail").length
        && !getAvailableRouletteCosmetics("avatar").length;
}

function chooseRouletteCosmetic<T>(candidates: T[], rarityFor: (candidate: T) => Rarity, tier: RouletteTier) {
    const tierBoost = tier.buyIn === 25 ? 2 : tier.buyIn === 10 ? 1 : 0;
    const weighted = candidates.map((candidate) => {
        const rarityIndex = RARITY_ORDER.indexOf(rarityFor(candidate));
        return { candidate, weight: (0.55 ** rarityIndex) * (1 + tierBoost * rarityIndex * 0.3) };
    });
    let random = Math.random() * weighted.reduce((sum, entry) => sum + entry.weight, 0);
    return weighted.find((entry) => (random -= entry.weight) < 0)?.candidate ?? weighted[weighted.length - 1].candidate;
}

function getRouletteSegments(tier: RouletteTier) {
    const labels: Record<"claims" | "specialClaims" | "color" | "trail" | "avatar", string> = {
        claims: "Asteroids",
        specialClaims: "Special",
        color: "Color",
        trail: "Trail",
        avatar: "Avatar",
    };
    return (Object.keys(tier.chances) as (keyof RouletteTier["chances"])[])
        .filter((type) => tier.chances[type] > 0 && (type === "claims" || type === "specialClaims" || getAvailableRouletteCosmetics(type).length > 0))
        .map((type) => ({
            type,
            label: labels[type],
            weight: tier.chances[type],
            startAngle: 0,
            endAngle: 0,
        }));
}

function getRouletteReward(type: keyof RouletteTier["chances"], tier: RouletteTier): RouletteReward {
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
        if (!candidates.length) return getRouletteReward("claims", tier);
        const chosen = chooseRouletteCosmetic(candidates, () => getCosmeticRarity({ required: 30 }), tier);
        unlockSpinCosmetic(type, chosen.index);
        const color = chosen.color;
        selectedShipColor = color;
        localStorage.setItem("orbit-ship-color", color);
        return { title: `${color} ship color`, description: "New color unlocked and equipped.", rarity: getCosmeticRarity({ required: 30 }), collectionComplete: false };
    }
    if (type === "trail") {
        const candidates = getAvailableRouletteCosmetics("trail");
        if (!candidates.length) return getRouletteReward("claims", tier);
        const chosen = chooseRouletteCosmetic(candidates, ({ item }) => getCosmeticRarity(item), tier);
        unlockSpinCosmetic(type, chosen.index);
        return { title: `${chosen.item.name} trail`, description: "New trail unlocked. Equip it from Customization.", rarity: getCosmeticRarity(chosen.item), collectionComplete: false };
    }
    const candidates = getAvailableRouletteCosmetics("avatar");
    if (!candidates.length) return getRouletteReward("claims", tier);
    const chosen = chooseRouletteCosmetic(candidates, ({ item }) => getCosmeticRarity(item), tier);
    unlockSpinCosmetic(type, chosen.index);
    return {
        title: `${chosen.item.name} avatar`,
        description: "New avatar unlocked. Equip it from Customization.",
        rarity: getCosmeticRarity(chosen.item),
        collectionComplete: false,
    };
}

function showDropRates() {
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
    };
    const rewardTypes = Object.keys(rewardLabels) as (keyof RouletteTier["chances"])[];
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
            value.textContent = `${tier.chances[type].toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
            row.append(label, value);
            if (type === "claims" || type === "specialClaims") {
                const [minimum, maximum] = tier.rewards[type];
                const range = document.createElement("small");
                range.textContent = `Reward: ${minimum.toLocaleString()}-${maximum.toLocaleString()}`;
                row.append(range);
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
    const rarityHeading = document.createElement("h2");
    rarityHeading.className = "rarity-odds-heading";
    rarityHeading.textContent = "Asteroid rarity guide";
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
    menu.append(rouletteOdds, rarityHeading, odds, catalog, createTextButton("Back to main menu", showMenu), createPageCounter());
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
            setOnlineUser(response.user);
            void sendPresenceHeartbeat();
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
    let user = currentOnlineUser;
    try {
        if (!user) user = (await apiRequest<{ user: OnlineUser | null }>("/auth/session")).user;
    } catch (error) {
        showTesterLogin();
        console.error("Could not verify owner account:", error);
        return;
    }
    if (user?.role !== "owner" && user?.role !== "tester") {
        showTesterLogin();
        return;
    }
    setOnlineUser(user);
    updateOwnerAccountIndicator();
    const isOwner = user.role === "owner";
    const menu = document.createElement("main");
    menu.className = "menu-screen tester-screen";
    const pageHeader = document.createElement("div");
    pageHeader.className = "tester-console-header";
    pageHeader.innerHTML = `<div><p class="eyebrow">FLIGHT SYSTEMS / ${isOwner ? "OWNER" : "TESTER"}</p><h1>Control <em>center</em></h1><p class="menu-copy">${isOwner ? "Manage your game and pilots from one place." : "Test game settings and progression on this device."}</p></div><span class="tester-scope-badge">${isOwner ? "OWNER ACCESS" : "LOCAL TEST MODE"}</span>`;
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
    const updateLogManagement = document.createElement("section");
    updateLogManagement.className = "tester-player-management";
    updateLogManagement.hidden = true;
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
    bindTesterSetting(starChanceInput, "rainbowStarChance", () => selectedWorld);
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
        bindTesterSetting(oddsInput, `rarityOdds.${rarity}`, () => selectedWorld);
        const minimumInput = document.createElement("input");
        minimumInput.type = "number"; minimumInput.min = "0"; minimumInput.value = String(rewards[rarity][0]);
        minimumInput.setAttribute("aria-label", `${rarity} minimum asteroid reward`);
        minimumInput.dataset.rewardMin = rarity;
        bindTesterSetting(minimumInput, `rewardMin.${rarity}`, () => selectedWorld);
        const maximumInput = document.createElement("input");
        maximumInput.type = "number"; maximumInput.min = "0"; maximumInput.value = String(rewards[rarity][1]);
        maximumInput.setAttribute("aria-label", `${rarity} maximum asteroid reward`);
        maximumInput.dataset.rewardMax = rarity;
        bindTesterSetting(maximumInput, `rewardMax.${rarity}`, () => selectedWorld);
        const skinChanceInput = document.createElement("input");
        skinChanceInput.type = "number"; skinChanceInput.min = "0"; skinChanceInput.max = "100"; skinChanceInput.value = String(skinChances[rarity]);
        skinChanceInput.step = "1";
        skinChanceInput.setAttribute("aria-label", `${rarity} skin chance percent`);
        skinChanceInput.dataset.skinChance = rarity;
        bindTesterSetting(skinChanceInput, `skinChance.${rarity}`, () => selectedWorld);
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
    rouletteDescription.textContent = "Adjust each tier's prize chances and asteroid rewards. Chances in each tier must add up to 100%.";
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
    form.append(rouletteSettings);
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
        unlocks.querySelector<HTMLInputElement>('input[data-unlock="skins"]')!.checked = true;
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
            const hasPortal = Boolean(level.portals?.length || level.secretPortals?.length);
            metadata.className = "tester-level-meta";
            metadata.textContent = `${hasPortal ? "PORTAL" : "NO PORTAL"} / RAINBOW STAR ${getConfiguredRainbowStarChance(Boolean(level.prestige))}%`;
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
            if (!level.customId || !window.confirm(`Delete the shared workshop level "${level.name}" for every player?`)) return;
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
        if (isOwner) row.append(remove);
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
    resetButton.addEventListener("click", () => {
        if (!window.confirm("Clear this device's game data? Shared settings and workshop levels will not be deleted.")) return;
        Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith("orbit-"))).forEach((key) => localStorage.removeItem(key));
        window.location.reload();
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
            if (oddsTotal !== 100 || !isPercentage(worldConfig.rainbowStarChance)
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
    const chancesRewards = settingPanel("rewards", [rewardSettings, rouletteSettings]);
    const sections: ControlSection[] = [
        { id: "rewards", title: "Chances & rewards", group: "Game settings", description: "Tune world drops, rarity chances, roulette prizes, and wheel buy-ins from one place.", panel: chancesRewards },
        { id: "abilities", title: "Power-ups", group: "Game settings", description: "Set power-up strength and duration for both worlds.", panel: settingPanel("abilities", [effectSettings]) },
        { id: "profile", title: "Resources", group: "Your test profile", description: "Adjust the progress and inventory on this device, not other players' accounts.", panel: settingPanel("profile", pilotFields) },
        { id: "cosmetics", title: "Cosmetics", group: "Your test profile", description: "Manage cosmetic unlocks for this device.", panel: settingPanel("cosmetics", [customizationTitle, unlocks, unlockEverySkin]) },
        { id: "levels", title: "Levels & prestige", group: "Your test profile", description: "Quick unlock buttons apply immediately. Save checkbox changes when you're ready.", panel: settingPanel("levels", [levelTitle, levelActions, prestigeGateLabel, levelChoices, tryPrestige]) },
        { id: "workshop", title: "Level workshop", group: "Your test profile", description: isOwner ? "Build routes or manage shared workshop levels." : "Playtest routes. Publishing or deleting shared levels requires owner access.", panel: settingPanel("workshop", [customTitle, sharedLevels, workshopStatus, openMaker]) },
        { id: "reset", title: "Device reset", group: "Your test profile", description: "Reset this device's game data without deleting shared settings.", panel: settingPanel("reset", [resetTitle, resetPanel]) },
    ];
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
    if (isOwner) sections.push(
        { id: "players", title: "Player accounts", group: "Owner management", description: "Review accounts, progress, roles, and access.", panel: accountManagement, onOpen: () => loadOnce("players", accountManagement, () => loadManagedUsers(accountManagement)) },
        { id: "codes", title: "Reward codes", group: "Owner management", description: "Create and manage redeemable asteroid rewards.", panel: codeManagement, onOpen: () => loadOnce("codes", codeManagement, () => renderAdminCodeTools(codeManagement)) },
        { id: "messages", title: "Messages", group: "Owner management", description: "Send announcements and review message history.", panel: messageManagement, onOpen: () => loadOnce("messages", messageManagement, () => renderAdminMessageTools(messageManagement)) },
        { id: "updates", title: "Update log", group: "Owner management", description: "Publish the changes shown to players in Credits.", panel: updateLogManagement, onOpen: () => loadOnce("updates", updateLogManagement, () => renderAdminUpdateLog(updateLogManagement, updateLogEntries, (entries) => { updateLogEntries = entries; })) },
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
    content.append(sectionHeader, worldTabs, form, accountManagement, codeManagement, messageManagement, updateLogManagement);
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
    const legacySections: Record<string, string> = { General: "profile", Economy: "rewards", Abilities: "abilities", Cosmetics: "cosmetics", Levels: "levels", Prestige: "profile", Workshop: "workshop", roulette: "rewards" };
    const initialSection = previousSection ? legacySections[previousSection] ?? previousSection : "rewards";
    selectSection(sections.some((section) => section.id === initialSection) ? initialSection : "rewards");
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
            ...Object.values(settings.powerupSpawnChances)].every((item) => typeof item === "number" && Number.isFinite(item))) return false;
    }
    const effects = config.powerupEffects;
    return isRecord(effects)
        && isRecord(effects.shield) && Number.isFinite(effects.shield.charges)
        && isRecord(effects.boost) && Number.isFinite(effects.boost.durationSeconds) && Number.isFinite(effects.boost.movementMultiplier)
        && isRecord(effects.rapid) && Number.isFinite(effects.rapid.durationSeconds)
        && isRecord(effects.cannon) && Number.isFinite(effects.cannon.durationSeconds)
        && isRecord(effects.star) && Number.isFinite(effects.star.durationSeconds);
}

function isUsableRouletteTiers(value: unknown): value is RouletteTier[] {
    if (!Array.isArray(value) || value.length !== 3) return false;
    const keys = ["claims", "specialClaims", "color", "trail", "avatar"] as const;
    return value.every((tier, index) => {
        if (!tier || typeof tier !== "object") return false;
        const candidate = tier as Partial<RouletteTier>;
        const chances = candidate.chances;
        const rewards = candidate.rewards;
        if (!chances || !rewards) return false;
        return candidate.buyIn === [5, 10, 25][index]
            && keys.every((key) => Number.isSafeInteger(chances[key]) && chances[key] >= 0 && chances[key] <= 100)
            && keys.reduce((total, key) => total + chances[key], 0) === 100
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
    const prestigeDifficulty = getPrestigeDifficultyMultiplier();
    const miniBossHealth = Math.ceil(2 * prestigeDifficulty);
    levelMiniBosses = (level.miniBosses ?? []).map((index) => ({ x: 140 + index * TILE_WIDTH, y: 245, health: miniBossHealth, maxHealth: miniBossHealth, defeated: false }));
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
    if (portalTransitTimer) window.clearTimeout(portalTransitTimer);
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
            const secondPhase = secretBoss.health <= secretBoss.maxHealth / 2;
            const attackInterval = secondPhase ? 48 : rapidTimer > 0 ? 56 : reducedEffects ? 96 : 72;
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
    const speed = 5.04;
    projectiles.push({ x: secretBoss.x + 64, y: secretBoss.y + SECRET_BOSS_HEIGHT / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, element, owner: "enemy" });
}

function damageSecretBoss() {
    if (!secretBoss || secretBoss.defeated) return;
    secretBoss.health--;
    const room = document.querySelector<HTMLElement>(".portal-key-room");
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
    if (room) createEnemyExplosion(room, secretBoss.x + 64, secretBoss.y + SECRET_BOSS_HEIGHT / 2, "#6ecbff");
    const keyId = currentSecretPortalTarget;
    if (keyId) {
        markSecretPortalClaimed(keyId);
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
    const transition = document.createElement("div"); transition.className = "planet-transition prestige"; transition.innerHTML = `<span>${text}</span>`; document.body.append(transition); window.setTimeout(() => transition.remove(), 1100);
}

function startGame(levelIndex = currentLevel) {
    const level = levels[levelIndex];
    if (!level) return;
    if (level.secret && level.secretId) {
        const cooldownUntil = Number(localStorage.getItem(`orbit-secret-cooldown-${level.secretId}`) ?? "0") + SECRET_LEVEL_COOLDOWN_MS;
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
    if (currentOnlineUser && !level.localOnly && !level.customId) {
        localStorage.setItem("orbit-last-level", level.name);
        void syncAccountProgress("save").catch((error: unknown) => console.error("Could not save the last started level:", error));
    }
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
    const level = levels[currentLevel];
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
    runStatus.textContent = `Abilities used: ${usedAbilities.size ? [...usedAbilities].map(formatAbilityName).join(", ") : "None"}. Saving online score...`;
    if (!level.secret) screen.append(runStatus);
    void submitLeaderboardRun(runStatus, levels[currentLevel].name, Math.round(elapsedMilliseconds), [...usedAbilities]);
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
    screen.append(createMenuButton(nextLevel >= 0 ? "Next sector" : "Replay sector", () => nextLevel >= 0 ? startGame(nextLevel) : startGame(currentLevel)), createTextButton("Mission select", showLevelMenu), createPageCounter());
    document.body.replaceChildren(screen);
}

async function submitLeaderboardRun(status: HTMLElement, levelName: string, timeMs: number, abilities: string[]) {
    try {
        const session = await apiRequest<{ user: OnlineUser | null }>("/auth/session");
        setOnlineUser(session.user);
        if (!session.user) {
            status.textContent = "Sign in or create an account to submit this run to the online leaderboard.";
            return;
        }
        const result = await apiRequest<{ entry: OnlineLeaderboardEntry | null; improved: boolean; ignored?: boolean }>("/runs", {
            method: "POST",
            body: JSON.stringify({ level: levelName, timeMs, abilities }),
        });
        if (result.ignored) {
            status.textContent = "Owner and tester runs are not included on the public leaderboard.";
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
    playerLabel.className = `player ${hasCustomArt ? "" : `ship-${skin.shape}`} avatar-${selectedAvatar}`;
    playerLabel.style.setProperty("--ship-color", selectedShipColor);
    playerLabel.innerHTML = `${avatar.cssArt ? createCssShipArtMarkup(avatar.cssArt, avatar.name, selectedShipColor) : shipArt ? createShipArtMarkup(shipArt, avatar.name, selectedShipColor) : "<span class=\"ship-window\"></span>"}<span class="ship-gun"></span><span class="ship-flame"></span>`;
    world.append(playerLabel);
    updatePlayerPosition();
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
    const secretPortals = levels[currentLevel].secret ? [] : levels[currentLevel].secretPortals ?? [];
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

function startPortalTransit(target: number, secretId?: string) {
    if (portalTravelInProgress) return;
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
    secretBoss = { x: bossX, y: secretRoomFloorY - SECRET_BOSS_HEIGHT, health: 12, maxHealth: 12, defeated: false };
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
    if (inFlippedRoute && doubleDown) { leaveFlippedRoute(); return; }
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
function createEnemyExplosion(container: HTMLElement, x: number, y: number, color = "#f6c46e") {
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
    window.setTimeout(() => burst.remove(), reducedEffects ? 360 : 720);
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
            createEnemyExplosion(world, enemy.x + 24, enemy.y + 24);
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
                createEnemyExplosion(world, miniBoss.x + 35, miniBoss.y + 35, "#b991ff");
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
        levelEnemies.forEach((enemy, index) => {
            if (enemy.defeated) return;
            enemy.defeated = true;
            document.querySelectorAll(".enemy")[index]?.classList.add("defeated");
            createEnemyExplosion(world, enemy.x + 24, enemy.y + 24);
        });
        levelMiniBosses.forEach((miniBoss, index) => {
            if (miniBoss.defeated) return;
            miniBoss.defeated = true;
            document.querySelectorAll(".mini-boss")[index]?.classList.add("defeated");
            createEnemyExplosion(world, miniBoss.x + 35, miniBoss.y + 35, "#b991ff");
        });
        if (boss && !boss.defeated) {
            boss.defeated = true;
            document.querySelector(".boss")?.classList.add("defeated");
            createEnemyExplosion(world, boss.x + 64, boss.y + 75, "#ed7657");
        }
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
function damageBoss() { if (!boss || boss.defeated) return; boss.health--; bossLabel.textContent = `TITAN ${boss.health}/${boss.maxHealth}`; const bossElement = document.querySelector(".boss"); bossElement?.classList.add("hit"); window.setTimeout(() => bossElement?.classList.remove("hit"), 180); if (boss.health <= 0) { boss.defeated = true; bossElement?.classList.add("defeated"); createEnemyExplosion(world, boss.x + 64, boss.y + 75, "#ed7657"); statusLabel.textContent = "Titan Core shattered. Reach the beacon for your reward."; } }

function getPrestigeRequirement(level: number) { return { normal: 100 + level * 50, special: 10 + level * 5 }; }
function getNormalRouteCount() { return levels.filter((level) => !level.secret && !level.prestige).length; }
function getNormalCompletedLevelCount() { return levels.filter((level, index) => { const bestTime = Number(localStorage.getItem(`orbit-best-${index}`) ?? "0"); return !level.secret && !level.prestige && localStorage.getItem(`orbit-level-complete-${index}`) === "1" && bestTime > 0 && bestTime <= goldenTimeLimitMs; }).length; }
function getCompletedLevelCount() { return levels.filter((_, index) => localStorage.getItem(`orbit-level-complete-${index}`) === "1").length; }
function hasClearedPrestigeGate() { return localStorage.getItem("orbit-level-complete-prestige-gate") === "1" || levels.some((level, index) => level.secretId === "prestige-gate" && localStorage.getItem(`orbit-level-complete-${index}`) === "1"); }
function getPrestigeGateAccessError() {
    const requirement = getPrestigeRequirement(prestigeLevel);
    const normalComplete = getNormalCompletedLevelCount();
    if (prestigeLevel >= prestigeMax) return "You have reached the configured prestige limit.";
    if (normalComplete < getNormalRouteCount()) return `Clear every normal route under ${formatTime(goldenTimeLimitMs)} (${normalComplete}/${getNormalRouteCount()} complete).`;
    if (asteroidsClaimed < requirement.normal || specialAsteroids < requirement.special) {
        return `Gate requirements: asteroids ${asteroidsClaimed}/${requirement.normal}, special asteroids ${specialAsteroids}/${requirement.special}.`;
    }
    return "";
}
function canClaimPrestige() { return !getPrestigeGateAccessError() && hasClearedPrestigeGate(); }
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
        if (error || !hasClearedPrestigeGate()) {
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
        .filter((key): key is string => Boolean(key && /^orbit-spin-(skin|trail|avatar)-\d+$/.test(key)))
        .forEach((key) => localStorage.removeItem(key));
    refreshProgressStateFromStorage();
    return true;
}
function isSkinUnlocked(skin: { required: number; boss?: boolean; secret?: boolean; prestige?: number; golden?: boolean }, index?: number) { return localStorage.getItem("orbit-unlock-skins") === "1" || (index !== undefined && isSpinCosmeticUnlocked("skin", index)) || (skin.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : skin.prestige !== undefined ? prestigeLevel >= skin.prestige : skin.boss ? localStorage.getItem("orbit-boss-defeated") === "1" : skin.secret ? localStorage.getItem("orbit-secret-unlocked") === "1" : asteroidsClaimed >= skin.required); }
function getUnlockedSkinCount() { return skins.filter(isSkinUnlocked).length; }
function isAvatarUnlocked(avatar: AvatarStyle) { const index = avatars.indexOf(avatar); return localStorage.getItem("orbit-unlock-avatars") === "1" || (index >= 0 && isSpinCosmeticUnlocked("avatar", index)) || (avatar.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : avatar.prestige !== undefined ? prestigeLevel >= avatar.prestige : avatar.jackpot ? localStorage.getItem("orbit-jackpot-avatar") === "1" : true); }
function isTrailUnlocked(trail: TrailStyle) { const index = trails.indexOf(trail); return localStorage.getItem("orbit-unlock-trails") === "1" || (index >= 0 && isSpinCosmeticUnlocked("trail", index)) || (trail.golden ? getNormalCompletedLevelCount() >= getNormalRouteCount() : trail.prestige !== undefined ? prestigeLevel >= trail.prestige : trail.boss ? localStorage.getItem("orbit-boss-defeated") === "1" : trail.secret ? localStorage.getItem("orbit-secret-unlocked") === "1" : asteroidsClaimed >= trail.required); }
function getUnlockedTrailCount() { return trails.filter(isTrailUnlocked).length; }
function formatTime(milliseconds: number) { const total = Math.max(0, Math.floor(milliseconds)); const minutes = Math.floor(total / 60000).toString().padStart(2, "0"); const seconds = Math.floor(total / 1000 % 60).toString().padStart(2, "0"); const millis = (total % 1000).toString().padStart(3, "0"); return `${minutes}:${seconds}.${millis}`; }
