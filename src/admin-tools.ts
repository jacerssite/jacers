import type { ManagedUser, UpdateLogEntry } from "./types";
import { apiRequest } from "./api";
import { createTextButton } from "./ui";

export async function renderAdminCodeTools(container: HTMLElement) {
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Redemption codes";
    const description = document.createElement("p");
    description.textContent = "Codes are shown once when created. Rewards are normal or special asteroids; limits are enforced on the server.";
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
    code.pattern = "[A-Za-z0-9-]{8,40}";
    const rewardType = document.createElement("select");
    [["claims", "Normal asteroids"], ["specialClaims", "Special asteroids"]].forEach(([value, labelText]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = labelText;
        rewardType.append(option);
    });
    const typeLabel = document.createElement("label");
    typeLabel.append(document.createTextNode("Reward type"), rewardType);
    form.append(typeLabel);
    const amount = createInput("Reward amount", "number", "50");
    amount.min = "0";
    amount.max = "1000000";
    const maxUses = createInput("Total use limit", "number", "100");
    maxUses.min = "1";
    maxUses.max = "1000000";
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
                    reward: { type: rewardType.value, amount: Number(amount.value) },
                    maxUses: Number(maxUses.value),
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
    const refreshCodes = async () => {
        try {
            const response = await apiRequest<{ codes: { id: string; maxUses: number; perPlayerLimit: number; uses: number; reward: { type: string; amount: number }; enabled: boolean; expiresAt: string | null }[] }>("/admin/codes");
            history.replaceChildren();
            response.codes.forEach((entry) => {
                const row = document.createElement("article");
                row.className = "tester-custom-level-row";
                const label = document.createElement("span");
                label.textContent = `${entry.reward.amount} ${entry.reward.type === "specialClaims" ? "special" : "normal"} asteroids / ${entry.uses}/${entry.maxUses} uses / ${entry.enabled ? "enabled" : "disabled"}${entry.expiresAt ? ` / expires ${new Date(entry.expiresAt).toLocaleString()}` : ""}`;
                row.append(label);
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

export async function renderAdminUpdateLog(container: HTMLElement, entriesFromServer: UpdateLogEntry[], onSaved: (entries: UpdateLogEntry[]) => void) {
    container.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Credits update log";
    const description = document.createElement("p");
    description.textContent = "Published entries appear in Credits for every player. Changes are recorded in settings history.";
    const form = document.createElement("form");
    form.className = "account-profile-form update-log-editor";
    const entries = document.createElement("section");
    entries.className = "update-log-editor-list";
    const status = document.createElement("small");
    status.setAttribute("role", "status");
    let draft = entriesFromServer.map((entry) => ({ ...entry }));
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
            body.maxLength = 600;
            body.required = true;
            body.placeholder = "What changed?";
            body.dataset.updateBody = String(index);
            body.setAttribute("aria-label", `Update ${index + 1} details`);
            const remove = createTextButton("Remove", () => {
                draft = draft.filter((_, entryIndex) => entryIndex !== index);
                drawEntries();
            });
            row.append(date, title, body, remove);
            entries.append(row);
        });
        if (!draft.length) {
            const empty = document.createElement("p");
            empty.textContent = "The public update log is currently empty.";
            entries.append(empty);
        }
    };
    const add = createTextButton("Add update", () => {
        draft.unshift({ date: new Date().toISOString().slice(0, 10), title: "", body: "" });
        drawEntries();
    });
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "menu-button";
    save.textContent = "Publish update log";
    form.append(entries, add, save, status);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        save.disabled = true;
        status.textContent = "Saving update log...";
        const nextEntries = draft.map((entry, index) => ({
            date: entries.querySelector<HTMLInputElement>(`input[data-update-date="${index}"]`)?.value ?? entry.date,
            title: entries.querySelector<HTMLInputElement>(`input[data-update-title="${index}"]`)?.value.trim() ?? entry.title,
            body: entries.querySelector<HTMLTextAreaElement>(`textarea[data-update-body="${index}"]`)?.value.trim() ?? entry.body,
        }));
        try {
            const result = await apiRequest<{ updateLog: UpdateLogEntry[] }>("/settings/update-log", {
                method: "PUT",
                body: JSON.stringify({ entries: nextEntries }),
            });
            onSaved(result.updateLog);
            draft = result.updateLog.map((entry) => ({ ...entry }));
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

