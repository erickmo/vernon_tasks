import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchTaskDetail } from "../../api/tasks";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { fmtDate, fmtTime, t } from "../../i18n";
import { logEvent } from "../../telemetry";
export function MyWorkDetail() {
    const { id } = useParams();
    const q = useQuery({
        queryKey: ["task", id],
        queryFn: () => fetchTaskDetail(id),
        enabled: !!id,
    });
    useEffect(() => {
        if (id)
            logEvent("task_view", { task_id: id });
    }, [id]);
    if (q.isLoading) {
        return (_jsxs("div", { style: { padding: 16 }, children: [_jsx(Skeleton, { height: 28, width: "60%" }), _jsx("div", { style: { height: 12 } }), _jsx(Skeleton, { height: 120 })] }));
    }
    if (q.isError || !q.data) {
        return (_jsx(EmptyState, { title: t("empty.no_offline"), cta: { label: t("common.retry"), onClick: () => q.refetch() } }));
    }
    const d = q.data;
    return (_jsxs("div", { style: { padding: 16 }, children: [_jsxs(Link, { to: "/m/work", style: { color: "var(--vt-primary)", textDecoration: "none" }, children: ["\u2190 ", t("nav.tasks")] }), _jsx("h1", { style: { marginTop: 12 }, children: d.title }), _jsxs("div", { style: {
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    color: "var(--vt-text-muted)",
                    marginBottom: 16,
                }, children: [d.status && _jsx("span", { children: d.status }), d.priority && _jsxs("span", { children: ["\u00B7 ", d.priority] }), d.due_date && _jsxs("span", { children: ["\u00B7 ", fmtDate(d.due_date)] }), d.points ? _jsxs("span", { children: ["\u00B7 +", d.points, " pts"] }) : null] }), d.description && (_jsx("div", { style: {
                    background: "var(--vt-surface)",
                    padding: 16,
                    borderRadius: "var(--vt-radius)",
                    whiteSpace: "pre-wrap",
                    marginBottom: 16,
                }, children: d.description })), _jsx("h3", { children: "Aktivitas" }), d.activity.length === 0 && _jsx("p", { style: { color: "var(--vt-text-muted)" }, children: "\u2014" }), d.activity.map((a, idx) => (_jsxs("div", { style: { padding: 12, borderTop: "1px solid var(--vt-border)" }, children: [_jsxs("div", { style: { fontSize: 12, color: "var(--vt-text-muted)" }, children: [a.owner, " \u00B7 ", fmtDate(a.creation), " ", fmtTime(a.creation)] }), _jsx("div", { children: a.content })] }, idx))), _jsx("div", { style: {
                    marginTop: 24,
                    padding: 16,
                    background: "var(--vt-surface)",
                    borderRadius: "var(--vt-radius)",
                    textAlign: "center",
                    color: "var(--vt-text-muted)",
                }, children: t("tasks.detail.action_disabled") })] }));
}
