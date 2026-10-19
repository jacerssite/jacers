import type { FlippedRoute, Level, LevelMakerDraft, PowerupKind } from "./types";
import { levels } from "./levels";
import { apiRequest } from "./api";
import { createMenuButton, createTextButton } from "./ui";

type LevelMakerContext = {
    powerupLabels: Record<PowerupKind, string>;
    configurePortalDistribution: () => void;
    showLevelMenu: () => void;
    showTesterPanel: () => void;
    startPreview: (index: number, returnToEditor: () => void) => void;
};

export function levelToMakerDraft(level: Level): LevelMakerDraft {
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

export function createLevelMaker(context: LevelMakerContext) {
    const { powerupLabels, configurePortalDistribution, showLevelMenu, showTesterPanel, startPreview } = context;
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
        tiles.forEach((tile) => { const button = createTextButton(tileLabels[tile] ?? tile, () => { selectedTile = tile; deleteMode = false; modeLabel.textContent = "BUILD MODE"; buildMode.classList.add("selected"); eraseMode.classList.remove("selected"); palette.querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item.dataset.tile === tile)); }); button.dataset.tile = tile; button.classList.toggle("selected", tile === selectedTile); palette.append(button); });
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
        const normalTab = document.createElement("button"); normalTab.className = "maker-tool-button"; normalTab.type = "button"; normalTab.textContent = "Normal area"; normalTab.hidden = true;
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
        const updatePaletteForArea = () => {
            const inFlippedArea = !flippedGrid.hidden;
            const flippedTiles = new Set(["empty", "wall", "spike", "gravity", "enemy", "exitKey", ...Object.keys(powerupTileKinds)]);
            palette.querySelectorAll<HTMLButtonElement>("button[data-tile]").forEach((button) => {
                const tile = button.dataset.tile ?? "";
                button.disabled = inFlippedArea ? !flippedTiles.has(tile) : tile === "exitKey";
                if (button.disabled && selectedTile === tile) selectedTile = "wall";
            });
            palette.querySelectorAll<HTMLButtonElement>("button[data-tile]").forEach((button) => button.classList.toggle("selected", button.dataset.tile === selectedTile));
        };
        const showMainGrid = () => { grid.hidden = false; flippedGrid.hidden = true; normalTab.hidden = true; buildMode.textContent = "Build"; updatePaletteForArea(); };
        normalTab.addEventListener("click", showMainGrid);
        flippedTab.addEventListener("click", () => { grid.hidden = true; flippedGrid.hidden = false; normalTab.hidden = false; buildMode.textContent = "Flipped build"; updatePaletteForArea(); });
        const updateFlippedTab = () => {
            const canBuildFlippedArea = prestigeRouteInput.checked && cells.some((cell) => cell.dataset.kind === "gravity");
            flippedTab.hidden = !canBuildFlippedArea;
            areaState.textContent = prestigeRouteInput.checked ? (canBuildFlippedArea ? "PRESTIGE / main route + flipped route" : "PRESTIGE / place a gravity field to enable the flipped route") : "NORMAL / main route only";
            if (flippedTab.hidden) showMainGrid();
        };
        prestigeRouteInput.addEventListener("change", updateFlippedTab);
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
            startPreview(previewIndex, () => showLevelMaker(draftSnapshot));
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
        toolbar.append(areaState, normalTab, flippedTab);
        menu.append(details, toolbar, grid, flippedGrid, palette, playtest, save, saveStatus, createTextButton("Back to tester", () => showTesterPanel()));
        document.body.replaceChildren(menu);
    }


    return showLevelMaker;
}
