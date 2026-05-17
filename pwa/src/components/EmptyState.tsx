import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  /** Long-form description (new portal API). */
  description?: ReactNode;
  /** Legacy short body text (mobile pages). */
  body?: ReactNode;
  /** New portal action slot. */
  action?: ReactNode;
  /** Legacy single CTA. */
  cta?: { label: string; onClick: () => void };
  /** Optional leading icon. */
  icon?: ReactNode;
}

export function EmptyState({ title, description, body, action, cta, icon }: EmptyStateProps) {
  return (
    <div
      className="empty-state"
      role="status"
      style={{ padding: "var(--vt-space-6)", textAlign: "center", color: "var(--vt-text-muted)" }}
    >
      {icon && <div className="empty-state__icon">{icon}</div>}
      <h3 className="empty-state__title" style={{ color: "var(--vt-text)" }}>
        {title}
      </h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {body && <p className="empty-state__body">{body}</p>}
      {action && <div className="empty-state__action">{action}</div>}
      {cta && (
        <button
          onClick={cta.onClick}
          style={{
            padding: "var(--vt-space-3) var(--vt-space-4)",
            background: "var(--vt-primary)",
            color: "var(--vt-primary-contrast)",
            border: 0,
            borderRadius: "var(--vt-radius)",
          }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
