import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchReviewQueue,
  approveTask,
  rejectTask,
  ReviewItem,
} from "../../api/leader";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { PullToRefresh } from "../../components/PullToRefresh";
import { RejectModal } from "../../components/RejectModal";
import { Tabs } from "../../components/Tabs";
import { useToast } from "../../components/Toast";
import { useIsLeader } from "../../hooks/useIsLeader";
import { useIsManager } from "../../hooks/useIsManager";
import { fmtDate, t } from "../../i18n";
import { logEvent } from "../../telemetry";

const LeaderSprint = lazy(() => import("./LeaderSprint"));
const LeaderExec = lazy(() => import("./LeaderExec"));

const PRIORITY_COLOR: Record<string, string> = {
  Critical: "var(--vt-danger)",
  High: "var(--vt-warn)",
  Medium: "var(--vt-primary)",
  Low: "var(--vt-text-muted)",
};

function ReviewCard({
  item,
  onApprove,
  onReject,
  disabled,
}: {
  item: ReviewItem;
  onApprove: () => void;
  onReject: () => void;
  disabled: boolean;
}) {
  const accent = item.priority ? PRIORITY_COLOR[item.priority] : undefined;
  return (
    <div
      style={{
        padding: "var(--vt-space-4)",
        background: "var(--vt-surface)",
        borderRadius: "var(--vt-radius)",
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        marginBottom: "var(--vt-space-3)",
        boxShadow: "var(--vt-shadow)",
      }}
    >
      <div style={{ fontWeight: 600 }}>{item.title}</div>
      <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginTop: 4 }}>
        {[item.project, item.priority].filter(Boolean).join(" · ")}
        {item.deadline ? ` · ${fmtDate(item.deadline)}` : ""}
      </div>
      <div style={{ fontSize: 12, color: "var(--vt-text-muted)", marginTop: 2 }}>
        oleh {item.assigned_to}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={onReject}
          disabled={disabled}
          style={{
            flex: 1,
            padding: 10,
            background: "transparent",
            border: "1px solid var(--vt-danger)",
            color: "var(--vt-danger)",
            borderRadius: "var(--vt-radius)",
            fontWeight: 600,
          }}
        >
          {t("leader.reject")}
        </button>
        <button
          onClick={onApprove}
          disabled={disabled}
          style={{
            flex: 1,
            padding: 10,
            background: "var(--vt-success)",
            color: "white",
            border: 0,
            borderRadius: "var(--vt-radius)",
            fontWeight: 600,
          }}
        >
          {t("leader.approve")}
        </button>
      </div>
    </div>
  );
}

function LeaderReviewTab() {
  const q = useQuery({
    queryKey: ["review-queue"],
    queryFn: fetchReviewQueue,
    staleTime: 30_000,
  });
  const qc = useQueryClient();
  const { show } = useToast();
  const [rejectTarget, setRejectTarget] = useState<ReviewItem | null>(null);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  useEffect(() => {
    logEvent("leader_review_view", {});
  }, []);

  function removeFromCache(name: string): ReviewItem[] | undefined {
    const prev = qc.getQueryData<ReviewItem[]>(["review-queue"]);
    if (!prev) return undefined;
    qc.setQueryData<ReviewItem[]>(
      ["review-queue"],
      prev.filter((x) => x.name !== name),
    );
    return prev;
  }

  async function handleApprove(item: ReviewItem) {
    if (offline) return show(t("actions.offline"));
    if (!window.confirm(t("leader.confirm_approve") + "\n\n" + item.title)) return;
    const prev = removeFromCache(item.name);
    try {
      await approveTask(item.name);
      logEvent("leader_approve", { task_id: item.name });
      show(t("leader.approved_toast"));
    } catch {
      if (prev) qc.setQueryData(["review-queue"], prev);
      show(t("leader.approve_failed"));
    }
  }

  async function handleReject(item: ReviewItem, reason: string) {
    setRejectTarget(null);
    if (offline) return show(t("actions.offline"));
    const prev = removeFromCache(item.name);
    try {
      await rejectTask(item.name, reason);
      logEvent("leader_reject", { task_id: item.name, has_reason: true });
      show(t("leader.rejected_toast"));
    } catch {
      if (prev) qc.setQueryData(["review-queue"], prev);
      show(t("leader.reject_failed"));
    }
  }

  return (
    <PullToRefresh onRefresh={() => q.refetch().then(() => {})}>
      <div>
        {q.isLoading && (
          <>
            <Skeleton height={120} />
            <div style={{ height: 12 }} />
            <Skeleton height={120} />
          </>
        )}

        {q.isError && (
          <EmptyState
            title={t("empty.no_offline")}
            cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
          />
        )}

        {q.data && q.data.length === 0 && <EmptyState title={t("leader.empty")} />}

        {q.data &&
          q.data.length > 0 &&
          q.data.map((item) => (
            <ReviewCard
              key={item.name}
              item={item}
              onApprove={() => handleApprove(item)}
              onReject={() => setRejectTarget(item)}
              disabled={offline}
            />
          ))}

        <RejectModal
          open={rejectTarget !== null}
          taskTitle={rejectTarget?.title}
          onSubmit={(reason) => rejectTarget && handleReject(rejectTarget, reason)}
          onCancel={() => setRejectTarget(null)}
        />
      </div>
    </PullToRefresh>
  );
}

type TabKey = "review" | "sprint" | "exec";

const VALID_LEADER_TABS: TabKey[] = ["review", "sprint", "exec"];

export function LeaderPage() {
  const isLeader = useIsLeader();
  const isManager = useIsManager();
  const [params, setParams] = useSearchParams();
  const rawLeaderTab = params.get("tab") as TabKey;
  const tab = VALID_LEADER_TABS.includes(rawLeaderTab) ? rawLeaderTab : "review";
  function setTab(k: TabKey) {
    setParams({ tab: k }, { replace: true });
  }

  if (isLeader === null) return <div style={{ padding: 24 }}>…</div>;
  if (isLeader === false) return <EmptyState title={t("leader.no_access")} />;

  const tabs = [
    { key: "review", label: "Review" },
    { key: "sprint", label: "Sprint" },
    ...(isManager ? [{ key: "exec", label: "Exec" }] : []),
  ];

  return (
    <div style={{ padding: "var(--vt-space-4)" }}>
      <h1 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>{t("leader.title")}</h1>
      <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />
      {tab === "review" && <LeaderReviewTab />}
      {tab === "sprint" && (
        <Suspense fallback={<Skeleton height={240} />}>
          <LeaderSprint />
        </Suspense>
      )}
      {tab === "exec" && isManager && (
        <Suspense fallback={<Skeleton height={240} />}>
          <LeaderExec />
        </Suspense>
      )}
    </div>
  );
}
