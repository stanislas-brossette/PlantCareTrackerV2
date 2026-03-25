import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import toast from "react-hot-toast";
import { db } from "../lib/db";
import { initOfflineSync } from "../lib/sync";
import { useOfflineStore } from "../stores/offline";

export function useOfflineSync() {
  const { setOnline, setPendingCount } = useOfflineStore();
  const qc = useQueryClient();

  const pendingCount = useLiveQuery(() => db.pendingActions.count(), []) ?? 0;

  useEffect(() => {
    setPendingCount(pendingCount);
  }, [pendingCount, setPendingCount]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const cleanup = initOfflineSync((result) => {
      if (result.success > 0) {
        toast.success(`${result.success} action(s) synchronisée(s) ✓`);
        qc.invalidateQueries(); // full refresh after sync
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} action(s) non synchronisée(s)`);
      }
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      cleanup();
    };
  }, [qc, setOnline]);
}
