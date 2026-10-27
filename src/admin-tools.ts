import type { CodeReward, ManagedUser, PowerupKind, ProfileTitle, UpdateLogEntry } from "./types";
import { apiRequest } from "./api";
import { createTextButton, showActionDialog } from "./ui";
import { adjustIndentation } from "./text-editor";
import { avatars, skins, trails } from "./cosmetics";
import { powerupLabels } from "./game-config";

// Keep these limits in sync with server/game-data.mjs.
const MAX_UPDATE_LOG_BODY_LENGTH = 20_000;
const MAX_UPDATE_LOG_BYTES = 200_000;

export async function renderAdminCodeTools(container: HTMLElement, availableTitles: ProfileTitle[] = []) {
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Redemption codes";
    const description = document.createElement("p");
    description.textContent = "Codes are shown once when created. Rewards can grant asteroids, power-ups, cosmetics, or titles; limits are enforced on the server. Total uses can be unlimited.";
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    const form = document.createElement("form");
    form.className = "account-profile-form";
    const createInput = (labelText: string, type: string, value = "") => {
        const label = document.createElement("label");
        label.append(document.createTextNode(labelText));
        const input = document.createElement("input");
        input.type = type;
        input.value = value;
        label.append(input);
        form.append(label);
        return input;
    };
    const code = createInput("Code (leave blank to generate)", "text");
    code.maxLength = 40;
    code.pattern = "[A-Za-z0-9!?@#$%&*+=._~()\\-]{8,40}";
    code.title = "Use 8-40 letters, numbers, or ! ? @ # $ % & * + = . _ ~ ( ) -";
    const rewardType = document.createElement("select");
    const rewardTypeOptions: [string, string][] = [
        ["claims", "Normal asteroids"], ["specialClaims", "Special asteroids"], ["powerup", "Power-up"],
        ["skin", "Skin"], ["trail", "Trail"], ["avatar", "Avatar"], ["title", "Profile title"],
    ];
    rewardTypeOptions.forEach(([value, labelText]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = labelText;
        rewardType.append(option);
    });
    const typeLabel = document.createElement("label");
    typeLabel.append(document.createTextNode("Reward type"), rewardType);
    form.append(typeLabel);
    const rewardDetails = document.createElement("div");
    rewardDetails.className = "reward-code-details";
    form.append(rewardDetails);
    const amount = document.createElement("input");
    amount.type = "number";
    amount.value = "50";
    amount.min = "0";
    amount.max = "1000000";
    amount.step = "1";
    const amountLabel = document.createElement("label");
    amountLabel.append(document.createTextNode("Reward amount"), amount);
    rewardDetails.append(amountLabel);
    const detailSelect = document.createElement("select");
    const detailLabel = document.createElement("label");
    detailLabel.append(document.createTextNode("Reward"), detailSelect);
    rewardDetails.append(detailLabel);
    const titleId = document.createElement("select");
    titleId.setAttribute("aria-label", "Title reward");
    const noTitle = document.createElement("option");
    noTitle.value = "";
    noTitle.textContent = "Choose a title";
    titleId.append(noTitle);
    availableTitles.forEach((title) => { const option = document.createElement("option"); option.value = title.id; option.textContent = `${title.name} (${title.id})`; titleId.append(option); });
    const titleLabel = document.createElement("label");
    titleLabel.append(document.createTextNode("Title"), titleId);
    rewardDetails.append(titleLabel);
    const redrawRewardDetails = () => {
        const type = rewardType.value;
        amountLabel.hidden = !["claims", "specialClaims", "powerup"].includes(type);
        amount.max = type === "powerup" ? "1000" : "1000000";
        amount.min = type === "powerup" ? "1" : "0";
        detailLabel.hidden = !["powerup", "skin", "trail", "avatar"].includes(type);
        titleLabel.hidden = type !== "title";
        detailSelect.replaceChildren();
        if (type === "powerup") Object.entries(powerupLabels).forEach(([value, labelText]) => { const option = document.createElement("option"); option.value = value; option.textContent = labelText; detailSelect.append(option); });
        if (type === "skin") skins.forEach((item, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = `${item.name} (#${index})`; detailSelect.append(option); });
        if (type === "trail") trails.forEach((item, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = `${item.name} (#${index})`; detailSelect.append(option); });
        if (type === "avatar") avatars.forEach((item, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = `${item.name} (#${index})`; detailSelect.append(option); });
    };
    rewardType.addEventListener("change", redrawRewardDetails);
    redrawRewardDetails();
    amount.min = "0";
    amount.max = "1000000";
    const maxUses = createInput("Total use limit", "number", "100");
    maxUses.min = "1";
    maxUses.max = "1000000";
    maxUses.required = true;
    const unlimitedUsesLabel = document.createElement("label");
    const unlimitedUses = document.createElement("input");
    unlimitedUses.type = "checkbox";
    unlimitedUses.setAttribute("aria-label", "Unlimited total uses");
    unlimitedUsesLabel.append(unlimitedUses, document.createTextNode(" Unlimited total uses"));
    form.append(unlimitedUsesLabel);
    unlimitedUses.addEventListener("change", () => {
        maxUses.disabled = unlimitedUses.checked;
        maxUses.required = !unlimitedUses.checked;
    });
    const perPlayerLimit = createInput("Uses per player", "number", "1");
    perPlayerLimit.min = "1";
    perPlayerLimit.max = "1000";
    const expiresAt = createInput("Expires at (optional)", "datetime-local");
    const create = document.createElement("button");
    create.type = "submit";
    create.className = "menu-button";
    create.textContent = "Create code";
    form.append(create, status);
    const history = document.createElement("section");
    history.className = "tester-player-management";
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        create.disabled = true;
        try {
            const response = await apiRequest<{ redemptionCode: string }>("/admin/codes", {
                method: "POST",
                body: JSON.stringify({
                    code: code.value.trim() || undefined,
                    reward: (() => {
                        const type = rewardType.value as CodeReward["type"];
                        if (type === "claims" || type === "specialClaims") return { type, amount: Number(amount.value) } satisfies CodeReward;
                        if (type === "powerup") return { type, kind: detailSelect.value as PowerupKind, amount: Math.max(1, Number(amount.value)) } satisfies CodeReward;
                        if (type === "title") return { type, titleId: titleId.value } satisfies CodeReward;
                        return { type: type as "skin" | "trail" | "avatar", index: Number(detailSelect.value) } satisfies CodeReward;
                    })(),
                    maxUses: unlimitedUses.checked ? null : Number(maxUses.value),
                    perPlayerLimit: Number(perPlayerLimit.value),
                    expiresAt: expiresAt.value ? new Date(expiresAt.value).toISOString() : undefined,
                }),
            });
            status.textContent = `New code (shown once): ${response.redemptionCode}`;
            code.value = "";
            await refreshCodes();
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Could not create the code.";
        } finally {
            create.disabled = false;
        }
    });
    const showEditForm = (entry: { id: string; maxUses: number | null; perPlayerLimit: number; reward: CodeReward | number; enabled: boolean; expiresAt: string | null }, row: HTMLElement) => {
        if (row.querySelector(".redemption-code-edit")) return;
        const editForm = document.createElement("form");
        editForm.className = "account-profile-form redemption-code-edit";
        const editInput = (labelText: string, type: string, value = "") => {
            const label = document.createElement("label");
            label.append(document.createTextNode(labelText));
            const input = document.createElement("input");
            input.type = type;
            input.value = value;
            label.append(input);
            editForm.append(label);
            return input;
        };
        const initialReward: CodeReward = typeof entry.reward === "number" ? { type: "claims", amount: entry.reward } : entry.reward;
        const editRewardType = document.createElement("select");
        rewardTypeOptions.forEach(([value, labelText]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = labelText;
            editRewardType.append(option);
        });
        editRewardType.value = initialReward.type;
        const editRewardTypeLabel = document.createElement("label");
        editRewardTypeLabel.append(document.createTextNode("Reward type"), editRewardType);
        editForm.append(editRewardTypeLabel);
        const editDetails = document.createElement("div");
        editDetails.className = "reward-code-details";
        editForm.append(editDetails);
        const editAmount = document.createElement("input");
        editAmount.type = "number";
        editAmount.step = "1";
        const editAmountLabel = document.createElement("label");
        editAmountLabel.append(document.createTextNode("Reward amount"), editAmount);
        editDetails.append(editAmountLabel);
        const editDetailSelect = document.createElement("select");
        const editDetailLabel = document.createElement("label");
        editDetailLabel.append(document.createTextNode("Reward"), editDetailSelect);
        editDetails.append(editDetailLabel);
        const editTitleId = document.createElement("select");
        const editNoTitle = document.createElement("option");
        editNoTitle.value = "";
        editNoTitle.textContent = "Choose a title";
        editTitleId.append(editNoTitle);
        availableTitles.forEach((title) => {
            const option = document.createElement("option");
            option.value = title.id;
            option.textContent = `${title.name} (${title.id})`;
            editTitleId.append(option);
        });
        const editTitleLabel = document.createElement("label");
        editTitleLabel.append(document.createTextNode("Title"), editTitleId);
        editDetails.append(editTitleLabel);
        const redrawEditReward = () => {
            const type = editRewardType.value;
            editAmountLabel.hidden = !["claims", "specialClaims", "powerup"].includes(type);
            editAmount.min = type === "powerup" ? "1" : "0";
            editAmount.max = type === "powerup" ? "1000" : "1000000";
            editDetailLabel.hidden = !["powerup", "skin", "trail", "avatar"].includes(type);
            editTitleLabel.hidden = type !== "title";
            editDetailSelect.replaceChildren();
            if (type === "powerup") Object.entries(powerupLabels).forEach(([value, labelText]) => { const option = document.createElement("option"); option.value = value; option.textContent = labelText; editDetailSelect.append(option); });
            if (type === "skin") skins.forEach((item, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = `${item.name} (#${index})`; editDetailSelect.append(option); });
            if (type === "trail") trails.forEach((item, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = `${item.name} (#${index})`; editDetailSelect.append(option); });
            if (type === "avatar") avatars.forEach((item, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = `${item.name} (#${index})`; editDetailSelect.append(option); });
        };
        if (initialReward.type === "claims" || initialReward.type === "specialClaims" || initialReward.type === "powerup") editAmount.value = String(initialReward.amount);
        redrawEditReward();
        if (initialReward.type === "powerup") editDetailSelect.value = initialReward.kind;
        if (initialReward.type === "skin" || initialReward.type === "trail" || initialReward.type === "avatar") editDetailSelect.value = String(initialReward.index);
        if (initialReward.type === "title") editTitleId.value = initialReward.titleId;
        editRewardType.addEventListener("change", redrawEditReward);
        const editMaxUses = editInput("Total use limit", "number", entry.maxUses === null ? "" : String(entry.maxUses));
        editMaxUses.min = "1";
        editMaxUses.max = "1000000";
        editMaxUses.required = entry.maxUses !== null;
        const editUnlimitedLabel = document.createElement("label");
        const editUnlimited = document.createElement("input");
        editUnlimited.type = "checkbox";
        editUnlimited.checked = entry.maxUses === null;
        editUnlimited.setAttribute("aria-label", "Unlimited total uses");
        editUnlimitedLabel.append(editUnlimited, document.createTextNode(" Unlimited total uses"));
        editForm.append(editUnlimitedLabel);
        editMaxUses.disabled = editUnlimited.checked;
        editUnlimited.addEventListener("change", () => {
            editMaxUses.disabled = editUnlimited.checked;
            editMaxUses.required = !editUnlimited.checked;
        });
        const editPerPlayerLimit = editInput("Uses per player", "number", String(entry.perPlayerLimit));
        editPerPlayerLimit.min = "1";
        editPerPlayerLimit.max = "1000";
        const editExpiresAt = editInput("Expires at (optional)", "datetime-local");
        if (entry.expiresAt) {
            const expires = new Date(entry.expiresAt);
            if (Number.isFinite(expires.getTime())) {
                editExpiresAt.value = new Date(expires.getTime() - expires.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            }
        }
        const editEnabledLabel = document.createElement("label");
        const editEnabled = document.createElement("input");
        editEnabled.type = "checkbox";
        editEnabled.checked = entry.enabled;
        editEnabled.setAttribute("aria-label", "Code enabled");
        editEnabledLabel.append(editEnabled, document.createTextNode(" Code enabled"));
        editForm.append(editEnabledLabel);
        const actions = document.createElement("div");
        const saveEdit = document.createElement("button");
        saveEdit.type = "submit";
        saveEdit.className = "menu-button";
        saveEdit.textContent = "Save code changes";
        const cancelEdit = createTextButton("Cancel", () => editForm.remove());
        actions.append(saveEdit, cancelEdit);
        editForm.append(actions);
        editForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            saveEdit.disabled = true;
            try {
                const type = editRewardType.value as CodeReward["type"];
                const reward: CodeReward = type === "claims" || type === "specialClaims"
                    ? { type, amount: Number(editAmount.value) }
                    : type === "powerup"
                        ? { type, kind: editDetailSelect.value as PowerupKind, amount: Math.max(1, Number(editAmount.value)) }
                        : type === "title"
                            ? { type, titleId: editTitleId.value }
                            : { type: type as "skin" | "trail" | "avatar", index: Number(editDetailSelect.value) };
                await apiRequest(`/admin/codes/${encodeURIComponent(entry.id)}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        reward,
                        maxUses: editUnlimited.checked ? null : Number(editMaxUses.value),
                        perPlayerLimit: Number(editPerPlayerLimit.value),
                        expiresAt: editExpiresAt.value ? new Date(editExpiresAt.value).toISOString() : null,
                        enabled: editEnabled.checked,
                    }),
                });
                status.textContent = "Code updated.";
                await refreshCodes();
            } catch (error) {
                status.textContent = error instanceof Error ? error.message : "Could not update the code.";
                saveEdit.disabled = false;
            }
        });
        row.append(editForm);
    };
    const refreshCodes = async () => {
        try {
            const response = await apiRequest<{ codes: { id: string; maxUses: number | null; perPlayerLimit: number; uses: number; reward: CodeReward | number; enabled: boolean; expiresAt: string | null }[] }>("/admin/codes");
            history.replaceChildren();
            response.codes.forEach((entry) => {
                const row = document.createElement("article");
                row.className = "tester-custom-level-row";
                const label = document.createElement("span");
                const reward: CodeReward = typeof entry.reward === "number" ? { type: "claims", amount: entry.reward } : entry.reward;
                const rewardText = reward.type === "claims" ? `${reward.amount} normal asteroids` : reward.type === "specialClaims" ? `${reward.amount} special asteroids` : reward.type === "powerup" ? `${reward.amount} ${powerupLabels[reward.kind] ?? reward.kind}` : reward.type === "title" ? `title ${reward.titleId}` : `${reward.type} #${(reward as Extract<CodeReward, { type: "skin" | "trail" | "avatar" }>).index}`;
                const usageText = entry.maxUses === null ? `${entry.uses}/unlimited uses` : `${entry.uses}/${entry.maxUses} uses`;
                label.textContent = `${rewardText} / ${usageText} / ${entry.enabled ? "enabled" : "disabled"}${entry.expiresAt ? ` / expires ${new Date(entry.expiresAt).toLocaleString()}` : ""}`;
                row.append(label);
                const edit = createTextButton("Edit", () => showEditForm(entry, row));
                row.append(edit);
                if (entry.enabled) {
                    const disable = createTextButton("Turn off", async () => {
                        disable.disabled = true;
                        try {
                            await apiRequest(`/admin/codes/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
                            await refreshCodes();
                        } catch (error) {
                            status.textContent = error instanceof Error ? error.message : "Could not disable the code.";
                            disable.disabled = false;
                        }
                    });
                    row.append(disable);
                }
                history.append(row);
            });
            if (!response.codes.length) history.textContent = "No codes yet.";
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Could not load redemption codes.";
        }
    };
    const refresh = createTextButton("Refresh code list", () => void refreshCodes());
    container.append(heading, description, form, refresh, history);
    await refreshCodes();
}

export async function renderAdminMessageTools(container: HTMLElement) {
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Player messages";
    const form = document.createElement("form");
    form.className = "account-profile-form";
    const title = document.createElement("input");
    title.required = true;
    title.maxLength = 100;
    title.placeholder = "Message title";
    title.setAttribute("aria-label", "Message title");
    const body = document.createElement("textarea");
    body.required = true;
    body.maxLength = 300;
    body.placeholder = "Message (up to 300 characters)";
    body.setAttribute("aria-label", "Message body");
    const recipient = document.createElement("select");
    recipient.setAttribute("aria-label", "Message recipient");
    const everyone = document.createElement("option");
    everyone.value = "";
    everyone.textContent = "Everyone (available for 24 hours)";
    recipient.append(everyone);
    const kind = document.createElement("select");
    kind.setAttribute("aria-label", "Message type");
    [["info", "Info"], ["warning", "Warning"], ["reward", "Reward"]].forEach(([value, labelText]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = labelText;
        kind.append(option);
    });
    const users = await apiRequest<{ users: ManagedUser[] }>("/admin/users");
    users.users.filter((user) => user.role !== "owner").forEach((user) => {
        const option = document.createElement("option");
        option.value = user.id;
        option.textContent = user.username;
        recipient.append(option);
    });
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "menu-button";
    submit.textContent = "Send message";
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    const history = document.createElement("section");
    history.className = "tester-player-management";
    form.append(title, body, recipient, kind, submit, status);
    const loadHistory = async () => {
        const response = await apiRequest<{ messages: { id: string; title: string; body: string; type: string; userId: string | null; createdAt: string }[] }>("/admin/messages");
        history.replaceChildren();
        response.messages.forEach((message) => {
            const row = document.createElement("article");
            row.className = "tester-custom-level-row";
            const summary = document.createElement("span");
            summary.textContent = `${message.title} / ${message.type} / ${message.userId ? "one pilot" : "everyone"} / ${new Date(message.createdAt).toLocaleString()}`;
            const deleteButton = createTextButton("Delete", async () => {
                deleteButton.disabled = true;
                try {
                    await apiRequest(`/admin/messages/${encodeURIComponent(message.id)}`, { method: "DELETE" });
                    await loadHistory();
                } catch (error) {
                    status.textContent = error instanceof Error ? error.message : "Could not delete the message.";
                    deleteButton.disabled = false;
                }
            });
            row.append(summary, deleteButton);
            history.append(row);
        });
        if (!response.messages.length) history.textContent = "No messages have been sent.";
    };
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submit.disabled = true;
        try {
            await apiRequest("/admin/messages", {
                method: "POST",
                body: JSON.stringify({ title: title.value, body: body.value, type: kind.value, ...(recipient.value ? { userId: recipient.value } : {}) }),
            });
            status.textContent = "Message queued for delivery.";
            form.reset();
            await loadHistory();
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Could not send the message.";
        } finally {
            submit.disabled = false;
        }
    });
    const refresh = createTextButton("Refresh message history", () => void loadHistory().catch((error) => { status.textContent = error instanceof Error ? error.message : "Could not load messages."; }));
    container.append(heading, form, refresh, history);
    try {
        await loadHistory();
    } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Could not load messages.";
    }
}

export async function renderAdminChatReports(container: HTMLElement) {
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Chat reports";
    const description = document.createElement("p");
    description.textContent = "Review open player reports from global chat and direct messages. Use Player accounts to apply moderation actions.";
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    const list = document.createElement("section");
    list.className = "tester-player-management chat-report-list";
    const loadReports = async () => {
        const response = await apiRequest<{ reports: { id: string; senderId: string; sender: string; reporter: string; text: string; reason: string; global: boolean; createdAt: string | null }[] }>("/admin/chat/reports");
        list.replaceChildren();
        if (!response.reports.length) { list.textContent = "No open chat reports."; return; }
        response.reports.forEach((report) => {
            const row = document.createElement("article");
            row.className = "tester-custom-level-row chat-report-row";
            const details = document.createElement("div");
            const summary = document.createElement("strong");
            summary.textContent = `${report.global ? "Global chat" : "Direct message"} / ${report.sender} reported by ${report.reporter}`;
            const message = document.createElement("p");
            message.textContent = `Message: ${report.text}`;
            const reason = document.createElement("small");
            reason.textContent = `Reason: ${report.reason}${report.createdAt ? ` / ${new Date(report.createdAt).toLocaleString()}` : ""}`;
            details.append(summary, message, reason);
            row.append(details);
            list.append(row);
        });
    };
    const refresh = createTextButton("Refresh reports", () => void loadReports().catch((error) => { status.textContent = error instanceof Error ? error.message : "Could not load chat reports."; }));
    container.append(heading, description, refresh, status, list);
    await loadReports();
}

export async function renderAdminModerationLog(container: HTMLElement) {
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Moderation log";
    const description = document.createElement("p");
    description.textContent = "Account, email, and login-network moderation actions are recorded here with the actor and reason.";
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    const list = document.createElement("section");
    list.className = "tester-player-management chat-report-list";
    const loadLog = async () => {
        const response = await apiRequest<{ entries: { id: string; action: string; reason: string; actor: string; target: string; createdAt: string | null }[] }>("/admin/moderation-log");
        list.replaceChildren();
        if (!response.entries.length) { list.textContent = "No moderation actions have been recorded yet."; return; }
        response.entries.forEach((entry) => {
            const row = document.createElement("article");
            row.className = "tester-custom-level-row chat-report-row";
            const action = document.createElement("strong");
            action.textContent = `${entry.action}: ${entry.target}`;
            const details = document.createElement("small");
            details.textContent = `By ${entry.actor}${entry.createdAt ? ` / ${new Date(entry.createdAt).toLocaleString()}` : ""}`;
            const reason = document.createElement("p");
            reason.textContent = `Reason: ${entry.reason || "No reason supplied."}`;
            row.append(action, details, reason);
            list.append(row);
        });
    };
    const refresh = createTextButton("Refresh moderation log", () => void loadLog().catch((error) => { status.textContent = error instanceof Error ? error.message : "Could not load moderation log."; }));
    container.append(heading, description, refresh, status, list);
    await loadLog();
}

export async function renderAdminChatFilterTools(container: HTMLElement) {
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Chat word filter";
    const description = document.createElement("p");
    description.textContent = "Hateful and abusive terms are masked in global and direct chat. Built-in terms stay masked here; add project-specific words or phrases below.";
    const form = document.createElement("form");
    form.className = "account-profile-form chat-filter-form";
    const term = document.createElement("input");
    term.required = true;
    term.maxLength = 80;
    term.placeholder = "Word or short phrase to block";
    term.setAttribute("aria-label", "Blocked word or phrase");
    const category = document.createElement("select");
    category.setAttribute("aria-label", "Blocked word category");
    [["Custom", "Custom"], ["Hate / race", "Hate / race"], ["Hate / identity", "Hate / identity"], ["Abusive profanity", "Abusive profanity"], ["Threats", "Threats"]].forEach(([value, labelText]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = labelText;
        category.append(option);
    });
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "menu-button";
    submit.textContent = "Add blocked term";
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    form.append(term, category, submit, status);
    const list = document.createElement("section");
    list.className = "chat-filter-list";
    const renderTerms = async () => {
        const response = await apiRequest<{ terms: { id: string; masked: string; category: string; builtIn: boolean }[]; builtInCount: number }>("/admin/chat-filter");
        list.replaceChildren();
        const summary = document.createElement("p");
        summary.className = "menu-copy";
        summary.textContent = `${response.terms.length} blocked terms (${response.builtInCount} built-in). Terms are shown with masked characters.`;
        list.append(summary);
        if (!response.terms.length) { const empty = document.createElement("p"); empty.textContent = "No blocked terms are configured."; list.append(empty); return; }
        response.terms.forEach((entry) => {
            const row = document.createElement("article");
            row.className = "chat-filter-row";
            const label = document.createElement("span");
            label.textContent = `${entry.masked} / ${entry.category}${entry.builtIn ? " / built-in" : " / owner added"}`;
            row.append(label);
            if (!entry.builtIn) {
                const remove = createTextButton("Remove", async () => {
                    remove.disabled = true;
                    try {
                        await apiRequest(`/admin/chat-filter/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
                        await renderTerms();
                    } catch (error) {
                        status.textContent = error instanceof Error ? error.message : "Could not remove the blocked term.";
                        remove.disabled = false;
                    }
                });
                row.append(remove);
            }
            list.append(row);
        });
    };
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submit.disabled = true;
        status.textContent = "Saving blocked term...";
        try {
            await apiRequest("/admin/chat-filter", { method: "POST", body: JSON.stringify({ term: term.value, category: category.value }) });
            term.value = "";
            status.textContent = "Blocked term saved. Matching chat text will be replaced with **.";
            await renderTerms();
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Could not save the blocked term.";
        } finally { submit.disabled = false; }
    });
    const refresh = createTextButton("Refresh blocked list", () => void renderTerms().catch((error) => { status.textContent = error instanceof Error ? error.message : "Could not load blocked terms."; }));
    container.append(heading, description, form, refresh, list);
    await renderTerms();
}

