import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchScheduleAgenda } from "../../../api/dashboard";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { logEvent } from "../../../telemetry";
import { AgendaDayGroup } from "./components/AgendaDayGroup";
import { TOKENS } from "./components/shared";

const GOOGLE_CALENDAR_ENABLED = false; // feature.google_calendar — v1: off

function TodayChips({
  summary,
  onTap,
}: {
  summary: { tasks: number; meetings: number; sprint_events: number };
  onTap: (chip: string) => void;
}) {
  const items: { key: string; label: string; value: number }[] = [
    { key: "tasks",         label: "Tasks due",    value: summary.tasks },
    { key: "meetings",      label: "Meetings",     value: summary.meetings },
    { key: "sprint_events", label: "Sprint",       value: summary.sprint_events },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onTap(it.key)}
          style={{
            flex: 1,
            background: TOKENS.CARD,
            border: `1px solid ${TOKENS.BD}`,
            borderRadius: 10,
            padding: "10px 8px",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.TEXT, lineHeight: 1 }}>
            {it.value}
          </div>
          <div
            style={{
              fontSize: 10,
              color: TOKENS.TEXT2,
              marginTop: 4,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {it.label}
          </div>
        </button>
      ))}
    </div>
  );
}

function GoogleSlot() {
  if (!GOOGLE_CALENDAR_ENABLED) {
    return (
      <div
        style={{
          marginTop: 22,
          background: TOKENS.CARD,
          border: `1px dashed ${TOKENS.BD}`,
          borderRadius: 10,
          padding: "14px 16px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, color: TOKENS.TEXT, fontWeight: 600 }}>
          Hubungkan Google Calendar
        </div>
        <div style={{ fontSize: 11, color: TOKENS.TEXT2, marginTop: 4 }}>
          Belum tersedia.
        </div>
        <button
          disabled
          style={{
            marginTop: 10,
            padding: "6px 14px",
            fontSize: 12,
            background: "#e2e8f0",
            color: TOKENS.TEXT3,
            border: "none",
            borderRadius: 6,
            cursor: "not-allowed",
          }}
        >
          Hubungkan
        </button>
      </div>
    );
  }
  return null;
}

export function ScheduleTab() {
  useEffect(() => {
    logEvent("dashboard_tab_view", { tab: "schedule" });
  }, []);

  const q = useQuery({
    queryKey: ["dashboard-schedule-agenda"],
    queryFn: () => fetchScheduleAgenda(),
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton height={60} />
        <Skeleton height={140} />
        <Skeleton height={140} />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <EmptyState
        title="Gagal memuat agenda"
        cta={{ label: "Coba lagi", onClick: () => q.refetch() }}
      />
    );
  }

  return (
    <div>
      <TodayChips
        summary={q.data.today_summary}
        onTap={(chip) => logEvent("dashboard_agenda_chip_tap", { chip })}
      />
      {q.data.days.length === 0 ? (
        <EmptyState title="Tidak ada agenda" body="Tidak ada item dalam 8 hari ke depan." />
      ) : (
        q.data.days.map((d) => <AgendaDayGroup key={d.date} day={d} />)
      )}
      <GoogleSlot />
    </div>
  );
}
