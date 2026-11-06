import { before, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "vite";
import { DEFAULT_GAME_CONFIG, validateUpdateLog } from "../server/game-data.mjs";
import { TRUSTED_LEVEL_REWARDS } from "../server/reward-events.mjs";

let clientScript;
let siteStyles;
before(async () => {
  const output = await build({ configFile: false, logLevel: "silent", build: { write: false, minify: false } });
  const bundle = Array.isArray(output) ? output[0] : output;
  clientScript = bundle.output.find((item) => item.type === "chunk" && item.isEntry).code;
  siteStyles = await readFile(new URL("../src/style.css", import.meta.url), "utf8");
});

async function createPage(overrides = {}, initialStorage = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://test.example/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  window.Headers = Headers;
  window.TextEncoder = TextEncoder;
  window.structuredClone = structuredClone;
  window.localStorage.setItem("orbit-music-muted", "true");
  Object.entries(initialStorage).forEach(([key, value]) => window.localStorage.setItem(key, value));
  window.fetch = async (url, init = {}) => {
    const path = new URL(url, window.location.href).pathname;
    const method = init.method ?? "GET";
    const override = overrides[`${method} ${path}`] ?? overrides[path];
    const defaults = {
      "/api/auth/session": { user: null },
      "/api/settings": { goldenTimeLimitMs: 60000, rouletteTiers: [], updateLog: [] },
      "/api/game-config": { config: DEFAULT_GAME_CONFIG },
      "/api/levels": { levels: [] },
      "/api/presence": { users: [], truncated: false },
      "/api/leaderboard": { entries: [] },
      "/api/messages": { messages: [] },
      "/api/account/profile": { role: "player", nextUsernameChangeAt: null, hasRecoveryCode: true, recoveryCodeCreatedAt: null },
      "/api/presence/heartbeat": null,
    };
    const result = override === undefined ? defaults[path] : typeof override === "function" ? await override({ url, init }) : override;
    if (result === null) return new Response(null, { status: 204 });
    if (result === undefined) return Response.json({ error: `Unexpected test request: ${path}` }, { status: 404 });
    return Response.json(result.json ?? result, { status: result.status ?? 200 });
  };
  window.eval(clientScript);
  return { dom, window, document: window.document, errors };
}

async function waitFor(condition, message, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await delay(10);
  }
  assert.fail(message);
}

function clickButton(document, name) {
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === name);
  assert.ok(button, `Could not find button: ${name}`);
  assert.equal(button.disabled, false, `Button is disabled: ${name}`);
  button.click();
}

test("client normal, secret, and prestige routes match the stable server reward indices", async () => {
  const { dom, document } = await createPage({
    "/api/auth/session": { user: { id: "owner1", username: "Owner", role: "owner" } },
  });
  const readRouteNames = () => [...document.querySelectorAll(".level-button")].map((button) => button.querySelector("span").textContent.replace(/^(?:\d+|\?{2})\s*/, ""));
  const expectedNames = (indices) => indices.map((index) => TRUSTED_LEVEL_REWARDS[index].name);
  try {
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not load");
    clickButton(document, "Launch mission");
    await waitFor(() => document.querySelectorAll(".level-button").length === 20, "Normal route list did not load");
    assert.deepEqual(readRouteNames(), expectedNames([
      ...Array.from({ length: 12 }, (_, index) => index),
      18, 19,
      ...Array.from({ length: 6 }, (_, index) => index + 30),
    ]));
    document.querySelector(".secret-gate").click();
    await waitFor(() => document.querySelectorAll(".level-button").length === 4, "Secret route list did not load");
    assert.deepEqual(readRouteNames(), expectedNames([12, 16, 17, 20]));
    clickButton(document, "Mission select");
    const prestigePlanet = [...document.querySelectorAll("button")].find((button) => button.textContent.startsWith("Fly to prestige planet"));
    assert.ok(prestigePlanet, "Prestige planet control did not load");
    prestigePlanet.click();
    await waitFor(() => document.querySelectorAll(".level-button").length === 23, "Prestige route list did not load");
    assert.deepEqual(readRouteNames(), expectedNames([
      13, 14, 15,
      ...Array.from({ length: 20 }, (_, index) => index + 36),
    ]));
    document.querySelector(".secret-gate").click();
    await waitFor(() => document.querySelectorAll(".level-button").length === 3, "Prestige secret route list did not load");
    assert.deepEqual(readRouteNames(), expectedNames([21, 22, 23]));
  } finally {
    dom.window.close();
  }
});

