import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import toast from "react-hot-toast";
import { db } from "../lib/db";
import { bootstrapFromServer, checkServerHealth, flushPendingActions } from "../lib/sync";
import { useOfflineStore } from "../stores/offline";
import { useAppStore } from "../stores/app";

export function useOfflineSync() {
  const { setOnline, setPendingCount, setSyncing, setLastSyncError } = useOfflineStore();
  const { serverHost, setupComplete, hasHydrated } = useAppStore();
  const qc = useQueryClient();

  const pendingCount = useLiveQuery(() => db.pendingActions.count(), []) ?? 0;

  useEffect(() => {
    setPendingCount(pendingCount);
  }, [pendingCount, setPendingCount]);

  useEffect(() => {
    let cancelled = false;

    const syncAgainstServer = async () => {
      if (!hasHydrated || !setupComplete || !serverHost.trim()) {
        setOnline(false);
        setSyncing(false);
        return;
      }

      if (!navigator.onLine) {
        setOnline(false);
        setSyncing(false);
        return;
      }

      setSyncing(true);
      try {
        await checkServerHealth();
        if (cancelled) return;
        setOnline(true);
        setLastSyncError(null);
        const result = await flushPendingActions();
        if (cancelled) return;
        if (result.remaining === 0) {
          await bootstrapFromServer();
          if (cancelled) return;
          qc.invalidateQueries();
        }
        if (result.success > 0) {
          toast.success(`${result.success} action(s) synchronisée(s)`);
        }
        if (result.failed > 0 || result.remaining > 0) {
          const message =
            result.remaining > 0
              ? `${result.remaining} action(s) en attente ou en échec`
              : `${result.failed} action(s) en échec`;
          setLastSyncError(message);
          toast.error(message);
        }
      } catch {
        if (cancelled) return;
        setOnline(false);
        setLastSyncError("Serveur Raspberry Pi inaccessible");
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };

    const probeServer = async () => {
      if (cancelled) return;
      if (!hasHydrated || !setupComplete || !serverHost.trim()) {
        setOnline(false);
        setSyncing(false);
        return;
      }
      if (!navigator.onLine) {
        setOnline(false);
        setSyncing(false);
        return;
      }
      if (useOfflineStore.getState().isSyncing) {
        return;
      }

      try {
        await checkServerHealth(1200);
        if (cancelled) return;
        const wasOnline = useOfflineStore.getState().isOnline;
        setOnline(true);
        if (!wasOnline) {
          void syncAgainstServer();
        }
      } catch {
        if (cancelled) return;
        setOnline(false);
        setSyncing(false);
      }
    };

    const handleOnline = () => {
      void syncAgainstServer();
    };
    const handleOffline = () => {
      setOnline(false);
      setSyncing(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    void syncAgainstServer();
    const interval = window.setInterval(() => {
      void probeServer();
    }, 3000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, [hasHydrated, qc, serverHost, setLastSyncError, setOnline, setPendingCount, setSyncing, setupComplete]);
}
