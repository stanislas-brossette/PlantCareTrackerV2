import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { db, queueAction, syncCareEventsToLocal } from "../lib/db";
import { useOfflineStore } from "../stores/offline";
import type { CareEvent, CareType } from "@plantcare/shared";

export function useCareEvents(plantId: string | undefined) {
  const isOnline = useOfflineStore((s) => s.isOnline);

  return useQuery({
    queryKey: ["care", plantId],
    queryFn: async () => {
      const res = await api.get<CareEvent[]>(`/care/plant/${plantId}`);
      await syncCareEventsToLocal(res.data);
      return res.data;
    },
    enabled: !!plantId && isOnline,
  });
}

export function useRecordCare(gardenId: string | null) {
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
        // Optimistic local update
        const tempEvent: CareEvent = {
          id: crypto.randomUUID(),
          type,
          plantId,
          userId: "local",
          performedAt,
          note: note ?? null,
        };
        await db.careEvents.add({ ...tempEvent, _localOnly: true });

        // Update plant's computed fields locally
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
      qc.invalidateQueries({ queryKey: ["plants", gardenId] });
      qc.invalidateQueries({ queryKey: ["plant", variables.plantId] });
    },
  });
}

export function useUndoCare(gardenId: string | null) {
  const qc = useQueryClient();
  const isOnline = useOfflineStore((s) => s.isOnline);

  return useMutation({
    mutationFn: async ({ plantId, type }: { plantId: string; type: CareType }) => {
      if (!isOnline) {
        // Remove the last local event of this type
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
        await queueAction({ kind: "UNDO_CARE", payload: { plantId, type } });
        return;
      }
      await api.delete("/care/undo", { params: { plantId, type } });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["care", variables.plantId] });
      qc.invalidateQueries({ queryKey: ["plants", gardenId] });
      qc.invalidateQueries({ queryKey: ["plant", variables.plantId] });
    },
  });
}

export function useCalendar(gardenId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["calendar", gardenId, from, to],
    queryFn: async () => {
      const res = await api.get<CareEvent[]>("/care/calendar", {
        params: { gardenId, from, to },
      });
      return res.data;
    },
    enabled: !!gardenId,
  });
}

export function useStats(gardenId: string | null) {
  return useQuery({
    queryKey: ["stats", gardenId],
    queryFn: async () => {
      const res = await api.get("/care/stats", { params: { gardenId } });
      return res.data;
    },
    enabled: !!gardenId,
  });
}
