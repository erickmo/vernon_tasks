import { api } from "../api/client";

export type TelemetryEvent =
  | "pwa_boot"
  | "login_success"
  | "login_failure"
  | "page_view"
  | "task_view"
  | "offline_seen"
  | "error_boundary"
  | "sw_register_failed";

export function logEvent(event: TelemetryEvent, props: Record<string, unknown> = {}): void {
  api
    .post("/api/method/vernon_tasks.task.api.telemetry.log_event", { event, props })
    .catch(() => {
      /* swallow */
    });
}
