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
}: {
  label: string;
  value: 0 | 1;
  onChange: (v: 0 | 1) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "var(--vt-space-4)",
        borderBottom: "1px solid var(--vt-border)",
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
    <div style={{ padding: "var(--vt-space-4)" }}>
      <Link
        to="/m/me/notifications"
        style={{ color: "var(--vt-primary)", textDecoration: "none" }}
      >
        ← {t("notif.title")}
      </Link>
      <h1 style={{ marginTop: 12 }}>{t("pref.title")}</h1>
      <p style={{ color: "var(--vt-text-muted)" }}>{t("pref.subtitle")}</p>

      {q.isLoading && (
        <>
          <Skeleton height={56} />
          <div style={{ height: 4 }} />
          <Skeleton height={56} />
        </>
      )}

      {q.data &&
        FIELDS.map((f) => (
          <ToggleRow
            key={f.key}
            label={t(f.labelKey)}
            value={(q.data[f.key] ? 1 : 0) as 0 | 1}
            onChange={(v) => setField(f.key, v)}
          />
        ))}
    </div>
  );
}
