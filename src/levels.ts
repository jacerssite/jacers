import type { Level } from "./types";

export const levels: Level[] = [
    { name: "Nebula Dawn", briefing: "Slip through the quiet nebula.", length: 13, asteroids: [2, 5, 9, 11], walls: [4, 7], enemies: [6], spikes: [8], gravity: [] },
    { name: "Crimson Torrent", briefing: "Rocks are closing in.", length: 16, asteroids: [2, 6, 9, 13], walls: [4, 8, 11], enemies: [7, 12], spikes: [5, 10], gravity: [] },
    { name: "Abyssal Vortex", briefing: "Gravity wells drag you down.", length: 18, asteroids: [2, 6, 10, 14, 16], walls: [4, 9, 12], enemies: [8, 15], spikes: [7, 11, 14], gravity: [12] },
    { name: "Shattered Expanse", briefing: "Stay precise.", length: 21, asteroids: [2, 6, 9, 13, 16, 19], walls: [4, 8, 11, 15, 18], enemies: [7, 14, 17], spikes: [6, 12, 16, 19], gravity: [10, 17] },
    { name: "Eternal Twilight", briefing: "Push through the storm.", length: 24, asteroids: [2, 6, 9, 13, 16, 19, 21], walls: [4, 8, 12, 15, 18, 21], enemies: [7, 14, 17, 22], spikes: [6, 11, 16, 20], gravity: [9, 14, 19], secretPortals: [{ index: 3, secretId: "eclipse" }] },
    { name: "Ion Sanctum", briefing: "Break through its elite choir.", length: 25, asteroids: [2, 6, 9, 13, 16, 20, 23], walls: [4, 8, 12, 15, 19, 22], enemies: [7, 14, 21], spikes: [6, 11, 17, 23], gravity: [10, 18], powerups: [{ index: 4, kind: "shield" }, { index: 17, kind: "cannon" }], miniBosses: [12] },
    { name: "Starlight Mausoleum", briefing: "Guardians won't surrender.", length: 28, asteroids: [2, 6, 10, 13, 17, 21, 25], walls: [4, 9, 12, 16, 20, 24], enemies: [8, 15, 22], spikes: [7, 11, 18, 23], gravity: [9, 19], powerups: [{ index: 8, kind: "boost" }, { index: 19, kind: "shield" }, { index: 24, kind: "cannon" }], miniBosses: [11, 21] },
    { name: "Prismatic Gauntlet", briefing: "Survive the barrage.", length: 31, asteroids: [3, 7, 11, 14, 18, 22, 26, 29], walls: [6, 10, 13, 17, 21, 25, 28], enemies: [8, 16, 24], spikes: [7, 12, 19, 27], gravity: [9, 15, 23], secretPortals: [{ index: 2, secretId: "nebula" }], powerups: [{ index: 6, kind: "rapid" }, { index: 15, kind: "boost" }, { index: 26, kind: "shield" }], miniBosses: [12, 23] },
    { name: "Titan's Crucible", briefing: "Face the colossus.", length: 34, asteroids: [3, 7, 10, 14, 17, 20, 23, 26, 29, 31], walls: [6, 9, 13, 16, 19, 22, 25, 28, 30], enemies: [8, 18, 27], spikes: [7, 15, 21, 29], gravity: [11, 19, 25], powerups: [{ index: 5, kind: "shield" }, { index: 16, kind: "rapid" }, { index: 26, kind: "boost" }], miniBosses: [14, 26], boss: true },
    { name: "Solar Inferno", briefing: "Ride the narrow gaps.", length: 29, asteroids: [2, 7, 11, 15, 19, 23, 27], walls: [5, 9, 13, 17, 21, 25], enemies: [8, 16, 24], spikes: [6, 12, 18, 26], gravity: [10, 20], powerups: [{ index: 4, kind: "shield" }, { index: 14, kind: "boost" }, { index: 22, kind: "cannon" }], miniBosses: [16], boss: true },
    { name: "Lunar Catacombs", briefing: "Descend and clear the elite.", length: 32, asteroids: [3, 8, 12, 16, 20, 24, 28], walls: [6, 10, 14, 18, 22, 26], enemies: [7, 15, 23, 29], spikes: [9, 13, 21, 27], gravity: [11, 19, 25], powerups: [{ index: 7, kind: "cannon" }, { index: 17, kind: "shield" }, { index: 27, kind: "boost" }], miniBosses: [13, 25] },
    { name: "Void Threshold", briefing: "Beyond lies the unknown.", length: 37, asteroids: [3, 8, 12, 16, 20, 24, 28, 32, 35], walls: [6, 10, 14, 18, 22, 26, 30, 34], enemies: [7, 15, 23, 31], spikes: [9, 13, 21, 29, 35], gravity: [11, 19, 27, 33], secretPortals: [{ index: 4, secretId: "eclipse" }], powerups: [{ index: 5, kind: "boost" }, { index: 17, kind: "shield" }, { index: 29, kind: "rapid" }], miniBosses: [14, 28] },
    { name: "Eclipse Obsidian", briefing: "Claim the obsidian cores.", length: 20, asteroids: [2, 5, 8, 11, 14, 17], walls: [4, 7, 10, 13, 16], enemies: [6, 12, 18], spikes: [5, 9, 15], gravity: [8, 17], powerups: [{ index: 7, kind: "shield" }, { index: 15, kind: "boost" }], specialAsteroids: [2, 5, 8, 11, 14, 17], secret: true, secretId: "eclipse", secretPortals: [{ index: 2, secretId: "eclipse" }] },
    { name: "Comet Forge", briefing: "Seize incandescent cores.", length: 27, asteroids: [2, 7, 11, 15, 19, 23], walls: [5, 9, 13, 17, 21], enemies: [8, 14, 20, 25], spikes: [6, 12, 18, 24], gravity: [10, 22], powerups: [{ index: 4, kind: "cannon" }, { index: 16, kind: "shield" }], miniBosses: [19], prestige: true, prestigeRequirement: 1 },
    { name: "Amethyst Citadel", briefing: "Crush the second titan.", length: 33, asteroids: [3, 8, 12, 16, 20, 24, 28, 31], walls: [6, 10, 14, 18, 22, 26, 30], enemies: [7, 15, 23, 29], spikes: [9, 13, 21, 27], gravity: [11, 19, 25], powerups: [{ index: 5, kind: "shield" }, { index: 17, kind: "cannon" }, { index: 27, kind: "boost" }], miniBosses: [14, 26], boss: true, prestige: true, prestigeRequirement: 2 },
    { name: "Starfall Bastion", briefing: "Defeat the bastion guardian.", length: 36, asteroids: [3, 8, 12, 16, 20, 24, 28, 32, 34], walls: [6, 10, 14, 18, 22, 26, 30], enemies: [7, 15, 23, 31], spikes: [9, 13, 21, 29, 34], gravity: [11, 19, 27, 33], powerups: [{ index: 5, kind: "cannon" }, { index: 17, kind: "shield" }, { index: 29, kind: "boost" }], miniBosses: [14, 28], boss: true, prestige: true, prestigeRequirement: 3 },
    { name: "Nebula Depths", briefing: "Find the beacon.", length: 26, asteroids: [3, 8, 12, 16, 20, 23], walls: [6, 10, 14, 18, 22], enemies: [7, 15, 21], spikes: [9, 13, 19], gravity: [11, 17, 23], powerups: [{ index: 5, kind: "shield" }, { index: 15, kind: "cannon" }], specialAsteroids: [3, 8, 12, 16, 20, 23], secret: true, secretId: "nebula", secretPortals: [{ index: 2, secretId: "nebula" }] },
    { name: "Singularity Archive", briefing: "Survive the keeper.", length: 31, asteroids: [3, 8, 12, 16, 20, 24, 28], walls: [6, 10, 14, 18, 22, 26], enemies: [7, 15, 23, 29], spikes: [9, 13, 21, 27], gravity: [11, 19, 25], powerups: [{ index: 5, kind: "cannon" }, { index: 17, kind: "shield" }, { index: 26, kind: "boost" }], miniBosses: [14, 26], boss: true, secret: true, secretId: "archive", specialAsteroids: [3, 8, 12, 16, 20, 24, 28], secretPortals: [{ index: 2, secretId: "archive" }] },
    { name: "Apex Gate", briefing: "Defeat the gatekeeper.", length: 29, asteroids: [3, 8, 12, 16, 20, 24], walls: [6, 10, 14, 18, 22], enemies: [7, 15, 23], spikes: [9, 13, 21], gravity: [11, 19], powerups: [{ index: 5, kind: "shield" }, { index: 17, kind: "cannon" }], miniBosses: [14], boss: true, secret: true, secretId: "prestige-gate", secretPortals: [{ index: 2, secretId: "prestige-gate" }] },
    { name: "Celestial Sanctum", briefing: "Prove your ascension.", length: 29, asteroids: [3, 8, 12, 16, 20, 24, 27], walls: [6, 10, 14, 18, 22], enemies: [7, 15, 23], spikes: [9, 13, 21, 26], gravity: [11, 19], powerups: [{ index: 6, kind: "shield" }, { index: 18, kind: "cannon" }], secretId: "stellar-sanctum", specialAsteroids: [3, 8, 12, 16, 20, 24, 27], secret: true, prestige: true, miniBosses: [15], secretPortals: [{ index: 2, secretId: "stellar-sanctum" }] },
    { name: "Quantum Abyss", briefing: "Gather quantum shards.", length: 33, asteroids: [3, 9, 13, 17, 21, 25, 29, 32], walls: [6, 11, 15, 19, 23, 27, 31], enemies: [8, 18, 26], spikes: [7, 14, 22, 30], gravity: [12, 20, 28], powerups: [{ index: 7, kind: "rapid" }, { index: 19, kind: "boost" }, { index: 29, kind: "shield" }], secretId: "quantum-depths", specialAsteroids: [3, 9, 13, 17, 21, 25, 29, 32], secret: true, prestige: true, miniBosses: [15, 28], secretPortals: [{ index: 2, secretId: "quantum-depths" }] },
    { name: "Infinity Nexus", briefing: "Claim Infinity.", length: 36, asteroids: [4, 10, 14, 18, 22, 26, 30, 33, 35], walls: [7, 11, 15, 19, 23, 27, 31, 34], enemies: [9, 19, 29], spikes: [8, 15, 23, 31, 35], gravity: [13, 21, 29], powerups: [{ index: 8, kind: "cannon" }, { index: 20, kind: "shield" }, { index: 31, kind: "boost" }], secretId: "infinity-spiral", specialAsteroids: [4, 10, 14, 18, 22, 26, 30, 33, 35], secret: true, prestige: true, miniBosses: [17, 30], boss: true, secretPortals: [{ index: 2, secretId: "infinity-spiral" }] },
];

