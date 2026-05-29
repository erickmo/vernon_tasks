import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listOutbox } from "../cache/outbox";
import { drainOutbox, retryFailed } from "../sync/outboxRunner";
import { useOnline } from "./useOnline";

export interface OutboxApi {
  pendingCount: number;
  failedCount: number;
  syncing: boolean;
  syncNow: () => Promise<void>;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * React binding over the outbox queue + drain runner.
 * Auto-drains on an online false->true transition and invalidates the query
 * keys the drain reports affected. Exposes pending/failed counts for the banner.
 */
export function useOutbox(): OutboxApi {
  const qc = useQueryClient();
  const online = useOnline();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const prevOnline = useRef(online);

  const refresh = useCallback(async () => {
    const all = await listOutbox();
    setPendingCount(all.filter((e) => !e.failed).length);
    setFailedCount(all.filter((e) => e.failed).length);
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await drainOutbox();
      if (!res.skipped) {
        for (const key of res.affectedKeys) qc.invalidateQueries({ queryKey: key as unknown[] });
      }
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [qc, refresh]);

  const retry = useCallback(async () => {
    await retryFailed();
    await refresh();
    await syncNow();
  }, [refresh, syncNow]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Drain only on the offline->online edge, not on every render.
  useEffect(() => {
    if (online && !prevOnline.current) void syncNow();
    prevOnline.current = online;
  }, [online, syncNow]);

  return { pendingCount, failedCount, syncing, syncNow, retry, refresh };
}
