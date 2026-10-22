import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { MongoClient, ObjectId } from "mongodb";

test("staff leaderboard returns player IDs and concurrent best runs keep the faster time", async () => {
  process.env.VERCEL = "1";
  process.env.DATABASE_MONGODB_URI = " ";
  process.env.DATABASE_URL = " ";
  process.env.MONGODB_URI = "mongodb://api-test.example/test-db";
  process.env.OWNER_PASSWORD = "test-owner-password-1";
  process.env.ADDITIONAL_OWNER_PASSWORD = "test-owner-password-2";

  const userId = new ObjectId();
  const entryId = new ObjectId();
  let role = "tester";
  let raceUpdates = 0;
  let invalidProgress = false;
  let appearOffline = true;
  const settingsById = new Map();
  const runProofRecords = [];
  const codeRecords = [];
  let run = { _id: entryId, userId, levelName: "Quiet Orbit", timeMs: 20000, abilities: [], achievedAt: new Date() };
  const generic = {
    async dropIndex() { throw Object.assign(new Error("missing collection"), { code: 26 }); },
    async createIndex() {},
    async updateMany() {},
    async updateOne() { return { matchedCount: 1 }; },
    find() { return { async toArray() { return []; } }; },
  };
  const users = {
    ...generic,
    async findOne(filter) { return { _id: userId, username: "Pilot_7", role: filter.role?.$in ? "player" : role, banned: false, appearOffline }; },
    find(_filter, options = {}) {
      const profile = { _id: userId, username: "Pilot_7", usernameNormalized: "pilot_7", role: "player", banned: false };
      if (options.projection?.appearOffline) profile.appearOffline = appearOffline;
      return { sort() { return this; }, limit() { return this; }, async toArray() { return [profile]; } };
    },
  };
  const sessions = {
    ...generic,
    async findOne() { return { userId, expiresAt: new Date(Date.now() + 60000) }; },
    find() { return { async toArray() { return [{ userId }]; } }; },
  };
  const entries = {
    ...generic,
    aggregate(pipeline) {
      assert.deepEqual(Object.keys(pipeline[1]), ["$sort"]);
      assert.ok(pipeline.findIndex((step) => step.$limit) > pipeline.findIndex((step) => step.$match?.["profile.role"]));
      const projection = pipeline.find((step) => step.$project).$project;
      return { async toArray() {
        return [{
          _id: entryId,
          ...(projection.userId ? { userId } : {}),
          username: "Pilot_7", role: "tester", levelName: "Quiet Orbit", timeMs: 20000, abilities: [], achievedAt: new Date(),
        }];
      } };
    },
    async updateOne(_filter, update, options = {}) {
      raceUpdates++;
      if (options.upsert) throw Object.assign(new Error("concurrent insert"), { code: 11000 });
      run = { ...run, ...update.$set };
      return { matchedCount: 1 };
    },
    async findOne() { return run; },
  };
  const progress = {
    ...generic,
    async findOne() { return invalidProgress ? { data: { "orbit-password": "not valid" } } : null; },
  };
  const settings = {
    ...generic,
    async findOne(filter) { return settingsById.get(filter._id) ?? null; },
    async updateOne(filter, update) {
      const current = settingsById.get(filter._id);
      settingsById.set(filter._id, { _id: filter._id, ...(current ?? update.$setOnInsert), ...update.$set });
      return { matchedCount: current ? 1 : 0 };
    },
  };
  const settingHistory = { ...generic, async insertOne() {} };
  const codes = {
    ...generic,
    async insertOne(document) {
      const record = { ...document, _id: new ObjectId() };
      codeRecords.push(record);
      return { insertedId: record._id };
    },
    async findOne(filter) {
      return codeRecords.find((code) => !filter._id || code._id.toString() === filter._id.toString()) ?? null;
    },
    async updateOne(filter, update) {
      const record = await this.findOne(filter);
      if (!record) return { matchedCount: 0 };
      Object.assign(record, update.$set ?? {});
      return { matchedCount: 1 };
    },
  };
  const runProofs = {
    ...generic,
    async insertOne(document) { runProofRecords.push(document); return { insertedId: document._id }; },
    async findOne(filter) {
      return runProofRecords.find((proof) => proof._id === filter._id
        && proof.userId === filter.userId
        && proof.levelName === filter.levelName
        && proof.consumedAt === filter.consumedAt
        && proof.expiresAt > filter.expiresAt.$gt) ?? null;
    },
    async updateOne(filter, update) {
      const proof = runProofRecords.find((item) => item._id === filter._id && item.userId === filter.userId && item.consumedAt === filter.consumedAt);
      if (!proof) return { matchedCount: 0 };
      Object.assign(proof, update.$set ?? {});
      return { matchedCount: 1 };
    },
  };
  const originalConnect = MongoClient.prototype.connect;
  const originalDb = MongoClient.prototype.db;
  MongoClient.prototype.connect = async function () { return this; };
  MongoClient.prototype.db = function () {
    return { collection(name) {
      if (name === "users") return users;
      if (name === "user_sessions") return sessions;
      if (name === "leaderboard_entries") return entries;
      if (name === "player_progress") return progress;
      if (name === "game_settings") return settings;
      if (name === "setting_history") return settingHistory;
      if (name === "redemption_codes") return codes;
      if (name === "run_proofs") return runProofs;
      return generic;
    } };
  };

  let server;
  try {
    const { default: handler } = await import("../api/router.mjs");
    server = createServer((req, res) => handler(req, res));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const cookie = "jacer_session=test-session";
    const staffResponse = await fetch(`${origin}/api/router?_route=staff/leaderboard`, { headers: { cookie } });
    assert.equal(staffResponse.status, 200);
    const staff = await staffResponse.json();
    assert.equal(staff.entries[0].userId, userId.toHexString());
    const publicLeaderboard = await fetch(`${origin}/api/router?_route=leaderboard`);
    assert.equal(publicLeaderboard.status, 200);

    const publicProfile = await fetch(`${origin}/api/router?_route=players/${userId.toHexString()}`);
    assert.equal(publicProfile.status, 200);
    assert.equal((await publicProfile.json()).player.isOnline, false);
    role = "owner";
    const ownerUsers = await fetch(`${origin}/api/router?_route=admin/users`, { headers: { cookie } });
    assert.equal(ownerUsers.status, 200);
    assert.equal((await ownerUsers.json()).users[0].isOnline, false);
    role = "owner";
    const createdCodeResponse = await fetch(`${origin}/api/router?_route=admin/codes`, {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ code: "EDIT-ME1", maxUses: 10, perPlayerLimit: 1, reward: { type: "claims", amount: 25 } }),
    });
    assert.equal(createdCodeResponse.status, 201);
    const createdCode = await createdCodeResponse.json();
    const editedCodeResponse = await fetch(`${origin}/api/router?_route=admin/codes/${createdCode.code.id}`, {
      method: "PATCH",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ maxUses: null, perPlayerLimit: 2, reward: { type: "specialClaims", amount: 4 }, enabled: false, expiresAt: null }),
    });
    assert.equal(editedCodeResponse.status, 200);
    const editedCode = await editedCodeResponse.json();
    assert.equal(editedCode.code.maxUses, null);
    assert.equal(editedCode.code.perPlayerLimit, 2);
    assert.deepEqual(editedCode.code.reward, { type: "specialClaims", amount: 4 });
    assert.equal(editedCode.code.enabled, false);
    appearOffline = false;
    const visibleProfile = await fetch(`${origin}/api/router?_route=players/${userId.toHexString()}`);
    assert.equal((await visibleProfile.json()).player.isOnline, true);

    const log = [{ date: "2026-10-19", title: "Update", body: `    Intro\n\n\t- Details\n${"x".repeat(1200)}  \n` }];
    const updateLogResponse = await fetch(`${origin}/api/router?_route=settings/update-log`, {
      method: "PUT",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ entries: log }),
    });
    assert.equal(updateLogResponse.status, 200);
    assert.deepEqual((await updateLogResponse.json()).updateLog, log);
    const publicSettings = await fetch(`${origin}/api/router?_route=settings`);
    assert.deepEqual((await publicSettings.json()).updateLog, log);
    const oversizedLogResponse = await fetch(`${origin}/api/router?_route=settings/update-log`, {
      method: "PUT",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ entries: [{ ...log[0], body: "x".repeat(20_001) }] }),
    });
    assert.equal(oversizedLogResponse.status, 400);
    assert.deepEqual(settingsById.get("update_log").value, log);

    role = "player";
    invalidProgress = true;
    const invalidResponse = await fetch(`${origin}/api/router?_route=account/progress`, { headers: { cookie } });
    assert.equal(invalidResponse.status, 409);
    assert.match((await invalidResponse.json()).error, /saved player progress is invalid/i);

    role = "player";
    const unauthorizedLogResponse = await fetch(`${origin}/api/router?_route=settings/update-log`, {
      method: "PUT",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ entries: [] }),
    });
    assert.equal(unauthorizedLogResponse.status, 403);
    const runStartResponse = await fetch(`${origin}/api/router?_route=runs/start`, {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ level: "Quiet Orbit" }),
    });
    assert.equal(runStartResponse.status, 201);
    const runProof = await runStartResponse.json();
    const runResponse = await fetch(`${origin}/api/router?_route=runs`, {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ level: "Quiet Orbit", timeMs: 15000, abilities: [], proofId: runProof.runId }),
    });
    assert.equal(runResponse.status, 201);
    const result = await runResponse.json();
    assert.equal(result.improved, true);
    assert.equal(result.entry.timeMs, 15000);
    assert.equal(raceUpdates, 2);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    MongoClient.prototype.connect = originalConnect;
    MongoClient.prototype.db = originalDb;
  }
});
