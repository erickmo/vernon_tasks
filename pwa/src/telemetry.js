import { api } from "./api/client";
export function logEvent(event, props = {}) {
    api
        .post("/api/method/vernon_tasks.task.api.telemetry.log_event", { event, props })
        .catch(() => {
        /* swallow */
    });
}
