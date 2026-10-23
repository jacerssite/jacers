import test from "node:test";
import assert from "node:assert/strict";
import { getMongoDatabaseConfigurationError, getMongoDatabaseConnectionString } from "./database-config.mjs";
import { dropLegacyRecoveryIndex } from "./database-setup.mjs";
import {
  isValidPassword,
  isValidGameConfig,
  isValidRun,
  normalizeUsername,
  parseGoldenTimeLimit,
  DEFAULT_GAME_CONFIG,
  formatRecoveryCode,
  normalizeRecoveryCode,
  validateCodeReward,
  validateProfileTitles,
  getEarnedProfileTitle,
  PROFILE_TITLE_MILESTONES,
  validatePlayerProgress,
  validateRouletteTiers,
  validateUpdateLog,
  MAX_UPDATE_LOG_BODY_LENGTH,
  MAX_UPDATE_LOG_BYTES,
  validateWorkshopLevel,
  USER_ROLES,
  hasRolePermission,
} from "./game-data.mjs";

test("staff roles keep permissions separated", () => {
  assert.deepEqual(USER_ROLES, ["owner", "developer", "admin", "moderator", "level-maker", "tester", "player"]);
  assert.equal(hasRolePermission("owner", "anything"), true);
  assert.equal(hasRolePermission("developer", "anything"), true);
  assert.equal(hasRolePermission("admin", "content:codes"), true);
  assert.equal(hasRolePermission("admin", "game-config"), false);
  assert.equal(hasRolePermission("moderator", "moderation"), true);
  assert.equal(hasRolePermission("moderator", "content:codes"), false);
  assert.equal(hasRolePermission("level-maker", "levels:workshop"), true);
  assert.equal(hasRolePermission("level-maker", "moderation"), false);
});

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

test("profile titles unlock at route milestones and require an earned selected title", () => {
  assert.equal(getEarnedProfileTitle(0, "cadet"), "");
  assert.equal(getEarnedProfileTitle(1, "cadet"), "Cadet");
  assert.equal(getEarnedProfileTitle(4, "pathfinder"), "");
  assert.equal(getEarnedProfileTitle(5, "pathfinder"), "Pathfinder");
  assert.equal(getEarnedProfileTitle(10, "not-a-title"), "");
  const lastTitle = PROFILE_TITLE_MILESTONES.at(-1);
  assert.equal(getEarnedProfileTitle(lastTitle.routes, lastTitle.id), lastTitle.name);
});

test("profile titles accept bounded colors and animations", () => {
  const titles = [{ id: "aurora", name: "Aurora", routes: 1, color: "#12AbEf", animation: "nebula-drift", requirement: { type: "routes", amount: 1 } }];
  assert.deepEqual(validateProfileTitles(titles), [{ ...titles[0], color: "#12abef" }]);
  assert.equal(validateProfileTitles([{ ...titles[0], color: "red" }]), null);
  assert.equal(validateProfileTitles([{ ...titles[0], animation: "spin" }]), null);
});

test("recovery codes use the unambiguous alphabet and display in four groups", () => {
  assert.equal(normalizeRecoveryCode("ABCD-2345-EFGH-6789"), "ABCD2345EFGH6789");
  assert.equal(formatRecoveryCode("ABCD2345EFGH6789"), "ABCD-2345-EFGH-6789");
  assert.equal(normalizeRecoveryCode("ABCD-1234-EFGH-6789"), null);
  assert.equal(normalizeRecoveryCode("too-short"), null);
  assert.equal(normalizeRecoveryCode("bad-code-with-punctuation!"), null);
});

test("code rewards use the bounded claims reward object contract", () => {
  assert.deepEqual(validateCodeReward({ type: "claims", amount: 25 }), { type: "claims", amount: 25 });
  assert.deepEqual(validateCodeReward({ type: "specialClaims", amount: 1 }), { type: "specialClaims", amount: 1 });
  assert.equal(validateCodeReward({ type: "password", amount: 1 }), null);
  assert.equal(validateCodeReward({ type: "claims", amount: -1 }), null);
});

