import { api } from "./api/client";
import * as self from "./telemetry";

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
  | "leader_project_change"
  | "push_subscribe_attempt"
  | "push_subscribed"
  | "push_unsubscribed"
  | "push_received"
  | "push_pref_view"
  | "push_pref_changed"
  | "push_action_complete"
  | "portal.page_view"
  | "portal.nav_click"
  | "portal.permission_denied"
  | "portal.error"
  | "okr.list_view"
  | "okr.detail_view"
  | "okr.kr_update"
  | "okr.objective_create"
  | "okr.objective_edit"
  | "okr.bulk_pdca_advance"
  | "okr.permission_denied";

export function logEvent(event: TelemetryEvent, props: Record<string, unknown> = {}): void {
  api
    .post("/api/method/vernon_tasks.task.api.telemetry.log_event", { event, props })
    .catch(() => {
      /* swallow */
    });
}

export function trackPortalPageView(path: string) {
  self.logEvent("portal.page_view", { path });
}
export function trackPortalNavClick(key: string, path: string) {
  self.logEvent("portal.nav_click", { key, path });
}
export function trackPortalPermissionDenied(path: string, required_perm: string) {
  self.logEvent("portal.permission_denied", { path, required_perm });
}
export function trackPortalError(path: string, message: string) {
  self.logEvent("portal.error", { path, message });
}

export function trackOkrListView(filters_count: number) {
  self.logEvent("okr.list_view", { filters_count });
}
export function trackOkrDetailView(name: string) {
  self.logEvent("okr.detail_view", { name });
}
export function trackOkrKrUpdate(kr_name: string, delta: number) {
  self.logEvent("okr.kr_update", { kr_name, delta });
}
export function trackOkrObjectiveCreate(name: string) {
  self.logEvent("okr.objective_create", { name });
}
export function trackOkrObjectiveEdit(name: string) {
  self.logEvent("okr.objective_edit", { name });
}
export function trackOkrBulkPdca(count: number, from_to_pairs: [string, string][]) {
  self.logEvent("okr.bulk_pdca_advance", { count, from_to_pairs });
}
export function trackOkrPermissionDenied(path: string, action: string) {
  self.logEvent("okr.permission_denied", { path, action });
}
