import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchEmployeeStats,
  fetchSprintKanban,
  type KanbanItem,
} from "../api/dashboard";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { PullToRefresh } from "../components/PullToRefresh";
import { fmtDate, t } from "../i18n";
import { logEvent } from "../telemetry";

/* ── Design tokens (dashboard-local) ─────────────────────── */
const BG       = "var(--vt-bg)";
const GLASS    = "var(--vt-surface)";
const GLASS_BD = "var(--vt-border)";
const DIM      = "rgba(0,0,0,0.45)";
const FONT     = "Inter, system-ui, sans-serif";

const STAT_META = [
  { key: "done_today",   icon: "✓", label: "Selesai hari ini", color: "#10b981", glow: "rgba(16,185,129,0.22)",  round: false },
  { key: "done_week",    icon: "◈", label: "Minggu ini",       color: "#a855f7", glow: "rgba(168,85,247,0.22)", round: false },
  { key: "points_month", icon: "◆", label: "Poin bulan ini",   color: "#f59e0b", glow: "rgba(245,158,11,0.22)", round: true  },
] as const;

const KANBAN_ACCENT: Record<string, { color: string; pill: string }> = {
  Backlog: { color: "#64748b", pill: "rgba(100,116,139,0.18)" },
  Doing:   { color: "#a855f7", pill: "rgba(168,85,247,0.18)"  },
  Review:  { color: "#f59e0b", pill: "rgba(245,158,11,0.18)"  },
  Done:    { color: "#10b981", pill: "rgba(16,185,129,0.18)"  },
};

/* ── Sub-components ───────────────────────────────────────── */

function StatCard({
  icon, label, color, glow, value, delay,
}: {
  icon: string; label: string; color: string; glow: string;
  value: number | string; delay: number;
}) {
  return (
    <div style={{
      background: GLASS,
      border: `1px solid ${GLASS_BD}`,
      borderRadius: 8,
      padding: "12px 10px",
      position: "relative",
      overflow: "hidden",
      animation: `vt-fade-up 0.45s ease ${delay}s both`,
    }}>
      <div style={{
        position: "absolute", bottom: -16, right: -16,
        width: 70, height: 70,
        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        borderRadius: "50%",
        pointerEvents: "none",
      }} />
      <div style={{ fontSize: 12, color, marginBottom: 6, fontWeight: 700 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: "var(--vt-text)", marginBottom: 6 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: DIM, lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

function GlowBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 10, background: "var(--vt-border)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${clamped}%`,
        background: "linear-gradient(90deg, #6d28d9, #a855f7, #c084fc)",
        borderRadius: 99,
        boxShadow: "0 0 14px rgba(168,85,247,0.8)",
        transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
      }} />
    </div>
  );
}

