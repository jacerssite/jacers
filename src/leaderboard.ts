import type { OnlineLeaderboardEntry, OnlinePlayerPresence, OnlineSettings, OnlineUser, PublicPlayerProfile } from "./types";
import { apiRequest } from "./api";
import { levels } from "./levels";
import { createTextButton } from "./ui";
import { loadFriends, sendFriendRequest } from "./friends";
import { attachPlayerCard } from "./player-card";
import { createTitleBadge } from "./title-style";

type LeaderboardContext = {
    showAccount: () => void;
    showLevelMenu: () => void;
    showMenu: () => void;
    sendPresenceHeartbeat: () => Promise<void>;
    setCurrentOnlineUser: (user: OnlineUser | null) => void;
    setGoldenTimeLimit: (limit: number) => void;
    createShipPreview: (loadout: { shipColor: string; avatar: number; skin: number; trail: number }) => HTMLElement;
    formatTime: (milliseconds: number) => string;
};

export function createLeaderboard(context: LeaderboardContext) {
    const { showAccount, showLevelMenu, showMenu, sendPresenceHeartbeat, setCurrentOnlineUser, setGoldenTimeLimit, createShipPreview, formatTime } = context;
    let loadedUser: OnlineUser | null = null;
    const currentUserName = () => loadedUser?.username ?? null;

    function showLeaderboard() {
        const menu = document.createElement("main");
        menu.className = "menu-screen leaderboard-screen";
        menu.innerHTML = `<p class="eyebrow">FLIGHT DATA / FASTEST RUNS</p><h1>Online <em>leaderboard</em></h1><p class="menu-copy">Best submitted account entry per level, with the abilities used on that run.</p>`;
        const accountSummary = document.createElement("p");
        accountSummary.className = "online-account-summary";
        accountSummary.setAttribute("role", "status");
        const accountButton = createTextButton("Sign in / Create account", () => showAccount());
        const levelPicker = document.createElement("select");
        levelPicker.className = "leaderboard-level-picker";
        const publicLevels = levels.filter((level) => !level.localOnly);
        publicLevels.forEach((level, index) => {
            const option = document.createElement("option");
            option.value = level.name;
            option.textContent = level.name;
            levelPicker.append(option);
            if (index === 0) levelPicker.value = level.name;
        });
        const list = document.createElement("section");
        list.className = "leaderboard-list";
        const adminPanel = document.createElement("section");
        adminPanel.className = "leaderboard-admin";
        const serviceStatus = document.createElement("p");
        serviceStatus.className = "online-service-status";
        serviceStatus.setAttribute("role", "status");
        const onlinePresence = document.createElement("section");
        onlinePresence.className = "online-presence";
        const presenceHeading = document.createElement("h2");
        presenceHeading.textContent = "Players online now";
        const presenceStatus = document.createElement("p");
        presenceStatus.className = "online-presence-status";
        presenceStatus.setAttribute("role", "status");
        presenceStatus.textContent = "Checking online players...";
        const onlinePlayers = document.createElement("div");
        onlinePlayers.className = "online-player-list";
        onlinePresence.append(presenceHeading, presenceStatus, onlinePlayers);
        menu.append(accountSummary, accountButton, levelPicker, serviceStatus, onlinePresence, list, adminPanel, createTextButton("Mission select", showLevelMenu), createTextButton("Back", showMenu));
        document.body.replaceChildren(menu);

        const refreshOnlinePlayers = async () => {
            try {
                const response = await apiRequest<{ users: OnlinePlayerPresence[]; truncated: boolean }>("/presence");
                if (!onlinePresence.isConnected) return;
                if (document.querySelector(".player-profile-card")) return;
                const existing = new Map(Array.from(onlinePlayers.querySelectorAll<HTMLButtonElement>("button[data-player-id]")).map((item) => [item.dataset.playerId!, item]));
                onlinePlayers.replaceChildren();
                response.users.forEach((player) => {
                    let name = existing.get(player.id);
                    if (!name) {
                        name = document.createElement("button");
                        name.type = "button";
                        name.dataset.playerId = player.id;
                        name.addEventListener("click", () => void showLeaderboardPlayerProfile(player.id, showLeaderboard));
                        attachPlayerCard(name, player, { getUser: () => loadedUser, createShipPreview, showProfile: (id) => void showLeaderboardPlayerProfile(id, showLeaderboard), showAccount });
                    }
                    name.className = `online-player-name ${player.role === "owner" ? "online-owner" : player.role === "admin" ? "online-admin" : player.role === "moderator" ? "online-moderator" : player.role === "level-maker" ? "online-level-maker" : player.role === "tester" ? "online-tester" : ""}`;
                    const badge = getRoleBadge(player.role ?? "player");
                    name.textContent = `${player.username}${badge ? ` ${badge}` : ""}`;
                    onlinePlayers.append(name);
                });
                presenceStatus.textContent = response.truncated
                    ? "200+ players online now."
                    : `${response.users.length} player${response.users.length === 1 ? "" : "s"} online now.`;
                if (!response.users.length) onlinePlayers.textContent = "No one is online right now.";
            } catch (error) {
                if (!onlinePresence.isConnected) return;
                onlinePlayers.replaceChildren();
                presenceStatus.textContent = `Online player status unavailable: ${error instanceof Error ? error.message : "unknown service error"}`;
                console.error("Could not load online player status:", error);
            }
        };
        void refreshOnlinePlayers();
        const onlinePlayerRefreshTimer = globalThis.setInterval(() => {
            if (!onlinePresence.isConnected) {
                globalThis.clearInterval(onlinePlayerRefreshTimer);
                return;
            }
            void refreshOnlinePlayers();
        }, 5_000);

        let latestLoad = 0;
        const loadEntries = async () => {
            const requestNumber = ++latestLoad;
            try {
                const [session, settings, response] = await Promise.all([
                    apiRequest<{ user: OnlineUser | null }>("/auth/session"),
                    apiRequest<OnlineSettings>("/settings"),
                    apiRequest<{ entries: OnlineLeaderboardEntry[] }>(`/leaderboard${levelPicker.value ? `?level=${encodeURIComponent(levelPicker.value)}` : ""}`),
                ]);
                if (!menu.isConnected || requestNumber !== latestLoad) return;
                setCurrentOnlineUser(session.user);
                loadedUser = session.user;
                void sendPresenceHeartbeat();
                setGoldenTimeLimit(settings.goldenTimeLimitMs);
                accountSummary.textContent = session.user
                    ? `Signed in as ${session.user.username}${getRoleBadge(session.user.role) ? ` / ${getRoleBadge(session.user.role)}` : ""}`
                    : "Sign in or create a username account to submit a time.";
                accountButton.textContent = session.user ? "Account / Sign out" : "Sign in / Create account";
                renderLeaderboardEntries(list, response.entries, session.user);
                serviceStatus.textContent = response.entries.length ? `${response.entries.length} online best runs` : "No online runs have been submitted yet.";
                if (session.user?.role === "owner") renderOwnerControls(adminPanel, settings, () => showLeaderboard());
                else adminPanel.replaceChildren();
            } catch (error) {
                if (!menu.isConnected || requestNumber !== latestLoad) return;
                serviceStatus.textContent = `Online leaderboard unavailable: ${error instanceof Error ? error.message : "unknown service error"}`;
                list.textContent = "Leaderboard data could not be loaded.";
            }
        };
        levelPicker.addEventListener("change", () => void loadEntries());
        void loadEntries();
    }

    function renderLeaderboardEntries(container: HTMLElement, entries: OnlineLeaderboardEntry[], user: OnlineUser | null) {
        container.replaceChildren();
        if (!entries.length) {
            const empty = document.createElement("p");
            empty.className = "menu-copy";
            empty.textContent = "No completed runs yet.";
            container.append(empty);
            return;
        }
        entries.forEach((entry, index) => {
            const row = document.createElement("div");
            row.className = "leaderboard-entry";
            const rank = document.createElement("b");
            rank.textContent = String(index + 1).padStart(2, "0");
            const username = createTextButton(entry.username, () => showLeaderboardPlayerProfile(entry.userId, showLeaderboard));
            username.classList.add("leaderboard-player-button");
            const badge = getRoleBadge((entry as OnlineLeaderboardEntry & { role?: OnlineUser["role"] }).role ?? "player");
            if (badge) username.append(document.createTextNode(` ${badge}`));
            const playerLevel = document.createElement("span");
            playerLevel.className = "leaderboard-player-level";
            playerLevel.textContent = entry.level;
            const abilities = document.createElement("small");
            abilities.className = "leaderboard-abilities";
            abilities.textContent = `Abilities: ${entry.abilities.length ? entry.abilities.map(formatAbilityName).join(", ") : "None"}`;
            const time = document.createElement("strong");
            time.textContent = formatTime(entry.timeMs);
            row.append(rank, username, playerLevel, time, abilities);
            if (user && entry.userId) {
                const add = document.createElement("button");
                add.type = "button";
                add.className = "leaderboard-add-friend";
                add.textContent = "+";
                add.title = `Add ${entry.username} as a friend`;
                add.hidden = user.username.toLowerCase() === entry.username.toLowerCase();
                add.addEventListener("click", async () => {
                    add.disabled = true;
                    try { const result = await sendFriendRequest(entry.userId); add.textContent = result.status === "accepted" ? "✓" : "…"; }
                    catch (error) { add.disabled = false; add.title = error instanceof Error ? error.message : "Could not send friend request."; }
                });
                row.append(add);
            }
            if (user?.role === "owner") row.append(createOwnerEntryControls(entry, () => showLeaderboard()));
            container.append(row);
        });
    }

    function getRoleBadge(role: OnlineUser["role"]) {
        return role === "owner" ? "★" : role === "admin" ? "A" : role === "moderator" ? "M" : role === "level-maker" ? "L" : role === "tester" ? "T" : "";
    }

    async function showLeaderboardPlayerProfile(playerId: string, returnTo: () => void) {
        const menu = document.createElement("main");
        menu.className = "menu-screen account-screen";
        menu.innerHTML = `<p class="eyebrow">FLIGHT DATA / PILOT PROFILE</p><h1>Player <em>profile</em></h1>`;
        const status = document.createElement("p");
        status.className = "online-service-status";
        status.setAttribute("role", "status");
        status.textContent = "Loading pilot profile...";
        const back = createTextButton("Back to leaderboard", returnTo);
        menu.append(status, back);
        document.body.replaceChildren(menu);
        try {
            const response = await apiRequest<{ player: PublicPlayerProfile }>(`/players/${encodeURIComponent(playerId)}`);
            if (!menu.isConnected) return;
            const { player } = response;
            const badge = getRoleBadge(player.role);
            const title = document.createElement("h2");
            title.textContent = `${player.username}${badge ? ` ${badge}` : ""}`;
            if (player.title) {
                title.append(createTitleBadge(player.title, player.titleStyle));
            }
            const presence = document.createElement("p");
            presence.className = `profile-presence${player.isOnline ? " is-online" : ""}`;
            presence.setAttribute("role", "status");
            presence.textContent = player.isOnline ? "ONLINE NOW" : "OFFLINE";
            const dashboard = document.createElement("section");
            dashboard.className = "account-dashboard";
            const stats = document.createElement("div");
            stats.className = "account-stats";
            [
                ["Asteroids", String(player.asteroids)],
                ["Special asteroids", String(player.specialAsteroids)],
                ["Enemies defeated", String(player.enemiesKilled)],
                ["Bosses defeated", String(player.bossesKilled)],
                ["Prestige", String(player.prestige)],
                ["Routes cleared", String(player.routesCleared)],
            ].forEach(([label, value]) => {
                const item = document.createElement("article");
                item.innerHTML = "<small></small><b></b>";
                item.querySelector("small")!.textContent = label;
                item.querySelector("b")!.textContent = value;
                stats.append(item);
            });
            const character = createShipPreview({
                shipColor: player.shipColor!,
                avatar: player.avatar!,
                skin: player.skin!,
                trail: player.trail!,
            });
            character.classList.add("profile-character-card");
            const friendAction = document.createElement("div");
            friendAction.className = "profile-friend-action";
            if (!currentUserName()) {
                friendAction.append(createTextButton("Sign in to add friends", showAccount));
            } else {
                const friendButton = createTextButton("Add friend", async () => {
                    friendButton.disabled = true;
                    try { const result = await sendFriendRequest(player.id); friendButton.textContent = result.status === "accepted" ? "Friends" : "Request sent"; }
                    catch (error) { friendButton.disabled = false; friendButton.textContent = error instanceof Error ? error.message : "Could not add friend."; }
                });
                if (player.username.toLowerCase() !== currentUserName()?.toLowerCase()) {
                    friendAction.append(friendButton);
                    void loadFriends().then((friends) => {
                        if (!menu.isConnected) return;
                        if (friends.friends.some((friend) => friend.userId === player.id)) { friendButton.textContent = "Friends"; friendButton.disabled = true; }
                        else if (friends.outgoing.some((request) => request.userId === player.id)) { friendButton.textContent = "Request sent"; }
                        else if (friends.incoming.some((request) => request.userId === player.id)) { friendButton.textContent = "Incoming request"; friendButton.disabled = true; }
                    }).catch(() => undefined);
                }
            }
            dashboard.append(title, presence, friendAction, stats, character);
            menu.replaceChildren(menu.firstElementChild!, menu.children[1]!, dashboard, back);
            const presenceTimer = globalThis.setInterval(() => {
                if (!menu.isConnected) {
                    globalThis.clearInterval(presenceTimer);
                    return;
                }
                void apiRequest<{ player: PublicPlayerProfile }>(`/players/${encodeURIComponent(playerId)}`).then((updated) => {
                    const isOnline = updated.player.isOnline;
                    presence.classList.toggle("is-online", isOnline);
                    presence.textContent = isOnline ? "ONLINE NOW" : "OFFLINE";
                }).catch((error: unknown) => {
                    console.error("Could not refresh player profile presence:", error);
                    if (menu.isConnected) {
                        presence.classList.remove("is-online");
                        presence.textContent = "Online status could not be refreshed.";
                    }
                });
            }, 5_000);
        } catch (error) {
            status.textContent = error instanceof Error && error.message.includes("404")
                ? "That player profile could not be found."
                : error instanceof Error ? error.message : "That player profile could not be loaded.";
        }
    }

    function formatAbilityName(ability: string) {
        return ability.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    }

    function createOwnerEntryControls(entry: OnlineLeaderboardEntry, refresh: () => void) {
        const controls = document.createElement("details");
        controls.className = "leaderboard-entry-controls";
        const summary = document.createElement("summary");
        summary.textContent = "Edit entry";
        const form = document.createElement("form");
        const level = document.createElement("input");
        level.value = entry.level;
        level.maxLength = 80;
        level.setAttribute("aria-label", "Leaderboard level name");
        const seconds = document.createElement("input");
        seconds.type = "number";
        seconds.min = "1";
        seconds.max = "1800";
        seconds.step = "0.001";
        seconds.value = (entry.timeMs / 1000).toString();
        seconds.setAttribute("aria-label", "Leaderboard time in seconds");
        const abilities = document.createElement("input");
        abilities.value = entry.abilities.join(", ");
        abilities.setAttribute("aria-label", "Leaderboard abilities, comma separated");
        const error = document.createElement("small");
        error.className = "tester-error";
        const save = document.createElement("button");
        save.type = "submit";
        save.textContent = "Save";
        form.append(level, seconds, abilities, save, error);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const parsedAbilities = abilities.value.split(",").map((ability) => ability.trim().toLowerCase()).filter(Boolean);
            try {
                await apiRequest(`/leaderboard/${encodeURIComponent(entry.id)}`, {
                    method: "PATCH",
                    body: JSON.stringify({ level: level.value, timeMs: Math.round(Number(seconds.value) * 1000), abilities: parsedAbilities }),
                });
                refresh();
            } catch (requestError) {
                error.textContent = requestError instanceof Error ? requestError.message : "Could not update leaderboard entry.";
            }
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
            if (!globalThis.confirm(`Delete ${entry.username}'s ${entry.level} record?`)) return;
            try {
                await apiRequest(`/leaderboard/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
                refresh();
            } catch (requestError) {
                error.textContent = requestError instanceof Error ? requestError.message : "Could not delete leaderboard entry.";
            }
        });
        form.append(remove);
        controls.append(summary, form);
        return controls;
    }

    function renderOwnerControls(container: HTMLElement, settings: OnlineSettings, refresh: () => void) {
        container.replaceChildren();
        const title = document.createElement("h2");
        title.textContent = "Owner controls";
        const description = document.createElement("p");
        description.textContent = "Set the maximum clear time that counts toward Golden Body progress.";
        const form = document.createElement("form");
        const label = document.createElement("label");
        label.textContent = "Golden clear limit (seconds)";
        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = "3600";
        input.step = "1";
        input.value = String(Math.ceil(settings.goldenTimeLimitMs / 1000));
        label.append(input);
        const save = document.createElement("button");
        save.type = "submit";
        save.textContent = "Save golden time limit";
        const status = document.createElement("small");
        status.setAttribute("role", "status");
        form.append(label, save, status);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
                const updated = await apiRequest<OnlineSettings>("/settings/golden-time-limit", {
                    method: "PUT",
                    body: JSON.stringify({ timeLimitMs: Math.round(Number(input.value) * 1000) }),
                });
                setGoldenTimeLimit(updated.goldenTimeLimitMs);
                status.textContent = "Golden progress time limit saved.";
                refresh();
            } catch (error) {
                status.textContent = error instanceof Error ? error.message : "Could not update the golden progress threshold.";
            }
        });
        container.append(title, description, form);
    }


    return { showLeaderboard, showLeaderboardPlayerProfile, getRoleBadge, formatAbilityName };
}
