export function drawTrailParticles(
    elements: HTMLElement[],
    positions: { x: number; y: number }[],
    anchor: { x: number; y: number },
    direction: number,
    flipped: boolean,
) {
    elements.forEach((element, index) => {
        element.classList.add("trail-active");
        const point = positions[Math.min(index * 2, positions.length - 1)] ?? anchor;
        const restingTailX = anchor.x - direction * index * 10;
        const tailX = direction > 0
            ? Math.min(point.x, restingTailX)
            : Math.max(point.x, restingTailX);
        const tailY = index === 0 ? anchor.y : point.y;
        element.classList.toggle("flipped-trail", flipped);
        element.style.left = `${index === 0 ? anchor.x : tailX}px`;
        element.style.top = `${index === 0 ? anchor.y : tailY}px`;
        // The particle at the ship's core is only an anchor for the trail
        // geometry. Keep it invisible so the visible tail starts just behind
        // the ship instead of drawing a spinning shape over the hull.
        element.style.opacity = index === 0 ? "0" : `${Math.max(0.1, 1 - index * 0.2)}`;
    });
}

