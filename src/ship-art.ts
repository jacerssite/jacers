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
export function createCssShipArtMarkup(art: PrestigeShipArt, label: string, color: string) { return `<span class="ship-css-art ship-css-${art}" role="img" aria-label="${label}" style="--ship-color:${color}"></span>`; }

