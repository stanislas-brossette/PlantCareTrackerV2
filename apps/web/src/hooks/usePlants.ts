import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import api from "../lib/api";
import { db, queueAction, syncPlantsToLocal } from "../lib/db";
import { cachePhotoForPlant } from "../lib/photos";
import { useOfflineStore } from "../stores/offline";
import type { CreatePlantBody, LocalPlant, Plant, UpdatePlantBody } from "@plantcare/shared";

export function usePlants() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["plants"],
    queryFn: async () => {
      const [activeRes, archivedRes] = await Promise.all([
        api.get<Plant[]>("/plants", { params: { archived: false } }),
        api.get<Plant[]>("/plants", { params: { archived: true } }),
      ]);
      const merged = [...activeRes.data, ...archivedRes.data] as LocalPlant[];
      await syncPlantsToLocal(merged);
      await Promise.all(merged.map((plant) => cachePhotoForPlant(plant.id, plant.photoUrl).catch(() => null)));
      return merged;
    },
    enabled: isOnline,
    staleTime: 30_000,
  });

  const localPlants = useLiveQuery(() => db.plants.toArray(), []) ?? [];
  const plants = isOnline ? query.data ?? localPlants : localPlants;

  const createPlant = useMutation({
    mutationFn: async (body: CreatePlantBody) => {
      if (!isOnline) {
        const tempId = crypto.randomUUID();
        const tempPlant: LocalPlant = {
          id: tempId,
          name: body.name,
          archived: false,
          photoUrl: null,
          cachedPhotoUrl: null,
          notes: body.notes ?? null,
          gardenId: "local-garden",
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
          _localOnly: true,
        };
        await db.plants.add(tempPlant);
        await queueAction({ kind: "CREATE_PLANT", payload: { ...body, tempId } });
        return tempPlant;
      }
      const res = await api.post<Plant>("/plants", body);
      return res.data as LocalPlant;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plants"] }),
  });

  const updatePlant = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & UpdatePlantBody) => {
      if (!isOnline) {
        await db.plants.update(id, body as Partial<LocalPlant>);
        await queueAction({ kind: "UPDATE_PLANT", payload: { id, ...body } });
        return;
      }
      const res = await api.patch<Plant>(`/plants/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plants"] }),
  });

  const deletePlant = useMutation({
    mutationFn: async (id: string) => {
      await db.plants.delete(id);
      if (!isOnline) {
        await queueAction({ kind: "DELETE_PLANT", payload: { id } });
        return;
      }
      await api.delete(`/plants/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plants"] }),
  });

  return { plants, isLoading: query.isLoading, createPlant, updatePlant, deletePlant };
}

export function usePlant(id: string | undefined) {
  const isOnline = useOfflineStore((s) => s.isOnline);

  return useQuery({
    queryKey: ["plant", id],
    queryFn: async () => {
      if (!isOnline) {
        return db.plants.get(id!) as Promise<LocalPlant>;
      }
      const res = await api.get<Plant>(`/plants/${id}`);
      await db.plants.put(res.data as LocalPlant);
      return res.data as LocalPlant;
    },
    enabled: !!id,
  });
}