function MiniCard({ item, accent }: { item: KanbanItem; accent: string }) {
  return (
    <div style={{
      background: "var(--vt-surface)",
      border: "1px solid var(--vt-border)",
      borderRadius: 8,
      padding: "8px 10px",
      marginBottom: 8,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 600,
        color: "var(--vt-text)",
        lineHeight: 1.4, marginBottom: 4,
      }}>
        {item.title}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {item.points > 0 && (
          <span style={{ fontSize: 11, color: accent, fontWeight: 600 }}>{item.points}pt</span>
        )}
        {item.priority && (
          <span style={{ fontSize: 11, color: DIM }}>{item.priority}</span>
        )}
        {item.deadline && (
          <span style={{ fontSize: 11, color: DIM, marginLeft: "auto" }}>
            {fmtDate(item.deadline)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────── */

export function DashboardPage() {
  useEffect(() => { logEvent("dashboard_view", {}); }, []);

  const stats  = useQuery({ queryKey: ["dashboard-stats"],  queryFn: fetchEmployeeStats, staleTime: 60_000 });
  const kanban = useQuery({ queryKey: ["dashboard-kanban"], queryFn: fetchSprintKanban,  staleTime: 60_000 });

  async function refresh() {
    await Promise.all([stats.refetch(), kanban.refetch()]);
  }

  const todayStr = new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <PullToRefresh onRefresh={refresh}>
      <div style={{ background: BG, minHeight: "100%", fontFamily: FONT, color: "var(--vt-text)" }}>

        {/* ── Hero section ── */}
        <div style={{
          background: "var(--vt-primary-light)",
          padding: "20px 20px 0",
          position: "relative",
          overflow: "hidden",
        }}>
          <p style={{
            margin: "0 0 2px", fontSize: 10,
            color: "var(--vt-primary)",
            letterSpacing: "0.1em", textTransform: "uppercase",
            animation: "vt-fade-in 0.4s ease both",
          }}>
            {todayStr}
          </p>
          <h1 style={{
            margin: "0 0 20px", fontSize: 20, fontWeight: 700,
            letterSpacing: "-0.03em", color: "var(--vt-primary-dark)",
            animation: "vt-fade-in 0.4s ease 0.05s both",
          }}>
            Dashboard
          </h1>

          {/* Stats row */}
          {stats.isLoading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, paddingBottom: 24 }}>
              {[0, 1, 2].map(i => <Skeleton key={i} height={104} />)}
            </div>
          )}
          {stats.data && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, paddingBottom: 24 }}>
              {STAT_META.map(({ key, icon, label, color, glow, round }, i) => {
                const raw   = stats.data[key];
                const value = round ? Math.round(raw as number) : raw;
                return (
                  <StatCard
                    key={key}
                    icon={icon} label={label}
                    color={color} glow={glow}
                    value={value}
                    delay={0.08 + i * 0.08}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── Content — responsive grid ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 24,
          padding: "16px 20px 32px",
          alignItems: "start",
        }}>

          {kanban.isLoading && <Skeleton height={130} />}

          {kanban.data && (
            kanban.data.sprint ? (
              <>
                {/* Sprint card */}
                <section style={{
                  background: GLASS,
                  border: "1px solid rgba(168,85,247,0.22)",
                  borderRadius: 8,
                  padding: 20,
                  marginBottom: 20,
                  animation: "vt-fade-up 0.45s ease 0.28s both",
                }}>
                  <div style={{
                    fontSize: 10, color: "#a855f7",
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    fontWeight: 700, marginBottom: 6,
                  }}>
                    Sprint Aktif
                  </div>
                  <div style={{
                    fontSize: 18, fontWeight: 800,
                    letterSpacing: "-0.02em", color: "var(--vt-text)",
                    marginBottom: 16,
                  }}>
                    {kanban.data.sprint.title}
                  </div>

                  <GlowBar pct={kanban.data.sprint.progress_pct} />

                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    marginTop: 10, fontSize: 12, color: DIM,
                  }}>
                    <span>
                      {fmtDate(kanban.data.sprint.start_date)} — {fmtDate(kanban.data.sprint.end_date)}
                    </span>
                    <span style={{ color: "#a855f7", fontWeight: 700 }}>
                      {Math.round(kanban.data.sprint.progress_pct)}%
                    </span>
                  </div>
                </section>

                {/* Kanban scroll */}
                <div style={{
                  display: "flex",
                  gap: 12,
                  overflowX: "auto",
                  paddingBottom: 8,
                  marginLeft: -20,
                  marginRight: -20,
                  paddingLeft: 20,
                  paddingRight: 20,
                  scrollbarWidth: "none",
                  animation: "vt-fade-up 0.45s ease 0.36s both",
                }}>
                  {Object.entries(kanban.data.columns).map(([col, items]) => {
                    const acc = KANBAN_ACCENT[col] ?? { color: "#64748b", pill: "rgba(100,116,139,0.18)" };
                    return (
                      <div key={col} style={{
                        minWidth: 210,
                        flex: "0 0 auto",
                        background: GLASS,
                        border: "1px solid var(--vt-border)",
                        borderTop: `2px solid ${acc.color}`,
                        borderRadius: 8,
                        padding: 12,
                      }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 12,
                        }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: acc.color,
                            textTransform: "uppercase", letterSpacing: "0.08em",
                          }}>
                            {col}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            background: acc.pill, color: acc.color,
                            padding: "2px 9px", borderRadius: 99,
                          }}>
                            {items.length}
                          </span>
                        </div>

                        {items.length === 0 && (
                          <div style={{
                            fontSize: 12, color: "var(--vt-text-muted)",
                            textAlign: "center", padding: "16px 0",
                          }}>
                            —
                          </div>
                        )}
                        {items.map(item => (
                          <MiniCard key={item.id} item={item} accent={acc.color} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState
                title="Belum ada sprint aktif"
                body="Sprint akan muncul saat tim memulai sprint baru."
              />
            )
          )}

          {(stats.isError || kanban.isError) && !stats.data && !kanban.data && (
            <EmptyState
              title={t("empty.no_offline")}
              cta={{ label: t("common.retry"), onClick: refresh }}
            />
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