test("roulette tiers validate bounds, unique names, and exact probability totals", () => {
  const tiers = [
    { buyIn: 5, chances: { claims: 45, specialClaims: 15, color: 20, trail: 12, avatar: 8 }, rewards: { claims: [50, 150], specialClaims: [1, 2] } },
    { buyIn: 10, chances: { claims: 30, specialClaims: 18, color: 22, trail: 18, avatar: 12 }, rewards: { claims: [125, 350], specialClaims: [1, 3] } },
    { buyIn: 25, chances: { claims: 15, specialClaims: 20, color: 22, trail: 25, avatar: 18 }, rewards: { claims: [300, 1000], specialClaims: [2, 5] } },
  ];
  assert.deepEqual(validateRouletteTiers(tiers), tiers);
  const invalidChance = structuredClone(tiers);
  invalidChance[0].chances.claims = 44;
  assert.equal(validateRouletteTiers(invalidChance), null);
  const invalidBuyIn = structuredClone(tiers);
  invalidBuyIn[1].buyIn = 15;
  assert.equal(validateRouletteTiers(invalidBuyIn), null);
  const invalidRange = structuredClone(tiers);
  invalidRange[2].rewards.specialClaims = [5, 4];
  assert.equal(validateRouletteTiers(invalidRange), null);
});

test("update log accepts bounded plain-text entries and rejects invalid dates or oversize history", () => {
  const entries = [{ date: "2026-10-19", title: "New season", body: "  First paragraph.\n\n\t- A new route is available.\n    More details.  \n" }];
  assert.deepEqual(validateUpdateLog(entries), entries);
  assert.equal(validateUpdateLog([{ ...entries[0], body: "x".repeat(MAX_UPDATE_LOG_BODY_LENGTH) }])[0].body.length, MAX_UPDATE_LOG_BODY_LENGTH);
  assert.equal(validateUpdateLog([{ ...entries[0], date: "2026-02-31" }]), null);
  assert.equal(validateUpdateLog([{ ...entries[0], title: "" }]), null);
  assert.equal(validateUpdateLog([{ ...entries[0], body: " \n\t" }]), null);
  assert.equal(validateUpdateLog([{ ...entries[0], body: "x".repeat(MAX_UPDATE_LOG_BODY_LENGTH + 1) }]), null);
  assert.equal(validateUpdateLog(Array.from({ length: 101 }, () => entries[0])), null);
  const oversized = Array.from({ length: 6 }, () => ({ ...entries[0], body: "🚀".repeat(MAX_UPDATE_LOG_BODY_LENGTH / 2) }));
  assert.ok(Buffer.byteLength(JSON.stringify({ entries: oversized }), "utf8") > MAX_UPDATE_LOG_BYTES);
  assert.equal(validateUpdateLog(oversized), null);
});

test("MongoDB connection configuration accepts hosted URIs and rejects local Vercel URIs", () => {
  const atlasUri = "mongodb+srv://cluster0.example.mongodb.net/jacer?retryWrites=true";
  assert.equal(getMongoDatabaseConfigurationError(atlasUri), null);
  assert.equal(getMongoDatabaseConfigurationError("mongodb://localhost:27017/jacer"), null);
  assert.equal(getMongoDatabaseConfigurationError("mongodb://localhost:27017/jacer", { vercel: true })?.includes("MongoDB Atlas"), true);
  assert.equal(getMongoDatabaseConfigurationError("postgresql://db.example.com/jacer")?.includes("mongodb://"), true);
  assert.equal(getMongoDatabaseConfigurationError("not a uri")?.includes("must be valid"), true);
  assert.equal(getMongoDatabaseConfigurationError(undefined)?.includes("DATABASE_MONGODB_URI"), true);
});

