import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchMyWork } from "../../api/tasks";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { StaleBadge } from "../../components/StaleBadge";
import { PullToRefresh } from "../../components/PullToRefresh";
import { greeting, fmtDate, t } from "../../i18n";
function TaskCardView({ task, accent }) {
    return (_jsxs(Link, { to: `/m/work/${encodeURIComponent(task.id)}`, style: {
            display: "block",
            padding: "var(--vt-space-4)",
            marginBottom: "var(--vt-space-3)",
            background: "var(--vt-surface)",
            borderRadius: "var(--vt-radius)",
            borderLeft: accent ? `3px solid ${accent}` : undefined,
            color: "var(--vt-text)",
            textDecoration: "none",
            boxShadow: "var(--vt-shadow)",
        }, children: [_jsx("div", { style: { fontWeight: 600 }, children: task.title }), _jsxs("div", { style: { fontSize: 13, color: "var(--vt-text-muted)", marginTop: 4 }, children: [[task.project, task.priority].filter(Boolean).join(" · "), task.points ? ` · +${task.points} pts` : ""] })] }));
}
function Section({ title, items, accent, }) {
    if (items.length === 0)
        return null;
    return (_jsxs("section", { style: { marginBottom: "var(--vt-space-5)" }, children: [_jsx("h3", { style: {
                    fontSize: 14,
                    color: "var(--vt-text-muted)",
                    margin: "0 0 var(--vt-space-3)",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                }, children: title }), items.map((task) => (_jsx(TaskCardView, { task: task, accent: accent }, task.id)))] }));
}
export function MyWorkList() {
    const q = useQuery({ queryKey: ["my-work"], queryFn: fetchMyWork });
    const total = (q.data?.overdue.length ?? 0) +
        (q.data?.today.length ?? 0) +
        (q.data?.upcoming.length ?? 0);
    return (_jsx(PullToRefresh, { onRefresh: () => q.refetch().then(() => { }), children: _jsxs("div", { style: { padding: "var(--vt-space-4)" }, children: [_jsxs("header", { style: { marginBottom: "var(--vt-space-4)" }, children: [_jsx("h1", { style: { margin: 0 }, children: greeting() }), _jsxs("div", { style: {
                                color: "var(--vt-text-muted)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginTop: 4,
                            }, children: [_jsx("span", { children: fmtDate(new Date()) }), _jsx(StaleBadge, { resource: "my-work" })] })] }), q.isLoading && (_jsxs(_Fragment, { children: [_jsx(Skeleton, { height: 64 }), _jsx("div", { style: { height: 12 } }), _jsx(Skeleton, { height: 64 }), _jsx("div", { style: { height: 12 } }), _jsx(Skeleton, { height: 64 })] })), q.isError && !q.data && (_jsx(EmptyState, { title: t("empty.no_offline"), cta: { label: t("common.retry"), onClick: () => q.refetch() } })), q.data &&
                    (total === 0 ? (_jsx(EmptyState, { title: t("empty.no_tasks") })) : (_jsxs(_Fragment, { children: [_jsx(Section, { title: t("tasks.section.overdue"), items: q.data.overdue, accent: "var(--vt-danger)" }), _jsx(Section, { title: t("tasks.section.today"), items: q.data.today, accent: "var(--vt-primary)" }), _jsx(Section, { title: t("tasks.section.upcoming"), items: q.data.upcoming })] })))] }) }));
}
