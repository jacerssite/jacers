import type { FlippedRoute, Level, LevelMakerDraft, PowerupKind } from "./types";
import { levels } from "./levels";
import { apiRequest } from "./api";
import { createMenuButton, createTextButton } from "./ui";

type LevelMakerContext = {
    powerupLabels: Record<PowerupKind, string>;
    configurePortalDistribution: () => void;
    showLevelMenu: () => void;
    showTesterPanel: () => void;
    canEditBuiltInLevels?: () => boolean;
    saveBuiltInLevel?: (index: number, level: Level) => Promise<Level>;
    startPreview: (index: number, returnToEditor: () => void) => void;
};

export function levelToMakerDraft(level: Level, sourceLevelIndex?: number): LevelMakerDraft {
    const columns = Math.max(24, Math.min(100, level.length));
    const tiles = Array<string>(columns * 6).fill("empty");
    const flippedTiles = Array<string>(columns * 6).fill("empty");
    const place = (target: string[], index: number, kind: string) => {
        const column = index - 1;
        if (column < 0 || column >= columns) return;
        let row = 0;
        while (row < 6 && target[row * columns + column] !== "empty") row++;
        if (row < 6) target[row * columns + column] = kind;
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
    return { name: level.name, briefing: level.briefing, prestige: Boolean(level.prestige), prestigeRequirement: level.prestigeRequirement ?? 1, length: level.length, tiles, flippedTiles, customId: level.customId, sourceLevelIndex };
}

export function createLevelMaker(context: LevelMakerContext) {
    const { powerupLabels, configurePortalDistribution, showLevelMenu, showTesterPanel, canEditBuiltInLevels, saveBuiltInLevel, startPreview } = context;
    function showLevelMaker(draft?: LevelMakerDraft) {
        const menu = document.createElement("main"); menu.className = "menu-screen maker-screen";
        const editingBuiltIn = draft?.sourceLevelIndex !== undefined && !draft.customId;
        const sourceLevel = draft?.sourceLevelIndex !== undefined
            ? levels[draft.sourceLevelIndex]
            : draft?.customId ? levels.find((level) => level.customId === draft.customId) : undefined;
        const maxRouteLength = 100;
        let routeLength = Math.max(8, Math.min(maxRouteLength, draft?.length ?? sourceLevel?.length ?? 26));
        // Start with a compact grid, then grow the timeline when the author
        // extends the route so the initial editor stays easy to scan.
        let gridColumns = Math.max(24, routeLength);
        menu.innerHTML = `<p class="eyebrow">JACER WORKSHOP / LEVEL EDITOR</p><h1>${editingBuiltIn ? "Edit a" : "Build a"} <em>route</em></h1><p class="menu-copy">Playtest your draft before publishing. Built-in route edits are shared with every player after an authorized admin or owner saves them.</p>`;
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
        const lengthControl = document.createElement("section");
        lengthControl.className = "maker-length-control";
        const lengthHeading = document.createElement("b");
        lengthHeading.textContent = "Timeline length";
        const lengthCopy = document.createElement("span");
        lengthCopy.textContent = "Scroll the timeline with your mouse wheel. Extend the route to make room for more columns.";
        const lengthInputs = document.createElement("div");
        lengthInputs.className = "maker-length-inputs";
        const lengthRange = document.createElement("input");
        lengthRange.type = "range";
        lengthRange.min = "8";
        lengthRange.max = String(maxRouteLength);
        lengthRange.step = "1";
        lengthRange.value = String(routeLength);
        lengthRange.setAttribute("aria-label", "Timeline length");
        const lengthNumber = document.createElement("input");
        lengthNumber.type = "number";
        lengthNumber.min = "8";
        lengthNumber.max = String(maxRouteLength);
        lengthNumber.step = "1";
        lengthNumber.value = String(routeLength);
        lengthNumber.setAttribute("aria-label", "Timeline length in columns");
        const lengthValue = document.createElement("output");
        lengthValue.className = "maker-length-value";
        lengthValue.textContent = `${routeLength} columns`;
        lengthInputs.append(lengthRange, lengthNumber, lengthValue);
        lengthControl.append(lengthHeading, lengthCopy, lengthInputs);
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
        if (canEditBuiltInLevels?.()) {
            const builtInLevels = levels.map((level, index) => ({ level, index })).filter(({ level }) => !level.customId && !level.localOnly);
            if (builtInLevels.length) {
                const editSection = document.createElement("section");
                editSection.className = "maker-existing-levels maker-built-in-levels";
                const heading = document.createElement("p");
                heading.className = "setting-title";
                heading.textContent = "Edit a built-in route";
                editSection.append(heading);
                const groups = new Map<string, HTMLElement>();
                builtInLevels.forEach(({ level, index }) => {
                    const groupName = level.secret ? "Secret routes" : level.prestige ? "Prestige routes" : "Normal routes";
                    let group = groups.get(groupName);
                    if (!group) {
                        group = document.createElement("div");
                        group.className = "maker-level-edit-group";
                        const label = document.createElement("b");
                        label.textContent = groupName;
                        group.append(label);
                        groups.set(groupName, group);
                        editSection.append(group);
                    }
                    const editButton = createTextButton(`Edit ${level.name}`, () => showLevelMaker(levelToMakerDraft(level, index)));
                    editButton.classList.add("maker-level-edit-button");
                    group.append(editButton);
                });
                menu.append(editSection);
            }
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
        const prestigeRequirementLabel = document.createElement("label");
        prestigeRequirementLabel.className = "maker-mode-label maker-prestige-requirement";
        prestigeRequirementLabel.append(document.createTextNode("Prestige needed"));
        const prestigeRequirementInput = document.createElement("input");
        prestigeRequirementInput.type = "number";
        prestigeRequirementInput.min = "1";
        prestigeRequirementInput.max = "100";
        prestigeRequirementInput.step = "1";
        prestigeRequirementInput.value = String(draft?.prestigeRequirement ?? sourceLevel?.prestigeRequirement ?? 1);
        prestigeRequirementInput.setAttribute("aria-label", "Prestige needed");
        prestigeRequirementLabel.append(prestigeRequirementInput);
        prestigeRequirementLabel.hidden = !prestigeRouteInput.checked;
        toolbar.append(prestigeRequirementLabel);
        const areaState = document.createElement("span"); areaState.className = "maker-area-state";
        const palette = document.createElement("nav"); palette.className = "maker-palette";
        const paletteHint = document.createElement("p");
        paletteHint.className = "maker-palette-hint";
        paletteHint.textContent = "Empty base plate — add only the platforms, hazards, enemies, collectibles, and power-ups you want.";
        palette.append(paletteHint);
        const tiles = ["empty", "wall", "block", "spike", "gravity", "portal", "asteroid", "special", "enemy", "miniBoss", "titan", "exitKey", "powerupShield", "powerupBoost", "powerupRapid", "powerupCannon", "powerupStar"];
        const powerupTileKinds: Record<string, PowerupKind> = { powerupShield: "shield", powerupBoost: "boost", powerupRapid: "rapid", powerupCannon: "cannon", powerupStar: "star" };
        const makerCellClass = (kind: string) => `maker-cell ${kind}${powerupTileKinds[kind] ? ` powerup ${powerupTileKinds[kind]}` : ""}`;
        let selectedTile = "empty";
        let deleteMode = false;
        const history: { tiles: string[]; flippedTiles: string[] }[] = [];
        const tileLabels: Record<string, string> = { empty: "Erase", wall: "Platform", block: "Block", miniBoss: "Dark Knight", titan: "Titan", special: "Special asteroid", exitKey: "Exit key" };
        tileLabels.powerupShield = "Shield power-up"; tileLabels.powerupBoost = "Boost power-up"; tileLabels.powerupRapid = "Rapid power-up"; tileLabels.powerupCannon = "Cannon power-up"; tileLabels.powerupStar = "Rainbow Star";
        const tileIcons: Record<string, string> = {
            empty: "\u232b", wall: "\u25ac", block: "\u25c6", spike: "\u25b2", gravity: "\u2195", portal: "\u25c9",
            asteroid: "\u2726", special: "\u2739", enemy: "\u2620", miniBoss: "\u265e", titan: "\u265b", exitKey: "\u26bf",
            powerupShield: "\u25c7", powerupBoost: "\u00bb", powerupRapid: "\u26a1", powerupCannon: "\u2736", powerupStar: "\u2605",
        };
        const tileGroups: Record<string, string> = {
            empty: "Base", wall: "Obstacles", block: "Obstacles", spike: "Obstacles", gravity: "Obstacles", portal: "Obstacles",
            asteroid: "Collectibles", special: "Collectibles", enemy: "Enemies", miniBoss: "Enemies", titan: "Enemies", exitKey: "Collectibles",
            powerupShield: "Power-ups", powerupBoost: "Power-ups", powerupRapid: "Power-ups", powerupCannon: "Power-ups", powerupStar: "Power-ups",
        };
        let activeGroup = "";
        let group: HTMLElement | null = null;
        tiles.forEach((tile) => {
            const label = tileLabels[tile] ?? tile;
            const groupName = tileGroups[tile] ?? "Objects";
            if (groupName !== activeGroup) {
                activeGroup = groupName;
                group = document.createElement("div");
                group.className = "maker-palette-group";
                const groupTitle = document.createElement("span");
                groupTitle.className = "maker-palette-group-title";
                groupTitle.textContent = groupName;
                group.append(groupTitle);
                palette.append(group);
            }
            const button = createTextButton(label, () => {
                selectedTile = tile;
                deleteMode = false;
                modeLabel.textContent = "BUILD MODE";
                buildMode.classList.add("selected");
                eraseMode.classList.remove("selected");
                palette.querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item.dataset.tile === tile));
            });
            button.dataset.tile = tile;
            button.classList.add("maker-palette-button", `maker-palette-${tile.toLowerCase()}`);
            button.classList.toggle("selected", tile === selectedTile);
            button.title = label;
            button.setAttribute("aria-label", `Select ${label} tool`);
            const icon = document.createElement("span");
            icon.className = "maker-palette-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.dataset.icon = tileIcons[tile] ?? tile.slice(0, 1).toUpperCase();
            const text = document.createElement("span");
            text.className = "maker-palette-label";
            text.textContent = label;
            button.replaceChildren(icon, text);
            group?.append(button);
        });
        const createCells = (target: HTMLElement, initial: string[] = [], prefix: string) => Array.from({ length: gridColumns * 6 }, (_, index) => {
            const cell = document.createElement("button");
            cell.type = "button";
            const initialKind = initial[index] ?? "empty";
            cell.className = makerCellClass(initialKind);
            cell.dataset.kind = initialKind;
            cell.textContent = initialKind === "gravity" ? "" : initialKind === "exitKey" ? "K" : powerupTileKinds[initialKind] ? powerupLabels[powerupTileKinds[initialKind]].slice(0, 1) : "";
            const column = index % gridColumns + 1;
            cell.disabled = column > routeLength - 2;
            if (cell.disabled) cell.classList.add("maker-cell-disabled");
            cell.setAttribute("aria-label", `${prefix} tile ${index + 1}`);
            cell.addEventListener("click", () => {
                if (cell.disabled) return;
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
        grid.style.gridTemplateColumns = `repeat(${gridColumns}, minmax(28px, 1fr))`;
        flippedGrid.style.gridTemplateColumns = `repeat(${gridColumns}, minmax(28px, 1fr))`;
        const gridViewport = document.createElement("div");
        gridViewport.className = "maker-grid-viewport";
        gridViewport.setAttribute("aria-label", "Scrollable level timeline");
        const ruler = document.createElement("div");
        ruler.className = "maker-grid-ruler";
        const renderRuler = () => {
            ruler.replaceChildren();
            ruler.style.gridTemplateColumns = `repeat(${gridColumns}, minmax(28px, 1fr))`;
            for (let column = 1; column <= gridColumns; column++) {
                const marker = document.createElement("span");
                marker.textContent = column === 1 || column % 5 === 0 ? String(column) : "";
                ruler.append(marker);
            }
        };
        renderRuler();
        gridViewport.addEventListener("wheel", (event) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.preventDefault();
            gridViewport.scrollLeft += event.deltaY;
        }, { passive: false });
        let cells: HTMLButtonElement[] = [];
        let flippedCells: HTMLButtonElement[] = [];
        cells = createCells(grid, draft?.tiles, "Normal");
        flippedCells = createCells(flippedGrid, draft?.flippedTiles, "Flipped");
        gridViewport.append(ruler, grid, flippedGrid);
        const updateRouteLength = (nextLength: number) => {
            routeLength = Math.max(8, Math.min(maxRouteLength, Math.round(nextLength)));
            if (routeLength > gridColumns) {
                const normalValues = cells.map((cell) => cell.dataset.kind ?? "empty");
                const flippedValues = flippedCells.map((cell) => cell.dataset.kind ?? "empty");
                gridColumns = routeLength;
                grid.style.gridTemplateColumns = `repeat(${gridColumns}, minmax(28px, 1fr))`;
                flippedGrid.style.gridTemplateColumns = `repeat(${gridColumns}, minmax(28px, 1fr))`;
                renderRuler();
                grid.replaceChildren();
                flippedGrid.replaceChildren();
                cells = createCells(grid, normalValues, "Normal");
                flippedCells = createCells(flippedGrid, flippedValues, "Flipped");
            }
            lengthRange.value = String(routeLength);
            lengthNumber.value = String(routeLength);
            lengthValue.textContent = `${routeLength} columns`;
            [...cells, ...flippedCells].forEach((cell, index) => {
                const column = index % gridColumns + 1;
                const disabled = column > routeLength - 2;
                cell.disabled = disabled;
                cell.classList.toggle("maker-cell-disabled", disabled);
                if (disabled) {
                    cell.dataset.kind = "empty";
                    cell.className = makerCellClass("empty");
                    cell.classList.add("maker-cell-disabled");
                    cell.textContent = "";
                }
            });
        };
        lengthRange.addEventListener("input", () => updateRouteLength(Number(lengthRange.value)));
        lengthNumber.addEventListener("change", () => updateRouteLength(Number(lengthNumber.value)));
        lengthNumber.addEventListener("input", () => {
            if (lengthNumber.value) updateRouteLength(Number(lengthNumber.value));
        });
        const applyCellData = (collection: HTMLButtonElement[], values: string[]) => collection.forEach((cell, index) => {
            const kind = values[index] ?? "empty";
            cell.dataset.kind = kind;
            cell.className = makerCellClass(kind);
            cell.textContent = kind === "empty" || kind === "gravity" ? "" : kind === "exitKey" ? "K" : powerupTileKinds[kind] ? powerupLabels[powerupTileKinds[kind]].slice(0, 1) : "";
            const disabled = index % gridColumns + 1 > routeLength - 2;
            cell.disabled = disabled;
            if (disabled) cell.classList.add("maker-cell-disabled");
        });
        const currentDraft = (): LevelMakerDraft => ({
            name: nameInput.value,
            briefing: briefingInput.value,
            prestige: prestigeRouteInput.checked,
            prestigeRequirement: Number(prestigeRequirementInput.value) || 1,
            tiles: cells.map((cell) => cell.dataset.kind ?? "empty"),
            flippedTiles: flippedCells.map((cell) => cell.dataset.kind ?? "empty"),
            length: routeLength,
            customId: draft?.customId,
            sourceLevelIndex: draft?.sourceLevelIndex,
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
            prestigeRequirementLabel.hidden = !prestigeRouteInput.checked;
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
            const level: Level = sourceLevel ? structuredClone(sourceLevel) : { name, briefing, length: routeLength, asteroids: [], walls: [], blocks: [], enemies: [], spikes: [], gravity: [], portals: [], specialAsteroids: [], miniBosses: [], powerups: [], prestige: prestigeRouteInput.checked, customId: draft?.customId };
            level.name = name;
            level.briefing = briefing;
            level.length = routeLength;
            level.prestige = prestigeRouteInput.checked;
            level.prestigeRequirement = prestigeRouteInput.checked ? Math.max(1, Math.min(100, Math.round(Number(prestigeRequirementInput.value) || 1))) : undefined;
            level.customId = draft?.customId;
            level.localOnly = sourceLevel?.localOnly;
            level.asteroids = [];
            level.walls = [];
            level.blocks = [];
            level.enemies = [];
            level.spikes = [];
            level.gravity = [];
            level.portals = [];
            level.specialAsteroids = [];
            level.miniBosses = [];
            level.powerups = [];
            // Some published routes use the default end-of-route boss and have no
            // explicit titan tile. Keep that metadata while still allowing an
            // explicit titan tile to define a custom boss position.
            // Built-in routes may intentionally use their default end boss,
            // but a workshop route should stay empty unless the author adds a
            // Titan tile. This lets an edited custom route remove its boss.
            level.boss = Boolean(editingBuiltIn && sourceLevel?.boss && sourceLevel.bossIndex === undefined);
            delete level.bossIndex;
            delete level.flippedRoute;
            level.flip = level.prestige ? [] : undefined;
            const addTile = (target: number[], index: number) => { if (!target.includes(index)) target.push(index); };
            cells.forEach((cell, cellIndex) => {
                const tile = cell.dataset.kind ?? "empty";
                const column = cellIndex % gridColumns + 1;
                if (tile === "asteroid" || tile === "special") addTile(level.asteroids, column);
                if (tile === "special") addTile(level.specialAsteroids!, column);
                if (tile === "wall") addTile(level.walls, column);
                if (tile === "block") addTile(level.blocks!, column);
                if (tile === "enemy") addTile(level.enemies, column);
                if (tile === "spike") addTile(level.spikes, column);
                if (tile === "gravity") addTile(level.gravity, column);
                if (tile === "gravity" && level.flip) addTile(level.flip, column);
                if (tile === "portal") addTile(level.portals!, column);
                if (tile === "miniBoss") addTile(level.miniBosses!, column);
                if (tile === "titan") { level.boss = true; level.bossIndex = column; }
                if (powerupTileKinds[tile] && !level.powerups!.some((powerup) => powerup.index === column)) level.powerups!.push({ index: column, kind: powerupTileKinds[tile] });
            });
            if (level.prestige && level.gravity.length) {
                const route: FlippedRoute = { walls: [], enemies: [], spikes: [], gravity: [], powerups: [], key: Math.min(routeLength - 2, Math.max(1, sourceLevel?.flippedRoute?.key ?? 23)) };
                flippedCells.forEach((cell, cellIndex) => {
                    const tile = cell.dataset.kind ?? "empty";
                    const column = cellIndex % gridColumns + 1;
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
            // A playtest is an exact preview of the editor grid. Do not carry
            // hidden portal/boss metadata from a built-in source route into it.
            const previewLevel = structuredClone(level);
            delete previewLevel.secretPortals;
            delete previewLevel.secretKey;
            delete previewLevel.secretId;
            delete previewLevel.secret;
            if (previewLevel.bossIndex === undefined) previewLevel.boss = false;
            const previewIndex = levels.push(previewLevel) - 1;
            startPreview(previewIndex, () => showLevelMaker(draftSnapshot));
        });
        const save = createMenuButton(editingBuiltIn ? "Save built-in changes" : draft?.customId ? "Save level changes" : "Publish shared level", async () => {
            const level = collectLevel();
            if (!level) return;
            save.disabled = true;
            saveStatus.textContent = editingBuiltIn ? "Saving built-in route..." : draft?.customId ? "Saving workshop changes..." : "Publishing workshop level...";
            if (editingBuiltIn) {
                if (!saveBuiltInLevel || draft?.sourceLevelIndex === undefined) {
                    saveStatus.textContent = "Built-in route editing is unavailable in this session.";
                    save.disabled = false;
                    return;
                }
                try {
                    await saveBuiltInLevel(draft.sourceLevelIndex, level);
                    configurePortalDistribution();
                    showLevelMenu();
                } catch (error) {
                    saveStatus.textContent = error instanceof Error ? error.message : "Could not save the built-in route.";
                    save.disabled = false;
                }
                return;
            }
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
        menu.append(details, lengthControl, toolbar, gridViewport, palette, playtest, save, saveStatus, createTextButton("Back to control center", () => showTesterPanel()));
        document.body.replaceChildren(menu);
    }


    return showLevelMaker;
}
