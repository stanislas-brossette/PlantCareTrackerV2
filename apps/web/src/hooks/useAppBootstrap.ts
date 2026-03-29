import { useEffect, useState } from "react";
import { getLocalSnapshotInfo } from "../lib/db";
import { useAppStore } from "../stores/app";

export function useAppBootstrap() {
  const {
    hasHydrated,
    gardenId,
    gardenName,
    setGardenContext,
    setHasLocalData,
  } = useAppStore();
  const [localChecked, setLocalChecked] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;

    let cancelled = false;

    getLocalSnapshotInfo()
      .then((snapshot) => {
        if (cancelled) return;

        setHasLocalData(snapshot.hasLocalData);

        if (snapshot.firstPlant && (!gardenId || !gardenName)) {
          setGardenContext(snapshot.firstPlant.gardenId, gardenName ?? "Mes plantes");
        }
      })
      .finally(() => {
        if (!cancelled) setLocalChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [gardenId, gardenName, hasHydrated, setGardenContext, setHasLocalData]);

  return {
    appReady: hasHydrated && localChecked,
  };
}