test("main menus, customization, settings, and a mission respond to player actions", async () => {
  const { dom, document, window, errors } = await createPage();
  try {
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not load");
    await delay(30);
    clickButton(document, "Customization");
    const color = document.querySelectorAll(".ship-color-choice:not([disabled])")[1];
    assert.ok(color);
    color.click();
    assert.match(document.querySelector(".ship-preview small").textContent, /Color #[0-9a-f]{6}/i);
    assert.ok(window.localStorage.getItem("orbit-ship-color"));
    clickButton(document, "Back");
    clickButton(document, "Flight settings");
    const reduced = [...document.querySelectorAll("label")].find((label) => label.textContent.includes("Reduced effects")).querySelector("input");
    reduced.click();
    assert.equal(window.localStorage.getItem("orbit-reduced-effects"), "true");
    clickButton(document, "Back");
    clickButton(document, "Power-up shop");
    clickButton(document, "Main menu");
    clickButton(document, "Credits");
    clickButton(document, "Back");
    clickButton(document, "Launch mission");
    document.querySelector(".level-button:not([disabled])").click();
    assert.ok(document.querySelector(".game-frame"));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight" }));
    clickButton(document, "Exit");
    assert.ok(document.querySelector(".level-menu"));
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("power-ups have configurable keyboard shortcuts that activate inventory and stay visible in game", async () => {
  const config = structuredClone(DEFAULT_GAME_CONFIG);
  config.powerupRules.oneActiveAtATime = false;
  const inventory = { shield: 2, boost: 2, rapid: 2, cannon: 2, star: 0 };
  const { dom, document, window, errors } = await createPage({
    "/api/game-config": { config },
  }, {
    "orbit-powerups": JSON.stringify(inventory),
  });
  try {
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not load");
    clickButton(document, "Flight settings");
    const shieldBinding = [...document.querySelectorAll(".custom-controls-settings button")]
      .find((button) => button.textContent.startsWith("Use Shield power-up:"));
    assert.ok(shieldBinding, "Shield shortcut should be listed in keyboard controls");
    assert.match(shieldBinding.textContent, /: 1$/);
    for (const [label, key] of [
      ["Use Boost power-up", "2"],
      ["Use Rapid Fire power-up", "3"],
      ["Use Cannon power-up", "4"],
    ]) {
      assert.match([...document.querySelectorAll(".custom-controls-settings button")]
        .find((button) => button.textContent.startsWith(`${label}:`)).textContent, new RegExp(`: ${key}$`));
    }

    shieldBinding.click();
    window.dispatchEvent(new window.KeyboardEvent("keydown", { code: "Digit5", key: "5" }));
    assert.equal(JSON.parse(window.localStorage.getItem("orbit-controls")).useShield, "digit5");
    assert.ok([...document.querySelectorAll(".custom-controls-settings button")]
      .some((button) => button.textContent === "Use Shield power-up: 5"));

    clickButton(document, "Back");
    clickButton(document, "Launch mission");
    document.querySelector(".level-button:not([disabled])").click();
    await waitFor(() => document.querySelector(".game-frame"), "Mission did not start");
    assert.match(document.querySelector(".controls-key-hint").textContent, /Shield 5 · Boost 2 · Rapid Fire 3 · Cannon 4/);
    for (const [key, kind] of [["Digit5", "shield"], ["Digit2", "boost"], ["Digit3", "rapid"], ["Digit4", "cannon"]]) {
      window.dispatchEvent(new window.KeyboardEvent("keydown", { code: key, key: key.slice(-1) }));
      const currentInventory = JSON.parse(window.localStorage.getItem("orbit-powerups"));
      assert.equal(currentInventory[kind], inventory[kind] - 1, `${kind} shortcut should use its inventory`);
      window.dispatchEvent(new window.KeyboardEvent("keyup", { code: key, key: key.slice(-1) }));
      assert.match(document.querySelector(`.hud-power.${kind}`).textContent, new RegExp(`\\(${key.slice(-1)}\\)`));
    }
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("holiday ships and named trails use distinct recognizable preview art", async () => {
  const requirementsPage = await createPage({}, {
    "orbit-claims": "200",
    "orbit-enemies-killed": "0",
    "orbit-christmas-unlock-trail-21": "1",
    "orbit-christmas-unlock-trail-22": "1",
    "orbit-christmas-unlock-trail-23": "1",
  });
  try {
    await waitFor(() => requirementsPage.document.querySelector(".home-screen"), "Home screen did not load");
    clickButton(requirementsPage.document, "Customization");
    await waitFor(() => requirementsPage.document.querySelector(".customization-screen"), "Customization did not open");
    const trailCard = (index) => requirementsPage.document.querySelector(`[data-trail-index="${index}"]`);
    const trailName = (index) => trailCard(index).children[1].textContent;
    [
      "Cinder Wake", "Verdant Comet", "Gilded Stardust", "Nebula Veil",
      "Titan Breaker", "Eclipse Veil", "Ion Afterburn", "Prismatic Wake",
      "Voidfire Trail", "Meteor Streak", "Aurora Loop", "Jackpot Spark",
      "Golden Halo", "Solar Arc", "Quantum Tide", "Nova Pulse",
      "Event Horizon", "Eclipse Orbit", "Silver Meteor", "Astral Ribbon",
      "Supernova Spark", "Present Parade", "Frost Shards", "Mistletoe Drift",
    ].forEach((name, index) => assert.equal(trailName(index), name));
    for (const [index, required] of [[1, 8], [2, 18], [3, 30], [6, 44], [7, 58], [9, 78], [10, 96]]) {
      assert.equal(trailCard(index).querySelector("small").textContent, `${required} ENEMIES DEFEATED`);
    }
    assert.equal(trailCard(4).querySelector("small").textContent, "BOSS DEFEATED");
    assert.equal(trailCard(5).querySelector("small").textContent, "SECRET ROUTE");
    assert.equal(trailCard(12).querySelector("small").textContent, "ALL NORMAL ROUTES");
    assert.equal(trailCard(13).querySelector("small").textContent, "PRESTIGE 1");
    assert.equal(trailCard(16).querySelector("small").textContent, "PRESTIGE 2");
    assert.equal(trailCard(19).querySelector("small").textContent, "PRESTIGE 3");
  } finally {
    requirementsPage.dom.window.close();
  }

  const enemyUnlockPage = await createPage({}, {
    "orbit-claims": "200",
    "orbit-enemies-killed": "8",
  });
  try {
    await waitFor(() => enemyUnlockPage.document.querySelector(".home-screen"), "Home screen did not load");
    clickButton(enemyUnlockPage.document, "Customization");
    await waitFor(() => enemyUnlockPage.document.querySelector(".customization-screen"), "Customization did not open");
    assert.equal(enemyUnlockPage.document.querySelector('[data-trail-index="1"] small').textContent, "READY");
    assert.equal(enemyUnlockPage.document.querySelector('[data-trail-index="2"] small').textContent, "18 ENEMIES DEFEATED");
    enemyUnlockPage.document.querySelectorAll("[data-avatar-index]").forEach((card) => {
      if (card.querySelector("small").textContent !== "READY") {
        assert.match(card.querySelector("small").textContent, /ROULETTE/, `${card.children[1].textContent} should show its roulette unlock path`);
      }
    });
  } finally {
    enemyUnlockPage.dom.window.close();
  }

  const { dom, document, window } = await createPage({}, {
    "orbit-secret-unlocked": "1",
    "orbit-unlock-trails": "1",
    "orbit-christmas-unlock-avatar-16": "1",
    "orbit-christmas-unlock-avatar-17": "1",
    "orbit-christmas-unlock-trail-11": "1",
    "orbit-christmas-unlock-trail-21": "1",
    "orbit-christmas-unlock-trail-22": "1",
    "orbit-christmas-unlock-trail-23": "1",
    "orbit-christmas-unlock-skin-26": "1",
    "orbit-christmas-unlock-skin-27": "1",
    "orbit-christmas-unlock-skin-28": "1",
  });
  try {
    const style = document.createElement("style");
    style.textContent = siteStyles;
    document.head.append(style);
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not load");
    clickButton(document, "Customization");
    await waitFor(() => document.querySelector(".customization-screen"), "Customization did not open");
    document.querySelector('[data-avatar-index="17"]').click();
    assert.ok(document.querySelector(".ship-sleigh-art svg path"), "Sleigh should render its runner-and-hull artwork");
    for (const [selector, expected] of [
      ['[data-trail-index="21"]', "trail-present-parade"],
      ['[data-trail-index="22"]', "trail-snowfall-wake"],
      ['[data-trail-index="23"]', "trail-holly-ribbon"],
      ['[data-avatar-index="16"]', "avatar-north-star"],
      ['[data-avatar-index="17"]', "avatar-sleigh"],
    ]) {
      const card = document.querySelector(selector);
      assert.ok(card.classList.contains("limited-cosmetic-card"));
      assert.equal(card.dataset.limitedCosmetic, expected);
    }
    assert.match(siteStyles, /\.cosmetic-card-choice\.limited-cosmetic-card::after\s*\{[^}]*content:\s*"EVENT"/);
    assert.match(siteStyles, /\.ship-color-choice\.limited-cosmetic-card::before\s*\{[^}]*content:\s*"EVENT"/);
    assert.equal(window.getComputedStyle(document.querySelector('[data-trail-index="22"]')).borderTopColor, "rgb(117, 207, 224)");
    assert.equal(window.getComputedStyle(document.querySelector('[data-trail-index="23"]')).borderTopColor, "rgb(110, 169, 108)");
    const limitedSkins = [...document.querySelectorAll('.limited-cosmetic-card[data-limited-cosmetic^="skin-"]')];
    assert.equal(limitedSkins.length, 3);
    limitedSkins.forEach((card) => {
      assert.match(card.getAttribute("aria-label"), /Christmas event/);
    });

    for (const [index, className, count] of [
      ["0", "trail-cinder-wake", 8],
      ["1", "trail-verdant-comet", 8],
      ["2", "trail-gilded-dust", 9],
      ["3", "trail-nebula-veil", 8],
      ["4", "trail-titan-breaker", 8],
      ["5", "trail-eclipse-veil", 8],
      ["6", "trail-ion-afterburn", 8],
      ["7", "trail-prismatic-wake", 8],
      ["8", "trail-voidfire-trail", 8],
      ["9", "trail-meteor-streak", 8],
      ["10", "trail-aurora-loop", 8],
      ["11", "trail-jackpot-spark", 7],
      ["12", "trail-golden-halo", 8],
      ["13", "trail-solar-arc", 8],
      ["14", "trail-quantum-tide", 8],
      ["15", "trail-nova-pulse", 9],
      ["16", "trail-event-horizon", 8],
      ["17", "trail-eclipse-orbit", 8],
      ["18", "trail-silver-meteor", 8],
      ["19", "trail-astral-ribbon", 8],
      ["20", "trail-supernova-spark", 9],
      ["21", "trail-present-parade", 5],
      ["22", "trail-snowfall-wake", 10],
      ["23", "trail-holly-ribbon", 9],
    ]) {
      document.querySelector(`[data-trail-index="${index}"]`).click();
      await waitFor(() => window.localStorage.getItem("orbit-trail") === index, `Trail ${index} was not selected`);
      const particles = document.querySelectorAll(`.trail-preview-scene .${className}`);
      assert.equal(particles.length, count, `${className} should have a distinct, readable particle trail`);
    }
  } finally {
    dom.window.close();
  }
});

test("Winter Orbit shows live cooldowns and respawns presents when they expire", async () => {
  const now = Date.now();
  const expiry = now + 5000;
  const progress = {
    "orbit-christmas-server-cooldown-24": String(expiry),
    "orbit-asteroids-24": "[0,1]",
    "orbit-level-claims-24": "2",
  };
  let respawns = 0;
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user: { id: "owner1", username: "Owner_1", role: "owner" } },
    "/api/account/progress": { progress },
    "POST /api/holiday/christmas-routes/24/respawn": () => {
      respawns++;
      return { progress: { "orbit-level-complete-24": "1" } };
    },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Owner_1"]'), "Owner session was not restored");
    clickButton(document, "Flight settings");
    clickButton(document, "Open");
    await waitFor(() => document.querySelector('.tester-sidebar [data-section="rewards"]'), "Control center did not load");
    clickButton(document, "Holiday updates");
    clickButton(document, "Try Winter Orbit");
    await waitFor(() => document.querySelector(".christmas-event-screen"), "Winter Orbit did not open");
    const route = [...document.querySelectorAll(".christmas-level")].find((button) => button.textContent.includes("Frostbound Passage"));
    assert.ok(route);
    assert.equal(route.disabled, true);
    assert.match(route.querySelector("small").textContent, /COOLDOWN 00:0[0-5]/);

    window.Date.now = () => expiry + 1;
    await waitFor(() => respawns === 1, "Expired route presents were not respawned automatically", 2500);
    await waitFor(() => !route.disabled, "Route did not become claimable after presents respawned");
    assert.match(route.querySelector("small").textContent, /Collect 5 presents/);
    assert.equal(window.localStorage.getItem("orbit-asteroids-24"), null);
    assert.equal(window.localStorage.getItem("orbit-level-claims-24"), null);
  } finally {
    dom.window.close();
  }
});

test("Backspace returns to the previous in-app screen", async () => {
  const { dom, document, window, errors } = await createPage();
  try {
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not load");
    clickButton(document, "Launch mission");
    clickButton(document, "Customization");
    window.dispatchEvent(new window.KeyboardEvent("keydown", { code: "Backspace", key: "Backspace" }));
    assert.ok(document.querySelector(".level-menu"), "Backspace should return to mission select");
    window.dispatchEvent(new window.KeyboardEvent("keydown", { code: "Backspace", key: "Backspace" }));
    assert.ok(document.querySelector(".home-screen"), "Backspace should then return to the home screen");
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("Prestige is offered after every normal route is complete without a Prestige Gate", async () => {
  const incomplete = await createPage();
  try {
    await waitFor(() => incomplete.document.querySelector(".home-screen"), "Home screen did not load");
    clickButton(incomplete.document, "Launch mission");
    assert.equal([...incomplete.document.querySelectorAll(".level-button")].some((button) => button.textContent.includes("Prestige now")), false);
    const normalLevels = [...incomplete.document.querySelectorAll(".level-button")];
    assert.equal(normalLevels.length, 20);
    for (const name of ["Nova Crossing", "Meteor Run", "Solar Breaker", "Aurora Run", "Gravity Escape", "Starline Rally", "Titan Passage", "Northstar Reach"]) {
      assert.ok(normalLevels.some((button) => button.textContent.includes(name)), `Missing normal route ${name}`);
    }
    assert.equal(normalLevels.some((button) => button.textContent.includes("Frontier")), false);
    incomplete.document.querySelector(".secret-gate").click();
    assert.equal([...incomplete.document.querySelectorAll(".level-button")].some((button) => button.textContent.includes("Prestige Gate")), false);
  } finally {
    incomplete.dom.window.close();
  }

  const complete = await createPage();
  try {
    await waitFor(() => complete.document.querySelector(".home-screen"), "Home screen did not load");
    const normalRouteIndices = [
      ...Array.from({ length: 12 }, (_, index) => index),
      18,
      19,
      ...Array.from({ length: 6 }, (_, index) => index + 30),
    ];
    normalRouteIndices.forEach((index) => complete.window.localStorage.setItem(`orbit-level-complete-${index}`, "1"));
    clickButton(complete.document, "Launch mission");
    assert.ok([...complete.document.querySelectorAll("button")].some((button) => button.textContent.includes("Prestige now")));
    assert.equal([...complete.document.querySelectorAll(".level-button")].some((button) => button.textContent.includes("Prestige Gate")), false);
  } finally {
    complete.dom.window.close();
  }
});

test("global chat remains usable when the friends snapshot is unavailable", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false, leaderboardOptIn: true, allowFriendRequests: true };
  const globalMessages = [];
  const { dom, document, errors } = await createPage({
    "/api/auth/session": { user },
    "/api/account/progress": { progress: {} },
    "/api/friends": { status: 503, json: { error: "Friends unavailable" } },
    "/api/chat/global": () => ({ messages: globalMessages }),
    "POST /api/chat/global": ({ init }) => {
      const text = JSON.parse(init.body).text;
      const message = { id: `message-${globalMessages.length + 1}`, conversationId: "global", senderId: "pilot", sender: user.username, role: user.role, text, createdAt: new Date().toISOString() };
      globalMessages.push(message);
      return { message };
    },
  });
  try {
    await waitFor(() => document.querySelector(".chat-launch-button:not([hidden])"), "Chat launcher did not appear");
    document.querySelector(".chat-launch-button").click();
    await waitFor(() => document.querySelector('.chat-composer textarea'), "Global chat composer did not appear");
    const input = document.querySelector('.chat-composer textarea');
    input.value = "hello global";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    input.form.requestSubmit();
    await waitFor(() => [...document.querySelectorAll(".chat-message p")].some((item) => item.textContent === "hello global"), "Global chat message did not render");
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("malformed local saves do not stop the game from opening", async () => {
  const { dom, document, errors } = await createPage({}, {
    "orbit-custom-levels": "{}",
    "orbit-global-level-cache": "null",
    "orbit-claims": "not a number",
    "orbit-skin": "not a number",
  });
  try {
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not open after startup");
    assert.match(document.querySelector(".home-stats").textContent, /0 normal/);
    clickButton(document, "Customization");
    assert.ok(document.querySelector(".ship-preview"));
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("slow startup does not replace an account form a player is filling in", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { dom, document, window } = await createPage({
    "/api/settings": async () => { await gate; return { goldenTimeLimitMs: 60000, rouletteTiers: [], updateLog: [] }; },
  });
  try {
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not open after session restore");
    clickButton(document, "Account");
    document.querySelector('input[name="username"]').value = "Pilot_7";
    release();
    await delay(100);
    assert.equal(document.querySelector('input[name="username"]')?.value, "Pilot_7");
  } finally {
    release();
    dom.window.close();
  }
});

test("a partial settings outage does not hide a working account session", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "/api/settings": { status: 503, json: { error: "Settings unavailable" } },
    "/api/account/progress": { progress: { "orbit-claims": "24" } },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Pilot_7"]'), "Signed-in account was not restored");
    assert.equal(window.localStorage.getItem("orbit-claims"), "24");
  } finally {
    dom.window.close();
  }
});

test("the verified owner can open the local-only control center while the API is unavailable", async () => {
  let apiAvailable = true;
  const owner = { username: "vslxped", role: "owner", offlineOwnerEligible: true, appearOffline: false };
  const { dom, document, window, errors } = await createPage({
    "/api/auth/session": () => apiAvailable
      ? { user: owner }
      : { status: 503, json: { error: "The online service is temporarily unavailable." } },
    "/api/account/progress": { progress: {} },
  });
  try {
    await waitFor(() => window.localStorage.getItem("jacer-offline-owner-grant"), "Verified owner grant was not stored");
    apiAvailable = false;
    const offlineButton = document.querySelector('[aria-label="Open offline owner access"]');
    assert.ok(offlineButton, "Offline owner button is missing from the home screen");
    offlineButton.click();
    const phrase = document.querySelector('input[name="offline-owner-phrase"]');
    assert.ok(phrase, "Offline owner phrase field did not open");
    phrase.value = "T3ster!";
    phrase.form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector(".tester-screen"), "Offline owner panel did not open");
    assert.match(document.querySelector(".tester-console-header").textContent, /local-only/i);
    assert.match(document.querySelector(".tester-scope-badge").textContent, /offline/i);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("offline owner access requires a previously verified owner device", async () => {
  const { dom, document, window, errors } = await createPage({
    "/api/auth/session": { status: 503, json: { error: "The online service is temporarily unavailable." } },
  });
  try {
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not load");
    document.querySelector('[aria-label="Open offline owner access"]').click();
    const phrase = document.querySelector('input[name="offline-owner-phrase"]');
    phrase.value = "T3ster!";
    phrase.form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector(".offline-owner-panel small[role=status]")?.textContent.includes("has not been verified"), "Missing-device warning did not appear");
    assert.equal(document.querySelector(".tester-screen"), null);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("first sync uses server progress if another device initialized the account first", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  let initialization;
  const { dom, document, window } = await createPage({
    "POST /api/auth/login": { user },
    "GET /api/account/progress": { progress: null },
    "PUT /api/account/progress": ({ init }) => {
      initialization = JSON.parse(init.body);
      return { progress: { "orbit-claims": "90", "orbit-skin": "2" } };
    },
  });
  try {
    await delay(30);
    window.localStorage.setItem("orbit-claims", "3");
    clickButton(document, "Account");
    document.querySelector('input[name="username"]').value = "Pilot_7";
    document.querySelector('input[name="password"]').value = "a-valid-password";
    document.querySelector(".account-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector(".account-dashboard"), "Account did not load");
    assert.equal(initialization.initializeOnly, true);
    assert.equal(window.localStorage.getItem("orbit-claims"), "90");
    assert.equal(window.localStorage.getItem("orbit-skin"), "2");
  } finally {
    dom.window.close();
  }
});

test("startup waits for account progress and blocks gameplay until a failed load is retried", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  let progressLoads = 0;
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "GET /api/account/progress": async () => {
      progressLoads++;
      if (progressLoads === 1) return { status: 503, json: { error: "Progress temporarily unavailable" } };
      return { progress: { "orbit-claims": "42" } };
    },
  });
  try {
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not appear after account load failure");
    assert.ok(document.querySelector(".account-sync-warning"), "Account load failure should be visible");
    clickButton(document, "Launch mission");
    const firstRoute = document.querySelector(".level-button:not([disabled])");
    assert.ok(firstRoute, "First route should be listed");
    firstRoute.click();
    assert.equal(document.querySelector(".game-frame"), null, "Gameplay should stay paused until saved progress loads");
    assert.match(document.querySelector(".account-sync-warning").textContent, /gameplay is paused/i);
    clickButton(document, "Retry account sync");
    await waitFor(() => !document.querySelector(".account-sync-warning"), "Progress retry did not complete");
    assert.equal(window.localStorage.getItem("orbit-claims"), "42");
    document.querySelector(".level-button:not([disabled])").click();
    assert.ok(document.querySelector(".game-frame"), "Gameplay should start after saved progress loads");
  } finally {
    dom.window.close();
  }
});

test("startup keeps the game behind the loading screen until cloud progress is ready", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  let releaseProgress;
  const progressGate = new Promise((resolve) => { releaseProgress = resolve; });
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "GET /api/account/progress": async () => {
      await progressGate;
      return { progress: { "orbit-claims": "42" } };
    },
  });
  try {
    await waitFor(() => document.querySelector(".startup-screen"), "Startup screen did not appear");
    await delay(50);
    assert.ok(document.querySelector(".startup-screen"), "Startup screen should remain until progress is restored");
    assert.equal(document.querySelector(".home-screen"), null);
    releaseProgress();
    await waitFor(() => document.querySelector(".home-screen"), "Home screen did not appear after progress loaded");
    assert.equal(window.localStorage.getItem("orbit-claims"), "42");
  } finally {
    releaseProgress();
    dom.window.close();
  }
});

test("startup reconciles concurrent account changes and preserves a recovery backup", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  const baseline = { "orbit-claims": "5", "orbit-last-level": "Vega Outpost", "orbit-ship-color": "#000000" };
  const remote = { "orbit-claims": "8", "orbit-last-level": "Vega Outpost", "orbit-ship-color": "#abcdef" };
  let getRequests = 0;
  let putRequests = 0;
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "GET /api/account/progress": () => {
      getRequests++;
      return { progress: remote };
    },
    "PUT /api/account/progress": ({ init }) => {
      putRequests++;
      const body = JSON.parse(init.body);
      if (putRequests === 1) return { status: 409, json: { error: "Progress changed on another device." } };
      assert.deepEqual(body.baseProgress, remote);
      assert.equal(body.progress["orbit-claims"], "8", "Cloud value should win a same-field conflict");
      assert.equal(body.progress["orbit-last-level"], "Emberline Run", "Local-only change should be merged");
      assert.equal(body.progress["orbit-ship-color"], "#abcdef", "Remote-only change should be preserved");
      return { progress: body.progress };
    },
  }, {
    "orbit-claims": "10",
    "orbit-last-level": "Emberline Run",
    "orbit-ship-color": "#000000",
    "jacer-local-owner": "pilot_7",
    "jacer-progress-snapshot-pilot_7": JSON.stringify(baseline),
  });
  try {
    await waitFor(() => document.querySelector(".home-screen"), "Home did not load after progress reconciliation");
    await waitFor(() => document.querySelector(".account-sync-warning"), "Concurrent progress warning was not shown");
    assert.equal(getRequests, 2);
    assert.equal(putRequests, 2);
    assert.equal(window.localStorage.getItem("orbit-claims"), "8");
    assert.equal(window.localStorage.getItem("orbit-last-level"), "Emberline Run");
    assert.equal(window.localStorage.getItem("orbit-ship-color"), "#abcdef");
    const backup = JSON.parse(window.localStorage.getItem("jacer-progress-conflict-backup-pilot_7"));
    assert.equal(backup.local["orbit-claims"], "10");
    assert.equal(backup.cloud["orbit-claims"], "8");
    assert.ok(document.querySelector(".account-sync-warning button").textContent.includes("Download recovery backup"));
  } finally {
    dom.window.close();
  }
});

test("leaderboard profiles show the player's presence and character", async () => {
  const entry = { id: "entry", userId: "player1", username: "Pilot_7", level: "Vega Outpost", timeMs: 12000, abilities: [] };
  const player = { username: "Pilot_7", role: "player", isOnline: true, shipColor: "#abcdef", avatar: 0, skin: 0, trail: 0, asteroids: 42, specialAsteroids: 2, prestige: 0, routesCleared: 1, title: "Cadet" };
  const { dom, document, errors } = await createPage({ "/api/leaderboard": { entries: [entry] }, "/api/players/player1": { player } });
  try {
    await delay(30);
    clickButton(document, "Launch mission");
    clickButton(document, "Online leaderboard");
    await waitFor(() => document.querySelector(".leaderboard-player-button"), "Leaderboard did not load");
    clickButton(document, "Pilot_7");
    await waitFor(() => document.querySelector(".profile-character-card"), "Player profile did not load");
    assert.equal(document.querySelector(".profile-presence").textContent, "ONLINE NOW");
    assert.match(document.querySelector(".profile-character-card small").textContent, /#abcdef/i);
    clickButton(document, "Back to leaderboard");
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("owner leaderboard wipe requires typed confirmation and reports successful deletion", async () => {
  let wipeRequests = 0;
  const owner = { id: "owner1", username: "Owner", role: "owner" };
  const { dom, document, errors } = await createPage({
    "/api/auth/session": { user: owner },
    "POST /api/leaderboard/wipe": async () => {
      wipeRequests++;
      return { deletedEntries: 3, clearedPersonalBestAccounts: 2 };
    },
  });
  try {
    await delay(30);
    clickButton(document, "Launch mission");
    clickButton(document, "Online leaderboard");
    await waitFor(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Wipe leaderboard scores and personal best times"), "Owner wipe control did not load");
    clickButton(document, "Wipe leaderboard scores and personal best times");
    const confirmation = document.querySelector(".action-dialog");
    assert.match(confirmation.textContent, /every online leaderboard entry and personal best time/i);
    const input = confirmation.querySelector("input");
    input.value = "NO";
    clickButton(document, "Wipe leaderboard");
    assert.equal(wipeRequests, 0);
    assert.match(confirmation.querySelector('[role="status"]').textContent, /type WIPE exactly/i);
    input.value = "WIPE";
    clickButton(document, "Wipe leaderboard");
    await waitFor(() => document.querySelector(".action-dialog")?.textContent.includes("Leaderboard wipe complete"), "Success dialog did not appear");
    assert.equal(wipeRequests, 1);
    assert.match(document.querySelector(".action-dialog").textContent, /Deleted 3 online scores.*cleared personal best times for 2 accounts/i);
    clickButton(document, "Done");
    await delay(30);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("signed-in player profiles animate their character before friend data finishes loading", async () => {
  let releaseFriends;
  const friendsGate = new Promise((resolve) => { releaseFriends = resolve; });
  const user = { username: "Viewer", role: "player", appearOffline: false, leaderboardOptIn: true, allowFriendRequests: true };
  const entry = { id: "entry", userId: "player1", username: "Pilot_7", level: "Vega Outpost", timeMs: 12000, abilities: [] };
  const player = { id: "player1", username: "Pilot_7", role: "player", isOnline: true, shipColor: "#abcdef", avatar: 0, skin: 0, trail: 0, asteroids: 42, specialAsteroids: 2, prestige: 0, routesCleared: 1 };
  const { dom, document, errors } = await createPage({
    "/api/auth/session": { user },
    "/api/account/progress": { progress: {} },
    "/api/leaderboard": { entries: [entry] },
    "/api/players/player1": { player },
    "/api/friends": async () => { await friendsGate; return { friends: [], incoming: [], outgoing: [] }; },
  });
  try {
    await delay(30);
    clickButton(document, "Launch mission");
    clickButton(document, "Online leaderboard");
    await waitFor(() => document.querySelector(".leaderboard-player-button"), "Leaderboard did not load");
    clickButton(document, "Pilot_7");
    await waitFor(() => document.querySelector(".profile-character-card .trail-preview-ship")?.style.transform, "Profile character did not begin animating");
    assert.ok(document.querySelector(".profile-friend-action .text-button"), "Friend action should render without waiting for friend data");
    assert.deepEqual(errors, []);
  } finally {
    releaseFriends();
    dom.window.close();
  }
});

test("leaderboard keeps the latest level selection when responses arrive out of order", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const entry = (username, level) => ({ id: username, userId: username, username, level, timeMs: 12000, abilities: [] });
  const { dom, document, window } = await createPage({
    "/api/leaderboard": async ({ url }) => {
      const level = new URL(url, "https://test.example").searchParams.get("level");
      if (level === "Vega Outpost") { await gate; return { entries: [entry("SlowReply", level)] }; }
      if (level === "Emberline Run") return { entries: [entry("LatestReply", level)] };
      return { entries: [] };
    },
  });
  try {
    await delay(30);
    clickButton(document, "Launch mission");
    clickButton(document, "Online leaderboard");
    const picker = document.querySelector(".leaderboard-level-picker");
    picker.value = "Vega Outpost";
    picker.dispatchEvent(new window.Event("change"));
    picker.value = "Emberline Run";
    picker.dispatchEvent(new window.Event("change"));
    await waitFor(() => document.querySelector(".leaderboard-player-button")?.textContent === "LatestReply", "Latest leaderboard did not load");
    release();
    await delay(60);
    assert.equal(document.querySelector(".leaderboard-player-button").textContent, "LatestReply");
  } finally {
    release();
    dom.window.close();
  }
});

test("account visibility setting saves the requested offline status", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  let choice;
  const { dom, document } = await createPage({
    "/api/auth/session": { user },
    "/api/account/progress": { progress: {} },
    "PUT /api/account/presence": ({ init }) => { choice = JSON.parse(init.body).appearOffline; return { appearOffline: choice }; },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Pilot_7"]'), "Account did not load");
    clickButton(document, "Pilot_7");
    const privacy = document.querySelector('[aria-label="Appear offline"]');
    privacy.click();
    await waitFor(() => !privacy.disabled, "Visibility did not finish saving");
    assert.equal(choice, true);
    assert.equal(privacy.checked, true);
    assert.match(document.querySelector(".presence-setting-status").textContent, /appear offline/i);
  } finally {
    dom.window.close();
  }
});

test("account settings are organized into persistent player tabs", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "/api/account/progress": { progress: {} },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Pilot_7"]'), "Account did not load");
    clickButton(document, "Pilot_7");
    const overview = document.querySelector('[data-control-section="overview"]');
    const profile = document.querySelector('[data-control-section="profile"]');
    assert.equal(overview.hidden, false);
    assert.equal(profile.hidden, true);
    clickButton(document, "Profile");
    assert.equal(overview.hidden, true);
    assert.equal(profile.hidden, false);
    assert.equal(window.localStorage.getItem("orbit-account-tab"), "profile");
    clickButton(document, "Security");
    assert.equal(document.querySelector('[data-control-section="security"]').hidden, false);
  } finally {
    dom.window.close();
  }
});

test("redeeming a code refreshes the server balance instead of overwriting it with a stale balance", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  const requests = [];
  let progressReads = 0;
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "GET /api/account/progress": () => {
      progressReads++;
      if (progressReads === 1) return { progress: { "orbit-claims": "100" } };
      requests.push("refresh");
      return { progress: { "orbit-claims": "160" } };
    },
    "PUT /api/account/progress": ({ init }) => {
      requests.push("save");
      return { progress: JSON.parse(init.body).progress };
    },
    "POST /api/codes/redeem": () => {
      requests.push("redeem");
      return { reward: { type: "claims", amount: 10 } };
    },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Pilot_7"]'), "Account did not load");
    clickButton(document, "Flight settings");
    const form = document.querySelector(".settings-code-section form");
    form.querySelector("input").value = "REWARD";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => form.querySelector('[role="status"]').textContent.startsWith("Success:"), "Reward did not finish refreshing");
    assert.deepEqual(requests, ["save", "redeem", "refresh"]);
    assert.equal(window.localStorage.getItem("orbit-claims"), "160");
  } finally {
    dom.window.close();
  }
});

test("currency collected while a code is being redeemed is retained with the reward", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  let release;
  let redemptionStarted = false;
  let progressReads = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "GET /api/account/progress": () => ({ progress: { "orbit-claims": ++progressReads === 1 ? "100" : "160" } }),
    "PUT /api/account/progress": ({ init }) => ({ progress: JSON.parse(init.body).progress }),
    "POST /api/codes/redeem": async () => {
      redemptionStarted = true;
      await gate;
      return { reward: { type: "claims", amount: 10 } };
    },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Pilot_7"]'), "Account did not load");
    clickButton(document, "Flight settings");
    const form = document.querySelector(".settings-code-section form");
    form.querySelector("input").value = "REWARD";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => redemptionStarted, "Redemption did not start");
    window.localStorage.setItem("orbit-claims", "105");
    release();
    await waitFor(() => form.querySelector('[role="status"]').textContent.startsWith("Success:"), "Reward did not finish refreshing");
    assert.equal(window.localStorage.getItem("orbit-claims"), "165");
  } finally {
    release();
    dom.window.close();
  }
});

test("an uncertain code redemption pauses cloud saving until the account is reloaded", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  let progressWrites = 0;
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "GET /api/account/progress": { progress: { "orbit-claims": "100" } },
    "PUT /api/account/progress": ({ init }) => {
      progressWrites++;
      return { progress: JSON.parse(init.body).progress };
    },
    "POST /api/codes/redeem": () => { throw new Error("Connection lost"); },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Pilot_7"]'), "Account did not load");
    clickButton(document, "Flight settings");
    const form = document.querySelector(".settings-code-section form");
    form.querySelector("input").value = "REWARD";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => form.querySelector('[role="status"]').textContent.includes("Could not confirm"), "Uncertain redemption was not reported");
    window.localStorage.setItem("orbit-claims", "105");
    await delay(2600);
    assert.equal(progressWrites, 1);
  } finally {
    dom.window.close();
  }
});

