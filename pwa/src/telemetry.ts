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
  | "project_create_click"
  | "project_manage_click"
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
  | "okr.permission_denied"
  | "projects.list_view"
  | "projects.detail_view"
  | "projects.create"
  | "projects.edit"
  | "projects.bulk_pdca_advance"
  | "projects.bulk_status_set"
  | "projects.inline_status_change"
  | "projects.objective_link_click"
  | "projects.permission_denied"
  | "sprints.board_view"
  | "sprints.sprint_move"
  | "sprints.sprint_created"
  | "sprints.sprint_updated"
  | "sprints.task_move"
  | "sprints.task_rank_change"
  | "sprints.task_board_axis_toggle"
  | "sprints.burndown_view"
  | "sprints.rank_rebalance"
  | "portal.notif_bell_open"
  | "portal.notif_panel_close"
  | "portal.notif_item_click"
  | "portal.notif_mark_read"
  | "portal.notif_mark_all_read"
  | "portal.notif_page_view"
  | "portal.notif_filter_change"
  | "portal.notif_load_more"
  | "tasks.detail_view"
  | "tasks.task_updated"
  | "tasks.task_created"
  | "tasks.comment_added"
  | "tasks.comment_deleted"
  | "tasks.panel_closed"
  | "reports.page_view"
  | "reports.tab_view"
  | "reports.period_change"
  | "reports.kpi_select"
  | "reports.velocity_n_change"
  | "reports.leaderboard_period_change"
  | "reports.overdue_view_toggle"
  | "reports.permission_denied"
  | "reports_landing_view"
  | "reports_projects_view"
  | "reports_card_tap"
  | "reports_my_view"
  | "reports_project_view"
  | "reports_period_change"
  | "reports_team_view"
  | "dashboard_tab_view"
  | "dashboard_project_filter"
  | "dashboard_agenda_chip_tap"
  | "dashboard_next_action_tap"
  | "quick_add_task_submit"
  | "quick_add_task_open";

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

export function trackProjectsListView(filters_count: number) {
  self.logEvent("projects.list_view", { filters_count });
}
export function trackProjectsDetailView(name: string) {
  self.logEvent("projects.detail_view", { name });
}
export function trackProjectsCreate(name: string) {
  self.logEvent("projects.create", { name });
}
export function trackProjectsEdit(name: string) {
  self.logEvent("projects.edit", { name });
}
export function trackProjectsBulkPdca(count: number, from_to_pairs: [string, string][]) {
  self.logEvent("projects.bulk_pdca_advance", { count, from_to_pairs });
}
export function trackProjectsBulkStatusSet(count: number, target_status: string) {
  self.logEvent("projects.bulk_status_set", { count, target_status });
}
export function trackProjectsInlineStatusChange(name: string, from: string, to: string) {
  self.logEvent("projects.inline_status_change", { name, from, to });
}
export function trackProjectsObjectiveLinkClick(project: string, objective: string) {
  self.logEvent("projects.objective_link_click", { project, objective });
}
export function trackProjectsPermissionDenied(path: string, action: string) {
  self.logEvent("projects.permission_denied", { path, action });
}

export function trackSprintBoardView(project: string, sprint_count: number) {
  self.logEvent("sprints.board_view", { project, sprint_count });
}
export function trackSprintMove(sprint: string, from_status: string, to_status: string) {
  self.logEvent("sprints.sprint_move", { sprint, from_status, to_status });
}
export function trackSprintCreated(sprint: string, project: string) {
  self.logEvent("sprints.sprint_created", { sprint, project });
}
export function trackSprintUpdated(sprint: string, changed_fields: string[]) {
  self.logEvent("sprints.sprint_updated", { sprint, changed_fields });
}
export function trackTaskMove(task: string, sprint: string, axis: "kanban" | "pdca", from: string, to: string) {
  self.logEvent("sprints.task_move", { task, sprint, axis, from, to });
}
export function trackTaskRankChange(task: string, sprint: string) {
  self.logEvent("sprints.task_rank_change", { task, sprint });
}
export function trackTaskBoardAxisToggle(sprint: string, axis: "kanban" | "pdca") {
  self.logEvent("sprints.task_board_axis_toggle", { sprint, axis });
}
export function trackBurndownView(sprint: string) {
  self.logEvent("sprints.burndown_view", { sprint });
}
export function trackRankRebalance(sprint: string, axis: "kanban" | "pdca", column: string) {
  self.logEvent("sprints.rank_rebalance", { sprint, axis, column });
}

export function trackTaskDetailView(task: string, sprint: string) {
  self.logEvent("tasks.detail_view", { task, sprint });
}
export function trackTaskUpdated(task: string, changed_fields: string[]) {
  self.logEvent("tasks.task_updated", { task, changed_fields });
}
export function trackTaskCreated(task: string, sprint: string, project: string) {
  self.logEvent("tasks.task_created", { task, sprint, project });
}
export function trackCommentAdded(task: string) {
  self.logEvent("tasks.comment_added", { task });
}
export function trackCommentDeleted(task: string) {
  self.logEvent("tasks.comment_deleted", { task });
}
export function trackTaskPanelClosed(task: string, open_duration_ms: number) {
  self.logEvent("tasks.panel_closed", { task, open_duration_ms });
}

export function trackNotifBellOpen(unread_count: number) {
  self.logEvent("portal.notif_bell_open", { unread_count });
}
export function trackNotifPanelClose(duration_ms: number) {
  self.logEvent("portal.notif_panel_close", { duration_ms });
}
export function trackNotifItemClick(event_type: string, is_read: boolean) {
  self.logEvent("portal.notif_item_click", { event_type, is_read });
}
export function trackNotifMarkRead(event_type: string) {
  self.logEvent("portal.notif_mark_read", { event_type });
}
export function trackNotifMarkAllRead(count_marked: number) {
  self.logEvent("portal.notif_mark_all_read", { count_marked });
}
export function trackNotifPageView(filter: string, only_unread: boolean) {
  self.logEvent("portal.notif_page_view", { filter, only_unread });
}
export function trackNotifFilterChange(from: string, to: string) {
  self.logEvent("portal.notif_filter_change", { from, to });
}
export function trackNotifLoadMore(offset: number, filter: string) {
  self.logEvent("portal.notif_load_more", { offset, filter });
}

export function trackReportsPageView() {
  self.logEvent("reports.page_view", {});
}
export function trackReportsTabView(tab: "okr" | "sprints" | "team") {
  self.logEvent("reports.tab_view", { tab });
}
export function trackReportsPeriodChange(tab: string, period: string) {
  self.logEvent("reports.period_change", { tab, period });
}
export function trackReportsKpiSelect(kpi: string) {
  self.logEvent("reports.kpi_select", { kpi });
}
export function trackReportsVelocityNChange(n: number) {
  self.logEvent("reports.velocity_n_change", { n });
}
export function trackReportsLeaderboardPeriodChange(period: string) {
  self.logEvent("reports.leaderboard_period_change", { period });
}
export function trackReportsOverdueViewToggle(view: "member" | "project") {
  self.logEvent("reports.overdue_view_toggle", { view });
}
export function trackReportsPermissionDenied(tab: string) {
  self.logEvent("reports.permission_denied", { tab });
}
