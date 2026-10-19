import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { MongoClient } from "mongodb";

test("Vercel native MongoDB configuration initializes a fresh database and serves the online routes", async () => {
  // This test runs in its own Node test process and never connects to a database.
  process.env.VERCEL = "1";
  process.env.DATABASE_MONGODB_URI = " ";
  process.env.DATABASE_URL = " ";
  process.env.MONGODB_URI = "mongodb://vercel-integration.example/vercel-native";
  process.env.OWNER_PASSWORD = "test-owner-password-1";
  process.env.ADDITIONAL_OWNER_PASSWORD = "test-owner-password-2";

  let connections = 0;
  let indexDrops = 0;
  let selectedDatabase;
  const fakeCollection = {
    async dropIndex(name) {
      assert.equal(name, "windowExpiresAt_1");
      indexDrops++;
      throw Object.assign(new Error("namespace does not exist"), { code: 26 });
    },
    async createIndex() {},
    async updateMany() {},
    async updateOne() { return { matchedCount: 1 }; },
    async findOne() { return null; },
    find() { return { sort() { return { async toArray() { return []; } }; } }; },
  };
  const originalConnect = MongoClient.prototype.connect;
  const originalDb = MongoClient.prototype.db;
  MongoClient.prototype.connect = async function () {
    connections++;
    assert.equal(this.options.dbName, "vercel-native");
    assert.equal(this.options.maxIdleTimeMS, 5000);
    assert.equal(this.options.serverSelectionTimeoutMS, 12000);
    return this;
  };
  MongoClient.prototype.db = function (name) {
    selectedDatabase = name ?? this.options.dbName;
    return { collection: () => fakeCollection };
  };

  let server;
  try {
    const { default: handler } = await import("../api/router.mjs");
    server = createServer((req, res) => handler(req, res));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/router?_route=`;
    const routes = ["health", "levels", "auth/session", "settings", "game-config"];
    const responses = await Promise.all(routes.map((route) => fetch(`${base}${route}`)));
    assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 200]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(bodies[0], { ok: true });
    assert.deepEqual(bodies[1], { levels: [] });
    assert.equal(bodies[2].user, null);
    assert.equal(bodies[3].goldenTimeLimitMs, 60000);
    assert.ok(bodies[4].config);
    assert.equal(selectedDatabase, "vercel-native");
    assert.equal(connections, 1);
    assert.equal(indexDrops, 1);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    MongoClient.prototype.connect = originalConnect;
    MongoClient.prototype.db = originalDb;
  }
});
