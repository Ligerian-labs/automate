import { getToken } from "./auth";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
async function toJson(res) {
    try {
        return await res.json();
    }
    catch {
        return null;
    }
}
export async function apiFetch(path, init, auth = true) {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    if (auth) {
        const token = getToken();
        if (token)
            headers.set("Authorization", `Bearer ${token}`);
    }
    const res = await fetch(`${API_URL}${path}`, { ...init, headers });
    const data = await toJson(res);
    if (!res.ok) {
        const message = data?.error ||
            data?.message ||
            `Request failed (${res.status})`;
        throw new ApiError(res.status, message);
    }
    return data;
}
//# sourceMappingURL=api.js.map