export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
    if (response.status === 204) return undefined as T;
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(response.ok
            ? "Online API is not configured at this address."
            : `Online API is unavailable (${response.status}).`);
    }
    let payload: { error?: string } & T;
    try {
        payload = await response.json() as { error?: string } & T;
    } catch {
        throw new Error(`Online service returned an invalid response (${response.status}).`);
    }
    if (!response.ok) throw new Error(payload.error || `Online request failed (${response.status}).`);
    return payload;
}