test("Vercel's native MongoDB URI works without changing existing database precedence", () => {
  const existing = "mongodb://existing.example/players";
  const native = "mongodb+srv://native.example/players";
  const legacy = "mongodb://legacy.example/players";
  assert.equal(getMongoDatabaseConnectionString({ MONGODB_URI: `  ${native}  ` }), native);
  assert.equal(getMongoDatabaseConnectionString({ DATABASE_MONGODB_URI: existing, MONGODB_URI: native, DATABASE_URL: legacy }), existing);
  assert.equal(getMongoDatabaseConnectionString({ DATABASE_MONGODB_URI: "  ", MONGODB_URI: native, DATABASE_URL: legacy }), native);
  assert.equal(getMongoDatabaseConnectionString({ DATABASE_URL: legacy }), legacy);
  assert.equal(getMongoDatabaseConnectionString({}), undefined);
  // Do not silently switch databases when a configured override is invalid.
  assert.equal(getMongoDatabaseConnectionString({ DATABASE_MONGODB_URI: "invalid", MONGODB_URI: native }), "invalid");
});

test("legacy recovery index cleanup allows fresh databases but surfaces other failures", async () => {
  let requestedIndex;
  await dropLegacyRecoveryIndex({ dropIndex: async (name) => { requestedIndex = name; } });
  assert.equal(requestedIndex, "windowExpiresAt_1");
  for (const code of [26, 27]) {
    await dropLegacyRecoveryIndex({ dropIndex: async () => { throw Object.assign(new Error("missing"), { code }); } });
  }
  const denied = Object.assign(new Error("not authorized"), { code: 13 });
  await assert.rejects(dropLegacyRecoveryIndex({ dropIndex: async () => { throw denied; } }), (error) => error === denied);
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
  const invalidStarEffect = structuredClone(DEFAULT_GAME_CONFIG);
  invalidStarEffect.powerupEffects.star.movementMultiplier = 0.5;
  assert.equal(isValidGameConfig(invalidStarEffect), false);
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

test("workshop flipped routes validate powerups and discard unrecognized route fields", () => {
  const draft = {
    name: "Flipped route", briefing: "Fly carefully.", length: 12,
    asteroids: [], walls: [], enemies: [], spikes: [], gravity: [4],
    flippedRoute: { walls: [], enemies: [], spikes: [], gravity: [], powerups: [{ index: 3, kind: "boost" }], key: 8, unexpected: "ignored" },
  };
  const valid = validateWorkshopLevel(draft);
  assert.deepEqual(valid.flippedRoute.powerups, [{ index: 3, kind: "boost" }]);
  assert.equal(valid.flippedRoute.unexpected, undefined);
  assert.equal(validateWorkshopLevel({ ...draft, flippedRoute: { ...draft.flippedRoute, powerups: "bad" } }), null);
  assert.equal(validateWorkshopLevel({ ...draft, flippedRoute: { ...draft.flippedRoute, powerups: [{ index: 11, kind: "boost" }] } }), null);
  assert.equal(validateWorkshopLevel({ ...draft, flippedRoute: { ...draft.flippedRoute, powerups: [{ index: 3, kind: "bogus" }] } }), null);
  assert.equal(validateWorkshopLevel({ ...draft, flippedRoute: { ...draft.flippedRoute, powerups: [{ index: 3, kind: "boost" }, { index: 3, kind: "shield" }] } }), null);
});

test("player progress accepts bounded game data and excludes shared caches", () => {
  const progress = { "orbit-claims": "42", "orbit-level-complete-3": "1" };
  assert.deepEqual(validatePlayerProgress(progress), progress);
  assert.equal(validatePlayerProgress({ "orbit-global-level-cache": "[]" }), null);
  assert.equal(validatePlayerProgress({ token: "not game data" }), null);
  assert.equal(validatePlayerProgress({ "orbit-password-hash": "private" }), null);
  assert.equal(validatePlayerProgress({ "orbit-recovery-code": "private" }), null);
  assert.equal(validatePlayerProgress({ "orbit-claims": 42 }), null);
  assert.equal(validatePlayerProgress({ "orbit-claims": "x".repeat(20001) }), null);
});
