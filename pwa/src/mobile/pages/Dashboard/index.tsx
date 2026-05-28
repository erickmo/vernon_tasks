import { useEffect, useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMeProgress,
  fetchMyProjects,
  fetchScheduleAgenda,
} from "../../../api/dashboard";
import { logEvent } from "../../../telemetry";
import { TOKENS } from "./components/shared";

const TABS = [
  { to: "/m/dashboard/me",       label: "Saya",   key: "me" },
  { to: "/m/dashboard/projects", label: "Proyek", key: "projects" },
  { to: "/m/dashboard/schedule", label: "Jadwal", key: "schedule" },
] as const;

function PageHeader() {
  const todayStr = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div
      style={{
        background: TOKENS.CARD,
        borderBottom: `1px solid ${TOKENS.BD}`,
        padding: "20px 20px 14px",
      }}
    >
      <p
        style={{
          margin: "0 0 2px",
          fontSize: 10,
          color: TOKENS.TEXT3,
          fontWeight: 500,
          letterSpacing: "0.04em",
        }}
      >
        {todayStr}
      </p>
      <h1
        style={{
          margin: 0,
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: TOKENS.TEXT,
        }}
      >
        Dashboard
      </h1>
    </div>
  );
}

function TabBadge({ count, active }: { count: number; active: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      style={{
        marginLeft: 6,
        fontSize: 10,
        fontWeight: 700,
        padding: "1px 6px",
        borderRadius: 99,
        background: active ? "#fff" : TOKENS.PURPLE,
        color: active ? TOKENS.PURPLE : "#fff",
        minWidth: 16,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {count}
    </span>
  );
}

function TabStrip({ badges }: { badges: { me: number; projects: number; schedule: number } }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: TOKENS.BG,
        padding: "10px 14px 8px",
        borderBottom: `1px solid ${TOKENS.BD}`,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          background: TOKENS.CARD,
          borderRadius: 99,
          padding: 4,
          boxShadow: TOKENS.SHADOW,
        }}
      >
        {TABS.map((t) => {
          const badge = badges[t.key as keyof typeof badges];
          return (
            <NavLink
              key={t.to}
              to={t.to}
              style={({ isActive }) => ({
                flex: 1,
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 99,
                textAlign: "center",
                textDecoration: "none",
                background: isActive ? TOKENS.PURPLE : "transparent",
                color: isActive ? "#fff" : TOKENS.TEXT2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              {({ isActive }) => (
                <>
                  {t.label}
                  <TabBadge count={badge} active={isActive} />
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardLayout() {
  const loc = useLocation();

  useEffect(() => {
    logEvent("dashboard_view", { route: loc.pathname });
  }, [loc.pathname]);

  const meQ = useQuery({
    queryKey: ["dashboard-me-progress"],
    queryFn: fetchMeProgress,
    staleTime: 60_000,
  });
  const projQ = useQuery({
    queryKey: ["dashboard-my-projects", "all"],
    queryFn: () => fetchMyProjects("all"),
    staleTime: 60_000,
  });
  const schedQ = useQuery({
    queryKey: ["dashboard-schedule-agenda"],
    queryFn: () => fetchScheduleAgenda(),
    staleTime: 60_000,
  });

  const badges = useMemo(() => {
    const me = meQ.data?.workload.overdue ?? 0;
    const projects = (projQ.data?.led ?? []).filter(
      (p) => p.risk === "at_risk" || p.risk === "behind",
    ).length;
    const today = schedQ.data?.today_summary;
    const schedule = today ? today.tasks + today.meetings + today.sprint_events : 0;
    return { me, projects, schedule };
  }, [meQ.data, projQ.data, schedQ.data]);

  return (
    <div style={{ background: TOKENS.BG, minHeight: "100%", color: TOKENS.TEXT }}>
      <PageHeader />
      <TabStrip badges={badges} />
      <div style={{ padding: "12px 14px 32px" }}>
        <Outlet />
      </div>
    </div>
  );
}
