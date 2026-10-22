import { validatePlayerProgress } from "./game-data.mjs";

// Do not silently replace a balance another device changed since this device's
// last sync. The caller can keep its local data and ask the player to reload.
export function hasCurrencyConflict(existing, progress, baseline) {
  if (!existing || !baseline) return false;
  const currencyKeys = ["orbit-claims", "orbit-special-claims"];
  const prestigeChanged = (existing["orbit-prestige"] ?? "0") !== (baseline["orbit-prestige"] ?? "0");
  return currencyKeys.some((key) => {
    const localChanged = (progress[key] ?? "0") !== (baseline[key] ?? "0");
    const remoteChanged = (existing[key] ?? "0") !== (baseline[key] ?? "0");
    return localChanged && (remoteChanged || prestigeChanged);
  });
}

// A browser can edit localStorage, so player syncs must never be allowed to
// mint privileged inventory or make a large unexplained balance jump. Server
// generated rewards (codes, admin actions, and roulette) use replace writes and
// bypass this client-mutation guard.
export function getSuspiciousPlayerMutation(existing, progress, role = "player") {
  // Owner/admin/tester accounts are explicitly allowed to use local test
  // tools. Moderators and level makers still use the normal anti-cheat path;
  // their roles must never become a way to mint currency or unlocks.
  if (["owner", "admin", "tester"].includes(role) || !existing) return null;
  const changedKeys = Object.keys(progress).filter((key) => progress[key] !== existing[key]);
  const privileged = changedKeys.find((key) => /^(orbit-(all-titles|unlock-|spin-|title-unlock-|jackpot-avatar|prestige-max|tester-))/.test(key));
  if (privileged) return `privileged progress key: ${privileged}`;

  const readCount = (key) => {
    const value = existing[key];
    return typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : 0;
  };
  const nextCount = (key) => {
    const value = progress[key];
    return typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : 0;
  };
  for (const key of ["orbit-claims", "orbit-special-claims", "orbit-enemies-killed", "orbit-bosses-killed", "orbit-prestige"]) {
    if (Object.hasOwn(progress, key) && (typeof progress[key] !== "string" || !/^\d{1,10}$/.test(progress[key]))) return `${key} is invalid`;
  }
  for (const key of ["orbit-claims", "orbit-special-claims"]) {
    if (nextCount(key) < readCount(key)) return `${key} cannot decrease in a player sync`;
  }
  if (nextCount("orbit-claims") - readCount("orbit-claims") > 5000) return "normal asteroid balance jumped too far";
  if (nextCount("orbit-special-claims") - readCount("orbit-special-claims") > 100) return "special asteroid balance jumped too far";
  for (const [key, maximumJump] of [["orbit-enemies-killed", 5000], ["orbit-bosses-killed", 100]]) {
    const current = readCount(key);
    const next = nextCount(key);
    if (next < current) return `${key} cannot decrease`;
    if (next - current > maximumJump) return `${key} jumped too far`;
  }
  const currentPrestige = readCount("orbit-prestige");
  const nextPrestige = nextCount("orbit-prestige");
  if (nextPrestige < currentPrestige) return "prestige cannot decrease in a player sync";
  if (nextPrestige - currentPrestige > 1) return "prestige advanced too far in one sync";
  const routeKeys = new Set([...Object.keys(existing), ...Object.keys(progress)]);
  const completedRouteCount = [...routeKeys].filter((key) => /^orbit-level-complete-\d+$/.test(key)
    && (progress[key] === "1" || existing[key] === "1")).length;
  if (nextPrestige > Math.floor(completedRouteCount / 20)) return "prestige does not match completed routes";

  const completionKeys = changedKeys.filter((key) => /^(orbit-(level-complete|golden-level)-|orbit-key-)/.test(key) && progress[key] === "1");
  if (completionKeys.length > 1) return "multiple route rewards changed in one sync";
  if (progress["orbit-powerups"] !== existing["orbit-powerups"]) {
    let before = {};
    let after = {};
    try { before = JSON.parse(existing["orbit-powerups"] ?? "{}"); } catch { return "invalid saved power-up inventory"; }
    try { after = JSON.parse(progress["orbit-powerups"] ?? "{}"); } catch { return "invalid power-up inventory"; }
    for (const kind of ["shield", "boost", "rapid", "cannon", "star"]) {
      const oldAmount = Number.isSafeInteger(before?.[kind]) && before[kind] >= 0 ? before[kind] : 0;
      const newAmount = Number.isSafeInteger(after?.[kind]) && after[kind] >= 0 && after[kind] <= 100000 ? after[kind] : -1;
      if (newAmount < 0) return "power-up inventory contains an invalid amount";
      if (newAmount - oldAmount > 20) return "power-up inventory jumped too far";
    }
  }
  return null;
}

export function sanitizeInitialPlayerProgress(progress, role = "player") {
  if (["owner", "admin", "tester"].includes(role)) return progress;
  const sanitized = { ...progress };
  for (const key of Object.keys(sanitized)) {
    if (/^orbit-(all-titles|unlock-|spin-|title-unlock-|jackpot-avatar|prestige-max|tester-)/.test(key)) delete sanitized[key];
  }
  const clampCount = (key, maximum) => {
    const value = sanitized[key];
    if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) { if (value !== undefined) delete sanitized[key]; return; }
    sanitized[key] = String(Math.min(Number(value), maximum));
  };
  clampCount("orbit-claims", 5000);
  clampCount("orbit-special-claims", 100);
  clampCount("orbit-enemies-killed", 5000);
  clampCount("orbit-bosses-killed", 100);
  clampCount("orbit-prestige", 1);
  if (sanitized["orbit-powerups"] !== undefined) {
    try {
      const inventory = JSON.parse(sanitized["orbit-powerups"]);
      const safeInventory = Object.fromEntries(["shield", "boost", "rapid", "cannon", "star"]
        .map((kind) => [kind, Number.isSafeInteger(inventory?.[kind]) && inventory[kind] >= 0 ? Math.min(inventory[kind], 20) : 0]));
      sanitized["orbit-powerups"] = JSON.stringify(safeInventory);
    } catch {
      delete sanitized["orbit-powerups"];
    }
  }
  return sanitized;
}

// Only initialize a new account. If another device creates the record first,
// use its data instead of overwriting it with this device's guest progress.
export async function initializePlayerProgress(collection, userId, progress) {
  try {
    await collection.insertOne({ _id: userId, data: progress, revision: 1, updatedAt: new Date() });
    return progress;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await collection.findOne({ _id: userId });
    if (!existing) throw error;
    return validatePlayerProgress(existing.data);
  }
}