test("a concurrent currency conflict keeps local progress and warns that cloud saving paused", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  let progressWrites = 0;
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "GET /api/account/progress": { progress: { "orbit-claims": "100" } },
    "PUT /api/account/progress": () => {
      progressWrites++;
      return { status: 409, json: { error: "Progress changed on another device. Your local progress is still on this device; reload to reconcile the latest cloud progress before saving again." } };
    },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Pilot_7"]'), "Account did not load");
    clickButton(document, "Flight settings");
    window.localStorage.setItem("orbit-claims", "105");
    const form = document.querySelector(".settings-code-section form");
    form.querySelector("input").value = "REWARD";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector(".account-sync-warning"), "Conflict warning was not shown");
    assert.match(document.querySelector(".account-sync-warning").textContent, /your local progress is still on this device/i);
    await delay(2600);
    assert.equal(progressWrites, 1);
    assert.equal(window.localStorage.getItem("orbit-claims"), "105");
  } finally {
    dom.window.close();
  }
});

test("background save failures are visible and the warning clears after a successful retry", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  let progressWrites = 0;
  let releaseRetry;
  const retryGate = new Promise((resolve) => { releaseRetry = resolve; });
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "GET /api/account/progress": { progress: { "orbit-claims": "100" } },
    "PUT /api/account/progress": async ({ init }) => {
      progressWrites++;
      if (progressWrites === 1) return { status: 503, json: { error: "Progress service unavailable" } };
      if (progressWrites === 2) await retryGate;
      return { progress: JSON.parse(init.body).progress };
    },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Pilot_7"]'), "Account did not load");
    window.localStorage.setItem("orbit-claims", "105");
    await waitFor(() => document.querySelector(".account-sync-warning"), "Failed background save was not shown", 3000);
    assert.match(document.querySelector(".account-sync-warning").textContent, /saved on this device but have not been confirmed online/i);
    assert.equal(window.localStorage.getItem("orbit-claims"), "105");
    releaseRetry();
    await waitFor(() => progressWrites >= 2 && !document.querySelector(".account-sync-warning"), "Save retry did not clear the warning", 4000);
    assert.equal(window.localStorage.getItem("orbit-claims"), "105");
  } finally {
    releaseRetry();
    dom.window.close();
  }
});

