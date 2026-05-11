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
  | "install_snoozed"
  | "search_query"
  | "filter_applied"
  | "notif_view"
  | "notif_tap"
  | "notif_mark_all_read"
  | "dashboard_view"
  | "analytics_view"
  | "analytics_period_change"
  | "analytics_project_change"
  | "leader_review_view"
  | "leader_approve"
  | "leader_reject"
  | "leader_sprint_view"
  | "leader_exec_view"
  | "leader_project_change";

export function logEvent(event: TelemetryEvent, props: Record<string, unknown> = {}): void {
  api
    .post("/api/method/vernon_tasks.task.api.telemetry.log_event", { event, props })
    .catch(() => {
      /* swallow */
    });
}
