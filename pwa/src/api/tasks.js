import { api } from "./client";
import { cacheGet, cachePut } from "../cache/idb";
import { stamp } from "../cache/sync-time";
export async function fetchMyWork() {
    try {
        const data = await api.get("/api/method/vernon_tasks.task.api.my_work.list");
        await cachePut("my-work", data);
        stamp("my-work");
        return data;
    }
    catch (e) {
        const cached = await cacheGet("my-work");
        if (cached)
            return cached;
        throw e;
    }
}
export async function fetchTaskDetail(id) {
    const key = `task:${id}`;
    try {
        const data = await api.get(`/api/method/vernon_tasks.task.api.my_work.detail?task_id=${encodeURIComponent(id)}`);
        await cachePut(key, data);
        stamp(key);
        return data;
    }
    catch (e) {
        const cached = await cacheGet(key);
        if (cached)
            return cached;
        throw e;
    }
}
