import type { Level, ManagedUser, PowerupKind } from "./types";
import { apiRequest } from "./api";
import { levels } from "./levels";
import { PROFILE_TITLES, powerupLabels, powerupPrices } from "./game-config";
import { createTextButton } from "./ui";

let managedPresenceTimer = 0;
type ManagedUsersOptions = {
    canEditProfiles?: boolean;
    canManageRoles?: boolean;
    canManageSensitive?: boolean;
};

export async function loadManagedUsers(container: HTMLElement, options: ManagedUsersOptions = {}) {
    const canEditProfiles = options.canEditProfiles !== false;
    const canManageRoles = options.canManageRoles !== false;
    const canManageSensitive = options.canManageSensitive !== false;
    if (managedPresenceTimer) {
        globalThis.clearInterval(managedPresenceTimer);
        managedPresenceTimer = 0;
    }
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Player accounts";
    const description = document.createElement("p");
    description.textContent = canEditProfiles
        ? "Review player stats and live online status, ban or restore access, manage email and network bans, rename accounts, and edit saved profile data."
        : "Review live status and suspend accounts or block their network and email. Profile rewards and saved game data are owner-only.";
    const status = document.createElement("small");
    status.className = "tester-error";
    status.setAttribute("role", "status");
    status.textContent = "Loading player accounts...";
    const refresh = createTextButton("Refresh accounts", () => { void loadManagedUsers(container, options); });
    container.append(heading, description, refresh, status);
    try {
        const { users } = await apiRequest<{ users: ManagedUser[] }>("/admin/users");
        let profileTitles = PROFILE_TITLES;
        try {
            const settings = await apiRequest<{ profileTitles?: typeof PROFILE_TITLES }>("/settings");
            if (Array.isArray(settings.profileTitles) && settings.profileTitles.length) profileTitles = settings.profileTitles;
        } catch (error) {
            console.error("Could not load profile titles for player management:", error);
        }
        if (!container.isConnected) return;
        status.textContent = users.length ? `${users.length} account${users.length === 1 ? "" : "s"} loaded (up to 200).` : "No player accounts found.";
        const lookup = document.createElement("input");
        lookup.className = "tester-player-lookup";
        lookup.type = "search";
        lookup.placeholder = "Search by player name, role, or status";
        lookup.autocomplete = "off";
        lookup.setAttribute("aria-label", "Find a player account");
        const lookupStatus = document.createElement("small");
        lookupStatus.className = "tester-player-lookup-status";
        lookupStatus.setAttribute("role", "status");
        lookupStatus.textContent = "Search to open a player account.";
        const results = document.createElement("div");
        results.className = "tester-player-lookup-results";
        const lookupPanel = document.createElement("section");
        lookupPanel.className = "tester-player-lookup-panel";
        lookupPanel.append(lookup, lookupStatus, results);
        container.append(lookupPanel);
        users.forEach((user) => {
            const card = document.createElement("details");
            card.className = "tester-player-card";
            card.hidden = true;
            card.dataset.playerSearch = `${user.username} ${user.role} ${user.banned ? "banned" : "active"}`.toLowerCase();
            const summary = document.createElement("summary");
            summary.textContent = `${user.username} / ${user.banned ? "BANNED" : "ACTIVE"} / ${user.role.toUpperCase()}`;
            card.append(summary);
            const presence = document.createElement("small");
            presence.className = `player-presence-status${user.isOnline ? " is-online" : ""}`;
            presence.dataset.presenceUserId = user.id;
            presence.textContent = user.isOnline ? "ONLINE NOW" : "OFFLINE";
            card.append(presence);
            const stats = document.createElement("p");
            stats.textContent = `Asteroids: ${user.progress["orbit-claims"] ?? "0"} / Special: ${user.progress["orbit-special-claims"] ?? "0"} / Enemies defeated: ${user.progress["orbit-enemies-killed"] ?? "0"} / Bosses defeated: ${user.progress["orbit-bosses-killed"] ?? "0"} / Prestige: ${user.progress["orbit-prestige"] ?? "0"} / Power-ups: ${user.progress["orbit-powerups"] ?? "{}"}`;
            const created = document.createElement("small");
            created.textContent = `Created ${new Date(user.createdAt).toLocaleString()}`;
            const recoveryStatus = document.createElement("small");
            recoveryStatus.textContent = user.hasRecoveryCode
                ? `Recovery code set ${user.recoveryCodeCreatedAt ? `on ${new Date(user.recoveryCodeCreatedAt).toLocaleString()}` : "(date unavailable)"}`
                : "No recovery code set";
            const passwordStatus = document.createElement("small");
            passwordStatus.textContent = `Password last changed ${user.passwordChangedAt ? new Date(user.passwordChangedAt).toLocaleString() : "never"}`;
            const lockStatus = document.createElement("small");
            lockStatus.textContent = user.recoveryLockState === "locked" && user.recoveryLockedUntil
                ? `Recovery locked until ${new Date(user.recoveryLockedUntil).toLocaleString()} (${user.recoveryAttempts} attempts)`
                : `Recovery open (${user.recoveryAttempts} attempts)`;
            const ipStatus = document.createElement("small");
            ipStatus.textContent = user.ipBanned
                ? "Latest login network is IP-banned (the address is hidden for privacy)."
                : user.lastSeenIpAvailable
                    ? "Latest login network is recorded (the address is hidden for privacy)."
                    : "No login network has been recorded yet.";
            const emailStatus = document.createElement("small");
            emailStatus.textContent = user.emailBanned
                ? `Email ${user.emailMasked ?? "on file"} is permanently banned.`
                : user.emailSet
                    ? `Email on file: ${user.emailMasked ?? "hidden"}.`
                    : "No email address has been recorded.";
            card.append(stats, created, recoveryStatus, passwordStatus, lockStatus, ipStatus, emailStatus);
            if (user.role === "owner") {
                const protectedMessage = document.createElement("small");
                protectedMessage.textContent = "Owner accounts are protected from player management.";
                card.append(protectedMessage);
                results.append(card);
                return;
            }
            const form = document.createElement("form");
            form.className = "tester-player-form";
            const username = document.createElement("input");
            username.value = user.username;
            username.maxLength = 20;
            username.pattern = "[A-Za-z0-9_]{3,20}";
            username.required = true;
            username.setAttribute("aria-label", `Username for ${user.username}`);
            const emailLabel = document.createElement("label");
            emailLabel.append(document.createTextNode("Email address (optional)"));
            const email = document.createElement("input");
            email.type = "email";
            email.autocomplete = "off";
            email.placeholder = user.emailMasked ? `Current: ${user.emailMasked}` : "Enter an email address";
            email.setAttribute("aria-label", `Email address for ${user.username}`);
            emailLabel.append(email);
            const roleLabel = document.createElement("label");
            roleLabel.append(document.createTextNode("Role"));
            const role = document.createElement("select");
            role.setAttribute("aria-label", `Role for ${user.username}`);
            const roleOptions = canManageRoles
                ? [["player", "Player"], ["tester", "Tester"], ["moderator", "Moderator"], ["admin", "Admin"], ["level-maker", "Level maker"]]
                : [[user.role, user.role.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())]];
            roleOptions.forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                option.selected = user.role === value;
                role.append(option);
            });
            roleLabel.append(role);
            role.disabled = !canManageRoles;
            let emailBanButton: HTMLButtonElement | null = null;
            const banLabel = document.createElement("label");
            const banned = document.createElement("input");
            banned.type = "checkbox";
            banned.checked = user.banned;
            banLabel.append(banned, document.createTextNode(" Ban account"));
            const chatMute = createTextButton(user.chatMuted ? "Unmute chat" : "Mute chat", async () => {
                chatMute.disabled = true;
                try {
                    const endpoint = user.chatMuted ? "chat-unmute" : "chat-mute";
                    await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/${endpoint}`, { method: "POST", body: JSON.stringify({ reason: "Owner moderation" }) });
                    chatMute.textContent = user.chatMuted ? "Mute chat" : "Unmute chat";
                    user.chatMuted = !user.chatMuted;
                } catch (error) {
                    status.textContent = error instanceof Error ? error.message : "Could not update chat mute.";
                } finally { chatMute.disabled = false; }
            });
            const progress = document.createElement("textarea");
            progress.value = JSON.stringify(user.progress, null, 2);
            progress.setAttribute("aria-label", `Saved progress for ${user.username}`);
            const progression = document.createElement("section");
            progression.className = "tester-player-progression";
            const progressionHeading = document.createElement("b");
            progressionHeading.textContent = "Resources & skills";
            progression.append(progressionHeading);
            const numberFields = document.createElement("div");
            numberFields.className = "tester-player-number-fields";
            const readStoredNumber = (key: string, fallback = 0) => {
                const value = Number(user.progress[key] ?? fallback);
                return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
            };
            const addProgressNumber = (labelText: string, key: string, maximum: number) => {
                const label = document.createElement("label");
                label.append(document.createTextNode(labelText));
                const input = document.createElement("input");
                input.type = "number";
                input.min = "0";
                input.max = String(maximum);
                input.step = "1";
                input.value = String(Math.min(readStoredNumber(key), maximum));
                input.dataset.progressKey = key;
                label.append(input);
                numberFields.append(label);
            };
            addProgressNumber("Asteroids", "orbit-claims", 100000000);
            addProgressNumber("Special asteroids", "orbit-special-claims", 100000000);
            addProgressNumber("Prestige level", "orbit-prestige", 100);
            addProgressNumber("Maximum prestige", "orbit-prestige-max", 100);

            let inventory: Partial<Record<PowerupKind, number>> = {};
            let inventoryNeedsRepair = false;
            try {
                const storedInventory: unknown = JSON.parse(user.progress["orbit-powerups"] ?? "{}");
                if (storedInventory && typeof storedInventory === "object" && !Array.isArray(storedInventory)) {
                    inventory = storedInventory as Partial<Record<PowerupKind, number>>;
                    inventoryNeedsRepair = (Object.keys(powerupPrices) as PowerupKind[]).some((kind) =>
                        inventory[kind] !== undefined && (!Number.isSafeInteger(inventory[kind]) || (inventory[kind] ?? -1) < 0));
                } else inventoryNeedsRepair = true;
            } catch {
                inventoryNeedsRepair = true;
            }
            const skillsHeading = document.createElement("b");
            skillsHeading.textContent = "Power-up skills";
            progression.append(numberFields, skillsHeading);
            if (inventoryNeedsRepair) {
                const inventoryWarning = document.createElement("small");
                inventoryWarning.textContent = "Saved power-up data is malformed; the values below will replace it when saved.";
                progression.append(inventoryWarning);
            }
            const skillFields = document.createElement("div");
            skillFields.className = "tester-player-number-fields";
            (Object.keys(powerupPrices) as PowerupKind[]).forEach((kind) => {
                const label = document.createElement("label");
                label.append(document.createTextNode(powerupLabels[kind]));
                const input = document.createElement("input");
                input.type = "number";
                input.min = "0";
                input.max = "1000000";
                input.step = "1";
                const amount = inventory[kind];
                input.value = String(Number.isSafeInteger(amount) && (amount ?? -1) >= 0 ? amount : 0);
                input.dataset.powerup = kind;
                label.append(input);
                skillFields.append(label);
            });
            progression.append(skillFields);

            const titleLabel = document.createElement("label");
            titleLabel.append(document.createTextNode("Pilot title"));
            const titleSelect = document.createElement("select");
            titleSelect.setAttribute("aria-label", `Pilot title for ${user.username}`);
            const noTitle = document.createElement("option");
            noTitle.value = "";
            noTitle.textContent = "No title";
            titleSelect.append(noTitle);
            profileTitles.forEach((title) => {
                const option = document.createElement("option");
                option.value = title.id;
                const requirement = title.requirement?.type === "locked" ? "owner or code only" : title.requirement?.type === "golden" ? `${title.requirement.amount} Golden Body routes` : title.requirement?.type === "prestige" ? `prestige ${title.requirement.amount}` : title.requirement?.type === "roulette" ? "roulette prize" : `${title.requirement?.amount ?? title.routes} routes`;
                option.textContent = `${title.name} / ${requirement}`;
                option.selected = user.progress["orbit-title"] === title.id;
                titleSelect.append(option);
            });
            titleLabel.append(titleSelect);
            progression.append(titleLabel);

            const cosmeticUnlocks = document.createElement("div");
            cosmeticUnlocks.className = "tester-player-unlocks";
            (["skins", "trails", "avatars"] as const).forEach((kind) => {
                const label = document.createElement("label");
                const input = document.createElement("input");
                input.type = "checkbox";
                input.checked = user.progress[`orbit-unlock-${kind}`] === "1";
                input.dataset.cosmeticUnlock = kind;
                label.append(input, document.createTextNode(`Unlock all ${kind}`));
                cosmeticUnlocks.append(label);
            });
            progression.append(cosmeticUnlocks);

            const levelSection = document.createElement("details");
            levelSection.className = "tester-player-levels";
            const levelSummary = document.createElement("summary");
            levelSummary.textContent = `Levels & clears (${levels.length})`;
            const levelGroups = document.createElement("div");
            levelGroups.className = "tester-player-level-groups";
            const groupedLevels = [
                { title: "Normal levels", matches: (level: Level) => !level.secret && !level.prestige },
                { title: "Secret levels", matches: (level: Level) => Boolean(level.secret) },
                { title: "Prestige levels", matches: (level: Level) => Boolean(level.prestige) },
            ];
            groupedLevels.forEach((group) => {
                const groupPanel = document.createElement("fieldset");
                const groupTitle = document.createElement("legend");
                groupTitle.textContent = group.title;
                groupPanel.append(groupTitle);
                levels.forEach((level, index) => {
                    if (!group.matches(level)) return;
                    const row = document.createElement("div");
                    row.className = "tester-player-level-row";
                    const name = document.createElement("span");
                    name.textContent = level.name;
                    row.append(name);

                    const accessLabel = document.createElement("label");
                    const access = document.createElement("input");
                    access.type = "checkbox";
                    access.checked = level.secret
                        ? level.secretId === "prestige-gate"
                            ? user.progress["orbit-key-prestige-gate"] === "1"
                            : level.secretId === "eclipse"
                                ? user.progress["orbit-key-eclipse"] === "1" || user.progress["orbit-secret-unlocked"] === "1"
                                : level.secretId
                                    ? user.progress[`orbit-key-${level.secretId}`] === "1"
                                    : user.progress["orbit-secret-unlocked"] === "1"
                        : index === 0 || user.progress[`orbit-level-${index}`] === "1";
                    access.dataset.levelAccess = String(index);
                    accessLabel.append(access, document.createTextNode(" Access"));

                    const clearLabel = document.createElement("label");
                    const clear = document.createElement("input");
                    clear.type = "checkbox";
                    clear.checked = user.progress[`orbit-level-complete-${index}`] === "1";
                    clear.dataset.levelClear = String(index);
                    clearLabel.append(clear, document.createTextNode(" Cleared"));
                    row.append(accessLabel, clearLabel);
                    groupPanel.append(row);
                });
                levelGroups.append(groupPanel);
            });
            levelSection.append(levelSummary, levelGroups);
            const save = document.createElement("button");
            save.type = "submit";
            save.textContent = "Save profile";
            const result = document.createElement("small");
            result.setAttribute("role", "status");
            const progressHeading = document.createElement("b");
            progressHeading.textContent = "Advanced saved profile data";
            if (!canEditProfiles) {
                username.disabled = true;
                emailLabel.hidden = true;
                roleLabel.hidden = true;
                progression.hidden = true;
                levelSection.hidden = true;
                progressHeading.hidden = true;
                progress.hidden = true;
                save.textContent = "Save ban status";
            }
            form.append(username, emailLabel, roleLabel, banLabel, chatMute, progression, levelSection, progressHeading, progress, save, result);
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                save.disabled = true;
                result.textContent = "Saving player profile...";
                try {
                    if (!canEditProfiles) {
                        await apiRequest(`/admin/users/${encodeURIComponent(user.id)}`, {
                            method: "PATCH",
                            body: JSON.stringify({ banned: banned.checked }),
                        });
                        user.banned = banned.checked;
                        result.textContent = `Account ${banned.checked ? "banned" : "restored"}.`;
                        summary.textContent = `${user.username} / ${banned.checked ? "BANNED" : "ACTIVE"} / ${user.role.toUpperCase()}`;
                        return;
                    }
                    const parsedProgress: unknown = JSON.parse(progress.value);
                    if (!parsedProgress || typeof parsedProgress !== "object" || Array.isArray(parsedProgress)) {
                        throw new Error("Saved profile data must be a JSON object.");
                    }
                    const updatedProgress = { ...(parsedProgress as Record<string, unknown>) };
                    numberFields.querySelectorAll<HTMLInputElement>("input[data-progress-key]").forEach((input) => {
                        const value = Number(input.value);
                        if (!Number.isSafeInteger(value) || value < 0 || value > Number(input.max)) {
                            throw new Error(`${input.closest("label")?.firstChild?.textContent?.trim() ?? "Progress"} must be a whole number between 0 and ${input.max}.`);
                        }
                        updatedProgress[input.dataset.progressKey!] = String(value);
                    });
                    const updatedInventory: Partial<Record<PowerupKind, number>> = { ...inventory };
                    skillFields.querySelectorAll<HTMLInputElement>("input[data-powerup]").forEach((input) => {
                        const value = Number(input.value);
                        if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) {
                            throw new Error(`${powerupLabels[input.dataset.powerup as PowerupKind]} must be a whole number between 0 and 1000000.`);
                        }
                        updatedInventory[input.dataset.powerup as PowerupKind] = value;
                    });
                    updatedProgress["orbit-powerups"] = JSON.stringify(updatedInventory);
                    if (titleSelect.value) {
                        updatedProgress["orbit-title"] = titleSelect.value;
                        updatedProgress[`orbit-title-unlock-${titleSelect.value}`] = "1";
                    } else delete updatedProgress["orbit-title"];
                    cosmeticUnlocks.querySelectorAll<HTMLInputElement>("input[data-cosmetic-unlock]").forEach((input) => {
                        const key = `orbit-unlock-${input.dataset.cosmeticUnlock}`;
                        if (input.checked) updatedProgress[key] = "1";
                        else delete updatedProgress[key];
                    });
                    const levelAccessUpdates = new Map<string, boolean>();
                    levelSection.querySelectorAll<HTMLInputElement>("input[data-level-access]").forEach((input) => {
                        const index = Number(input.dataset.levelAccess);
                        const level = levels[index];
                        if (!level) throw new Error("A selected level is no longer available. Refresh accounts and try again.");
                        const key = level.secret
                            ? level.secretId === "prestige-gate"
                                ? "orbit-key-prestige-gate"
                                : level.secretId
                                    ? `orbit-key-${level.secretId}`
                                    : "orbit-secret-unlocked"
                            : `orbit-level-${index}`;
                        levelAccessUpdates.set(key, Boolean(levelAccessUpdates.get(key) || input.checked));
                        if (level.secretId === "eclipse") levelAccessUpdates.set("orbit-secret-unlocked", Boolean(levelAccessUpdates.get("orbit-secret-unlocked") || input.checked));
                    });
                    levelAccessUpdates.forEach((hasAccess, key) => {
                        if (hasAccess) updatedProgress[key] = "1";
                        else delete updatedProgress[key];
                    });
                    levelSection.querySelectorAll<HTMLInputElement>("input[data-level-clear]").forEach((input) => {
                        const key = `orbit-level-complete-${input.dataset.levelClear}`;
                        if (input.checked) updatedProgress[key] = "1";
                        else delete updatedProgress[key];
                    });
                    const submittedEmail = email.value.trim();
                    const profileUpdate: Record<string, unknown> = { username: username.value, role: role.value, banned: banned.checked, progress: updatedProgress };
                    if (submittedEmail) profileUpdate.email = submittedEmail;
                    const updatedProfile = await apiRequest<{ emailMasked?: string | null; emailSet?: boolean }>(`/admin/users/${encodeURIComponent(user.id)}`, {
                        method: "PATCH",
                        body: JSON.stringify(profileUpdate),
                    });
                    user.emailMasked = updatedProfile.emailMasked ?? user.emailMasked ?? null;
                    user.emailSet = updatedProfile.emailSet ?? user.emailSet;
                    if (submittedEmail) {
                        user.emailBanned = false;
                        if (emailBanButton) emailBanButton.textContent = "Permanently ban email";
                    }
                    emailStatus.textContent = user.emailSet
                        ? `Email on file: ${user.emailMasked ?? "hidden"}.`
                        : "No email address has been recorded.";
                    email.value = "";
                    email.placeholder = user.emailMasked ? `Current: ${user.emailMasked}` : "Enter an email address";
                    result.textContent = "Profile saved. Changes are available on the player's signed-in devices.";
                    summary.textContent = `${username.value} / ${banned.checked ? "BANNED" : "ACTIVE"} / ${role.value.toUpperCase()}`;
                } catch (error) {
                    result.textContent = error instanceof Error ? error.message : "Could not save this profile.";
                } finally {
                    save.disabled = false;
                }
            });
            card.append(form);
            const accountActions = document.createElement("section");
            accountActions.className = "tester-player-actions";
            const actionStatus = document.createElement("small");
            actionStatus.setAttribute("role", "status");
            const resetPassword = createTextButton("Reset password", () => {});
            resetPassword.addEventListener("click", async () => {
                if (!globalThis.confirm(`Reset ${user.username}'s password? They will be signed out everywhere and required to change it.`)) return;
                resetPassword.disabled = true;
                actionStatus.textContent = "Resetting password...";
                try {
                    const response = await apiRequest<{ temporaryPassword: string }>(`/admin/users/${encodeURIComponent(user.id)}/password`, { method: "POST", body: "{}" });
                    actionStatus.textContent = `Temporary password (shown once): ${response.temporaryPassword}`;
                } catch (error) {
                    actionStatus.textContent = error instanceof Error ? error.message : "Could not reset the password.";
                } finally {
                    resetPassword.disabled = false;
                }
            });
            const makeRecoveryCode = createTextButton("Make new recovery code", () => {});
            makeRecoveryCode.addEventListener("click", async () => {
                if (!globalThis.confirm(`Replace ${user.username}'s current recovery code? The old code will stop working.`)) return;
                makeRecoveryCode.disabled = true;
                try {
                    const response = await apiRequest<{ recoveryCode: string }>(`/admin/users/${encodeURIComponent(user.id)}/recovery-code`, { method: "POST", body: "{}" });
                    actionStatus.textContent = `New recovery code (shown once): ${response.recoveryCode}`;
                    recoveryStatus.textContent = "Recovery code set just now (the code itself is shown once above).";
                } catch (error) {
                    actionStatus.textContent = error instanceof Error ? error.message : "Could not create a recovery code.";
                } finally {
                    makeRecoveryCode.disabled = false;
                }
            });
            const clearRecoveryLock = createTextButton("Clear recovery lock", () => {});
            clearRecoveryLock.addEventListener("click", async () => {
                clearRecoveryLock.disabled = true;
                try {
                    await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/recovery-lock`, { method: "DELETE" });
                    lockStatus.textContent = "Recovery open (0 attempts)";
                    actionStatus.textContent = "Recovery lock cleared.";
                } catch (error) {
                    actionStatus.textContent = error instanceof Error ? error.message : "Could not clear the recovery lock.";
                } finally {
                    clearRecoveryLock.disabled = false;
                }
            });
            const ipBanButton = createTextButton(user.ipBanned ? "Unban latest login network" : "Ban latest login network", () => {});
            ipBanButton.addEventListener("click", async () => {
                if (!user.lastSeenIpAvailable) {
                    actionStatus.textContent = "This account has not logged in from a network yet.";
                    return;
                }
                const banning = !user.ipBanned;
                const warning = banning
                    ? "This bans the latest network address for every account using it (shared Wi-Fi/VPNs can affect multiple players). Continue?"
                    : "Allow logins again from this account's latest network address?";
                if (!globalThis.confirm(warning)) return;
                ipBanButton.disabled = true;
                actionStatus.textContent = banning ? "Banning latest login network..." : "Removing network ban...";
                try {
                    await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/ip-ban`, { method: banning ? "POST" : "DELETE", ...(banning ? { body: JSON.stringify({ reason: "Owner moderation" }) } : {}) });
                    user.ipBanned = banning;
                    ipBanButton.textContent = banning ? "Unban latest login network" : "Ban latest login network";
                    ipStatus.textContent = banning
                        ? "Latest login network is IP-banned (the address is hidden for privacy)."
                        : "Latest login network is recorded (the address is hidden for privacy).";
                    actionStatus.textContent = banning ? "Network banned and active sessions signed out." : "Network ban removed.";
                } catch (error) {
                    actionStatus.textContent = error instanceof Error ? error.message : "Could not update the network ban.";
                } finally {
                    ipBanButton.disabled = false;
                }
            });
            emailBanButton = createTextButton(user.emailBanned ? "Unban email permanently" : "Permanently ban email", () => {});
            emailBanButton.addEventListener("click", async () => {
                if (!user.emailSet) {
                    actionStatus.textContent = "This account has no email address on file. Save one in the profile first.";
                    return;
                }
                const banning = !user.emailBanned;
                const warning = banning
                    ? `Permanently block ${user.emailMasked ?? "this email address"} from registering, signing in, or recovering accounts?`
                    : `Allow ${user.emailMasked ?? "this email address"} to be used again?`;
                if (!globalThis.confirm(warning)) return;
                emailBanButton.disabled = true;
                actionStatus.textContent = banning ? "Permanently banning email..." : "Removing permanent email ban...";
                try {
                    await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/email-ban`, { method: banning ? "POST" : "DELETE", ...(banning ? { body: JSON.stringify({ reason: "Owner moderation" }) } : {}) });
                    user.emailBanned = banning;
                    emailBanButton.textContent = banning ? "Unban email permanently" : "Permanently ban email";
                    emailStatus.textContent = banning
                        ? `Email ${user.emailMasked ?? "on file"} is permanently banned.`
                        : `Email on file: ${user.emailMasked ?? "hidden"}.`;
                    actionStatus.textContent = banning ? "Email banned and active sessions signed out." : "Permanent email ban removed.";
                } catch (error) {
                    actionStatus.textContent = error instanceof Error ? error.message : "Could not update the email ban.";
                } finally {
                    emailBanButton.disabled = false;
                }
            });
            const wipeTitle = document.createElement("b");
            wipeTitle.textContent = "Selective profile wipe";
            const wipeOptions = document.createElement("div");
            wipeOptions.className = "tester-player-unlocks";
            const wipeCategories = [
                ["progress", "Progress & inventory"],
                ["cosmetics", "Cosmetics"],
                ["leaderboard", "Leaderboard times"],
                ["portalsCooldowns", "Claimed portals & cooldowns"],
            ] as const;
            const selectedWipeCategories = new Set<string>();
            wipeCategories.forEach(([value, labelText]) => {
                const label = document.createElement("label");
                const input = document.createElement("input");
                input.type = "checkbox";
                input.addEventListener("change", () => input.checked ? selectedWipeCategories.add(value) : selectedWipeCategories.delete(value));
                label.append(input, document.createTextNode(labelText));
                wipeOptions.append(label);
            });
            const wipeButton = createTextButton("Wipe selected data", () => {});
            wipeButton.classList.add("danger");
            wipeButton.addEventListener("click", async () => {
                const categories = [...selectedWipeCategories];
                if (!categories.length) {
                    actionStatus.textContent = "Select at least one category to wipe.";
                    return;
                }
                if (!globalThis.confirm(`This will permanently remove the selected data for ${user.username} and sign them out everywhere. A seven-day backup will be created.`)
                    || globalThis.prompt(`Type ${user.username} to confirm this wipe:`) !== user.username) return;
                wipeButton.disabled = true;
                try {
                    const response = await apiRequest<{ backupId: string }>(`/admin/users/${encodeURIComponent(user.id)}/wipe`, {
                        method: "POST",
                        body: JSON.stringify({ categories }),
                    });
                    actionStatus.textContent = `Selected data wiped. Backup ${response.backupId} is available for seven days.`;
                    void loadBackups();
                } catch (error) {
                    actionStatus.textContent = error instanceof Error ? error.message : "Could not wipe this profile.";
                } finally {
                    wipeButton.disabled = false;
                }
            });
            const backupSelect = document.createElement("select");
            backupSelect.setAttribute("aria-label", `Profile backup for ${user.username}`);
            const loadBackups = async () => {
                try {
                    const response = await apiRequest<{ backups: { id: string; categories: string[]; createdAt: string }[] }>(`/admin/users/${encodeURIComponent(user.id)}/backups`);
                    backupSelect.replaceChildren();
                    response.backups.forEach((backup) => {
                        const option = document.createElement("option");
                        option.value = backup.id;
                        option.textContent = `${new Date(backup.createdAt).toLocaleString()} / ${backup.categories.join(", ")}`;
                        backupSelect.append(option);
                    });
                    if (!response.backups.length) {
                        const option = document.createElement("option");
                        option.textContent = "No restorable backups";
                        option.value = "";
                        backupSelect.append(option);
                    }
                } catch (error) {
                    actionStatus.textContent = error instanceof Error ? error.message : "Could not load profile backups.";
                }
            };
            const restoreButton = createTextButton("Restore selected backup", () => {});
            restoreButton.addEventListener("click", async () => {
                if (!backupSelect.value || !globalThis.confirm(`Restore this backup for ${user.username}? Current values may be replaced.`)) return;
                restoreButton.disabled = true;
                try {
                    await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/restore`, {
                        method: "POST",
                        body: JSON.stringify({ backupId: backupSelect.value }),
                    });
                    actionStatus.textContent = "Profile backup restored.";
                    void loadManagedUsers(container, options);
                } catch (error) {
                    actionStatus.textContent = error instanceof Error ? error.message : "Could not restore the profile backup.";
                } finally {
                    restoreButton.disabled = false;
                }
            });
            const deleteAccount = createTextButton("Delete account permanently", () => {});
            deleteAccount.classList.add("danger");
            deleteAccount.addEventListener("click", async () => {
                if (!globalThis.confirm(`Permanently delete ${user.username}? This removes the account, progress, leaderboard entries, messages, and backups.`)
                    || globalThis.prompt(`Type ${user.username} to confirm account deletion:`) !== user.username) return;
                deleteAccount.disabled = true;
                actionStatus.textContent = "Deleting account...";
                try {
                    await apiRequest(`/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
                    card.remove();
                    status.textContent = `Deleted account ${user.username}.`;
                } catch (error) {
                    actionStatus.textContent = error instanceof Error ? error.message : "Could not delete this account.";
                    deleteAccount.disabled = false;
                }
            });
            accountActions.append(wipeTitle, wipeOptions, wipeButton, backupSelect, restoreButton, resetPassword, makeRecoveryCode, clearRecoveryLock, ipBanButton, emailBanButton, deleteAccount, actionStatus);
            if (!canManageSensitive) {
                [wipeTitle, wipeOptions, wipeButton, backupSelect, restoreButton, resetPassword, makeRecoveryCode, clearRecoveryLock, deleteAccount].forEach((element) => { element.hidden = true; });
            }
            card.append(accountActions);
            void loadBackups();
            results.append(card);
        });
        const filterPlayers = () => {
            const query = lookup.value.trim().toLowerCase();
            let matchCount = 0;
            results.querySelectorAll<HTMLDetailsElement>(".tester-player-card").forEach((card) => {
                const matches = Boolean(query) && (card.dataset.playerSearch ?? "").includes(query);
                card.hidden = !matches;
                if (matches) matchCount += 1;
            });
            lookupStatus.textContent = !query
                ? "Search to open a player account."
                : matchCount
                    ? `${matchCount} matching account${matchCount === 1 ? "" : "s"}.`
                    : "No matching player accounts.";
        };
        lookup.addEventListener("input", filterPlayers);
        const refreshPresence = async () => {
            const response = await apiRequest<{ users: Pick<ManagedUser, "id" | "isOnline">[] }>("/admin/presence");
            if (!container.isConnected) return;
            const onlineById = new Map(response.users.map((user) => [user.id, user.isOnline]));
            container.querySelectorAll<HTMLElement>("[data-presence-user-id]").forEach((item) => {
                const isOnline = onlineById.get(item.dataset.presenceUserId ?? "") ?? false;
                item.classList.toggle("is-online", isOnline);
                item.textContent = isOnline ? "ONLINE NOW" : "OFFLINE";
            });
        };
        const presenceTimer = globalThis.setInterval(() => {
            if (!container.isConnected) {
                globalThis.clearInterval(presenceTimer);
                if (managedPresenceTimer === presenceTimer) managedPresenceTimer = 0;
                return;
            }
            void refreshPresence().catch((error: unknown) => {
                console.error("Could not refresh player online statuses:", error);
                status.textContent = `Accounts loaded, but online status refresh failed: ${error instanceof Error ? error.message : "unknown service error"}`;
            });
        }, 30_000);
        managedPresenceTimer = presenceTimer;
    } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Could not load player accounts.";
    }
}

