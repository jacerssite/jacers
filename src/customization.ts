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
        menu.innerHTML = `<p class="eyebrow">HANGAR / LOADOUT</p><h1>Build your <em>ship</em></h1><p class="menu-copy">Equip a skin, trail, and avatar. Every collection is grouped from Common through Legendary.</p>`;
        const layout = document.createElement("div"); layout.className = "customization-layout";
        const panel = document.createElement("section"); panel.className = "settings-panel customization-panel";
        
        // Planetary flip toggle for customization
        const flipToggleRow = document.createElement("label");
        flipToggleRow.className = "setting-row";
        const showFlip = localStorage.getItem("orbit-show-planetary-flip") === "1";
        flipToggleRow.innerHTML = `<span><b>Show prestige planetary flip</b><small>Preview prestige skins and trails. All normal and prestige avatars stay together below.</small></span>`;
        const flipToggle = document.createElement("input");
        flipToggle.type = "checkbox";
        flipToggle.checked = showFlip;
        flipToggle.addEventListener("change", () => { localStorage.setItem("orbit-show-planetary-flip", flipToggle.checked ? "1" : "0"); showCustomization(); });
        flipToggleRow.append(flipToggle);
        panel.append(flipToggleRow);
        
        const { shipColor: selectedShipColor, avatar: selectedAvatar, skin: selectedSkin, trail: selectedTrail } = getLoadout();
        const preview = createShipPreview();
        
        const rarityOrder: Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
        
        // Create arrays with original indices
        const skinsWithIndex = showFlip 
            ? skins.map((s, i) => ({ ...s, originalIndex: i })).filter(s => s.prestige)
            : skins.map((s, i) => ({ ...s, originalIndex: i })).filter(s => !s.prestige);
        const trailsWithIndex = showFlip
            ? trails.map((t, i) => ({ ...t, originalIndex: i })).filter(t => t.prestige)
            : trails.map((t, i) => ({ ...t, originalIndex: i })).filter(t => !t.prestige);
        // Keep the complete avatar catalog in one collection. Prestige avatars
        // can be won from the roulette wheel just like the normal collection,
        // so hiding them behind the planetary-flip preview made rewards look
        // missing even though they were already unlocked on the account.
        const avatarsWithIndex = avatars.map((a, i) => ({ ...a, originalIndex: i }));
        
        const appendRarityGroups = <T extends { name: string; required: number; secret?: boolean; boss?: boolean; prestige?: number; golden?: boolean; jackpot?: boolean }>(target: HTMLElement, title: string, collection: T[], gridClass: string, createChoice: (item: T, index: number, rarity: Rarity) => HTMLButtonElement) => {
            if (title) {
                const heading = document.createElement("p"); heading.className = "setting-title"; heading.textContent = title; target.append(heading);
            }
            const ordered = collection.map((item, index) => ({ item, index, rarity: getCosmeticRarity(item) })).sort((first, second) => rarityOrder.indexOf(first.rarity) - rarityOrder.indexOf(second.rarity) || first.item.name.localeCompare(second.item.name));
            rarityOrder.forEach((rarity) => {
                const groupItems = ordered.filter((entry) => entry.rarity === rarity);
                if (!groupItems.length) return;
                const group = document.createElement("section"); group.className = `rarity-group rarity-${rarity.toLowerCase()}`;
                group.innerHTML = `<h2>${rarity}</h2>`;
                const grid = document.createElement("div"); grid.className = gridClass;
                groupItems.forEach(({ item, index }) => grid.append(createChoice(item, index, rarity)));
                group.append(grid); target.append(group);
            });
        };
        const colorOptions = getShipColorOptions(STARTER_SHIP_COLORS, ROULETTE_SHIP_COLORS, skins);
        const appearance = document.createElement("section");
        appearance.className = "appearance-loadout-section";
        appearance.innerHTML = `<h2>Appearance</h2><p>Colors tint every ship body. Pair one with any unlocked skin to build your character.</p>`;
        appendRarityGroups(appearance, "Colors & skins", colorOptions, "color-grid", (option) => {
            const button = document.createElement("button");
            const unlocked = isShipColorUnlocked(option, skins, isSkinUnlocked, (index) => isSpinCosmeticUnlocked("color", index));
            const selected = selectedShipColor.toLowerCase() === option.color.toLowerCase();
            button.className = `ship-color-choice ${selected ? "selected" : ""}`;
            button.type = "button";
            button.disabled = !unlocked;
            button.title = unlocked ? `${option.name} / ${option.color}` : option.source === "roulette" ? "Unlock this color from the roulette wheel" : `Unlock the ${option.name} skin to use this color`;
            button.setAttribute("aria-label", `Ship color ${option.name}${unlocked ? "" : ", locked"}`);
            button.setAttribute("aria-pressed", String(selected));
            button.style.setProperty("--ship-color-choice", option.color);
            button.addEventListener("click", () => {
                setLoadout({ shipColor: option.color });
                showCustomization();
            });
            return button;
        });
        // Skin cards live in the same appearance section as colors. A selected
        // skin carries its canonical color, so there is one combined loadout
        // instead of two competing customization inventories.
        appendRarityGroups(appearance, "", skinsWithIndex, "customization-grid", (skin, _index, rarity) => {
            const button = document.createElement("button"); button.className = `loadout-choice ${selectedSkin === skin.originalIndex ? "selected" : ""}`; button.disabled = !isSkinUnlocked(skin, skin.originalIndex);
            const swatch = skin.image
                ? createShipArtMarkup(skin.image, `${skin.name} skin`, skin.color)
                : `<i class="skin-color-swatch" style="--skin-color:${skin.color}" aria-hidden="true"></i>`;
            button.innerHTML = `${swatch}<span>${skin.name}</span>${createRarityBadge(rarity)}`;
            button.addEventListener("click", () => {
                setLoadout({ skin: skin.originalIndex, shipColor: skin.color });
                showCustomization();
            }); return button;
        });
        panel.append(appearance);
        appendRarityGroups(panel, "Trails", trailsWithIndex, "customization-grid", (trail, _index, rarity) => {
            const button = document.createElement("button"); button.className = `loadout-choice ${selectedTrail === trail.originalIndex ? "selected" : ""}`; button.disabled = !isTrailUnlocked(trails[trail.originalIndex]);
            button.innerHTML = `<i class="loadout-trail-mark trail-effect-${trail.effect}" style="--trail-color:${trail.color}" aria-hidden="true"></i><span>${trail.name}</span>${createRarityBadge(rarity)}`;
            button.addEventListener("click", () => { setLoadout({ trail: trail.originalIndex }); showCustomization(); }); return button;
        });
        appendRarityGroups(panel, "Avatars", avatarsWithIndex, "avatar-grid", (avatar, _index, rarity) => {
            const unlocked = isAvatarUnlocked(avatars[avatar.originalIndex]);
            const button = document.createElement("button"); button.className = `avatar-option ${selectedAvatar === avatar.originalIndex ? "selected" : ""}`; button.disabled = !unlocked;
            button.innerHTML = `${avatar.cssArt ? createCssShipArtMarkup(avatar.cssArt, avatar.name, avatar.color) : avatar.image ? createShipArtMarkup(avatar.image, avatar.name, avatar.color) : `<i style="--avatar-color:${avatar.color}"></i>`}<span>${avatar.name}</span>${createRarityBadge(rarity)}<small>${unlocked ? "READY" : avatar.prestige ? `PRESTIGE ${avatar.prestige}` : avatar.golden ? "20 routes" : avatar.jackpot ? "JACKPOT" : "LOCKED"}</small>`;
            button.addEventListener("click", () => {
                const skin = skins[avatar.defaultSkin];
                setLoadout(isSkinUnlocked(skin, avatar.defaultSkin)
                    ? { avatar: avatar.originalIndex, skin: avatar.defaultSkin, shipColor: skin.color }
                    : { avatar: avatar.originalIndex });
                showCustomization();
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
        const particleElements = Array.from({ length: 5 }, (_, index) => {
            const particle = document.createElement("i");
            particle.className = `trail-particle trail-effect-${trail.effect} ${index === 0 ? "trail-head" : ""}`;
            particle.style.setProperty("--trail-delay", `${index * 60}ms`);
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
        details.textContent = `Color ${shipColor} / ${skin.name} skin / ${trail.name} trail`;
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
