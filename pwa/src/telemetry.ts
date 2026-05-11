import { api } from "./api/client";

export type TelemetryEvent =
  | "pwa_boot"
  | "login_success"
  | "login_failure"
  | "page_view"
  | "task_view"
  | "offline_seen"
  | "error_boundary"
  | "sw_register_failed"
  | "task_complete"
  | "task_complete_undone"
  | "task_log"
  | "task_snooze"
  | "install_prompt_shown"
  | "install_accepted"
  | "install_dismissed"
  | "install_snoozed";

export function logEvent(event: TelemetryEvent, props: Record<string, unknown> = {}): void {
  api
    .post("/api/method/vernon_tasks.task.api.telemetry.log_event", { event, props })
    .catch(() => {
      /* swallow */
    });
}
