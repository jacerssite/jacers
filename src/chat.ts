import type { ChatAttachment, ChatConversation, ChatMessage, FriendEntry, FriendRequest, OnlineUser } from "./types";
import { apiRequest } from "./api";
import { acceptFriendRequest, blockUser, declineFriendRequest, loadFriends, removeFriend } from "./friends";

type ChatContext = {
    getUser: () => OnlineUser | null;
    onProfile?: (userId: string) => void;
    onUnread?: (pending: number, unread: number) => void;
    onMessage?: () => void;
};

function roleLabel(role: OnlineUser["role"]) { return role === "owner" ? "\u2605" : role === "developer" ? "D" : role === "admin" ? "A" : role === "moderator" ? "M" : role === "level-maker" ? "L" : role === "tester" ? "T" : ""; }
function ageLabel(value: string | null | undefined) {
    if (!value) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}
function clockLabel(value: string | null | undefined) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

export function createChat(context: ChatContext) {
    let button: HTMLButtonElement | null = null;
    let launchIcon: HTMLElement | null = null;
    let panel: HTMLElement | null = null;
    let snapshot: { friends: FriendEntry[]; incoming: FriendRequest[]; outgoing: FriendRequest[] } = { friends: [], incoming: [], outgoing: [] };
    let conversations: ChatConversation[] = [];
    let activeUserId: string | null = null;
    let activeName = "";
    let lastMessageId = "";
    let conversationMessages: ChatMessage[] = [];
    let globalMessages: ChatMessage[] = [];
    let globalLastMessageId = "";
    const messageDrafts = new Map<string, string>();
    let pendingAttachment: ChatAttachment | null = null;
    let pollTimer = 0;
    let refreshTimer = 0;
    let tab: "global" | "friends" | "battle" | "chats" | "requests" = "global";
    let activeView: "global" | "conversation" | null = null;
    let gameActiveState = false;
    let pending = 0;
    let unread = 0;
    let activeTyping = false;
    let ownTyping = false;
    let typingStopTimer = 0;
    let hasUnreadSnapshot = false;
    const chatEmojis = ["👍", "❤️", "😂", "😮", "🎉", "🚀"];

    const setUnread = (nextPending: number, nextUnread: number) => {
        const previousUnread = unread;
        pending = Math.max(0, nextPending);
        unread = Math.max(0, nextUnread);
        if (hasUnreadSnapshot && unread > previousUnread && panel?.hidden !== false) context.onMessage?.();
        hasUnreadSnapshot = true;
        if (button) {
            const badge = button.querySelector<HTMLElement>(".chat-unread-badge");
            if (badge) { badge.textContent = String(unread + pending); badge.hidden = unread + pending === 0; }
        }
        renderTabs();
        context.onUnread?.(pending, unread);
    };

    const clearTimers = () => {
        if (pollTimer) globalThis.clearInterval(pollTimer);
        if (refreshTimer) globalThis.clearInterval(refreshTimer);
        if (typingStopTimer) globalThis.clearTimeout(typingStopTimer);
        if (ownTyping && activeUserId) void apiRequest(`/chat/conversations/${encodeURIComponent(activeUserId)}/typing`, { method: "POST", body: JSON.stringify({ typing: false }) }).catch(() => undefined);
        ownTyping = false;
        typingStopTimer = 0;
        pollTimer = 0; refreshTimer = 0;
    };

    const saveCurrentDraft = () => {
        const input = content()?.querySelector<HTMLTextAreaElement>(".chat-composer textarea");
        if (!input) return;
        const key = activeView === "global" ? "global" : activeUserId ? `dm:${activeUserId}` : "";
        if (key) messageDrafts.set(key, input.value);
    };
    const close = () => { if (!panel) return; saveCurrentDraft(); clearTimers(); panel.hidden = true; activeUserId = null; activeView = null; launchIcon?.classList.remove("open"); if (launchIcon) launchIcon.textContent = ""; button?.setAttribute("aria-label", "Open chat"); };
    const open = () => {
        if (!context.getUser() || !panel) return;
        panel.hidden = false;
        launchIcon?.classList.add("open"); if (launchIcon) launchIcon.textContent = ""; button?.setAttribute("aria-label", "Close chat");
        // Render the selected view immediately. Global chat should not depend on
        // the friends/conversations snapshot being available first.
        renderTab();
        void refreshSnapshot();
        startSnapshotPolling();
    };

    const makeRole = (role: OnlineUser["role"]) => {
        const badge = document.createElement("span");
        badge.className = `chat-role-badge ${role}`;
        badge.textContent = roleLabel(role);
        badge.hidden = !roleLabel(role);
        return badge;
    };

    const renderTabs = () => {
        if (!panel) return;
        panel.querySelectorAll<HTMLButtonElement>(".chat-tab").forEach((item) => {
            item.classList.toggle("selected", item.dataset.tab === tab);
            item.setAttribute("aria-selected", String(item.dataset.tab === tab));
            if (item.dataset.tab === "friends") {
                item.replaceChildren();
                const label = document.createElement("span"); label.textContent = "Gang"; item.append(label);
                if (pending) { const count = document.createElement("b"); count.className = "chat-tab-count"; count.textContent = String(pending); item.append(count); }
            }
        });
    };

    const content = () => panel?.querySelector<HTMLElement>(".chat-panel-content") ?? null;
    const renderFriends = () => {
        const target = content(); if (!target) return;
        target.replaceChildren();
        if (!snapshot.friends.length) target.textContent = "No friends yet. Add pilots from the online leaderboard.";
        snapshot.friends.forEach((friend) => {
            const row = document.createElement("div"); row.className = "chat-list-row";
            const avatar = document.createElement("span"); avatar.className = "chat-avatar"; avatar.textContent = friend.username.slice(0, 1).toUpperCase();
            const name = document.createElement("button"); name.type = "button"; name.className = "chat-player-name"; name.textContent = friend.username; name.append(makeRole(friend.role));
            name.addEventListener("click", () => context.onProfile?.(friend.userId));
            const dot = document.createElement("i"); dot.className = `chat-online-dot${friend.isOnline ? " online" : ""}`; dot.setAttribute("aria-label", friend.isOnline ? "Online" : "Offline");
            const message = document.createElement("button"); message.type = "button"; message.className = "chat-action-button"; message.textContent = "Message"; message.addEventListener("click", () => openConversation(friend.userId, friend.username));
            row.append(avatar, dot, name, message); if (friend.unread) { const badge = document.createElement("b"); badge.className = "chat-row-unread"; badge.textContent = String(friend.unread); row.append(badge); }
            target.append(row);
        });
        if (snapshot.incoming.length || snapshot.outgoing.length) {
            const requests = document.createElement("button"); requests.type = "button"; requests.className = "chat-action-button chat-requests-link"; requests.textContent = pending ? `View requests (${pending})` : "View requests"; requests.addEventListener("click", () => { tab = "requests"; renderTab(); }); target.append(requests);
        }
    };
    const renderRequests = () => {
        const target = content(); if (!target) return;
        target.replaceChildren();
        if (!snapshot.incoming.length && !snapshot.outgoing.length) { target.textContent = "No friend requests right now."; return; }
        const heading = document.createElement("h3"); heading.textContent = "Requests for you"; target.append(heading);
        snapshot.incoming.forEach((request) => {
            const row = document.createElement("div"); row.className = "chat-list-row chat-request-row";
            const label = document.createElement("span"); label.textContent = `${request.username} ${roleLabel(request.role)} · ${ageLabel(request.createdAt)}`;
            const accept = document.createElement("button"); accept.type = "button"; accept.className = "chat-action-button"; accept.textContent = "Accept"; accept.addEventListener("click", async () => { await acceptFriendRequest(request.id); await refreshSnapshot(); });
            const decline = document.createElement("button"); decline.type = "button"; decline.className = "chat-action-button"; decline.textContent = "Decline"; decline.addEventListener("click", async () => { await declineFriendRequest(request.id); await refreshSnapshot(); });
            const block = document.createElement("button"); block.type = "button"; block.className = "chat-action-button danger"; block.textContent = "Block"; block.addEventListener("click", async () => { await blockUser(request.userId); await refreshSnapshot(); });
            row.append(label, accept, decline, block); target.append(row);
        });
        const sentHeading = document.createElement("h3"); sentHeading.textContent = "Requests you sent"; target.append(sentHeading);
        snapshot.outgoing.forEach((request) => {
            const row = document.createElement("div"); row.className = "chat-list-row"; const label = document.createElement("span"); label.textContent = `${request.username} · waiting`;
            const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "chat-action-button"; cancel.textContent = "Cancel"; cancel.addEventListener("click", async () => { await removeFriend(request.userId); await refreshSnapshot(); }); row.append(label, cancel); target.append(row);
        });
    };
    const renderChats = () => {
        const target = content(); if (!target) return;
        target.replaceChildren();
        if (!conversations.length) { target.textContent = "No conversations yet."; return; }
        conversations.forEach((conversation) => {
            const row = document.createElement("div"); row.className = "chat-list-row";
            const avatar = document.createElement("span"); avatar.className = "chat-avatar"; avatar.textContent = conversation.username.slice(0, 1).toUpperCase();
            const name = document.createElement("button"); name.type = "button"; name.className = "chat-player-name"; name.textContent = conversation.username; name.append(makeRole(conversation.role)); name.addEventListener("click", () => openConversation(conversation.userId, conversation.username));
            const preview = document.createElement("small"); preview.textContent = `${conversation.lastMessagePreview || "No messages yet"}${conversation.lastMessageAt ? ` · ${ageLabel(conversation.lastMessageAt)}` : ""}`;
            row.append(avatar, name, preview); if (conversation.unread) { const badge = document.createElement("b"); badge.className = "chat-row-unread"; badge.textContent = String(conversation.unread); row.append(badge); } target.append(row);
        });
    };
    const renderPlaceholder = (message: string) => { saveCurrentDraft(); activeView = null; const target = content(); if (!target) return; target.replaceChildren(); const empty = document.createElement("p"); empty.className = "chat-empty-state"; empty.textContent = message; target.append(empty); };
    const renderTab = () => {
        renderTabs();
        if (tab === "global") {
            if (activeView !== "global") void openGlobalChat();
            else renderConversation(globalMessages, "global");
        } else if (tab === "battle") renderPlaceholder("Battle chat will appear during a shared event.");
        else if (tab === "friends") renderFriends();
        else if (tab === "requests") renderRequests();
        else renderChats();
    };

    const startSnapshotPolling = () => {
        if (refreshTimer || !panel || panel.hidden) return;
        refreshTimer = globalThis.setInterval(() => {
            if (!document.hidden) void refreshSnapshot();
        }, 5000);
    };
    const updateTypingIndicator = () => {
        const indicator = content()?.querySelector<HTMLElement>(".chat-typing-indicator");
        if (!indicator) return;
        indicator.hidden = !activeTyping || !activeUserId;
        indicator.textContent = activeTyping ? `${activeName} is typing...` : "";
    };
    const sendTypingState = (typing: boolean) => {
        if (!activeUserId || context.getUser()?.typingIndicators === false) return;
        void apiRequest(`/chat/conversations/${encodeURIComponent(activeUserId)}/typing`, { method: "POST", body: JSON.stringify({ typing }) }).catch(() => undefined);
    };
    const scheduleTypingStop = () => {
        if (!activeUserId || context.getUser()?.typingIndicators === false) return;
        if (!ownTyping) { ownTyping = true; sendTypingState(true); }
        if (typingStopTimer) globalThis.clearTimeout(typingStopTimer);
        typingStopTimer = globalThis.setTimeout(() => {
            ownTyping = false;
            typingStopTimer = 0;
            sendTypingState(false);
        }, 1800);
    };

    const refreshActiveMessages = async (mode: "direct" | "global") => {
        if (mode === "global") await loadGlobalMessages(false);
        else await loadMessages(false);
    };
    const addEmojiToInput = (input: HTMLTextAreaElement, emoji: string) => {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
        input.focus();
        input.setSelectionRange(start + emoji.length, start + emoji.length);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const renderConversation = (messages: ChatMessage[], mode: "direct" | "global" = "direct") => {
        const target = content(); if (!target) return;
        const draftKey = mode === "global" ? "global" : activeUserId ? `dm:${activeUserId}` : "";
        const previousInput = target.querySelector<HTMLTextAreaElement>(".chat-composer textarea");
        const preserveFocus = previousInput === document.activeElement;
        const previousSelectionStart = previousInput?.selectionStart ?? null;
        const previousSelectionEnd = previousInput?.selectionEnd ?? null;
        if (previousInput && draftKey) messageDrafts.set(draftKey, previousInput.value);
        activeView = mode === "global" ? "global" : "conversation";
        target.replaceChildren();
        const back = document.createElement("button"); back.type = "button"; back.className = "chat-back-button"; back.textContent = "‹ Back"; back.addEventListener("click", () => { activeUserId = null; clearTimers(); renderTab(); });
        const heading = document.createElement("h3"); heading.textContent = mode === "global" ? "Global chat" : activeName;
        if (mode === "global") back.hidden = true;
        const typingIndicator = document.createElement("small"); typingIndicator.className = "chat-typing-indicator"; typingIndicator.hidden = mode !== "direct" || !activeTyping; typingIndicator.textContent = activeTyping ? `${activeName} is typing...` : "";
        target.append(back, heading, typingIndicator);
        const list = document.createElement("div"); list.className = "chat-message-list";
        messages.forEach((message) => {
            const mine = message.sender === context.getUser()?.username;
            const bubble = document.createElement("article"); bubble.className = `chat-message ${mine ? "mine" : ""}${message.deletedAt ? " deleted" : ""}`;
            const meta = document.createElement("small"); meta.textContent = `${message.sender} · ${ageLabel(message.createdAt)}${message.editedAt ? " · edited" : ""}`;
            const text = document.createElement("p"); text.textContent = message.text;
            bubble.append(meta, text);
            const canModerateGlobal = mode === "global" && ["moderator", "admin", "owner", "developer"].includes(context.getUser()?.role ?? "");
            if ((mine || canModerateGlobal) && !message.deletedAt) {
                const more = document.createElement("button"); more.type = "button"; more.className = "chat-message-more"; more.textContent = "⋯"; more.setAttribute("aria-label", "Message actions"); more.setAttribute("aria-expanded", "false");
                const actions = document.createElement("div"); actions.className = "chat-message-actions"; actions.hidden = true;
                const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit"; edit.hidden = !mine; edit.addEventListener("click", async () => {
                    const nextText = globalThis.prompt("Edit message", message.text);
                    if (nextText === null || nextText.trim() === message.text) return;
                    try { await apiRequest(`/chat/messages/${encodeURIComponent(message.id)}`, { method: "PATCH", body: JSON.stringify({ text: nextText }) }); await refreshActiveMessages(mode); }
                    catch (error) { globalThis.alert(error instanceof Error ? error.message : "Could not edit message."); }
                });
                const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Delete"; remove.addEventListener("click", async () => {
                    if (!globalThis.confirm("Delete this message?")) return;
                    try { await apiRequest(`/chat/messages/${encodeURIComponent(message.id)}`, { method: "DELETE" }); await refreshActiveMessages(mode); }
                    catch (error) { globalThis.alert(error instanceof Error ? error.message : "Could not delete message."); }
                });
                more.addEventListener("click", (event) => { event.stopPropagation(); actions.hidden = !actions.hidden; more.setAttribute("aria-expanded", String(!actions.hidden)); });
                actions.append(edit, remove); bubble.append(more, actions);
            }
            if (mode === "direct" && message.sender === context.getUser()?.username) {
                const receipt = document.createElement("small");
                receipt.className = `chat-read-receipt${message.readAt ? " is-read" : ""}`;
                receipt.textContent = message.readAt ? `Read ${clockLabel(message.readAt)}` : "Sent";
                bubble.append(receipt);
            }
            if (message.attachment) { const media = message.attachment.kind === "video" ? document.createElement("video") : document.createElement("img"); if (media instanceof HTMLVideoElement) { media.controls = true; media.preload = "metadata"; media.playsInline = true; } else { media.loading = "lazy"; media.alt = "Attachment"; } media.src = message.attachment.url; bubble.append(media); }
            if (!message.deletedAt) {
                const reactions = document.createElement("div"); reactions.className = "chat-reactions";
                const toggleReaction = async (emoji: string) => {
                    try { await apiRequest(`/chat/messages/${encodeURIComponent(message.id)}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) }); await refreshActiveMessages(mode); }
                    catch (error) { globalThis.alert(error instanceof Error ? error.message : "Could not add reaction."); }
                };
                (message.reactions ?? []).forEach((reaction) => {
                    const reactionButton = document.createElement("button"); reactionButton.type = "button"; reactionButton.className = `chat-reaction${reaction.reacted ? " selected" : ""}`; reactionButton.textContent = `${reaction.emoji} ${reaction.count}`; reactionButton.setAttribute("aria-label", `React ${reaction.emoji}`); reactionButton.addEventListener("click", () => { void toggleReaction(reaction.emoji); }); reactions.append(reactionButton);
                });
                const addReaction = document.createElement("button"); addReaction.type = "button"; addReaction.className = "chat-reaction-add"; addReaction.textContent = "☺"; addReaction.setAttribute("aria-label", "Add reaction");
                const reactionPicker = document.createElement("div"); reactionPicker.className = "chat-emoji-picker chat-reaction-picker"; reactionPicker.hidden = true;
                chatEmojis.forEach((emoji) => { const choice = document.createElement("button"); choice.type = "button"; choice.textContent = emoji; choice.setAttribute("aria-label", `React ${emoji}`); choice.addEventListener("click", () => { void toggleReaction(emoji); }); reactionPicker.append(choice); });
                addReaction.addEventListener("click", () => { reactionPicker.hidden = !reactionPicker.hidden; });
                reactions.append(addReaction, reactionPicker); bubble.append(reactions);
            }
            list.append(bubble); if (mode === "global") globalLastMessageId = message.id; else lastMessageId = message.id;
        });
        target.append(list);
        globalThis.requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
        const form = document.createElement("form"); form.className = "chat-composer";
        const input = document.createElement("textarea"); input.maxLength = 300; input.rows = 2; input.placeholder = "Write a message…"; input.setAttribute("aria-label", "Chat message");
        input.value = draftKey ? messageDrafts.get(draftKey) ?? "" : "";
        const count = document.createElement("small"); count.textContent = `${input.value.length}/300`;
        const attachmentInput = document.createElement("input"); attachmentInput.type = "file"; attachmentInput.accept = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"; attachmentInput.hidden = true; attachmentInput.setAttribute("aria-label", "Choose an image, GIF, or video");
        const attachmentButton = document.createElement("button"); attachmentButton.type = "button"; attachmentButton.className = "chat-action-button chat-attachment-button"; attachmentButton.textContent = "+"; attachmentButton.setAttribute("aria-label", "Attach an image, GIF, or video"); attachmentButton.hidden = mode === "global"; attachmentButton.addEventListener("click", () => attachmentInput.click());
        const emojiButton = document.createElement("button"); emojiButton.type = "button"; emojiButton.className = "chat-action-button chat-emoji-button"; emojiButton.textContent = "☺"; emojiButton.setAttribute("aria-label", "Add emoji");
        const emojiPicker = document.createElement("div"); emojiPicker.className = "chat-emoji-picker"; emojiPicker.hidden = true;
        chatEmojis.forEach((emoji) => { const choice = document.createElement("button"); choice.type = "button"; choice.textContent = emoji; choice.setAttribute("aria-label", `Add ${emoji}`); choice.addEventListener("click", () => { addEmojiToInput(input, emoji); emojiPicker.hidden = true; }); emojiPicker.append(choice); });
        emojiButton.addEventListener("click", () => { emojiPicker.hidden = !emojiPicker.hidden; });
        const attachmentStatus = document.createElement("small"); attachmentStatus.className = "chat-attachment-status"; attachmentStatus.hidden = mode === "global";
        const send = document.createElement("button"); send.type = "submit"; send.className = "chat-action-button"; send.textContent = "Send";
        const updateSendState = () => { count.textContent = `${input.value.length}/300`; send.disabled = !input.value.trim() && (mode === "global" || !pendingAttachment); };
        if (mode === "direct" && pendingAttachment) {
            attachmentStatus.textContent = `${pendingAttachment.kind === "video" ? "Video" : "Image"} attached (${Math.ceil(pendingAttachment.bytes / 1024)} KB)`;
            const removeAttachment = document.createElement("button"); removeAttachment.type = "button"; removeAttachment.className = "chat-attachment-remove"; removeAttachment.textContent = "Remove"; removeAttachment.addEventListener("click", () => { pendingAttachment = null; renderConversation(messages); }); attachmentStatus.append(" ", removeAttachment);
        }
        attachmentInput.addEventListener("change", async () => {
            const file = attachmentInput.files?.[0];
            if (mode === "global" || !file || !activeUserId) return;
            const isVideo = file.type === "video/mp4" || file.type === "video/webm";
            const isImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type);
            const maxBytes = isVideo ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
            if ((!isVideo && !isImage) || file.size < 1 || file.size > maxBytes) { attachmentStatus.textContent = isVideo ? "Videos must be MP4/WebM up to 25 MB." : "Images/GIFs must be JPG/PNG/WebP/GIF up to 8 MB."; attachmentInput.value = ""; return; }
            attachmentButton.disabled = true; attachmentStatus.textContent = "Uploading…";
            try {
                const result = await apiRequest<{ attachment: ChatAttachment }>("/chat/uploads", { method: "POST", headers: { "Content-Type": file.type, "X-Chat-User-Id": activeUserId, "X-File-Name": file.name }, body: file });
                pendingAttachment = result.attachment; renderConversation(messages);
            } catch (error) { attachmentStatus.textContent = error instanceof Error ? error.message : "Could not upload that attachment."; }
            finally { attachmentButton.disabled = false; attachmentInput.value = ""; updateSendState(); }
        });
        input.addEventListener("input", () => { if (draftKey) messageDrafts.set(draftKey, input.value); if (mode === "direct" && input.value.trim()) scheduleTypingStop(); else if (mode === "direct" && ownTyping) { ownTyping = false; sendTypingState(false); } updateSendState(); });
        input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
        form.append(input, attachmentInput, attachmentButton, emojiButton, emojiPicker, attachmentStatus, count, send); updateSendState();
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if ((mode === "direct" && !activeUserId) || (!input.value.trim() && (mode === "global" || !pendingAttachment))) return;
            send.disabled = true;
            try {
                const endpoint = mode === "global" ? "/chat/global" : `/chat/conversations/${encodeURIComponent(activeUserId!)}/messages`;
                const result = await apiRequest<{ message: ChatMessage }>(endpoint, { method: "POST", body: JSON.stringify({ text: input.value, ...(mode === "direct" && pendingAttachment ? { attachment: pendingAttachment } : {}) }) });
                if (draftKey) messageDrafts.delete(draftKey);
                input.value = "";
                pendingAttachment = null;
                if (ownTyping) { ownTyping = false; sendTypingState(false); }
                if (typingStopTimer) { globalThis.clearTimeout(typingStopTimer); typingStopTimer = 0; }
                count.textContent = "0/300";
                if (mode === "global") { globalLastMessageId = result.message.id; await loadGlobalMessages(false); }
                else { lastMessageId = result.message.id; await loadMessages(false); }
            } catch (error) { attachmentStatus.textContent = error instanceof Error ? error.message : "Could not send message."; }
            finally { updateSendState(); }
        });
        target.append(form);
        if (preserveFocus) {
            input.focus();
            if (previousSelectionStart !== null && previousSelectionEnd !== null) input.setSelectionRange(previousSelectionStart, previousSelectionEnd);
        }
    };
    const loadMessages = async (after = true) => {
        if (!activeUserId || !panel || panel.hidden) return;
        try {
            const suffix = after && lastMessageId ? `?after=${encodeURIComponent(lastMessageId)}` : "";
            const response = await apiRequest<{ messages: ChatMessage[]; typing?: boolean; readAt?: string | null }>(`/chat/conversations/${encodeURIComponent(activeUserId)}/messages${suffix}`);
            const previousLength = conversationMessages.length;
            let readStateChanged = false;
            const readAt = response.readAt ?? null;
            conversationMessages = conversationMessages.map((message) => {
                if (message.sender !== context.getUser()?.username) return message;
                const nextReadAt = readAt && new Date(readAt).getTime() >= new Date(message.createdAt).getTime() ? readAt : null;
                if ((message.readAt ?? null) !== nextReadAt) readStateChanged = true;
                return { ...message, readAt: nextReadAt };
            });
            if (after && lastMessageId) {
                const known = new Set(conversationMessages.map((message) => message.id));
                conversationMessages = [...conversationMessages, ...response.messages.filter((message) => !known.has(message.id))];
            } else conversationMessages = response.messages;
            const nextTyping = Boolean(response.typing);
            if (nextTyping !== activeTyping) { activeTyping = nextTyping; updateTypingIndicator(); }
            if (!after || conversationMessages.length !== previousLength || readStateChanged) renderConversation(conversationMessages);
            void apiRequest<void>(`/chat/conversations/${encodeURIComponent(activeUserId)}/read`, { method: "POST", body: "{}" }).catch(() => undefined);
        } catch (error) { const target = content(); if (target) target.textContent = error instanceof Error ? error.message : "Could not load messages."; }
    };
    const loadGlobalMessages = async (after = true) => {
        if (!panel || panel.hidden || activeView !== "global") return;
        try {
            const suffix = after && globalLastMessageId ? `?after=${encodeURIComponent(globalLastMessageId)}` : "";
            const response = await apiRequest<{ messages: ChatMessage[] }>(`/chat/global${suffix}`);
            const previousLength = globalMessages.length;
            if (after && globalLastMessageId) {
                const known = new Set(globalMessages.map((message) => message.id));
                globalMessages = [...globalMessages, ...response.messages.filter((message) => !known.has(message.id))];
            } else globalMessages = response.messages;
            if (!after || globalMessages.length !== previousLength) renderConversation(globalMessages, "global");
        } catch (error) { const target = content(); if (target) target.textContent = error instanceof Error ? error.message : "Global chat is unavailable."; }
    };
    const openGlobalChat = async () => {
        saveCurrentDraft();
        clearTimers();
        activeUserId = null; activeName = "Global chat"; activeView = "global"; globalLastMessageId = "";
        renderConversation(globalMessages, "global");
        await loadGlobalMessages(false);
        startSnapshotPolling();
        pollTimer = globalThis.setInterval(() => { if (!document.hidden) void loadGlobalMessages(true); }, 2500);
    };
    const openConversation = async (userId: string, username: string) => { saveCurrentDraft(); clearTimers(); activeUserId = userId; activeName = username; activeView = "conversation"; lastMessageId = ""; conversationMessages = []; pendingAttachment = null; activeTyping = false; await loadMessages(false); startSnapshotPolling(); pollTimer = globalThis.setInterval(() => { if (!document.hidden) void loadMessages(true); }, 2500); };
    const refreshSnapshot = async () => { if (!context.getUser() || !panel || panel.hidden) return; try { snapshot = await loadFriends(); const result = await apiRequest<{ conversations: ChatConversation[] }>("/chat/conversations"); conversations = result.conversations; setUnread(snapshot.incoming.length, conversations.reduce((sum, item) => sum + item.unread, 0)); if (!activeUserId && activeView !== "global") renderTab(); } catch (error) { const target = content(); if (target && !target.querySelector(".chat-composer textarea")) target.textContent = error instanceof Error ? error.message : "Chat is unavailable."; } };

    const mount = () => {
        if (button?.isConnected) return;
        if (button && !button.isConnected) { button = null; panel = null; launchIcon = null; }
        button = document.createElement("button"); button.type = "button"; button.className = "chat-launch-button"; button.setAttribute("aria-label", "Open chat"); launchIcon = document.createElement("span"); launchIcon.className = "chat-launch-icon";
        const badge = document.createElement("b"); badge.className = "chat-unread-badge"; badge.hidden = true; button.append(launchIcon, badge); button.addEventListener("click", () => panel?.hidden ? open() : close());
        panel = document.createElement("section"); panel.className = "chat-panel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Friends and chat");
        const header = document.createElement("header"); header.className = "chat-panel-header";
        const tabs = document.createElement("nav"); tabs.className = "chat-tabs";
        const tabLabels: Record<"global" | "chats", string> = { global: "Global", chats: "DMs" };
        (Object.keys(tabLabels) as (keyof typeof tabLabels)[]).forEach((name) => { const tabButton = document.createElement("button"); tabButton.type = "button"; tabButton.className = "chat-tab"; tabButton.dataset.tab = name; tabButton.textContent = tabLabels[name]; tabButton.addEventListener("click", () => { saveCurrentDraft(); clearTimers(); activeUserId = null; if (name !== "global") activeView = null; tab = name; renderTab(); if (name !== "global") startSnapshotPolling(); }); tabs.append(tabButton); });
        const refreshButton = document.createElement("button"); refreshButton.type = "button"; refreshButton.textContent = "\u21bb"; refreshButton.className = "chat-refresh-button"; refreshButton.setAttribute("aria-label", "Refresh chat"); refreshButton.addEventListener("click", () => {
            void refreshSnapshot();
            if (activeView === "global") void loadGlobalMessages(false);
            else if (activeView === "conversation") void loadMessages(false);
        });
        const closeButton = document.createElement("button"); closeButton.type = "button"; closeButton.textContent = "\u00d7"; closeButton.className = "chat-close-button"; closeButton.setAttribute("aria-label", "Close chat"); closeButton.addEventListener("click", close); header.append(tabs, refreshButton, closeButton);
        const panelContent = document.createElement("div"); panelContent.className = "chat-panel-content"; panel.append(header, panelContent); document.body.append(button, panel); setUser(context.getUser());
        panel.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); button?.focus(); } });
    };
    const setUser = (user: OnlineUser | null) => { if (!button) return; button.hidden = !user || gameActiveState; if (!user) { close(); hasUnreadSnapshot = false; setUnread(0, 0); } };
    const setGameActive = (active: boolean) => { gameActiveState = active; if (!button) return; button.hidden = !context.getUser() || active; if (active) close(); };
    const remove = () => { clearTimers(); button?.remove(); panel?.remove(); button = null; panel = null; launchIcon = null; setUnread(0, 0); };
    mount();
    return { setUser, setUnread, setGameActive, remove, open, close, mount };
}

