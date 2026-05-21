import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchEmployeeStats,
  fetchSprintKanban,
  type KanbanItem,
} from "../../api/dashboard";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { PullToRefresh } from "../../components/PullToRefresh";
import { fmtDate, t } from "../../i18n";
import { logEvent } from "../../telemetry";

/* ── Tokens ───────────────────────────────────────────────── */
const BG     = "#f1f5f9";
const CARD   = "#ffffff";
const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 2px 10px rgba(0,0,0,0.04)";
const BD     = "#e8edf3";
const TEXT   = "#0f172a";
const TEXT2  = "#64748b";
const TEXT3  = "#94a3b8";
const INDIGO = "#4f46e5";
const PURPLE = "#7c3aed";
const GREEN  = "#059669";
const AMBER  = "#d97706";

const STAT_META = [
  { key: "done_today",   icon: "✓", label: "Selesai hari ini", color: GREEN,  bg: "#f0fdf4", round: false },
  { key: "done_week",    icon: "◈", label: "Minggu ini",       color: INDIGO, bg: "#eef2ff", round: false },
  { key: "points_month", icon: "◆", label: "Poin bulan ini",   color: AMBER,  bg: "#fffbeb", round: true  },
] as const;

const KANBAN_ACCENT: Record<string, { color: string; bg: string }> = {
  Backlog: { color: "#64748b", bg: "#f8fafc" },
  Doing:   { color: INDIGO,   bg: "#eef2ff" },
  Review:  { color: AMBER,    bg: "#fffbeb" },
  Done:    { color: GREEN,    bg: "#f0fdf4" },
};

/* ── Sub-components ───────────────────────────────────────── */

function StatCard({
  icon, label, color, bg, value, delay,
}: {
  icon: string; label: string; color: string; bg: string;
  value: number | string; delay: number;
}) {
  return (
    <div style={{
      background: CARD,
      borderRadius: 10,
      padding: "14px 12px",
      boxShadow: SHADOW,
      animation: `vt-fade-up 0.4s ease ${delay}s both`,
    }}>
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28, height: 28,
        borderRadius: 7,
        background: bg,
        color,
        fontSize: 12,
        fontWeight: 700,
        marginBottom: 10,
      }}>
        {icon}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 700, lineHeight: 1,
        color: TEXT, marginBottom: 5,
        letterSpacing: "-0.03em",
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: TEXT2, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{
      height: 6, background: "#e2e8f0",
      borderRadius: 99, overflow: "hidden",
    }}>
      <div style={{
        height: "100%",
        width: `${clamped}%`,
        background: `linear-gradient(90deg, ${INDIGO}, ${PURPLE})`,
        borderRadius: 99,
        transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
      }} />
    </div>
  );
}

