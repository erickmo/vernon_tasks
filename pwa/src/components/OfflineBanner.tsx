import { useEffect, useRef } from "react";
import { fmtTime } from "../i18n";
import { useOnline } from "../hooks/useOnline";
import { useOutbox } from "../hooks/useOutbox";
import { logEvent } from "../telemetry";

/**
 * Connectivity + outbox status banner. Visible while offline OR whenever there
 * are pending/failed queued mutations (even online), so the user can trigger a
 * manual "Sync now" / "Coba lagi". Fires `offline_seen` once per offline spell.
 */
export function OfflineBanner() {
  const online = useOnline();
  const { pendingCount, failedCount, syncing, syncNow, retry } = useOutbox();
  const sinceRef = useRef<Date | null>(null);
  const seenOffline = useRef(false);

  if (!online && sinceRef.current === null) sinceRef.current = new Date();
  if (online) sinceRef.current = null;

  useEffect(() => {
    if (!online && !seenOffline.current) {
      seenOffline.current = true;
      logEvent("offline_seen", {});
    }
    if (online) seenOffline.current = false;
  }, [online]);

  const visible = !online || pendingCount > 0 || failedCount > 0;
  if (!visible) return null;

  const btnStyle = {
    background: "rgba(255,255,255,0.2)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.5)",
    borderRadius: 6,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: 600,
  } as const;

  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "var(--vt-danger)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        textAlign: "center",
        padding: "var(--vt-space-2)",
        fontSize: 13,
      }}
    >
      {!online && pendingCount === 0 && failedCount === 0 && (
        <span>Mode offline · terakhir sinkron {sinceRef.current ? fmtTime(sinceRef.current) : "—"}</span>
      )}
      {!online && (pendingCount > 0 || failedCount > 0) && <span>Mode offline</span>}
      {pendingCount > 0 && (
        <>
          <span>{`${pendingCount} aksi menunggu`}</span>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing}
            aria-label={syncing ? "Menyinkronkan…" : "Sync now"}
            style={{ ...btnStyle, cursor: syncing ? "default" : "pointer" }}
          >
            {syncing ? "Menyinkronkan…" : "Sync now"}
          </button>
        </>
      )}
      {failedCount > 0 && (
        <>
          <span>{`${failedCount} gagal`}</span>
          <button
            type="button"
            onClick={() => void retry()}
            aria-label="Coba lagi"
            style={{ ...btnStyle, cursor: "pointer" }}
          >
            Coba lagi
          </button>
        </>
      )}
    </div>
  );
}
