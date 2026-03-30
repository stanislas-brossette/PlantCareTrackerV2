import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import api from "../lib/api";
import { db, queueAction, syncCareEventsToLocal } from "../lib/db";
import { useOfflineStore } from "../stores/offline";
import type { CareEvent, CareType } from "@plantcare/shared";

function daysSince(date: string | null) {
  if (!date) return Infinity;
  const now = new Date();
  const target = new Date(date);
  const startOfDay = (value: Date) => {
    const normalized = new Date(value);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };

  return (
    (startOfDay(now).getTime() - startOfDay(target).getTime()) /
    (1000 * 60 * 60 * 24)
  );
}

export function useCareEvents(plantId: string | undefined) {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const localEvents =
    useLiveQuery(
      () => (plantId ? db.careEvents.where("plantId").equals(plantId).reverse().sortBy("performedAt") : []),
      [plantId]
    ) ?? [];

  return useQuery({
    queryKey: ["care", plantId],
    queryFn: async () => {
      if (!isOnline) {
        return localEvents;
      }
      const res = await api.get<CareEvent[]>(`/care/plant/${plantId}`);
      await syncCareEventsToLocal(res.data);
      return res.data;
    },
    enabled: !!plantId,
    initialData: localEvents,
  });
}

export function useRecordCare() {
  const qc = useQueryClient();
  const isOnline = useOfflineStore((s) => s.isOnline);

  return useMutation({
    mutationFn: async ({
      plantId,
      type,
      note,
    }: {
      plantId: string;
      type: CareType;
      note?: string;
    }) => {
      const performedAt = new Date().toISOString();

      if (!isOnline) {
        const tempEvent: CareEvent = {
          id: crypto.randomUUID(),
          type,
          plantId,
          userId: "local",
          performedAt,
          note: note ?? null,
        };
        await db.careEvents.add({ ...tempEvent, _localOnly: true });

        const plant = await db.plants.get(plantId);
        if (plant) {
          const updates: Partial<typeof plant> = {};
          if (type === "WATERING") {
            updates.lastWatered = performedAt;
            updates.needsWatering = false;
          }
          if (type === "FERTILIZING") {
            updates.lastFertilized = performedAt;
            updates.needsFertilizing = false;
          }
          await db.plants.update(plantId, updates);
        }

        await queueAction({ kind: "RECORD_CARE", payload: { type, plantId, performedAt, note } });
        return tempEvent;
      }

      const res = await api.post<CareEvent>("/care", { type, plantId, note });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["care", variables.plantId] });
      qc.invalidateQueries({ queryKey: ["plants"] });
      qc.invalidateQueries({ queryKey: ["plant", variables.plantId] });
    },
  });
}

export function useUndoCare() {
  const qc = useQueryClient();
  const isOnline = useOfflineStore((s) => s.isOnline);

  return useMutation({
    mutationFn: async ({ plantId, type }: { plantId: string; type: CareType }) => {
      if (!isOnline) {
        const events = await db.careEvents
          .where("plantId")
          .equals(plantId)
          .filter((e) => e.type === type)
          .toArray();
        if (events.length > 0) {
          const last = events.sort(
            (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()
          )[0];
          await db.careEvents.delete(last.id);
        }

        const plant = await db.plants.get(plantId);
        if (plant) {
          const remainingEvents = await db.careEvents
            .where("plantId")
            .equals(plantId)
            .filter((event) => event.type === type)
            .toArray();

          const latestRemaining = remainingEvents.sort(
            (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()
          )[0] ?? null;

          if (type === "WATERING") {
            const lastWatered = latestRemaining?.performedAt ?? null;
            await db.plants.update(plantId, {
              lastWatered,
              needsWatering:
                plant.currentWateringFreq != null && daysSince(lastWatered) >= plant.currentWateringFreq,
            });
          }

          if (type === "FERTILIZING") {
            const lastFertilized = latestRemaining?.performedAt ?? null;
            await db.plants.update(plantId, {
              lastFertilized,
              needsFertilizing:
                plant.currentFertilizingFreq != null &&
                daysSince(lastFertilized) >= plant.currentFertilizingFreq,
            });
          }
        }

        await queueAction({ kind: "UNDO_CARE", payload: { plantId, type } });
        return;
      }
      await api.delete("/care/undo", { params: { plantId, type } });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["care", variables.plantId] });
      qc.invalidateQueries({ queryKey: ["plants"] });
      qc.invalidateQueries({ queryKey: ["plant", variables.plantId] });
    },
  });
}
