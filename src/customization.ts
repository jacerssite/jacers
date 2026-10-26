import type { AvatarStyle, CosmeticGroup, Rarity, TrailStyle } from "./types";
import { avatars, createRarityBadge, getCosmeticRarity, ROULETTE_SHIP_COLORS, skins, STARTER_SHIP_COLORS, trails } from "./cosmetics";
import { createCssShipArtMarkup, createShipArtMarkup } from "./ship-art";
import { drawTrailParticles } from "./trail";
import { createTextButton } from "./ui";
import { getShipColorOptions, isShipColorUnlocked } from "./appearance";

type ShipLoadout = { shipColor: string; avatar: number; skin: number; trail: number };
type CustomizationContext = {
    getLoadout: () => ShipLoadout;
    setLoadout: (changes: Partial<ShipLoadout>) => void;
    isSkinUnlocked: (skin: typeof skins[number], index?: number) => boolean;
    isTrailUnlocked: (trail: TrailStyle) => boolean;
    isAvatarUnlocked: (avatar: AvatarStyle) => boolean;
    isSpinCosmeticUnlocked: (group: CosmeticGroup, index: number) => boolean;
    showMenu: () => void;
    createPageCounter: () => HTMLElement;
};

export function createCustomization(context: CustomizationContext) {
    const { getLoadout, setLoadout, isSkinUnlocked, isTrailUnlocked, isAvatarUnlocked, isSpinCosmeticUnlocked, showMenu, createPageCounter } = context;

    function showCustomization() {
        const menu = document.createElement("main");
        menu.className = "menu-screen customization-screen";
        menu.innerHTML = `<p class="eyebrow">HANGAR / LOADOUT</p><h1>Build your <em>ship</em></h1><p class="menu-copy">Choose a ship color, trail, and avatar. Every collection is grouped from Common through Legendary.</p>`;
        const layout = document.createElement("div"); layout.className = "customization-layout";
        const panel = document.createElement("section"); panel.className = "settings-panel customization-panel";
        
        const { shipColor: selectedShipColor, avatar: selectedAvatar, trail: selectedTrail } = getLoadout();
        let preview = createShipPreview();
        const refreshCustomization = () => {
            const loadout = getLoadout();
            panel.querySelectorAll<HTMLButtonElement>(".ship-color-choice").forEach((button) => {
                const selected = loadout.shipColor.toLowerCase() === (button.dataset.color ?? "").toLowerCase();
                button.classList.toggle("selected", selected);
                button.setAttribute("aria-pressed", String(selected));
            });
            panel.querySelectorAll<HTMLButtonElement>(".cosmetic-card-choice[data-trail-index]").forEach((button) => {
                button.classList.toggle("selected", Number(button.dataset.trailIndex) === loadout.trail);
            });
            panel.querySelectorAll<HTMLButtonElement>(".cosmetic-card-choice[data-avatar-index]").forEach((button) => {
                button.classList.toggle("selected", Number(button.dataset.avatarIndex) === loadout.avatar);
            });
            const nextPreview = createShipPreview(loadout);
            layout.replaceChild(nextPreview, preview);
            preview = nextPreview;
        };
        
        const rarityOrder: Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
        
        // Create arrays with original indices. Skins are represented by the
        // color swatches above; they are intentionally not shown as a second
        // selectable collection.
        const trailsWithIndex = trails.map((t, i) => ({ ...t, originalIndex: i }));
        // Keep the complete avatar catalog in one collection. Prestige avatars
        // can be won from the roulette wheel just like the normal collection,
        // so hiding them behind the planetary-flip preview made rewards look
        // missing even though they were already unlocked on the account.
        const avatarsWithIndex = avatars.map((a, i) => ({ ...a, originalIndex: i }));
        
        const appendRarityGroups = <T extends { name: string; required: number; secret?: boolean; boss?: boolean; prestige?: number; golden?: boolean; jackpot?: boolean }>(target: HTMLElement, title: string, collection: T[], gridClass: string, createChoice: (item: T, index: number, rarity: Rarity) => HTMLButtonElement) => {
            const group = document.createElement("details");
            group.className = "cosmetic-group-section cosmetic-dropdown";
            group.open = title === "Appearance";
            if (title) {
                const heading = document.createElement("summary");
                heading.className = "cosmetic-dropdown-summary";
                heading.textContent = title;
                group.append(heading);
            }
            const ordered = collection.map((item, index) => ({ item, index, rarity: getCosmeticRarity(item) })).sort((first, second) => rarityOrder.indexOf(first.rarity) - rarityOrder.indexOf(second.rarity) || first.item.name.localeCompare(second.item.name));
            const grid = document.createElement("div"); grid.className = gridClass;
            ordered.forEach(({ item, index, rarity }) => grid.append(createChoice(item, index, rarity)));
            group.append(grid);
            target.append(group);
        };
        const colorOptions = getShipColorOptions(STARTER_SHIP_COLORS, ROULETTE_SHIP_COLORS, skins);
        const appearance = document.createElement("details");
        appearance.className = "appearance-loadout-section cosmetic-dropdown";
        appearance.open = true;
        appearance.innerHTML = `<summary class="cosmetic-dropdown-summary">Appearance</summary><p>Choose your ship color. Colors are grouped by rarity; locked colors are dimmed and marked with a lock.</p>`;
        const appendColorGroups = () => {
            const grouped = new Map<Rarity, typeof colorOptions>();
            rarityOrder.forEach((rarity) => grouped.set(rarity, []));
            colorOptions.forEach((option) => grouped.get(getCosmeticRarity(option))!.push(option));
            grouped.forEach((options, rarity) => {
                if (!options.length) return;
                const heading = document.createElement("p"); heading.className = "setting-title appearance-group-title"; heading.textContent = rarity;
                const grid = document.createElement("div"); grid.className = "color-grid";
                options.forEach((option) => grid.append(createColorChoice(option)));
                appearance.append(heading, grid);
            });
        };
        const createColorChoice = (option: (typeof colorOptions)[number]) => {
            const button = document.createElement("button");
            const unlocked = isShipColorUnlocked(option, skins, isSkinUnlocked, (index) => isSpinCosmeticUnlocked("color", index));
            const selected = selectedShipColor.toLowerCase() === option.color.toLowerCase();
            button.className = `ship-color-choice ${selected ? "selected" : ""}${unlocked ? "" : " is-locked"}`;
            button.type = "button";
            button.disabled = !unlocked;
            button.dataset.color = option.color;
            button.title = unlocked ? `${option.name} / ${option.color}` : option.source === "roulette" ? "Unlock this color from the roulette wheel" : `Unlock the ${option.name} skin to use this color`;
            button.setAttribute("aria-label", `Ship color ${option.name}${unlocked ? "" : ", locked"}`);
            button.setAttribute("aria-pressed", String(selected));
            button.style.setProperty("--ship-color-choice", option.color);
            button.addEventListener("click", () => {
                setLoadout({ shipColor: option.color });
                refreshCustomization();
            });
            return button;
        };
        appendColorGroups();
        panel.append(appearance);
        // Keep trails and avatars grouped into compact cards. Skins only define
        // unlockable colors now and are not presented as a separate list.
        appendRarityGroups(panel, "Trails", trailsWithIndex, "cosmetic-card-grid", (trail, _index, rarity) => {
            const unlocked = isTrailUnlocked(trails[trail.originalIndex]);
            const button = document.createElement("button"); button.className = `cosmetic-card-choice ${selectedTrail === trail.originalIndex ? "selected" : ""}${unlocked ? "" : " is-locked"}`; button.disabled = !unlocked; button.dataset.trailIndex = String(trail.originalIndex);
            const icon = document.createElement("span");
            icon.className = `cosmetic-icon trail-choice-icon trail-effect-${trail.effect}${trail.secondaryColor ? " trail-duotone" : ""}`;
            icon.style.setProperty("--trail-icon-color", trail.color);
            if (trail.secondaryColor) icon.style.setProperty("--trail-secondary-color", trail.secondaryColor);
            icon.setAttribute("aria-hidden", "true");
            const label = document.createElement("span"); label.textContent = trail.name;
            button.append(icon, label);
            button.insertAdjacentHTML("beforeend", createRarityBadge(rarity));
            const status = document.createElement("small");
            status.textContent = unlocked ? "READY" : trail.prestige ? `PRESTIGE ${trail.prestige}` : trail.golden ? "20 ROUTES" : trail.jackpot ? "JACKPOT" : trail.secret ? "SECRET" : trail.boss ? "BOSS" : `${trail.required} ASTEROIDS`;
            button.append(status);
            button.addEventListener("click", () => { setLoadout({ trail: trail.originalIndex }); refreshCustomization(); }); return button;
        });
        appendRarityGroups(panel, "Avatars", avatarsWithIndex, "cosmetic-card-grid", (avatar, _index, rarity) => {
            const unlocked = isAvatarUnlocked(avatars[avatar.originalIndex]);
            const button = document.createElement("button"); button.className = `cosmetic-card-choice ${selectedAvatar === avatar.originalIndex ? "selected" : ""}`; button.disabled = !unlocked; button.dataset.avatarIndex = String(avatar.originalIndex);
            const icon = document.createElement("span");
            icon.className = "cosmetic-icon avatar-choice-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.innerHTML = avatar.cssArt
                ? createCssShipArtMarkup(avatar.cssArt, avatar.name, avatar.color)
                : avatar.image
                    ? createShipArtMarkup(avatar.image, avatar.name, avatar.color)
                    : `<span class="avatar-choice-shape avatar-shape-${avatar.shape}" style="--avatar-choice-color:${avatar.color}"></span>`;
            const label = document.createElement("span"); label.textContent = avatar.name;
            button.append(icon, label);
            button.insertAdjacentHTML("beforeend", createRarityBadge(rarity));
            const status = document.createElement("small");
            status.textContent = unlocked ? "READY" : avatar.prestige ? `PRESTIGE ${avatar.prestige}` : avatar.golden ? "20 routes" : avatar.jackpot ? "JACKPOT" : "LOCKED";
            button.append(status);
            button.addEventListener("click", () => {
                const skin = skins[avatar.defaultSkin];
                setLoadout(isSkinUnlocked(skin, avatar.defaultSkin)
                    ? { avatar: avatar.originalIndex, skin: avatar.defaultSkin, shipColor: skin.color }
                    : { avatar: avatar.originalIndex });
                refreshCustomization();
            }); return button;
        });
        layout.append(panel, preview);
        menu.append(layout, createTextButton("Back", showMenu), createPageCounter()); document.body.replaceChildren(menu);
    }

    function createShipPreview(loadout = getLoadout()) {
        const avatar = avatars[loadout.avatar] ?? avatars[0];
        const skin = skins[loadout.skin] ?? skins[0];
        const trail = trails[loadout.trail] ?? trails[0];
        const shipColor = /^#[0-9a-f]{6}$/i.test(loadout.shipColor) ? loadout.shipColor : skins[0].color;
        const art = avatar.image ?? skin.image;
        const preview = document.createElement("aside");
        preview.className = "ship-preview";
        const heading = document.createElement("p");
        heading.className = "setting-title";
        heading.textContent = "Current character";
        const stage = document.createElement("div");
        stage.className = "preview-stage";
        const scene = document.createElement("div");
        scene.className = "trail-preview-scene";
        scene.style.setProperty("--trail-color", trail.color);
        if (trail.secondaryColor) scene.style.setProperty("--trail-secondary-color", trail.secondaryColor);
        const particleElements = Array.from({ length: 5 }, (_, index) => {
            const particle = document.createElement("i");
            particle.className = `trail-particle trail-effect-${trail.effect}${trail.secondaryColor ? " trail-duotone" : ""} ${index === 0 ? "trail-head" : ""}`;
            particle.style.setProperty("--trail-delay", `${index * 60}ms`);
            if (trail.secondaryColor) particle.style.setProperty("--trail-secondary-color", trail.secondaryColor);
            scene.append(particle);
            return particle;
        });
        const ship = document.createElement("div");
        ship.className = "trail-preview-ship";
        ship.innerHTML = avatar.cssArt
            ? createCssShipArtMarkup(avatar.cssArt, avatar.name, shipColor)
            : art
                ? createShipArtMarkup(art, avatar.name, shipColor)
                : `<div class="preview-ship ship-${skin.shape}" style="--ship-color:${shipColor}"><span></span><i></i></div>`;
        scene.append(ship);
        stage.append(scene);
        const name = document.createElement("b");
        name.textContent = avatar.name;
        const details = document.createElement("small");
        details.textContent = `Color ${shipColor} / ${trail.name} trail`;
        preview.append(heading, stage, name, details);
        let animationStart = 0;
        let lastSampleAt = 0;
        let previewPositions: { x: number; y: number }[] = [];
        const animate = (timestamp: number) => {
            if (!scene.isConnected) return;
            if (!animationStart) animationStart = timestamp;
            const elapsed = timestamp - animationStart;
            const angle = (elapsed / 2600) * Math.PI * 2;
            const anchor = { x: 116 + Math.cos(angle) * 48, y: 32 + Math.sin(angle) * 13 };
            if (!lastSampleAt || timestamp - lastSampleAt >= 1000 / 30) {
                previewPositions.unshift(anchor);
                previewPositions = previewPositions.slice(0, 24);
                lastSampleAt = timestamp;
            }
            const direction = previewPositions.length > 1 && anchor.x < previewPositions[1].x ? -1 : 1;
            drawTrailParticles(particleElements, previewPositions, anchor, direction, false);
            ship.style.transform = `translate(${anchor.x - 24}px, ${anchor.y - 18}px)`;
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
        return preview;
    }


    return { showCustomization, createShipPreview };
}