export async function renderAdminUpdateLog(container: HTMLElement, entriesFromServer: UpdateLogEntry[], onSaved: (entries: UpdateLogEntry[]) => void) {
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Credits update log / edit entries";
    const description = document.createElement("p");
    description.textContent = "Edit any existing entry below, paste plain text with paragraphs, spaces, and tabs, then publish the changes for every player.";
    const form = document.createElement("form");
    form.className = "account-profile-form update-log-editor";
    const entries = document.createElement("section");
    entries.className = "update-log-editor-list";
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    let savedEntries = entriesFromServer.map((entry) => ({ ...entry }));
    let draft = savedEntries.map((entry) => ({ ...entry }));
    const drawEntries = () => {
        entries.replaceChildren();
        draft.forEach((entry, index) => {
            const row = document.createElement("article");
            row.className = "update-log-editor-entry";
            const date = document.createElement("input");
            date.type = "date";
            date.value = entry.date;
            date.required = true;
            date.dataset.updateDate = String(index);
            date.setAttribute("aria-label", `Update ${index + 1} date`);
            const title = document.createElement("input");
            title.type = "text";
            title.value = entry.title;
            title.maxLength = 80;
            title.required = true;
            title.placeholder = "Update title";
            title.dataset.updateTitle = String(index);
            title.setAttribute("aria-label", `Update ${index + 1} title`);
            const body = document.createElement("textarea");
            body.value = entry.body;
            body.rows = 10;
            body.required = true;
            body.placeholder = "Paste or write your update here...";
            body.dataset.updateBody = String(index);
            body.setAttribute("aria-label", `Update ${index + 1} details`);
            const count = document.createElement("small");
            count.className = "update-log-character-count";
            const updateCount = () => {
                count.textContent = `${body.value.length.toLocaleString()} / ${MAX_UPDATE_LOG_BODY_LENGTH.toLocaleString()} characters${body.value.length > MAX_UPDATE_LOG_BODY_LENGTH ? " — entry is too long to publish" : ""}`;
                count.classList.toggle("is-over-limit", body.value.length > MAX_UPDATE_LOG_BODY_LENGTH);
            };
            body.addEventListener("input", updateCount);
            updateCount();
            const editorActions = document.createElement("div");
            editorActions.className = "update-log-editor-actions";
            const indent = createTextButton("Indent", () => adjustIndentation(body));
            indent.setAttribute("aria-label", `Indent update ${index + 1}`);
            const outdent = createTextButton("Outdent", () => adjustIndentation(body, true));
            outdent.setAttribute("aria-label", `Outdent update ${index + 1}`);
            const tabOption = document.createElement("label");
            tabOption.className = "update-log-tab-option";
            const useTab = document.createElement("input");
            useTab.type = "checkbox";
            tabOption.append(useTab, document.createTextNode("Use Tab to indent"));
            const tabHint = document.createElement("small");
            tabHint.textContent = "Select lines to indent or outdent. If Tab indentation is on, press Esc to turn it off and move focus.";
            body.addEventListener("keydown", (event) => {
                if (event.key === "Escape" && useTab.checked) {
                    useTab.checked = false;
                    status.textContent = "Tab indentation is off; Tab now moves between controls.";
                } else if (event.key === "Tab" && useTab.checked) {
                    event.preventDefault();
                    adjustIndentation(body, event.shiftKey);
                }
            });
            editorActions.append(indent, outdent, tabOption);
            const edit = createTextButton("Edit entry", () => {
                title.focus();
                status.textContent = `Editing update ${index + 1}. Publish the log when you are finished.`;
            });
            edit.setAttribute("aria-label", `Edit update ${index + 1}`);
            editorActions.prepend(edit);
            const remove = createTextButton("Remove", () => {
                void showActionDialog({ title: "Remove update from draft?", description: `Remove update ${index + 1}? You must publish for this change to affect players.`, confirmLabel: "Remove update", danger: true }).then((dialog) => {
                    if (!dialog.confirmed) return;
                    draft = readEntries().filter((_, entryIndex) => entryIndex !== index);
                    drawEntries();
                });
            });
            row.append(date, title, body, count, editorActions, tabHint, remove);
            entries.append(row);
        });
        if (!draft.length) {
            const empty = document.createElement("p");
            empty.textContent = "The public update log is currently empty.";
            entries.append(empty);
        }
    };
    const readEntries = () => draft.map((entry, index) => ({
        date: entries.querySelector<HTMLInputElement>(`input[data-update-date="${index}"]`)?.value ?? entry.date,
        title: entries.querySelector<HTMLInputElement>(`input[data-update-title="${index}"]`)?.value ?? entry.title,
        body: entries.querySelector<HTMLTextAreaElement>(`textarea[data-update-body="${index}"]`)?.value ?? entry.body,
    }));
    const add = createTextButton("Add update", () => {
        draft = [{ date: new Date().toISOString().slice(0, 10), title: "", body: "" }, ...readEntries()];
        drawEntries();
    });
    const reset = createTextButton("Discard unsaved changes", () => {
        draft = savedEntries.map((entry) => ({ ...entry }));
        drawEntries();
        status.textContent = "Unsaved update-log changes discarded.";
    });
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "menu-button";
    save.textContent = "Publish update log";
    form.append(entries, add, reset, save, status);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const nextEntries = readEntries().map((entry) => ({ ...entry, title: entry.title.trim() }));
        const invalidEntry = nextEntries.findIndex((entry) => !entry.body.trim() || entry.body.length > MAX_UPDATE_LOG_BODY_LENGTH);
        if (invalidEntry !== -1) {
            status.textContent = `Update ${invalidEntry + 1} needs text and must be at most ${MAX_UPDATE_LOG_BODY_LENGTH.toLocaleString()} characters.`;
            return;
        }
        const requestBody = JSON.stringify({ entries: nextEntries });
        if (new TextEncoder().encode(requestBody).length > MAX_UPDATE_LOG_BYTES) {
            status.textContent = "The update log is too large to publish (200 KB total). Shorten or remove some entries.";
            return;
        }
        save.disabled = true;
        status.textContent = "Saving update log...";
        try {
            const result = await apiRequest<{ updateLog: UpdateLogEntry[] }>("/settings/update-log", {
                method: "PUT",
                body: requestBody,
            });
            onSaved(result.updateLog);
            savedEntries = result.updateLog.map((entry) => ({ ...entry }));
            draft = savedEntries.map((entry) => ({ ...entry }));
            drawEntries();
            status.textContent = "Credits update log published.";
        } catch (error) {
            status.textContent = error instanceof Error ? error.message : "Could not publish the update log.";
        } finally {
            save.disabled = false;
        }
    });
    drawEntries();
    container.append(heading, description, form);
}

