import test from "node:test";
import assert from "node:assert/strict";
import {
  TRUSTED_LEVEL_REWARDS,
  applyTrustedAsteroidReward,
  asteroidRewardEventId,
  getTrustedLevelReward,
  validateAsteroidRewardRequest,
} from "../server/reward-events.mjs";

test("trusted reward catalog only accepts a matching built-in level and collectible slot", () => {
  assert.equal(TRUSTED_LEVEL_REWARDS.length, 56);
  assert.deepEqual(TRUSTED_LEVEL_REWARDS.map(({ index }) => index), Array.from({ length: 56 }, (_, index) => index));
  assert.deepEqual(getTrustedLevelReward("Vega Outpost", 0), { index: 0, name: "Vega Outpost", asteroidCount: 4, currency: "claims" });
  assert.equal(getTrustedLevelReward("Vega Outpost", 1), null);
  assert.equal(getTrustedLevelReward("Made Up Level", 0), null);
  assert.deepEqual(validateAsteroidRewardRequest({ levelName: "Eclipse Vault", levelIndex: 12, asteroidIndex: 5 }), {
    index: 12, name: "Eclipse Vault", asteroidCount: 6, currency: "specialClaims", asteroidIndex: 5, currencyKey: "orbit-special-claims",
  });
  assert.equal(validateAsteroidRewardRequest({ levelName: "Eclipse Vault", levelIndex: 12, asteroidIndex: 6 }), null);
  assert.deepEqual(validateAsteroidRewardRequest({ levelName: "Nova Crossing", levelIndex: 18, asteroidIndex: 5 }), {
    index: 18, name: "Nova Crossing", asteroidCount: 6, currency: "claims", asteroidIndex: 5, currencyKey: "orbit-claims",
  });
  assert.deepEqual(validateAsteroidRewardRequest({ levelName: "Frostbound Passage", levelIndex: 24, asteroidIndex: 4 }), {
    index: 24, name: "Frostbound Passage", asteroidCount: 5, currency: "presents", asteroidIndex: 4, currencyKey: "orbit-christmas-presents",
  });
  assert.deepEqual(validateAsteroidRewardRequest({ levelName: "Endless Crown", levelIndex: 55, asteroidIndex: 6 }), {
    index: 55, name: "Endless Crown", asteroidCount: 7, currency: "claims", asteroidIndex: 6, currencyKey: "orbit-claims",
  });
});

test("trusted reward catalog records every built-in route in stable order with exact collectible counts", () => {
  const names = [
    "Vega Outpost", "Emberline Run", "Graviton Rift", "Shardstorm Passage", "Duskfall Reach", "Ion Crown",
    "Reliquary of Stars", "Prism Breaker", "Colossus Crossing", "Helios Crucible", "Moonforge Depths", "Event Horizon",
    "Eclipse Vault", "Comet Foundry", "Amethyst Rampart", "Starfall Citadel", "Nebula Hollow", "Black Hole Archive",
    "Nova Crossing", "Meteor Run", "Astral Vault", "Celestial Sanctum", "Quantum Trench", "Infinity Spiral",
    "Frostbound Passage", "Candy Comet Run", "Evergreen Circuit", "Aurora Station", "Reindeer Nebula", "Northstar Throne",
    "Solar Breaker", "Aurora Run", "Gravity Escape", "Starline Rally", "Titan Passage", "Northstar Reach",
    "Aether Run", "Ringfall Circuit", "Violet Singularity", "Saturn's Crown", "Nebula Citadel", "Oracle's Crossing",
    "Prism Wastes", "Pale Eclipse", "Sovereign's Drift", "Astral Fortress", "Io's Veil", "Radiant Rupture",
    "Dusk Cathedral", "Nova Maze", "Violet Eventide", "Inverted Starsea", "Ashen Halo", "Sable Lights",
    "Titan's Expanse", "Endless Crown",
  ];
  const counts = [
    4, 4, 5, 6, 7, 7, 7, 8, 10, 7, 7, 9, 6, 6, 8, 9, 6, 7, 6, 6, 6, 7, 8, 9,
    5, 5, 6, 6, 7, 8, 6, 6, 6, 6, 6, 6, ...Array(20).fill(7),
  ];
  const currencyFor = (index) => index === 12 || index === 16 || index === 17 || index >= 20 && index <= 23
    ? "specialClaims"
    : index >= 24 && index <= 29
      ? "presents"
      : "claims";
  assert.equal(names.length, 56);
  assert.deepEqual(TRUSTED_LEVEL_REWARDS, names.map((name, index) => ({
    index,
    name,
    asteroidCount: counts[index],
    currency: currencyFor(index),
  })));
});

test("a trusted asteroid event is stable and rejects malformed run ids", () => {
  const runId = "a".repeat(32);
  assert.equal(asteroidRewardEventId(runId, 0, 2), `asteroid:${runId}:0:2`);
  assert.equal(asteroidRewardEventId("short", 0, 2), null);
  assert.equal(asteroidRewardEventId(runId, -1, 2), null);
});

test("trusted asteroid awards are one-time and choose currency from the server catalog", () => {
  const first = applyTrustedAsteroidReward({ "orbit-claims": "4" }, { levelName: "Vega Outpost", levelIndex: 0, asteroidIndex: 1 });
  assert.equal(first.status, "awarded");
  assert.equal(first.progress["orbit-claims"], "5");
  assert.equal(first.progress["orbit-asteroids-0"], "[1]");
  const replay = applyTrustedAsteroidReward(first.progress, { levelName: "Vega Outpost", levelIndex: 0, asteroidIndex: 1 });
  assert.equal(replay.status, "already-claimed");
  assert.equal(replay.progress["orbit-claims"], "5");
  const special = applyTrustedAsteroidReward({}, { levelName: "Eclipse Vault", levelIndex: 12, asteroidIndex: 0 });
  assert.equal(special.status, "awarded");
  assert.equal(special.progress["orbit-special-claims"], "1");
  assert.equal(special.progress["orbit-claims"], undefined);
});

test("malformed collection records fail closed and a full balance cannot overflow", () => {
  assert.equal(
    applyTrustedAsteroidReward({ "orbit-asteroids-0": "[0,0]" }, { levelName: "Vega Outpost", levelIndex: 0, asteroidIndex: 1 }).status,
    "invalid",
  );
  const capped = applyTrustedAsteroidReward({ "orbit-claims": "100000000" }, { levelName: "Vega Outpost", levelIndex: 0, asteroidIndex: 0 });
  assert.equal(capped.status, "awarded");
  assert.equal(capped.progress["orbit-claims"], "100000000");
});
