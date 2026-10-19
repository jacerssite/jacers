import type { SkinStyle } from "./types";

type ColorOption =
    | { name: string; color: string; required: number; source: "starter" | "roulette"; index: number }
    | (SkinStyle & { source: "skin" });

export function getShipColorOptions(starterColors: string[], rouletteColors: string[], skins: SkinStyle[]): ColorOption[] {
    const options: ColorOption[] = [
        ...starterColors.map((color, index) => ({ name: `Starter color ${index + 1}`, color, required: 0, source: "starter" as const, index })),
        ...rouletteColors.map((color, offset) => ({ name: `Roulette color ${offset + 1}`, color, required: 30, source: "roulette" as const, index: starterColors.length + offset })),
        ...skins.map((skin) => ({ ...skin, source: "skin" as const })),
    ];
    return options.filter((option, index) => options.findIndex((candidate) => candidate.color.toLowerCase() === option.color.toLowerCase()) === index);
}

export function isShipColorUnlocked(
    option: ColorOption,
    skins: SkinStyle[],
    isSkinUnlocked: (skin: SkinStyle, index: number) => boolean,
    isRouletteColorUnlocked: (index: number) => boolean,
): boolean {
    return option.source === "starter"
        || option.source === "roulette" && isRouletteColorUnlocked(option.index)
        || skins.some((skin, index) => skin.color.toLowerCase() === option.color.toLowerCase() && isSkinUnlocked(skin, index));
}