test("registration shows the one-time recovery code and does not save before progress loads", async () => {
  const user = { username: "Pilot_7", role: "player", appearOffline: false };
  let progressWrites = 0;
  const { dom, document, window } = await createPage({
    "GET /api/auth/human-challenge": { token: "test-challenge", question: "What is 2 + 2?" },
    "POST /api/auth/register": { user, recoveryCode: "ABCD-2345-EFGH-6789" },
    "GET /api/account/progress": { status: 503, json: { error: "Progress temporarily unavailable" } },
    "PUT /api/account/progress": () => { progressWrites++; return { progress: {} }; },
  }, { "orbit-claims": "88", "orbit-special-claims": "12", "orbit-skin": "4" });
  try {
    await delay(30);
    clickButton(document, "Account");
    clickButton(document, "Create a new account");
    await waitFor(() => !document.querySelector('input[name="human-answer"]').disabled, "Human check did not load");
    document.querySelector('input[name="username"]').value = "Pilot_7";
    document.querySelector('input[name="human-answer"]').value = "4";
    document.querySelector('input[name="password"]').value = "a-valid-password";
    document.querySelector(".account-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector(".recovery-code-display"), "One-time recovery code was not shown");
    assert.equal(document.querySelector(".recovery-code-display").textContent, "ABCD-2345-EFGH-6789");
    assert.equal(window.localStorage.getItem("orbit-claims"), null);
    assert.equal(window.localStorage.getItem("orbit-special-claims"), null);
    assert.equal(window.localStorage.getItem("orbit-skin"), null);
    await delay(2600);
    assert.equal(progressWrites, 0);
  } finally {
    dom.window.close();
  }
});

test("owner indicator remains stable after page updates", async () => {
  const user = { username: "Owner_1", role: "owner", appearOffline: false };
  const { dom, document } = await createPage({ "/api/auth/session": { user }, "/api/account/progress": { progress: {} } });
  try {
    await waitFor(() => document.querySelector(".owner-account-indicator"), "Owner indicator was not displayed");
    const indicator = document.querySelector(".owner-account-indicator");
    await delay(50);
    assert.equal(document.querySelector(".owner-account-indicator"), indicator);
  } finally {
    dom.window.close();
  }
});

test("owner star opens paused in-game quick tools and applies personal test resources", async () => {
  const user = { username: "Owner_1", role: "owner", appearOffline: false };
  const { dom, document, window } = await createPage({ "/api/auth/session": { user }, "/api/account/progress": { progress: {} } });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Owner_1"]'), "Owner session was not restored");
    clickButton(document, "Launch mission");
    document.querySelector(".level-button:not([disabled])").click();
    await waitFor(() => document.querySelector(".game-frame"), "Mission did not start");
    await waitFor(() => document.querySelector(".owner-account-indicator"), "Owner quick button was not restored in-game");
    window.confirm = () => true;
    document.querySelector(".owner-account-indicator").click();
    await waitFor(() => document.querySelector(".role-quick-overlay"), "Owner quick panel did not open");
    assert.equal(document.querySelector(".owner-quick-overlay"), document.querySelector(".role-quick-overlay"));
    const inputs = document.querySelectorAll(".role-quick-form input");
    inputs[0].value = "123";
    inputs[1].value = "45";
    clickButton(document, "Apply resources");
    assert.equal(window.localStorage.getItem("orbit-claims"), "123");
    assert.equal(window.localStorage.getItem("orbit-special-claims"), "45");
    clickButton(document, "Return to level");
    assert.equal(document.querySelector(".role-quick-overlay"), null);
    assert.ok(document.querySelector(".game-frame"));
  } finally {
    dom.window.close();
  }
});

