import type { TimelineTask } from "../api/portalDashboard";

interface Props {
  data: Record<string, TimelineTask[]>;
  daysBack?: number;
  daysForward?: number;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtShort(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

const PDCA_BADGE: Record<string, { bg: string; color: string }> = {
  PLAN:  { bg: "#ede9fe", color: "#6d28d9" },
  DO:    { bg: "#f0fdf4", color: "#16a34a" },
  CHECK: { bg: "#fff7ed", color: "#c2410c" },
  ACT:   { bg: "#eff6ff", color: "#1d4ed8" },
};

export function TaskTimeline({ data, daysBack = 3, daysForward = 3 }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cols: Array<{ date: string; label: string; rel: number }> = [];
  for (let i = -daysBack; i <= daysForward; i++) {
    const d = addDays(today, i);
    const dateStr = isoDate(d);
    let label: string;
    if (i === 0) label = "⚡ Hari Ini";
    else if (i === -1) label = "H-1";
    else if (i === 1) label = "H+1";
    else label = i < 0 ? `H${i}` : `H+${i}`;
    cols.push({ date: dateStr, label, rel: i });
  }

  return (
    <div className="db-timeline">
      {cols.map((col, idx) => {
        const isPast = col.rel < 0;
        const isToday = col.rel === 0;
        const tasks = data[col.date] ?? [];
        const colClass = `db-tl-col${isPast ? " db-tl-col--past" : isToday ? " db-tl-col--today" : ""}`;
        const divClass = `db-tl-div${isToday || col.rel === 1 ? " db-tl-div--now" : ""}`;

        return (
          <div key={col.date} style={{ display: "contents" }}>
            <div className={colClass}>
              <div className="db-tl-col__head">
                <div className="db-tl-col__eyebrow">{col.label}</div>
                <div className="db-tl-col__date">{fmtShort(addDays(today, col.rel))}</div>
              </div>
              {tasks.map((t) => {
                const badge = PDCA_BADGE[t.pdca_phase] ?? PDCA_BADGE["PLAN"];
                const tcClass = `db-tc${isPast && !t.done ? " db-tc--overdue" : isToday ? " db-tc--today" : ""}${t.done ? " db-tc--done" : ""}`;
                const dotColor = isPast && !t.done ? "#dc2626" : isToday ? "#7c3aed" : "#6366f1";
                return (
                  <div key={t.id} className={tcClass}>
                    <span className="db-tc__dot" style={{ background: dotColor }} />
                    <span className="db-tc__text" title={t.title}>{t.title}</span>
                    <span
                      className="db-tc__badge"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {t.pdca_phase || "PLAN"}
                    </span>
                  </div>
                );
              })}
            </div>
            {idx < cols.length - 1 && <div className={divClass} />}
          </div>
        );
      })}
    </div>
  );
}
