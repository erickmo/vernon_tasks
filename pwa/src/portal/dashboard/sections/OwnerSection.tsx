import { type HTMLAttributes } from "react";
import { usePortfolioSummary } from "../hooks/usePortfolioSummary";
import { OkrProgressList } from "../widgets/OkrProgressList";
import { PortfolioList } from "../widgets/PortfolioList";
import type { OkrRow } from "../widgets/OkrProgressList";

interface Props {
  okrs: OkrRow[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
}

export function OwnerSection({ okrs, collapsed, onToggleCollapse, dragHandleProps }: Props) {
  const portfolio = usePortfolioSummary();
  const atRisk = okrs.filter((o) => o.progress_pct < 30).length;
  const avgOkr = okrs.length
    ? Math.round(okrs.reduce((s, o) => s + o.progress_pct, 0) / okrs.length)
    : 0;

  return (
    <>
      <div className="db-section__strip db-section__strip--owner" />
      <div className="db-section__header" onClick={onToggleCollapse}>
        <span className="db-section__drag" {...dragHandleProps}>⠿</span>
        <span className="db-section__icon">👑</span>
        <div>
          <div className="db-section__title">As Project Owner</div>
          <div className="db-section__subtitle">Cek OKR & portofolio — arah strategis</div>
        </div>
        <div className="db-section__badges">
          {atRisk > 0 && <span className="db-badge db-badge--red">{atRisk} At Risk</span>}
          <span className="db-badge db-badge--purple">OKR {avgOkr}%</span>
        </div>
        <span className={`db-section__collapse${collapsed ? " db-section__collapse--collapsed" : ""}`}>▾</span>
      </div>
      <div className={`db-section__body${collapsed ? " db-section__body--hidden" : ""}`}>
        <div className="db-owner-grid">
          <div>
            <div className="db-sub-label">🎯 OKR Progress + Trend</div>
            <OkrProgressList okrs={okrs} />
          </div>
          <div>
            <div className="db-sub-label">📁 Project Portfolio</div>
            {portfolio.isLoading ? (
              <div style={{ fontSize: 11, color: "#6b63a0" }}>Memuat…</div>
            ) : (
              <PortfolioList projects={portfolio.data ?? []} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
