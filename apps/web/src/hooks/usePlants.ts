import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import api from "../lib/api";
import { db, queueAction, syncPlantsToLocal } from "../lib/db";
import { cachePhotoForPlant } from "../lib/photos";
import { useOfflineStore } from "../stores/offline";
import type { CreatePlantBody, LocalPlant, Plant, UpdatePlantBody } from "@plantcare/shared";

function mergeWithLocalPlants(remotePlants: LocalPlant[] | undefined, localPlants: LocalPlant[]) {
  if (!remotePlants) return localPlants;

  const localById = new Map(localPlants.map((plant) => [plant.id, plant]));
  return remotePlants.map((plant) => {
    const localPlant = localById.get(plant.id);
    if (!localPlant) return plant;

    return {
      ...plant,
      cachedPhotoUrl: localPlant.cachedPhotoUrl ?? plant.cachedPhotoUrl ?? null,
      photoUrl: localPlant.photoUrl ?? plant.photoUrl,
      _localOnly: localPlant._localOnly ?? plant._localOnly,
    };
  });
}

async function persistPlantUpdate(qc: ReturnType<typeof useQueryClient>, plant: LocalPlant) {
  await db.plants.put(plant);
  qc.setQueryData(["plant", plant.id], plant);
  qc.setQueryData<LocalPlant[] | undefined>(["plants"], (current) => {
    if (!current) return current;
    const exists = current.some((currentPlant) => currentPlant.id === plant.id);
    if (!exists) {
      return [...current, plant];
    }

    return current.map((currentPlant) =>
      currentPlant.id === plant.id ? { ...currentPlant, ...plant } : currentPlant,
    );
  });
}

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
  const plants = isOnline ? mergeWithLocalPlants(query.data, localPlants) : localPlants;

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
      const createdPlant = res.data as LocalPlant;
      await persistPlantUpdate(qc, createdPlant);
      return createdPlant;
    },
    onSuccess: (createdPlant) => {
      qc.setQueryData<LocalPlant[] | undefined>(["plants"], (current) =>
        current
          ? [...current.filter((plant) => plant.id !== createdPlant.id), createdPlant]
          : current,
      );
      qc.setQueryData(["plant", createdPlant.id], createdPlant);
      qc.invalidateQueries({ queryKey: ["plants"] });
    },
  });

  const updatePlant = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & UpdatePlantBody) => {
      if (!isOnline) {
        await db.plants.update(id, body as Partial<LocalPlant>);
        await queueAction({ kind: "UPDATE_PLANT", payload: { id, ...body } });
        return;
      }
      const res = await api.patch<Plant>(`/plants/${id}`, body);
      const updatedPlant = res.data as LocalPlant;
      await persistPlantUpdate(qc, updatedPlant);
      return updatedPlant;
    },
    onSuccess: (updatedPlant, variables) => {
      if (updatedPlant) {
        qc.setQueryData(["plant", variables.id], updatedPlant);
      }
      qc.invalidateQueries({ queryKey: ["plants"] });
      qc.invalidateQueries({ queryKey: ["plant", variables.id] });
    },
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
      const remotePlant = res.data as LocalPlant;
      const localPlant = await db.plants.get(id!);
      const mergedPlant = {
        ...remotePlant,
        cachedPhotoUrl: localPlant?.cachedPhotoUrl ?? remotePlant.cachedPhotoUrl ?? null,
      };
      await db.plants.put(mergedPlant);
      return mergedPlant;
    },
    enabled: !!id,
  });
}
