import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

// This module is pure TypeScript; transpile it in memory so the tests also run on Node 20.
const source = await readFile(new URL("../src/appearance.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { getShipColorOptions, isShipColorUnlocked } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

const skins = [
    { name: "First shared", color: "#8de7ff", shape: "dart", required: 30 },
    { name: "Second shared", color: "#8DE7FF", shape: "ring", required: 98 },
    { name: "Roulette match", color: "#445566", shape: "classic", required: 0 },
];

test("skin, starter, and roulette colors appear once, ignoring capitalization", () => {
    const options = getShipColorOptions(["#112233"], ["#445566"], skins);
    assert.deepEqual(options.map(({ color, source }) => ({ color, source })), [
        { color: "#112233", source: "starter" },
        { color: "#445566", source: "roulette" },
        { color: "#8de7ff", source: "skin" },
    ]);
});

test("a skin color unlocks only with its own skin", () => {
    const options = getShipColorOptions(["#112233"], ["#445566"], skins);
    const skinColor = options.find((option) => option.source === "skin");
    const hasSecondSkin = (_skin, index) => index === 1;
    assert.equal(isShipColorUnlocked(skinColor, skins, hasSecondSkin, () => false), false);
    assert.equal(isShipColorUnlocked(skinColor, skins, (_skin, index) => index === skinColor.index, () => false), true);
    assert.equal(isShipColorUnlocked(skinColor, skins, () => false, () => false), false);
});

test("roulette and starter colors unlock through their own source or a matching skin", () => {
    const [starter, roulette] = getShipColorOptions(["#112233"], ["#445566"], skins);
    assert.equal(isShipColorUnlocked(starter, skins, () => false, () => false), true);
    assert.equal(isShipColorUnlocked(roulette, skins, () => false, () => false), false);
    assert.equal(isShipColorUnlocked(roulette, skins, () => false, (index) => index === 1), true);
    assert.equal(isShipColorUnlocked(roulette, skins, (_skin, index) => index === 2, () => false), false);
});
