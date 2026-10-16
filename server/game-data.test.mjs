import test from "node:test";
import assert from "node:assert/strict";
import { getMongoDatabaseConfigurationError } from "./database-config.mjs";
import {
  isValidPassword,
  isValidGameConfig,
  isValidRun,
  normalizeUsername,
  parseGoldenTimeLimit,
  DEFAULT_GAME_CONFIG,
  validatePlayerProgress,
  validateWorkshopLevel,
} from "./game-data.mjs";

test("username normalization is case-insensitive and validates the public format", () => {
  assert.deepEqual(normalizeUsername("Pilot_7"), { display: "Pilot_7", normalized: "pilot_7" });
  assert.equal(normalizeUsername("ab"), null);
  assert.equal(normalizeUsername("bad name"), null);
});

test("password validation enforces length without changing the password", () => {
  assert.equal(isValidPassword("1234567890"), true);
  assert.equal(isValidPassword("short"), false);
  assert.equal(isValidPassword("x".repeat(129)), false);
});

test("MongoDB connection configuration accepts hosted URIs and rejects local Vercel URIs", () => {
  const atlasUri = "mongodb+srv://cluster0.example.mongodb.net/jacer?retryWrites=true";
  assert.equal(getMongoDatabaseConfigurationError(atlasUri), null);
  assert.equal(getMongoDatabaseConfigurationError("mongodb://localhost:27017/jacer"), null);
  assert.equal(getMongoDatabaseConfigurationError("mongodb://localhost:27017/jacer", { vercel: true })?.includes("MongoDB Atlas"), true);
  assert.equal(getMongoDatabaseConfigurationError("postgresql://db.example.com/jacer")?.includes("mongodb://"), true);
  assert.equal(getMongoDatabaseConfigurationError("not a uri")?.includes("valid MongoDB"), true);
  assert.equal(getMongoDatabaseConfigurationError(undefined)?.includes("DATABASE_MONGODB_URI"), true);
});

test("run validation accepts bounded run details and known abilities only", () => {
  assert.equal(isValidRun({ level: "Quiet Orbit", timeMs: 12000, abilities: ["boost"] }), true);
  assert.equal(isValidRun({ level: "Quiet Orbit", timeMs: 999, abilities: [] }), false);
  assert.equal(isValidRun({ level: "Quiet Orbit", timeMs: 12000, abilities: ["admin"] }), false);
  assert.equal(isValidRun({ level: "Quiet Orbit", timeMs: 12000, abilities: ["boost", "boost"] }), false);
});

test("golden-time threshold is bounded to one second through one hour", () => {
  assert.equal(parseGoldenTimeLimit(60000), true);
  assert.equal(parseGoldenTimeLimit(999), false);
  assert.equal(parseGoldenTimeLimit(3600001), false);
});

test("shared game configuration validates world-specific odds and bounded power-up effects", () => {
  assert.equal(isValidGameConfig(DEFAULT_GAME_CONFIG), true);
  const invalid = structuredClone(DEFAULT_GAME_CONFIG);
  invalid.prestige.rarityOdds.Legendary = 50;
  assert.equal(isValidGameConfig(invalid), false);
  const invalidEffect = structuredClone(DEFAULT_GAME_CONFIG);
  invalidEffect.powerupEffects.boost.movementMultiplier = 8;
  assert.equal(isValidGameConfig(invalidEffect), false);
});

test("workshop levels validate tile bounds and discard unrecognized fields", () => {
  const draft = {
    name: "Workshop test",
    briefing: "Fly the route.",
    length: 12,
    asteroids: [2, 8],
    walls: [4, 9],
    blocks: [10],
    enemies: [6],
    spikes: [5],
    gravity: [7],
    powerups: [{ index: 3, kind: "shield" }],
    customId: "forged",
    unexpected: "<script>",
  };
  const result = validateWorkshopLevel(draft);
  assert.equal(result.customId, undefined);
  assert.equal(result.unexpected, undefined);
  assert.deepEqual(result.blocks, [10]);
  assert.equal(validateWorkshopLevel({ ...draft, enemies: [12] }), null);
  assert.equal(validateWorkshopLevel({ ...draft, blocks: [12] }), null);
  assert.equal(validateWorkshopLevel({ ...draft, name: "<script>" }), null);
});

test("player progress accepts bounded game data and excludes shared caches", () => {
  const progress = { "orbit-claims": "42", "orbit-level-complete-3": "1" };
  assert.deepEqual(validatePlayerProgress(progress), progress);
  assert.equal(validatePlayerProgress({ "orbit-global-level-cache": "[]" }), null);
  assert.equal(validatePlayerProgress({ token: "not game data" }), null);
  assert.equal(validatePlayerProgress({ "orbit-claims": 42 }), null);
  assert.equal(validatePlayerProgress({ "orbit-claims": "x".repeat(20001) }), null);
});
