import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useReportsAccess } from "./hooks/useReportsAccess";
import { logEvent } from "../../../telemetry";

interface CardSpec {
  to: string;
  icon: string;
  title: string;
  sub: string;
  visible: boolean;
  eventKey: string;
}

export function Landing() {
  const access = useReportsAccess();

  useEffect(() => {
    logEvent("reports_landing_view", {});
  }, []);

  const cards: CardSpec[] = [
    {
      to: "/m/reports/me",
      icon: "👤",
      title: "My Reports",
      sub: "Velocity, streak, ranking pribadi",
      visible: access.canMyReports,
      eventKey: "me",
    },
    {
      to: "/m/reports/projects",
      icon: "📁",
      title: "Projects I Manage",
      sub: "Velocity, forecast, risk per proyek",
      visible: access.canProjects,
      eventKey: "projects",
    },
    {
      to: "/m/reports/team",
      icon: "👥",
      title: "My Team",
      sub: "Leaderboard, workload, overdue",
      visible: access.canTeam,
      eventKey: "team",
    },
  ];

  return (
    <div style={{ background: "var(--vt-primary-light)", flex: 1, display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--vt-primary-light)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>
          Reports
        </h1>
      </header>
      <div style={{ padding: "var(--vt-space-4)" }}>
        {cards.filter((c) => c.visible).map((c) => (
          <Link
            key={c.to}
            to={c.to}
            onClick={() => logEvent("reports_card_tap", { card: c.eventKey })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 16,
              marginBottom: 10,
              background: "white",
              borderRadius: 12,
              boxShadow: "0 1px 6px rgba(149,97,171,0.12)",
              textDecoration: "none",
              color: "var(--vt-text)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--vt-primary-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              {c.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>{c.sub}</div>
            </div>
            <div style={{ color: "var(--vt-text-muted)" }}>›</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
