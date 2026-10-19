import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const source = await readFile(new URL("../src/trail.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { drawTrailParticles } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

function particle() {
    const classes = new Set();
    return {
        style: {},
        classList: {
            add: (name) => classes.add(name),
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
        },
        classes,
    };
}

test("the lead trail particle stays at the ship center while the tail follows previous positions", () => {
    const particles = [particle(), particle(), particle()];
    const positions = [{ x: 100, y: 50 }, { x: 95, y: 52 }, { x: 80, y: 60 }, { x: 75, y: 61 }, { x: 70, y: 65 }];
    drawTrailParticles(particles, positions, { x: 100, y: 50 }, 1, false);
    assert.equal(particles[0].style.left, "100px");
    assert.equal(particles[0].style.top, "50px");
    assert.equal(particles[1].style.left, "80px");
    assert.equal(particles[1].style.top, "60px");
    assert.equal(particles[0].classes.has("trail-active"), true);
});

test("the tail falls behind the ship in either direction", () => {
    const particles = [particle(), particle()];
    drawTrailParticles(particles, [{ x: 100, y: 50 }], { x: 100, y: 50 }, -1, true);
    assert.equal(particles[0].style.left, "100px");
    assert.equal(particles[1].style.left, "110px");
    assert.equal(particles[0].classes.has("flipped-trail"), true);
});