test("tester bubble opens an isolated quick panel with tester styling", async () => {
  const user = { username: "Tester_1", role: "tester", appearOffline: false };
  const { dom, document } = await createPage({ "/api/auth/session": { user }, "/api/account/progress": { progress: {} } });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Tester_1"]'), "Tester session was not restored");
    clickButton(document, "Launch mission");
    document.querySelector(".level-button:not([disabled])").click();
    await waitFor(() => document.querySelector(".game-frame"), "Mission did not start");
    await waitFor(() => document.querySelector(".tester-role"), "Tester quick button was not restored in-game");
    document.querySelector(".tester-role").click();
    await waitFor(() => document.querySelector(".tester-quick-overlay"), "Tester quick panel did not open");
    assert.match(document.querySelector(".role-quick-panel h2").textContent, /Tester/);
    clickButton(document, "Return to level");
  } finally {
    dom.window.close();
  }
});

test("control center keeps sections separate and preserves drafts while switching worlds and management tools", async () => {
  const user = { username: "Owner_1", role: "owner", appearOffline: false };
  let savedConfig;
  let savedRoulette;
  let rouletteWrites = 0;
  let codeLoads = 0;
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "/api/account/progress": { progress: {} },
    "PUT /api/game-config": ({ init }) => { savedConfig = JSON.parse(init.body).config; return { config: savedConfig }; },
    "PUT /api/settings/roulette-tiers": ({ init }) => { rouletteWrites++; savedRoulette = JSON.parse(init.body).tiers; return { rouletteTiers: savedRoulette }; },
    "/api/admin/codes": () => {
      codeLoads++;
      return { codes: [{ id: "code-1", maxUses: null, perPlayerLimit: 1, uses: 2, reward: { type: "claims", amount: 25 }, enabled: true, expiresAt: null }] };
    },
    "/api/admin/users": { users: [] },
    "/api/admin/messages": { messages: [] },
  });
  try {
    window.confirm = () => true;
    const style = document.createElement("style");
    style.textContent = siteStyles;
    document.head.append(style);
    await waitFor(() => document.querySelector('[aria-label="Account: Owner_1"]'), "Owner session was not restored");
    clickButton(document, "Flight settings");
    clickButton(document, "Open");
    await waitFor(() => document.querySelector('.tester-sidebar [data-section="rewards"]'), "Control center did not load");
    const rewards = document.querySelector('[data-control-section="rewards"]');
    const profile = document.querySelector('[data-control-section="profile"]');
    assert.equal(window.getComputedStyle(rewards).display, "grid");
    assert.equal(window.getComputedStyle(profile).display, "none");
    assert.equal(document.querySelector('[data-section="rewards"]').getAttribute("aria-current"), "page");
    assert.ok(rewards.querySelector('[data-rainbow-star-chance]'));
    assert.equal(rewards.querySelector(".roulette-settings-editor"), null);

    clickButton(document, "Resources");
    assert.equal(window.getComputedStyle(rewards).display, "none");
    assert.equal(window.getComputedStyle(document.querySelector(".tester-world-tabs")).display, "none");
    const claims = profile.querySelector('input[type="number"]');
    claims.value = "17";
    clickButton(document, "Levels & prestige");
    const sanctuaryInputs = [...document.querySelectorAll('.tester-levels label')]
      .filter((label) => label.querySelector("span")?.textContent === "Celestial Sanctum")
      .map((label) => label.querySelector("input"));
    assert.equal(sanctuaryInputs.length, 2);
    sanctuaryInputs[0].click();
    assert.equal(sanctuaryInputs[1].checked, sanctuaryInputs[0].checked);
    clickButton(document, "Unlock normal levels");
    assert.equal(claims.value, "17");
    clickButton(document, "World chances & rewards");
    const star = rewards.querySelector('[data-rainbow-star-chance]');
    star.value = "11";
    star.dispatchEvent(new window.Event("input", { bubbles: true }));
    clickButton(document, "Prestige world");
    star.value = "27";
    star.dispatchEvent(new window.Event("input", { bubbles: true }));
    clickButton(document, "Normal world");
    assert.equal(star.value, "11");
    assert.equal(claims.value, "17");
    clickButton(document, "Save settings");
    // The full test suite runs other server/browser fixtures concurrently on
    // slower Windows machines. This is an async UI save, not a short polling
    // assertion, so give it enough time without weakening the condition.
    await waitFor(() => window.localStorage.getItem("orbit-claims") === "17", "Settings did not finish saving", 6000);
    assert.equal(savedConfig.normal.rainbowStarChance, 11);
    assert.equal(savedConfig.prestige.rainbowStarChance, 27);
    assert.equal(window.localStorage.getItem("orbit-claims"), "17");

    clickButton(document, "Roulette & spinning");
    const tier = document.querySelector('.roulette-tier-card[data-buy-in="5"]');
    const asteroidChance = tier.querySelector('[data-roulette-field="chance.claims"]');
    const colorChance = tier.querySelector('[data-roulette-field="chance.color"]');
    asteroidChance.value = "44";
    clickButton(document, "Save roulette tiers");
    assert.match(document.querySelector('.roulette-settings-editor [role="status"]').textContent, /totaling 100%/);
    assert.equal(rouletteWrites, 0);
    asteroidChance.value = "41";
    colorChance.value = "21";
    clickButton(document, "Save roulette tiers");
    await waitFor(() => savedRoulette, "Roulette tiers did not save");
    assert.equal(savedRoulette[0].chances.claims, 41);
    assert.equal(savedRoulette[0].chances.color, 21);

    clickButton(document, "Reward codes");
    await waitFor(() => document.querySelector('.tester-player-management:not([hidden]) input[type="text"]'), "Code tools did not load");
    await waitFor(() => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Edit"), "Code list did not load");
    const codeInput = document.querySelector('.tester-player-management:not([hidden]) input[type="text"]');
    codeInput.value = "DRAFT-CODE";
    clickButton(document, "Edit");
    assert.ok(document.querySelector(".redemption-code-edit"));
    assert.equal(document.querySelector('.redemption-code-edit [aria-label="Unlimited total uses"]').checked, true);
    clickButton(document, "Cancel");
    clickButton(document, "Messages");
    await waitFor(() => document.querySelector('[aria-label="Message title"]'), "Message tools did not load");
    clickButton(document, "Reward codes");
    assert.equal(document.querySelector('.tester-player-management:not([hidden]) input[type="text"]').value, "DRAFT-CODE");
    assert.equal(codeLoads, 1);
    clickButton(document, "Update log");
    await waitFor(() => document.querySelector(".update-log-editor"), "Update editor did not load");
    clickButton(document, "Add update");
    document.querySelector('[data-update-title="0"]').value = "Draft title";
    clickButton(document, "Add update");
    assert.equal(document.querySelector('[data-update-title="1"]').value, "Draft title");
    clickButton(document, "Remove");
    clickButton(document, "Remove update");
    await delay(0);
    assert.equal(document.querySelector('[data-update-title="0"]').value, "Draft title");
  } finally {
    dom.window.close();
  }
});

