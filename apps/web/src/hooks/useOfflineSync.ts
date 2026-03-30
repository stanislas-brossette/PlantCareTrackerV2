import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import toast from "react-hot-toast";
import { db } from "../lib/db";
import {
  bootstrapFromServer,
  checkServerHealth,
  flushPendingActions,
  subscribeToServerEvents,
  syncRemoteChanges,
} from "../lib/sync";
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
    let stopRealtime: (() => void) | null = null;

    const disconnectRealtime = () => {
      stopRealtime?.();
      stopRealtime = null;
    };

    const applyRealtimeChanges = async (versionHint?: number) => {
      if (useOfflineStore.getState().pendingCount > 0) {
        return;
      }

      const currentVersion = useAppStore.getState().lastSeenChangeVersion;
      if (versionHint !== undefined && versionHint <= currentVersion) {
        return;
      }

      const changeSet = await syncRemoteChanges();
      if (cancelled || !changeSet) return;
      setLastSyncError(null);
      qc.invalidateQueries();
    };

    const ensureRealtimeConnection = () => {
      if (stopRealtime || typeof window === "undefined" || typeof window.EventSource === "undefined") {
        return;
      }

      stopRealtime = subscribeToServerEvents({
        onVersion: (version) => {
          void applyRealtimeChanges(version);
        },
        onDisconnect: () => {
          disconnectRealtime();
        },
      });
    };

    const syncAgainstServer = async () => {
      if (!hasHydrated || !setupComplete || !serverHost.trim()) {
        disconnectRealtime();
        setOnline(false);
        setSyncing(false);
        return;
      }

      if (!navigator.onLine) {
        disconnectRealtime();
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
        } else {
          await applyRealtimeChanges();
          if (cancelled) return;
        }
        ensureRealtimeConnection();
        qc.invalidateQueries();
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
        disconnectRealtime();
        setOnline(false);
        setLastSyncError("Serveur Raspberry Pi inaccessible");
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };

    const probeServer = async () => {
      if (cancelled) return;
      if (!hasHydrated || !setupComplete || !serverHost.trim()) {
        disconnectRealtime();
        setOnline(false);
        setSyncing(false);
        return;
      }
      if (!navigator.onLine) {
        disconnectRealtime();
        setOnline(false);
        setSyncing(false);
        return;
      }
      if (useOfflineStore.getState().isSyncing) {
        return;
      }

      try {
        const health = await checkServerHealth(1200);
        if (cancelled) return;
        const wasOnline = useOfflineStore.getState().isOnline;
        setOnline(true);
        if (!wasOnline) {
          void syncAgainstServer();
          return;
        }
        ensureRealtimeConnection();
        if (health.latestChangeVersion > useAppStore.getState().lastSeenChangeVersion) {
          void applyRealtimeChanges(health.latestChangeVersion);
        }
      } catch {
        if (cancelled) return;
        disconnectRealtime();
        setOnline(false);
        setSyncing(false);
      }
    };

    const handleOnline = () => {
      void syncAgainstServer();
    };
    const handleOffline = () => {
      disconnectRealtime();
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
      disconnectRealtime();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, [hasHydrated, qc, serverHost, setLastSyncError, setOnline, setPendingCount, setSyncing, setupComplete]);
}
