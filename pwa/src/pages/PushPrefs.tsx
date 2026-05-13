import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchPushPrefs, updatePushPrefs, PushPrefs } from "../api/pushPrefs";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { t, StringKey } from "../i18n";
import { logEvent } from "../telemetry";

const FIELDS: Array<{ key: keyof PushPrefs; labelKey: StringKey }> = [
  { key: "event_assignment", labelKey: "pref.assignment" },
  { key: "event_mention", labelKey: "pref.mention" },
  { key: "event_due", labelKey: "pref.due" },
  { key: "event_review", labelKey: "pref.review" },
];

function ToggleRow({
  label,
  value,
  onChange,
  isLast,
}: {
  label: string;
  value: 0 | 1;
  onChange: (v: 0 | 1) => void;
  isLast?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "var(--vt-space-4)",
        borderBottom: isLast ? "none" : "1px solid var(--vt-border)",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span
        onClick={() => onChange(value ? 0 : 1)}
        style={{
          width: 44,
          height: 26,
          background: value ? "var(--vt-primary)" : "var(--vt-border)",
          borderRadius: 999,
          position: "relative",
          transition: "background 0.2s",
        }}
        role="switch"
        aria-checked={value === 1}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: value ? 21 : 3,
            width: 20,
            height: 20,
            background: "white",
            borderRadius: "50%",
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}
        />
      </span>
    </label>
  );
}

export function PushPrefsPage() {
  const qc = useQueryClient();
  const { show } = useToast();
  const q = useQuery({ queryKey: ["push-prefs"], queryFn: fetchPushPrefs });

  useEffect(() => {
    logEvent("push_pref_view", {});
  }, []);

  async function setField(field: keyof PushPrefs, value: 0 | 1) {
    const prev = q.data;
    if (!prev) return;
    const next = { ...prev, [field]: value };
    qc.setQueryData(["push-prefs"], next);
    try {
      await updatePushPrefs(next);
      logEvent("push_pref_changed", { field, value });
      show(t("pref.saved"));
    } catch {
      qc.setQueryData(["push-prefs"], prev);
      show(t("pref.failed"));
    }
  }

  return (
    <div style={{ background: "var(--vt-primary-light)", minHeight: "100%" }}>
      {/* Sticky gradient header */}
      <header
        style={{
          background: "var(--vt-primary-light)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Link
          to="/m/me/notifications"
          style={{ color: "var(--vt-text-muted)", textDecoration: "none", fontSize: 20 }}
        >
          ←
        </Link>
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 14, fontWeight: 600 }}>
          {t("pref.title")}
        </h1>
      </header>

      {/* Content */}
      <div style={{ padding: "var(--vt-space-4)" }}>
        {/* Description card */}
        <div
          style={{
            background: "white",
            borderRadius: "var(--vt-radius)",
            boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
            padding: "var(--vt-space-4)",
            marginBottom: "var(--vt-space-4)",
          }}
        >
          <p style={{ margin: 0, color: "var(--vt-text-muted)", fontSize: 14 }}>
            {t("pref.subtitle")}
          </p>
        </div>

        {/* Toggle rows card */}
        {q.isLoading && (
          <>
            <Skeleton height={56} />
            <div style={{ height: 4 }} />
            <Skeleton height={56} />
          </>
        )}

        {q.data && (
          <div
            style={{
              background: "white",
              borderRadius: "var(--vt-radius)",
              boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
              overflow: "hidden",
            }}
          >
            {FIELDS.map((f, idx) => (
              <ToggleRow
                key={f.key}
                label={t(f.labelKey)}
                value={(q.data[f.key] ? 1 : 0) as 0 | 1}
                onChange={(v) => setField(f.key, v)}
                isLast={idx === FIELDS.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