export function normalizeNonPrestigeLevels(levelList: Level[]) {
    levelList.forEach((level) => {
        if (level.prestige || level.customId || level.localOnly) return;
        delete level.secretKey;
        delete level.portals;
        const routeTiles = Array.from({ length: Math.max(0, level.length - 3) }, (_, index) => index + 2);
        const occupied = new Set<number>([
            ...level.asteroids,
            ...(level.portals ?? []),
            ...(level.powerups ?? []).map((powerup) => powerup.index),
            ...(level.miniBosses ?? []),
            ...level.walls,
            ...(level.blocks ?? []),
            ...level.enemies,
            ...level.spikes,
            ...level.gravity,
            ...(level.secretPortals ?? []).map((portal) => portal.index),
        ]);
        const addTiles = (target: number[], count: number) => {
            for (const index of routeTiles) {
                if (target.length >= count || occupied.has(index)) continue;
                target.push(index);
                occupied.add(index);
            }
            target.sort((first, second) => first - second);
        };
        addTiles(level.enemies, 2);
        if (level.walls.length + (level.blocks?.length ?? 0) < 2) addTiles(level.walls, 2);
        addTiles(level.spikes, 1);
        level.enemies = [...new Set(level.enemies)].filter((index) => index > 0 && index < level.length).sort((a, b) => a - b);
        level.walls = [...new Set(level.walls)].filter((index) => index > 0 && index < level.length).sort((a, b) => a - b);
        level.spikes = [...new Set(level.spikes)].filter((index) => index > 0 && index < level.length).sort((a, b) => a - b);
    });
}

