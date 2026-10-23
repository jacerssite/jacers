import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { MongoClient, MongoNetworkError } from "mongodb";

async function waitFor(check) {
  const deadline = Date.now() + 5000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, "Timed out waiting for server state");
    await delay(10);
  }
}

test("the web server starts before MongoDB, survives failures, and enables the API after retrying setup", async (t) => {
  process.env.VERCEL = "";
  process.env.DATABASE_MONGODB_URI = "mongodb://startup-test.example/test-db";
  process.env.OWNER_PASSWORD = "test-owner-password-1";
  process.env.ADDITIONAL_OWNER_PASSWORD = "test-owner-password-2";

  let server;
  let attempts = 0;
  let canConnect = false;
  let failReads = false;
  let indexWrites = 0;
  let reads = 0;
  let rejectFirstConnection;
  let finishIndexes;
  const indexesReady = new Promise((resolve) => { finishIndexes = resolve; });
  const warnings = [];
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "warn", (message) => warnings.push(message));
  t.mock.method(console, "error", () => {});
  t.mock.method(MongoClient.prototype, "connect", async function () {
    assert.ok(server.listening, "HTTP must listen before MongoDB connects");
    attempts++;
    if (attempts === 1) {
      await new Promise((_resolve, reject) => { rejectFirstConnection = reject; });
    }
    if (!canConnect) throw new MongoNetworkError("Connection timed out");
    return this;
  });
  const collection = {
    async dropIndex() { throw Object.assign(new Error("Missing collection"), { code: 26 }); },
    async createIndex() { indexWrites++; await indexesReady; },
    async updateMany() {},
    async updateOne() {},
    find() {
      reads++;
      if (failReads) throw new MongoNetworkError("Connection lost");
      return { sort() { return this; }, async toArray() { return []; } };
    },
  };
  t.mock.method(MongoClient.prototype, "db", () => ({ collection: () => collection }));

  try {
    const { startServer } = await import("../server/start.mjs");
    server = startServer({ port: 0, retryDelayMs: 25 });
    await waitFor(() => attempts === 1);
    const base = `http://127.0.0.1:${server.address().port}`;

    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    const challenge = await fetch(`${base}/api/auth/human-challenge`);
    assert.equal(challenge.status, 200);
    await challenge.json();

    const starting = await fetch(`${base}/api/levels`);
    assert.equal(starting.status, 503);
    assert.equal(starting.headers.get("retry-after"), "10");
    assert.equal(starting.headers.get("cache-control"), "no-store");
    assert.match((await starting.json()).error, /temporarily unavailable/i);
    assert.equal(reads, 0);

    rejectFirstConnection(new MongoNetworkError("Connection timed out"));
    await waitFor(() => attempts >= 2 && warnings.length >= 2);
    assert.equal(server.listening, true);
    const offline = await fetch(`${base}/api/settings`);
    assert.equal(offline.status, 503);
    await offline.json();

    canConnect = true;
    await waitFor(() => indexWrites > 0);
    const settingUp = await fetch(`${base}/api/levels`);
    assert.equal(settingUp.status, 503, "Connecting alone must not expose an uninitialized API");
    await settingUp.json();
    finishIndexes();
    await waitFor(async () => {
      const response = await fetch(`${base}/api/levels`);
      const body = await response.json();
      if (response.status !== 200) return false;
      assert.deepEqual(body, { levels: [] });
      return true;
    });

    failReads = true;
    const lostConnection = await fetch(`${base}/api/levels`);
    assert.equal(lostConnection.status, 503);
    assert.match((await lostConnection.json()).error, /temporarily unavailable/i);
    failReads = false;
    const reconnected = await fetch(`${base}/api/levels`);
    assert.equal(reconnected.status, 200);
    assert.deepEqual(await reconnected.json(), { levels: [] });
  } finally {
    rejectFirstConnection?.(new MongoNetworkError("Test finished"));
    finishIndexes();
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
