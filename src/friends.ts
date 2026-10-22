import type { FriendEntry, FriendRequest } from "./types";
import { apiRequest } from "./api";

export type FriendsSnapshot = { friends: FriendEntry[]; incoming: FriendRequest[]; outgoing: FriendRequest[] };

export function loadFriends() {
    return apiRequest<FriendsSnapshot>("/friends");
}

export function sendFriendRequest(userId: string) {
    return apiRequest<{ status: "pending" | "accepted" }>("/friends/requests", { method: "POST", body: JSON.stringify({ userId }) });
}

export function acceptFriendRequest(id: string) {
    return apiRequest<{ status: "accepted" }>(`/friends/requests/${encodeURIComponent(id)}/accept`, { method: "POST", body: "{}" });
}

export function declineFriendRequest(id: string) {
    return apiRequest<{ status: "declined" }>(`/friends/requests/${encodeURIComponent(id)}/decline`, { method: "POST", body: "{}" });
}

export function removeFriend(userId: string) {
    return apiRequest<void>(`/friends/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export function blockUser(userId: string) {
    return apiRequest<{ blocked: true }>("/blocks", { method: "POST", body: JSON.stringify({ userId }) });
}