export function normalizePrestigeLevels(levelList: Level[]) {
    const isUsableTile = (index: number, length: number) => Number.isInteger(index) && index >= 2 && index <= length - 3;
    const normalizeTiles = (tiles: number[], length: number) => [...new Set(tiles.filter((index) => isUsableTile(index, length)))].sort((a, b) => a - b);
    const paceRoute = (level: Level, route: Pick<Level, "walls" | "enemies" | "spikes" | "gravity" | "powerups">) => {
        route.walls = normalizeTiles(route.walls, level.length);
        route.enemies = normalizeTiles(route.enemies, level.length);
        route.spikes = normalizeTiles(route.spikes, level.length);
        route.gravity = normalizeTiles(route.gravity, level.length);
        const protectedTiles = new Set<number>([
            ...level.asteroids,
            ...(level.portals ?? []),
            ...(level.secretPortals ?? []).map((portal) => portal.index),
            ...(level.miniBosses ?? []),
            ...(route.powerups ?? []).map((powerup) => powerup.index),
        ]);
        const challengeTiles = () => new Set<number>([...route.walls, ...route.enemies, ...route.spikes, ...route.gravity]);
        const targets = [route.walls, route.enemies, route.spikes, route.gravity];
        const lastTile = level.length - 3;
        for (let start = 2; start <= lastTile; start += 5) {
            const end = Math.min(lastTile, start + 4);
            const challenges = challengeTiles();
            if ([...challenges].some((index) => index >= start && index <= end)) continue;
            const candidates = Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
                .filter((index) => !protectedTiles.has(index) && !challenges.has(index));
            const placement = candidates[Math.floor(candidates.length / 2)];
            if (placement === undefined) continue;
            const target = targets[Math.floor((start - 2) / 5) % targets.length];
            target.push(placement);
        }
        route.walls = normalizeTiles(route.walls, level.length);
        route.enemies = normalizeTiles(route.enemies, level.length);
        route.spikes = normalizeTiles(route.spikes, level.length);
        route.gravity = normalizeTiles(route.gravity, level.length);
    };

    levelList.forEach((level) => {
        if (!level.prestige) return;
        if (!level.customId && !level.localOnly) {
            delete level.portals;
            delete level.secretKey;
        }
        paceRoute(level, level);
        const flippedRoute = level.flippedRoute ?? {
            walls: [...level.walls],
            enemies: [...level.enemies],
            spikes: [...level.spikes],
            gravity: [...level.gravity],
            powerups: level.powerups?.map((powerup) => ({ ...powerup })),
            key: level.length - 3,
        };
        paceRoute(level, flippedRoute);
        flippedRoute.key = Math.max(2, Math.min(level.length - 3, flippedRoute.key ?? level.length - 3));
        level.flippedRoute = flippedRoute;
    });
}

export function refreshBuiltInLevelBriefings(levelList: Level[]) {
    levelList.forEach((level) => {
        if (level.customId || level.localOnly) return;
        const hazards = level.boss ? "defeat the guardian" : level.miniBosses?.length ? "clear the sentries" : "navigate the hazards";
        if (level.prestige && level.secret) {
            level.briefing = `Secret prestige route: flip through the upper lane, ${hazards}, and claim every special asteroid.`;
        } else if (level.prestige) {
            level.briefing = `Flipped Planet route: use gravity fields to reach the upper lane, recover its exit key, then ${hazards}.`;
        } else if (level.secret) {
            level.briefing = `Secret route: ${hazards}, collect the special asteroids, and secure the hidden beacon.`;
        } else {
            level.briefing = `Collect the asteroids, ${hazards}, and reach the beacon through the active route.`;
        }
    });
}

normalizeNonPrestigeLevels(levels);
normalizePrestigeLevels(levels);
refreshBuiltInLevelBriefings(levels);
