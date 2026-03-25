import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import api from "../lib/api";
import { db, queueAction, syncPlantsToLocal } from "../lib/db";
import { useOfflineStore } from "../stores/offline";
import type { Plant, CreatePlantBody, UpdatePlantBody } from "@plantcare/shared";

export function usePlants(gardenId: string | null) {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const qc = useQueryClient();

  // Server query
  const query = useQuery({
    queryKey: ["plants", gardenId],
    queryFn: async () => {
      const res = await api.get<Plant[]>("/plants", { params: { gardenId } });
      await syncPlantsToLocal(res.data);
      return res.data;
    },
    enabled: !!gardenId && isOnline,
    staleTime: 30_000,
  });

  // Offline fallback from IndexedDB
  const localPlants = useLiveQuery(
    () => (gardenId ? db.plants.where("gardenId").equals(gardenId).toArray() : []),
    [gardenId]
  );

  const plants = isOnline ? query.data ?? localPlants ?? [] : localPlants ?? [];

  // Create
  const createPlant = useMutation({
    mutationFn: async (body: CreatePlantBody & { gardenId: string }) => {
      if (!isOnline) {
        const tempId = crypto.randomUUID();
        const tempPlant: Plant = {
          id: tempId,
          name: body.name,
          archived: false,
          photoUrl: null,
          notes: body.notes ?? null,
          gardenId: body.gardenId,
          location: null,
          locationId: body.locationId ?? null,
          wateringFreqDays: body.wateringFreqDays ?? null,
          fertilizingFreqDays: body.fertilizingFreqDays ?? null,
          wateringFreqByMonth: body.wateringFreqByMonth ?? null,
          fertilizingFreqByMonth: body.fertilizingFreqByMonth ?? null,
          lastWatered: null,
          lastFertilized: null,
          needsWatering: false,
          needsFertilizing: false,
          currentWateringFreq: body.wateringFreqDays ?? null,
          currentFertilizingFreq: body.fertilizingFreqDays ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.plants.add({ ...tempPlant, _localOnly: true });
        await queueAction({ kind: "CREATE_PLANT", payload: { ...body, tempId } });
        return tempPlant;
      }
      const res = await api.post<Plant>("/plants", body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plants", gardenId] }),
  });

  // Update
  const updatePlant = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & UpdatePlantBody) => {
      if (!isOnline) {
        await db.plants.update(id, body as Partial<Plant>);
        await queueAction({ kind: "UPDATE_PLANT", payload: { id, ...body } });
        return;
      }
      const res = await api.patch<Plant>(`/plants/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plants", gardenId] }),
  });

  // Delete
  const deletePlant = useMutation({
    mutationFn: async (id: string) => {
      await db.plants.delete(id);
      if (!isOnline) {
        await queueAction({ kind: "DELETE_PLANT", payload: { id } });
        return;
      }
      await api.delete(`/plants/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plants", gardenId] }),
  });

  return { plants, isLoading: query.isLoading, createPlant, updatePlant, deletePlant };
}

export function usePlant(id: string | undefined) {
  const isOnline = useOfflineStore((s) => s.isOnline);

  return useQuery({
    queryKey: ["plant", id],
    queryFn: async () => {
      if (!isOnline) {
        return db.plants.get(id!) as Promise<Plant>;
      }
      const res = await api.get<Plant>(`/plants/${id}`);
      await db.plants.put(res.data);
      return res.data;
    },
    enabled: !!id,
  });
}
