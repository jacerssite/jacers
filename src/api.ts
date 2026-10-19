export class ApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
    if (response.status === 204) return undefined as T;
    if (!response.headers.get("content-type")?.includes("application/json")) {
        if (!response.ok) throw new ApiError(`Online API is unavailable (${response.status}).`, response.status);
        throw new Error("Online API is not configured at this address.");
    }
    let payload: { error?: string } & T;
    try {
        payload = await response.json() as { error?: string } & T;
    } catch {
        if (!response.ok) throw new ApiError(`Online service returned an invalid response (${response.status}).`, response.status);
        throw new Error(`Online service returned an invalid response (${response.status}).`);
    }
    if (!response.ok) {
        const message = typeof payload?.error === "string" && payload.error
            ? payload.error
            : `Online request failed (${response.status}).`;
        throw new ApiError(message, response.status);
    }
    return payload;
}