test("update log preserves pasted formatting, supports indentation, and publishes safe plain text", async () => {
  const user = { username: "Owner_1", role: "owner", appearOffline: false };
  let saved;
  let writes = 0;
  const { dom, document, window, errors } = await createPage({
    "/api/auth/session": { user },
    "/api/account/progress": { progress: {} },
    "PUT /api/settings/update-log": ({ init }) => {
      writes++;
      saved = validateUpdateLog(JSON.parse(init.body).entries);
      assert.ok(saved, "Server rejected the editor's update log");
      return { updateLog: saved };
    },
  });
  try {
    window.confirm = () => true;
    const style = document.createElement("style");
    style.textContent = siteStyles;
    document.head.append(style);
    await waitFor(() => document.querySelector('[aria-label="Account: Owner_1"]'), "Owner session was not restored");
    clickButton(document, "Flight settings");
    clickButton(document, "Open");
    clickButton(document, "Update log");
    await waitFor(() => document.querySelector(".update-log-editor"), "Update editor did not load");
    clickButton(document, "Add update");
    document.querySelector('[data-update-title="0"]').value = "Big update";
    let body = document.querySelector('[data-update-body="0"]');
    body.value = "alpha\nbeta\ngamma";
    body.setSelectionRange(0, 11);
    clickButton(document, "Indent");
    assert.equal(body.value, "    alpha\n    beta\ngamma");
    clickButton(document, "Outdent");
    assert.equal(body.value, "alpha\nbeta\ngamma");

    const useTab = document.querySelector(".update-log-tab-option input");
    assert.equal(useTab.checked, false, "Tab should normally move focus");
    useTab.click();
    body.setSelectionRange(5, 5);
    const tab = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    body.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(body.value, "alpha    \nbeta\ngamma");
    body.value = "\talpha\n  beta\ngamma";
    body.setSelectionRange(0, "\talpha\n  beta\n".length);
    const shiftTab = new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    body.dispatchEvent(shiftTab);
    assert.equal(shiftTab.defaultPrevented, true);
    assert.equal(body.value, "alpha\nbeta\ngamma");
    body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(useTab.checked, false);
    const navigationTab = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    body.dispatchEvent(navigationTab);
    assert.equal(navigationTab.defaultPrevented, false);

    body.value = "x".repeat(20_001);
    body.dispatchEvent(new window.Event("input", { bubbles: true }));
    document.querySelector(".update-log-editor").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    assert.equal(body.value.length, 20_001, "Long pastes should not be silently truncated");
    assert.equal(writes, 0);
    assert.match(document.querySelector('.update-log-editor [role="status"]').textContent, /20,000/);

    body.value = "🚀".repeat(10_000);
    for (let index = 0; index < 5; index++) {
      clickButton(document, "Add update");
      document.querySelector('[data-update-title="0"]').value = `Extra update ${index}`;
      document.querySelector('[data-update-body="0"]').value = "🚀".repeat(10_000);
    }
    document.querySelector(".update-log-editor").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    assert.equal(writes, 0);
    assert.match(document.querySelector('.update-log-editor [role="status"]').textContent, /200 KB/);
    for (let index = 0; index < 5; index++) {
      clickButton(document, "Remove");
      clickButton(document, "Remove update");
      await delay(0);
    }
    body = document.querySelector('[data-update-body="0"]');

    const pasted = `    First paragraph\n\n\t- Second paragraph\n      ${"x".repeat(900)}\n\n<img src=x onerror=alert(1)>  \n`;
    body.value = pasted;
    body.dispatchEvent(new window.Event("input", { bubbles: true }));
    document.querySelector(".update-log-editor").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector('.update-log-editor [role="status"]')?.textContent.includes("published"), "Update did not publish");
    assert.equal(saved[0].body, pasted);
    body = document.querySelector('[data-update-body="0"]');
    assert.equal(body.value, pasted);
    clickButton(document, "Back to game");
    clickButton(document, "Updates");
    const rendered = document.querySelector(".credits-updates article p");
    assert.equal(rendered.textContent, pasted);
    assert.equal(rendered.querySelector("img"), null);
    assert.equal(window.getComputedStyle(rendered).whiteSpace, "pre-wrap");
    assert.equal(window.getComputedStyle(rendered).overflowWrap, "anywhere");
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test("tester control center omits owner-only management sections", async () => {
  const user = { username: "Tester_1", role: "tester", appearOffline: false };
  const { dom, document } = await createPage({ "/api/auth/session": { user }, "/api/account/progress": { progress: {} } });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Tester_1"]'), "Tester session was not restored");
    clickButton(document, "Flight settings");
    clickButton(document, "Open");
    await waitFor(() => document.querySelector(".tester-sidebar"), "Control center did not load");
    assert.equal(document.querySelector('[data-section="players"]'), null);
    assert.equal(document.querySelector('[data-section="codes"]'), null);
    assert.match(document.querySelector(".tester-scope-badge").textContent, /LOCAL TEST MODE/);
  } finally {
    dom.window.close();
  }
});

test("saving from another section opens the world that has invalid reward odds", async () => {
  const user = { username: "Owner_1", role: "owner", appearOffline: false };
  let writes = 0;
  const { dom, document, window } = await createPage({
    "/api/auth/session": { user },
    "/api/account/progress": { progress: {} },
    "PUT /api/game-config": () => { writes++; return { config: DEFAULT_GAME_CONFIG }; },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Owner_1"]'), "Owner session was not restored");
    clickButton(document, "Flight settings");
    clickButton(document, "Open");
    await waitFor(() => document.querySelector('[data-section="rewards"]'), "Control center did not load");
    clickButton(document, "Prestige world");
    const odds = document.querySelector('[data-roll-odds="Common"]');
    odds.value = String(Number(odds.value) + 1);
    odds.dispatchEvent(new window.Event("input", { bubbles: true }));
    clickButton(document, "Resources");
    clickButton(document, "Save settings");
    assert.equal(document.querySelector('[data-section="rewards"]').getAttribute("aria-current"), "page");
    assert.equal(document.querySelector(".tester-world-tabs .selected").textContent, "Prestige world");
    assert.match(document.querySelector(".tester-save-status").textContent, /prestige world rarity chances total/i);
    assert.equal(writes, 0);
  } finally {
    dom.window.close();
  }
});

test("workshop switches between normal and flipped areas without silently dropping unsupported tiles", async () => {
  const user = { username: "Owner_1", role: "owner", appearOffline: false };
  const { dom, document } = await createPage({ "/api/auth/session": { user }, "/api/account/progress": { progress: {} } });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Owner_1"]'), "Owner session was not restored");
    clickButton(document, "Flight settings");
    clickButton(document, "Open");
    await waitFor(() => document.querySelector('[data-section="workshop"]'), "Owner tools did not load");
    clickButton(document, "Level workshop");
    clickButton(document, "Open level maker");
    const prestige = [...document.querySelectorAll("label")].find((label) => label.textContent.includes("Prestige route")).querySelector("input");
    prestige.click();
    clickButton(document, "gravity");
    document.querySelector('[aria-label="Normal tile 1"]').click();
    const flipped = [...document.querySelectorAll("button")].find((button) => button.textContent === "Flipped planet area");
    assert.equal(flipped.hidden, false);
    flipped.click();
    assert.equal(document.querySelector('[aria-label="Flipped planet area grid"]').hidden, false);
    assert.equal(document.querySelector('button[data-tile="block"]').disabled, true);
    assert.equal(document.querySelector('button[data-tile="exitKey"]').disabled, false);
    clickButton(document, "Normal area");
    assert.equal(document.querySelector('[aria-label="Normal area grid"]').hidden, false);
    assert.equal(document.querySelector('button[data-tile="exitKey"]').disabled, true);
    clickButton(document, "Delete");
    clickButton(document, "Platform");
    assert.equal(document.querySelector(".maker-mode-label").textContent, "BUILD MODE");
    prestige.click();
    assert.equal(flipped.hidden, true);
  } finally {
    dom.window.close();
  }
});

test("owners can edit built-in routes without shrinking their original route", async () => {
  const user = { username: "Owner_1", role: "owner", appearOffline: false };
  let savedLevel;
  const { dom, document } = await createPage({
    "/api/auth/session": { user },
    "/api/account/progress": { progress: {} },
    "PUT /api/settings/builtin-level-overrides": ({ init }) => {
      savedLevel = JSON.parse(init.body).level;
      return { level: savedLevel, builtinLevelOverrides: { "0": savedLevel } };
    },
  });
  try {
    await waitFor(() => document.querySelector('[aria-label="Account: Owner_1"]'), "Owner session was not restored");
    clickButton(document, "Flight settings");
    clickButton(document, "Open");
    await waitFor(() => document.querySelector('[data-section="workshop"]'), "Owner tools did not load");
    clickButton(document, "Level workshop");
    clickButton(document, "Open level maker");
    clickButton(document, "Edit Vega Outpost");
    assert.equal(document.querySelector('[aria-label="Level name"]').value, "Vega Outpost");
    assert.equal(document.querySelectorAll('[aria-label^="Normal tile"]').length, 144);
    document.querySelector('[aria-label="Level name"]').value = "Vega Outpost Revised";
    clickButton(document, "Save built-in changes");
    await waitFor(() => document.querySelector(".level-menu"), "Built-in route did not return to the level menu");
    assert.equal(savedLevel.name, "Vega Outpost Revised");
    assert.equal(savedLevel.length, 13);
  } finally {
    dom.window.close();
  }
});
