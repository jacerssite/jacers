import test from "node:test";
import assert from "node:assert/strict";
import { getSuspiciousPlayerMutation, hasCurrencyConflict, initializePlayerProgress, sanitizeInitialPlayerProgress } from "../server/player-progress.mjs";

test("simultaneous currency changes are detected without blocking unrelated changes", () => {
  const baseline = { "orbit-claims": "100", "orbit-special-claims": "3" };
  assert.equal(hasCurrencyConflict({ ...baseline, "orbit-claims": "150" }, { ...baseline, "orbit-claims": "105" }, baseline), true);
  assert.equal(hasCurrencyConflict({ ...baseline, "orbit-claims": "105" }, { ...baseline, "orbit-claims": "105" }, baseline), true);
  assert.equal(hasCurrencyConflict({ ...baseline, "orbit-prestige": "1" }, { ...baseline, "orbit-claims": "105" }, baseline), true);
  assert.equal(hasCurrencyConflict({ ...baseline, "orbit-claims": "150" }, { ...baseline, "orbit-skin": "2" }, baseline), false);
  assert.equal(hasCurrencyConflict({ ...baseline, "orbit-claims": "150" }, { ...baseline, "orbit-special-claims": "4" }, baseline), false);
  assert.equal(hasCurrencyConflict(null, baseline, baseline), false);
});

test("player progress anti-cheat blocks forged unlocks, balance decreases, and unearned asteroids", () => {
  assert.match(
    getSuspiciousPlayerMutation({ "orbit-claims": "100" }, { "orbit-claims": "99" }),
    /cannot decrease/i,
  );
  assert.match(
    getSuspiciousPlayerMutation({}, { "orbit-unlock-skins": "1" }),
    /privileged progress key/i,
  );
  assert.match(
    getSuspiciousPlayerMutation({ "orbit-claims": "100" }, { "orbit-claims": "101" }),
    /does not match collected asteroids/i,
  );
  assert.equal(getSuspiciousPlayerMutation(
    { "orbit-claims": "100", "orbit-asteroids-0": "[0]" },
    { "orbit-claims": "101", "orbit-asteroids-0": "[0,1]" },
  ), null);
  assert.match(
    getSuspiciousPlayerMutation(
      { "orbit-special-claims": "0", "orbit-asteroids-0": "[0]" },
      { "orbit-special-claims": "20", "orbit-asteroids-0": "[0,1]" },
    ),
    /does not match collected asteroids/i,
  );
});

test("moderator progress stays behind the normal anti-cheat boundary", () => {
  assert.match(
    getSuspiciousPlayerMutation({ "orbit-claims": "100" }, { "orbit-claims": "100", "orbit-unlock-skins": "1" }, "moderator"),
    /privileged progress key/i,
  );
  assert.equal(sanitizeInitialPlayerProgress({ "orbit-claims": "999999" }, "moderator")["orbit-claims"], "5000");
  assert.equal(sanitizeInitialPlayerProgress({ "orbit-claims": "999999" }, "player")["orbit-claims"], "5000");
});

test("first progress save initializes only when the account has no saved record", async () => {
  let inserted;
  const guest = { "orbit-claims": "3" };
  const result = await initializePlayerProgress({ async insertOne(document) { inserted = document; } }, "player", guest);
  assert.deepEqual(result, guest);
  assert.deepEqual(inserted.data, guest);
  assert.equal(inserted.revision, 1);
});

test("concurrent progress initialization preserves an existing account and reports invalid data", async () => {
  const duplicate = Object.assign(new Error("duplicate"), { code: 11000 });
  let existing = { data: { "orbit-claims": "90", "orbit-skin": "2" } };
  const collection = { async insertOne() { throw duplicate; }, async findOne() { return existing; } };
  assert.deepEqual(await initializePlayerProgress(collection, "player", { "orbit-claims": "3" }), existing.data);
  existing = { data: { "orbit-password": "not allowed" } };
  assert.equal(await initializePlayerProgress(collection, "player", {}), null);
  existing = null;
  await assert.rejects(initializePlayerProgress(collection, "player", {}), (error) => error === duplicate);
  const denied = new Error("not authorized");
  await assert.rejects(initializePlayerProgress({ async insertOne() { throw denied; } }, "player", {}), (error) => error === denied);
});
