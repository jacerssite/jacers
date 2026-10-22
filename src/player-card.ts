import type { OnlinePlayerPresence, OnlineUser, PublicPlayerProfile } from "./types";
import { apiRequest } from "./api";
import { sendFriendRequest } from "./friends";

type PlayerCardContext = {
    getUser: () => OnlineUser | null;
    createShipPreview: (loadout: { shipColor: string; avatar: number; skin: number; trail: number }) => HTMLElement;
    showProfile: (id: string) => void;
    showAccount: () => void;
};

let card: HTMLElement | null = null;
let closeTimer = 0;
let openTimer = 0;
let activeAnchor: HTMLElement | null = null;
const cache = new Map<string, { expires: number; profile: PublicPlayerProfile }>();

function closeCard() {
    if (openTimer) window.clearTimeout(openTimer);
    if (closeTimer) window.clearTimeout(closeTimer);
    openTimer = 0; closeTimer = 0;
    card?.remove(); card = null; activeAnchor = null;
}

function scheduleClose() {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => { if (!card?.matches(":hover") && !activeAnchor?.matches(":hover")) closeCard(); }, 150);
}

function positionCard(anchor: HTMLElement) {
    if (!card) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    card.style.width = `${width}px`;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
    const below = rect.bottom + 8;
    const height = card.getBoundingClientRect().height;
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 8);
    card.style.left = `${left}px`; card.style.top = `${top}px`;
}

export function attachPlayerCard(anchor: HTMLElement, presence: Pick<OnlinePlayerPresence, "id" | "username" | "role">, context: PlayerCardContext) {
    if (!presence.id) return;
    const open = async () => {
        if (activeAnchor === anchor && card) return;
        closeCard(); activeAnchor = anchor;
        card = document.createElement("aside"); card.className = "player-profile-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", `Profile of ${presence.username}`); card.textContent = "Loading profile…";
        card.addEventListener("mouseenter", () => { if (closeTimer) window.clearTimeout(closeTimer); }); card.addEventListener("mouseleave", scheduleClose);
        document.body.append(card); positionCard(anchor);
        let profile = cache.get(presence.id)?.expires && cache.get(presence.id)!.expires > Date.now() ? cache.get(presence.id)!.profile : null;
        try { if (!profile) { profile = (await apiRequest<{ player: PublicPlayerProfile }>(`/players/${encodeURIComponent(presence.id)}`)).player; cache.set(presence.id, { profile, expires: Date.now() + 60_000 }); } } catch (error) { if (card) card.textContent = error instanceof Error ? error.message : "Profile unavailable."; return; }
        if (!card || activeAnchor !== anchor) return;
        card.replaceChildren();
        const title = document.createElement("h3"); title.textContent = `${profile.username}${profile.role === "owner" ? " ★" : profile.role === "tester" ? " T" : ""}`;
        const status = document.createElement("small"); status.textContent = profile.isOnline ? "ONLINE NOW" : "OFFLINE";
        const profileTitle = document.createElement("p"); profileTitle.textContent = profile.title ? `Title: ${profile.title}` : "No title equipped";
        card.append(title, status, profileTitle);
        if (!profile.limited) { const stats = document.createElement("p"); stats.textContent = `${profile.routesCleared} routes · prestige ${profile.prestige} · ${profile.asteroids} asteroids`; card.append(stats); card.append(context.createShipPreview({ shipColor: profile.shipColor, avatar: profile.avatar, skin: profile.skin, trail: profile.trail })); }
        const user = context.getUser();
        if (!user) card.append(createButton("Sign in to add friends", context.showAccount));
        else if (user.username.toLowerCase() !== profile.username.toLowerCase()) { const add = createButton("Add friend", async () => { add.disabled = true; try { await sendFriendRequest(profile!.id); add.textContent = "Request sent"; } catch (requestError) { add.disabled = false; add.textContent = requestError instanceof Error ? requestError.message : "Could not add friend."; } }); card.append(add); }
        card.append(createButton("View full profile", () => context.showProfile(profile!.id)));
        positionCard(anchor);
    };
    const scheduleOpen = () => { if (openTimer) window.clearTimeout(openTimer); openTimer = window.setTimeout(() => void open(), 250); };
    anchor.addEventListener("mouseenter", scheduleOpen); anchor.addEventListener("mouseleave", scheduleClose); anchor.addEventListener("focus", scheduleOpen); anchor.addEventListener("blur", scheduleClose); anchor.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCard(); });
    anchor.addEventListener("click", (event) => { if (window.matchMedia?.("(hover: none)").matches) { event.preventDefault(); void open(); } });
    window.addEventListener("scroll", closeCard, { passive: true });
}

function createButton(text: string, action: () => void | Promise<void>) { const button = document.createElement("button"); button.type = "button"; button.className = "chat-action-button"; button.textContent = text; button.addEventListener("click", () => void action()); return button; }

