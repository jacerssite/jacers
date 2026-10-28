import type { ProfileTitleStyle } from "./types";

const TITLE_ANIMATIONS = new Set(["pulse", "shimmer", "rainbow", "dark-matter", "star-shimmer", "comet-trail", "nebula-drift", "aurora-wave", "solar-flare", "winter-glow", "snowfall", "candy-cane"]);

export function createTitleBadge(text: string, style: ProfileTitleStyle | null | undefined) {
    const badge = document.createElement("span");
    badge.className = "pilot-title-badge";
    badge.textContent = text;
    if (style?.color && /^#[0-9a-f]{6}$/i.test(style.color)) badge.style.setProperty("--title-color", style.color);
    if (style?.animation && TITLE_ANIMATIONS.has(style.animation)) badge.classList.add(`title-animation-${style.animation}`);
    return badge;
}
