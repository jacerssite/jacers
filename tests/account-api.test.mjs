import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { MongoClient, ObjectId } from "mongodb";

test("account registration, progress, privacy, logout, and login work together", async () => {
  process.env.VERCEL = "1";
  process.env.DATABASE_MONGODB_URI = " ";
  process.env.DATABASE_URL = " ";
  process.env.MONGODB_URI = "mongodb://account-test.example/test-db";
  process.env.OWNER_PASSWORD = "test-owner-password-1";
  process.env.ADDITIONAL_OWNER_PASSWORD = "test-owner-password-2";

  const userRecords = [];
  const sessionRecords = [];
  const progressRecords = [];
  const sameId = (a, b) => a?.toString() === b?.toString();
  const generic = {
    async dropIndex() { throw Object.assign(new Error("missing collection"), { code: 26 }); },
    async createIndex() {},
    async updateMany() {},
    async updateOne() { return { matchedCount: 1 }; },
  };
  const users = {
    ...generic,
    async insertOne(document) {
      if (userRecords.some((user) => user.usernameNormalized === document.usernameNormalized)) throw Object.assign(new Error("duplicate"), { code: 11000 });
      const _id = new ObjectId();
      userRecords.push({ ...document, _id });
      return { insertedId: _id };
    },
    async findOne(filter) {
      return userRecords.find((user) => filter._id ? sameId(user._id, filter._id) : user.usernameNormalized === filter.usernameNormalized) ?? null;
    },
    async updateOne(filter, update) {
      const user = await this.findOne(filter);
      if (!user) return { matchedCount: 0 };
      Object.assign(user, update.$set ?? {});
      return { matchedCount: 1 };
    },
  };
  const sessions = {
    ...generic,
    async insertOne(document) { sessionRecords.push(document); return { insertedId: new ObjectId() }; },
    async findOne(filter) { return sessionRecords.find((session) => session.tokenHash === filter.tokenHash && session.expiresAt > filter.expiresAt.$gt) ?? null; },
    async deleteOne(filter) {
      const index = sessionRecords.findIndex((session) => session.tokenHash === filter.tokenHash);
      if (index >= 0) sessionRecords.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
    async deleteMany(filter) {
      for (let index = sessionRecords.length - 1; index >= 0; index--) {
        const session = sessionRecords[index];
        if (filter.userId && sameId(session.userId, filter.userId) || filter.expiresAt && session.expiresAt <= filter.expiresAt.$lte) sessionRecords.splice(index, 1);
      }
    },
  };
  const progress = {
    ...generic,
    async findOne(filter) { return progressRecords.find((record) => sameId(record._id, filter._id)) ?? null; },
    async insertOne(document) {
      if (progressRecords.some((record) => sameId(record._id, document._id))) throw Object.assign(new Error("duplicate"), { code: 11000 });
      progressRecords.push(document);
    },
    async updateOne(filter, update) {
      const record = await this.findOne(filter);
      if (!record || record.revision !== filter.revision) return { matchedCount: 0, upsertedCount: 0 };
      Object.assign(record, update.$set ?? {});
      record.revision += update.$inc?.revision ?? 0;
      return { matchedCount: 1, upsertedCount: 0 };
    },
  };
  const originalConnect = MongoClient.prototype.connect;
  const originalDb = MongoClient.prototype.db;
  MongoClient.prototype.connect = async function () { return this; };
  MongoClient.prototype.db = function () {
    return { collection(name) {
      if (name === "users") return users;
      if (name === "user_sessions") return sessions;
      if (name === "player_progress") return progress;
      return generic;
    } };
  };

  let server;
  try {
    const { default: handler } = await import("../api/router.mjs");
    server = createServer((req, res) => handler(req, res));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = (route, options = {}) => fetch(`${origin}/api/router?_route=${route}`, options);
    const jsonHeaders = { origin, "content-type": "application/json" };
    const credentials = { username: "Pilot_7", password: "private-test-password" };

    const forbidden = await request("auth/register", { method: "POST", headers: { ...jsonHeaders, origin: "https://other.example" }, body: JSON.stringify(credentials) });
    assert.equal(forbidden.status, 403);
    const registered = await request("auth/register", { method: "POST", headers: jsonHeaders, body: JSON.stringify(credentials) });
    assert.equal(registered.status, 201);
    const registration = await registered.json();
    assert.equal(registration.user.username, "Pilot_7");
    assert.match(registration.recoveryCode, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
    const cookie = registered.headers.get("set-cookie").split(";")[0];
    assert.equal(progressRecords.length, 1);
    assert.deepEqual(progressRecords[0].data, {});

    const initialized = await request("account/progress", {
      method: "PUT", headers: { ...jsonHeaders, cookie },
      body: JSON.stringify({ progress: { "orbit-claims": "42" }, baseProgress: null, initializeOnly: true }),
    });
    assert.equal(initialized.status, 200);
    assert.deepEqual((await initialized.json()).progress, {});
    progressRecords[0].data["orbit-claims"] = "60";
    progressRecords[0].revision++;
    const conflictingSave = await request("account/progress", {
      method: "PUT", headers: { ...jsonHeaders, cookie },
      body: JSON.stringify({ progress: { "orbit-claims": "44" }, baseProgress: { "orbit-claims": "42" } }),
    });
    assert.equal(conflictingSave.status, 409);
    assert.equal(progressRecords[0].data["orbit-claims"], "60");
    const unchangedSave = await request("account/progress", {
      method: "PUT", headers: { ...jsonHeaders, cookie },
      body: JSON.stringify({ progress: { "orbit-claims": "42" }, baseProgress: { "orbit-claims": "42" } }),
    });
    assert.equal((await unchangedSave.json()).progress["orbit-claims"], "60");
    const privacy = await request("account/presence", {
      method: "PUT", headers: { ...jsonHeaders, cookie }, body: JSON.stringify({ appearOffline: true }),
    });
    assert.equal((await privacy.json()).appearOffline, true);
    const session = await request("auth/session", { headers: { cookie } });
    assert.equal((await session.json()).user.appearOffline, true);

    const logout = await request("auth/logout", { method: "POST", headers: { origin, cookie } });
    assert.equal(logout.status, 204);
    const expired = await request("auth/session", { headers: { cookie } });
    assert.equal((await expired.json()).user, null);
    const login = await request("auth/login", { method: "POST", headers: jsonHeaders, body: JSON.stringify(credentials) });
    assert.equal(login.status, 200);
    const nextCookie = login.headers.get("set-cookie").split(";")[0];
    const restored = await request("account/progress", { headers: { cookie: nextCookie } });
    assert.equal((await restored.json()).progress["orbit-claims"], "60");

    userRecords[0].mustChangePassword = true;
    const restricted = await request("account/progress", { headers: { cookie: nextCookie } });
    assert.equal(restricted.status, 403);
    const passwordChange = await request("account/password", {
      method: "POST", headers: { ...jsonHeaders, cookie: nextCookie },
      body: JSON.stringify({ currentPassword: credentials.password, newPassword: "new-private-test-password" }),
    });
    assert.equal(passwordChange.status, 200);
    const afterPasswordChange = await request("auth/session", { headers: { cookie: nextCookie } });
    assert.equal((await afterPasswordChange.json()).user, null);
    const newLogin = await request("auth/login", {
      method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ username: credentials.username, password: "new-private-test-password" }),
    });
    assert.equal(newLogin.status, 200);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    MongoClient.prototype.connect = originalConnect;
    MongoClient.prototype.db = originalDb;
  }
});
