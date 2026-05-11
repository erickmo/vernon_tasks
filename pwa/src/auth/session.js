import { api } from "../api/client";
export async function probeSession() {
    const s = await api.get("/api/method/vernon_tasks.task.api.boot.boot");
    if (s.csrf_token) {
        window.csrf_token = s.csrf_token;
    }
    return s;
}
export async function login(usr, pwd) {
    await api.post("/api/method/login", { usr, pwd });
    return probeSession();
}
export async function logout() {
    await api.post("/api/method/logout");
    window.csrf_token = undefined;
}
