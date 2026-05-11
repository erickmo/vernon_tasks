let authHandler = null;
export function onAuthChallenge(handler) {
    authHandler = handler;
}
function getCsrf() {
    return window.csrf_token;
}
export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
async function request(method, url, body, retry = true) {
    const headers = { "X-Requested-With": "fetch" };
    if (body !== undefined)
        headers["Content-Type"] = "application/json";
    const csrf = getCsrf();
    if (csrf)
        headers["X-Frappe-CSRF-Token"] = csrf;
    const res = await fetch(url, {
        method,
        headers,
        credentials: "same-origin",
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) {
        if (retry && authHandler) {
            const ok = await authHandler();
            if (ok)
                return request(method, url, body, false);
        }
        throw new ApiError(res.status, "Unauthorized");
    }
    if (!res.ok) {
        throw new ApiError(res.status, `HTTP ${res.status}`);
    }
    const text = await res.text();
    if (!text)
        return undefined;
    const json = JSON.parse(text);
    return (json && "message" in json ? json.message : json);
}
export const api = {
    get: (url) => request("GET", url),
    post: (url, body) => request("POST", url, body ?? {}),
};