function MiniCard({ item, accent }: { item: KanbanItem; accent: string }) {
  return (
    <div style={{
      background: "#fafbfc",
      border: `1px solid ${BD}`,
      borderRadius: 7,
      padding: "8px 10px",
      marginBottom: 6,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 500,
        color: TEXT,
        lineHeight: 1.45, marginBottom: 5,
      }}>
        {item.title}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {item.points > 0 && (
          <span style={{
            fontSize: 10, color: accent, fontWeight: 600,
          }}>
            {item.points}pt
          </span>
        )}
        {item.priority && (
          <span style={{ fontSize: 10, color: TEXT3 }}>{item.priority}</span>
        )}
        {item.deadline && (
          <span style={{ fontSize: 10, color: TEXT3, marginLeft: "auto" }}>
            {fmtDate(item.deadline)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Section header ───────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700,
      color: TEXT3,
      textTransform: "uppercase",
      letterSpacing: "0.10em",
      margin: "0 0 10px",
    }}>
      {children}
    </p>
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
      <div style={{ background: BG, flex: 1, color: TEXT }}>

        {/* ── Hero / Header ── */}
        <div style={{
          background: CARD,
          borderBottom: `1px solid ${BD}`,
          padding: "20px 20px 16px",
        }}>
          <p style={{
            margin: "0 0 2px", fontSize: 10,
            color: TEXT3, fontWeight: 500,
            letterSpacing: "0.04em",
            animation: "vt-fade-in 0.35s ease both",
          }}>
            {todayStr}
          </p>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 700,
            letterSpacing: "-0.02em", color: TEXT,
            animation: "vt-fade-in 0.35s ease 0.05s both",
          }}>
            Dashboard
          </h1>
        </div>

        {/* ── Content ── */}
        <div style={{ padding: "16px 14px 32px" }}>

          {/* Stats */}
          <SectionLabel>Ringkasan</SectionLabel>
          {stats.isLoading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
              {[0, 1, 2].map(i => <Skeleton key={i} height={96} />)}
            </div>
          )}
          {stats.data && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3,1fr)",
              gap: 10, marginBottom: 20,
            }}>
              {STAT_META.map(({ key, icon, label, color, bg, round }, i) => {
                const raw   = stats.data[key];
                const value = round ? Math.round(raw as number) : raw;
                return (
                  <StatCard
                    key={key}
                    icon={icon} label={label}
                    color={color} bg={bg}
                    value={value}
                    delay={0.06 + i * 0.07}
                  />
                );
              })}
            </div>
          )}

          {/* Kanban / Sprint */}
          {kanban.isLoading && <Skeleton height={120} />}

          {kanban.data && (
            kanban.data.sprint ? (
              <>
                {/* Sprint card */}
                <SectionLabel>Sprint Aktif</SectionLabel>
                <div style={{
                  background: CARD,
                  borderRadius: 10,
                  borderLeft: `3px solid ${PURPLE}`,
                  boxShadow: SHADOW,
                  padding: "16px 18px",
                  marginBottom: 20,
                  animation: "vt-fade-up 0.4s ease 0.25s both",
                }}>
                  <div style={{
                    fontSize: 15, fontWeight: 600,
                    color: TEXT,
                    marginBottom: 14, lineHeight: 1.3,
                    letterSpacing: "-0.01em",
                  }}>
                    {kanban.data.sprint.title}
                  </div>

                  <ProgressBar pct={kanban.data.sprint.progress_pct} />

                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    marginTop: 10, fontSize: 11, color: TEXT2,
                  }}>
                    <span>
                      {fmtDate(kanban.data.sprint.start_date)} — {fmtDate(kanban.data.sprint.end_date)}
                    </span>
                    <span style={{ color: PURPLE, fontWeight: 700 }}>
                      {Math.round(kanban.data.sprint.progress_pct)}%
                    </span>
                  </div>
                </div>

                {/* Kanban scroll */}
                <SectionLabel>Kanban</SectionLabel>
                <div style={{
                  display: "flex",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 6,
                  marginLeft: -14,
                  marginRight: -14,
                  paddingLeft: 14,
                  paddingRight: 14,
                  scrollbarWidth: "none",
                  animation: "vt-fade-up 0.4s ease 0.32s both",
                }}>
                  {Object.entries(kanban.data.columns).map(([col, items]) => {
                    const acc = KANBAN_ACCENT[col] ?? { color: "#64748b", bg: "#f8fafc" };
                    return (
                      <div key={col} style={{
                        minWidth: 195,
                        flex: "0 0 auto",
                        background: CARD,
                        boxShadow: SHADOW,
                        borderRadius: 10,
                        padding: 12,
                      }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 10,
                        }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: acc.color,
                            textTransform: "uppercase", letterSpacing: "0.08em",
                          }}>
                            {col}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            background: acc.bg, color: acc.color,
                            padding: "2px 8px", borderRadius: 4,
                            border: `1px solid ${BD}`,
                          }}>
                            {items.length}
                          </span>
                        </div>

                        {items.length === 0 && (
                          <div style={{
                            fontSize: 12, color: TEXT3,
                            textAlign: "center", padding: "14px 0",
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
