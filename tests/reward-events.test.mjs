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
  assert.equal(TRUSTED_LEVEL_REWARDS.length, 28);
  assert.deepEqual(getTrustedLevelReward("Quiet Orbit", 0), { index: 0, name: "Quiet Orbit", asteroidCount: 3, currency: "claims" });
  assert.equal(getTrustedLevelReward("Quiet Orbit", 1), null);
  assert.equal(getTrustedLevelReward("Made Up Level", 0), null);
  assert.deepEqual(validateAsteroidRewardRequest({ levelName: "Eclipse Vault", levelIndex: 12, asteroidIndex: 5 }), {
    index: 12, name: "Eclipse Vault", asteroidCount: 6, currency: "specialClaims", asteroidIndex: 5, currencyKey: "orbit-special-claims",
  });
  assert.equal(validateAsteroidRewardRequest({ levelName: "Eclipse Vault", levelIndex: 12, asteroidIndex: 6 }), null);
});

test("a trusted asteroid event is stable and rejects malformed run ids", () => {
  const runId = "a".repeat(32);
  assert.equal(asteroidRewardEventId(runId, 0, 2), `asteroid:${runId}:0:2`);
  assert.equal(asteroidRewardEventId("short", 0, 2), null);
  assert.equal(asteroidRewardEventId(runId, -1, 2), null);
});

test("trusted asteroid awards are one-time and choose currency from the server catalog", () => {
  const first = applyTrustedAsteroidReward({ "orbit-claims": "4" }, { levelName: "Quiet Orbit", levelIndex: 0, asteroidIndex: 1 });
  assert.equal(first.status, "awarded");
  assert.equal(first.progress["orbit-claims"], "5");
  assert.equal(first.progress["orbit-asteroids-0"], "[1]");
  const replay = applyTrustedAsteroidReward(first.progress, { levelName: "Quiet Orbit", levelIndex: 0, asteroidIndex: 1 });
  assert.equal(replay.status, "already-claimed");
  assert.equal(replay.progress["orbit-claims"], "5");
  const special = applyTrustedAsteroidReward({}, { levelName: "Eclipse Vault", levelIndex: 12, asteroidIndex: 0 });
  assert.equal(special.status, "awarded");
  assert.equal(special.progress["orbit-special-claims"], "1");
  assert.equal(special.progress["orbit-claims"], undefined);
});

test("malformed collection records fail closed and a full balance cannot overflow", () => {
  assert.equal(
    applyTrustedAsteroidReward({ "orbit-asteroids-0": "[0,0]" }, { levelName: "Quiet Orbit", levelIndex: 0, asteroidIndex: 1 }).status,
    "invalid",
  );
  const capped = applyTrustedAsteroidReward({ "orbit-claims": "100000000" }, { levelName: "Quiet Orbit", levelIndex: 0, asteroidIndex: 0 });
  assert.equal(capped.status, "awarded");
  assert.equal(capped.progress["orbit-claims"], "100000000");
});
