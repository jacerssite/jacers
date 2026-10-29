import dartShipImage from "./assets/ships/dart.svg";
import ufoShipImage from "./assets/ships/ufo.svg";
import swordShipImage from "./assets/ships/sword.svg";
import jackpotCrownImage from "./assets/ships/jackpot-crown.svg";
import goldenCrownImage from "./assets/ships/golden-crown.svg";
import prestigeCometImage from "./assets/ships/prestige-comet.png";
import prestigeHaloImage from "./assets/ships/prestige-halo.png";
import prestigeNovaImage from "./assets/ships/prestige-nova.png";

import type { AvatarStyle, Rarity, SkinStyle, TrailStyle } from "./types";

export const STARTER_SHIP_COLORS = ["#58c9aa", "#f3b955", "#e85d75", "#aa83e8", "#45aee2", "#e85a9a", "#e9e6c9", "#78c96a"];
export const ROULETTE_SHIP_COLORS = ["#c93d6f", "#b1df4d", "#ff873d", "#735de0", "#38c9bb"];
export const skins: SkinStyle[] = [
    // Each skin owns a unique swatch, so a color cannot unlock through an
    // unrelated skin in a different rarity tier.
    { name: "Solar", color: "#ff7043", shape: "classic", required: 0 },
    { name: "Mint Dart", color: "#20b894", shape: "dart", required: 3, image: dartShipImage },
    { name: "Gold UFO", color: "#e8b23c", shape: "ring", required: 7, image: ufoShipImage },
    { name: "Plasma Sword", color: "#a86de0", shape: "blade", required: 12, image: swordShipImage },
    { name: "Aurora", color: "#258dcc", shape: "classic", required: 18 },
    { name: "Titan Core", color: "#c92f48", shape: "ring", required: 24, boss: true },
    { name: "Eclipse", color: "#c64ac9", shape: "blade", required: 0, secret: true },
    { name: "Ion Glass", color: "#47c7d9", shape: "dart", required: 30 },
    { name: "Rose Prism", color: "#d95691", shape: "ring", required: 38 },
    { name: "Void Flame", color: "#5544ad", shape: "blade", required: 46, boss: true },
    { name: "Comet Copper", color: "#b96c3d", shape: "dart", required: 86 },
    { name: "Prism Ice", color: "#8fd7e4", shape: "ring", required: 98 },
    { name: "Starforge", color: "#b7b85a", shape: "classic", required: 54 },
    { name: "Solar Flare", color: "#f08b25", shape: "blade", required: 62 },
    { name: "Moon Silver", color: "#9fb9c8", shape: "ring", required: 70 },
    { name: "Horizon Pink", color: "#ed3e87", shape: "dart", required: 78 },
    { name: "Vault Prism", color: "#7d57cf", shape: "blade", required: 0, secret: true },
    { name: "Golden Body", color: "#f4c430", shape: "classic", required: 0, golden: true },
    // Prestige-exclusive skins from special rolls
    { name: "Stellar Crown", color: "#ffcc33", shape: "classic", required: 0, prestige: 1 },
    { name: "Nebula Dancer", color: "#b24bff", shape: "dart", required: 0, prestige: 1 },
    { name: "Quantum Ring", color: "#00ffcc", shape: "ring", required: 0, prestige: 1 },
    { name: "Void Edge", color: "#ff0099", shape: "blade", required: 0, prestige: 2 },
    { name: "Cosmic Pearl", color: "#e0e0e0", shape: "classic", required: 0, prestige: 2 },
    { name: "Eclipse Dancer", color: "#9933ff", shape: "dart", required: 0, prestige: 2 },
    { name: "Infinity Gate", color: "#00ff66", shape: "ring", required: 0, prestige: 3 },
    { name: "Stellar Blade", color: "#ff6600", shape: "blade", required: 0, prestige: 3 },
    { name: "Holly Comet", color: "#c91f37", shape: "dart", required: 0, holiday: "christmas", limited: true },
    { name: "Snowglobe", color: "#dff7ff", shape: "ring", required: 0, holiday: "christmas", limited: true },
    { name: "Evergreen Blade", color: "#0d7a49", shape: "blade", required: 0, holiday: "christmas", limited: true },
];

