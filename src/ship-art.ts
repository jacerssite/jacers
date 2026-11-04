import dartShipImage from "./assets/ships/dart.svg";
import dartShipSvg from "./assets/ships/dart.svg?raw";
import ufoShipImage from "./assets/ships/ufo.svg";
import ufoShipSvg from "./assets/ships/ufo.svg?raw";
import swordShipImage from "./assets/ships/sword.svg";
import swordShipSvg from "./assets/ships/sword.svg?raw";
import jackpotCrownImage from "./assets/ships/jackpot-crown.svg";
import jackpotCrownSvg from "./assets/ships/jackpot-crown.svg?raw";
import goldenCrownImage from "./assets/ships/golden-crown.svg";
import goldenCrownSvg from "./assets/ships/golden-crown.svg?raw";
import type { PrestigeShipArt } from "./types";

export function createShipArtMarkup(image: string, label: string, color = "#f3f5e9") {
    if (image === dartShipImage) return `<span class="ship-art-inline" role="img" aria-label="${label}">${dartShipSvg.replace('fill="#62d6b2"', `fill="${color}"`)}</span>`;
    if (image === ufoShipImage) return `<span class="ship-art-inline" role="img" aria-label="${label}">${ufoShipSvg.replaceAll('fill="#f6c46e"', `fill="${color}"`)}</span>`;
    if (image === swordShipImage) return `<span class="ship-art-inline" role="img" aria-label="${label}">${swordShipSvg.replace('fill="#b991ff"', `fill="${color}"`)}</span>`;
    if (image === jackpotCrownImage) return `<span class="ship-art-inline" role="img" aria-label="${label}">${jackpotCrownSvg.replace('fill="#ffe36e"', `fill="${color}"`)}</span>`;
    if (image === goldenCrownImage) return `<span class="ship-art-inline" role="img" aria-label="${label}">${goldenCrownSvg.replace('fill="#ffe36e"', `fill="${color}"`)}</span>`;
    return `<span class="ship-art-image ship-art-tinted" role="img" aria-label="${label}" style="--ship-color:${color};--ship-art-source:url('${image}')"><img src="${image}" alt="" /></span>`;
}
export function createCssShipArtMarkup(art: PrestigeShipArt, label: string, color: string) {
    if (art === "sleigh") {
        return `<span class="ship-art-inline ship-sleigh-art" role="img" aria-label="${label}" style="--ship-color:${color}"><svg viewBox="0 0 180 100" aria-hidden="true" focusable="false"><path d="M5 53h18M10 63h13M17 73h12" fill="none" stroke="#9ee7ff" stroke-linecap="round" stroke-width="3"/><path d="M31 68c4 15 19 20 43 17l57-5c20-2 31-10 34-23 2-7-2-11-7-7-3 3-2 10-12 14-7 3-18 4-31 5l-43 4c-20 2-31-1-36-10" fill="none" stroke="#f6c46e" stroke-linecap="round" stroke-linejoin="round" stroke-width="6"/><path d="M27 48c10 6 19 8 34 8h63c17 0 27-9 36-23l10-15c3-5 9-2 7 3l-9 21c-6 15-18 23-38 24H62c-18 0-30-4-38-13z" fill="#9d1830" stroke="#f6c46e" stroke-linejoin="round" stroke-width="3"/><path d="M39 49c9 4 17 5 28 5h53c15 0 23-6 31-17l6-9" fill="none" stroke="var(--ship-color)" stroke-linecap="round" stroke-width="8"/><path d="M75 48V31c0-7 5-12 12-12h25c7 0 12 4 15 11l5 13" fill="#7a2037" stroke="#ffd978" stroke-linejoin="round" stroke-width="3"/><path d="M83 31h32" stroke="#f6c46e" stroke-linecap="round" stroke-width="3"/><path d="M41 43l9-13 13 5 8 13z" fill="#e63946" stroke="#fff0a1" stroke-width="2"/><path d="M52 31l5 18M43 37l22 4" stroke="#f6c46e" stroke-width="3"/><path d="M146 49c4-5 8-11 11-17" fill="none" stroke="#fff0a1" stroke-linecap="round" stroke-width="2"/><circle cx="163" cy="21" r="4" fill="#fff3bd"/><path d="M163 12v-5m-6 7-4-4m16 4 4-4" stroke="#fff3bd" stroke-linecap="round" stroke-width="2"/></svg></span>`;
    }
    return `<span class="ship-css-art ship-css-${art}" role="img" aria-label="${label}" style="--ship-color:${color}"></span>`;
}
