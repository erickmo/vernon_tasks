import { useEffect, useState } from "react";
import { fmtTime } from "../i18n";

export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [since, setSince] = useState<Date | null>(null);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      setSince(null);
    };
    const off = () => {
      setOnline(false);
      setSince(new Date());
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        background: "var(--vt-text-muted)",
        color: "var(--vt-bg)",
        textAlign: "center",
        padding: "var(--vt-space-2)",
        fontSize: 13,
      }}
    >
      Mode offline · terakhir sinkron {since ? fmtTime(since) : "—"}
    </div>
  );
}