export const trails: TrailStyle[] = [
    { name: "Ember", color: "#ed7657", required: 0, effect: "ember" },
    { name: "Mint Comet", color: "#62d6b2", required: 5, effect: "comet" },
    { name: "Gold Dust", color: "#b8843f", secondaryColor: "#e3aa55", required: 10, effect: "spark" },
    { name: "Nebula", color: "#b991ff", required: 16, effect: "ribbon" },
    { name: "Titan Sparks", color: "#c92f48", secondaryColor: "#ff805c", required: 24, effect: "spark", boss: true },
    { name: "Eclipse Ribbon", color: "#f58bff", required: 0, effect: "ribbon", secret: true },
    { name: "Ion Beam", color: "#8de7ff", required: 30, effect: "comet" },
    { name: "Prism Wake", color: "#ff8fbd", required: 38, effect: "ribbon" },
    { name: "Void Flame", color: "#8b7dff", required: 46, effect: "ember", boss: true },
    { name: "Comet Line", color: "#f29d68", required: 86, effect: "comet" },
    { name: "Prism Arc", color: "#8de7ff", secondaryColor: "#ff8fbd", required: 98, effect: "arc" },
    { name: "Jackpot Spark", color: "#ffe36e", required: 0, effect: "spark", secret: true, jackpot: true },
    { name: "Golden Trail", color: "#fff0a1", secondaryColor: "#f6c46e", required: 0, effect: "arc", golden: true },
    // Prestige-exclusive trails from special rolls
    { name: "Stellar Beam", color: "#ffcc33", secondaryColor: "#fff3bd", required: 0, effect: "arc", prestige: 1 },
    { name: "Quantum Wave", color: "#b24bff", required: 0, effect: "ribbon", prestige: 1 },
    { name: "Cosmic Spark", color: "#00ffcc", required: 0, effect: "spark", prestige: 1 },
    { name: "Void Ribbon", color: "#ff0099", required: 0, effect: "ribbon", prestige: 2 },
    { name: "Eclipse Arc", color: "#9933ff", secondaryColor: "#f58bff", required: 0, effect: "arc", prestige: 2 },
    { name: "Infinite Comet", color: "#e0e0e0", required: 0, effect: "comet", prestige: 2 },
    { name: "Stellar Ribbon", color: "#00ff66", required: 0, effect: "ribbon", prestige: 3 },
    { name: "Infinity Spark", color: "#ff6600", required: 0, effect: "spark", prestige: 3 },
    { name: "Present Parade", color: "#e63946", secondaryColor: "#f6c46e", required: 0, effect: "spark", holiday: "christmas", limited: true },
    { name: "Snowfall Wake", color: "#e9fbff", secondaryColor: "#8fd7e4", required: 0, effect: "comet", holiday: "christmas", limited: true },
    { name: "Holly Ribbon", color: "#138a55", secondaryColor: "#e63946", required: 0, effect: "ribbon", holiday: "christmas", limited: true },
];
export const avatars: AvatarStyle[] = [
    { name: "Classic", color: "#ed7657", shape: "classic", required: 0, defaultSkin: 0 },
    { name: "Dart", color: "#62d6b2", shape: "dart", required: 0, image: dartShipImage, defaultSkin: 1 },
    { name: "UFO", color: "#f6c46e", shape: "ring", required: 0, image: ufoShipImage, defaultSkin: 2 },
    { name: "Sword", color: "#b991ff", shape: "blade", required: 0, image: swordShipImage, defaultSkin: 3 },
    { name: "Jackpot Crown", color: "#ffe36e", shape: "classic", required: 0, defaultSkin: 17, jackpot: true, image: jackpotCrownImage },
    { name: "Prestige Comet", color: "#fff6a8", shape: "dart", required: 0, defaultSkin: 1, prestige: 1, image: prestigeCometImage },
    { name: "Prestige Halo", color: "#b8fff1", shape: "ring", required: 0, defaultSkin: 2, prestige: 2, image: prestigeHaloImage },
    { name: "Prestige Nova", color: "#ffb6e6", shape: "blade", required: 0, defaultSkin: 3, prestige: 3, image: prestigeNovaImage },
    { name: "Golden Pilot", color: "#ffe36e", shape: "classic", required: 0, defaultSkin: 17, golden: true, image: goldenCrownImage },
    // Prestige-exclusive avatars from special rolls
    { name: "Stellar Guard", color: "#ffcc33", shape: "classic", required: 0, defaultSkin: 18, prestige: 1, cssArt: "stellar-guard" },
    { name: "Quantum Dancer", color: "#b24bff", shape: "dart", required: 0, defaultSkin: 19, prestige: 1, cssArt: "quantum-dancer" },
    { name: "Cosmic Queen", color: "#00ffcc", shape: "ring", required: 0, defaultSkin: 20, prestige: 1, cssArt: "cosmic-queen" },
    { name: "Void Knight", color: "#ff0099", shape: "blade", required: 0, defaultSkin: 21, prestige: 2, cssArt: "void-knight" },
    { name: "Eclipse Oracle", color: "#9933ff", shape: "classic", required: 0, defaultSkin: 23, prestige: 2, cssArt: "eclipse-oracle" },
    { name: "Infinity Pilot", color: "#00ff66", shape: "dart", required: 0, defaultSkin: 24, prestige: 3, cssArt: "infinity-pilot" },
    { name: "Stellar Legend", color: "#ff6600", shape: "ring", required: 0, defaultSkin: 25, prestige: 3, cssArt: "stellar-legend" },
    { name: "North Star", color: "#f6c46e", shape: "classic", required: 0, defaultSkin: 26, holiday: "christmas", limited: true, cssArt: "north-star" },
    { name: "Sleigh", color: "#d92038", shape: "ring", required: 0, defaultSkin: 27, holiday: "christmas", limited: true, cssArt: "sleigh" },
];

export function getCosmeticRarity(item: { required: number; secret?: boolean; boss?: boolean; prestige?: number; golden?: boolean; jackpot?: boolean }): Rarity {
    if (item.golden || item.jackpot || (item.prestige ?? 0) >= 3) return "Legendary";
    if ((item.prestige ?? 0) >= 2 || item.boss || item.required >= 54) return "Epic";
    if ((item.prestige ?? 0) >= 1 || item.secret || item.required >= 30) return "Rare";
    if (item.required >= 10) return "Uncommon";
    return "Common";
}

export function createRarityBadge(rarity: Rarity | "Limited") { return `<span class="rarity-badge rarity-${rarity.toLowerCase()}">${rarity}</span>`; }
