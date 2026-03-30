import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import api from "../lib/api";
import { db, queueAction, syncLocationsToLocal } from "../lib/db";
import { useOfflineStore } from "../stores/offline";
import type { Location } from "@plantcare/shared";

export function useLocations() {
  const isOnline = useOfflineStore((s) => s.isOnline);

  const query = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await api.get<Location[]>("/locations");
      await syncLocationsToLocal(res.data);
      return res.data;
    },
    enabled: isOnline,
  });

  const localLocations = useLiveQuery(() => db.locations.toArray(), []) ?? [];
  return {
    data: isOnline ? query.data ?? localLocations : localLocations,
    isLoading: query.isLoading,
  };
}

export function useCreateLocation() {
  const qc = useQueryClient();
  const isOnline = useOfflineStore((s) => s.isOnline);

  return useMutation({
    mutationFn: async (name: string) => {
      if (!isOnline) {
        const location = {
          id: crypto.randomUUID(),
          name,
          gardenId: "local-garden",
        };
        await db.locations.add(location);
        await queueAction({ kind: "CREATE_LOCATION", payload: { tempId: location.id, name } });
        return location;
      }
      return api.post<Location>("/locations", { name }).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  const isOnline = useOfflineStore((s) => s.isOnline);

  return useMutation({
    mutationFn: async (id: string) => {
      await db.locations.delete(id);
      if (isOnline) {
        await api.delete(`/locations/${id}`);
      } else {
        await queueAction({ kind: "DELETE_LOCATION", payload: { id } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["plants"] });
    },
  });
}
