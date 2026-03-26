import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { syncGardensToLocal, syncLocationsToLocal } from "../lib/db";
import type { Garden, GardenMember, InviteMemberBody, Location } from "@plantcare/shared";

export function useGardens() {
  return useQuery({
    queryKey: ["gardens"],
    queryFn: async () => {
      const res = await api.get<Garden[]>("/gardens");
      await syncGardensToLocal(res.data);
      return res.data;
    },
  });
}

export function useGarden(id: string | null) {
  return useQuery({
    queryKey: ["garden", id],
    queryFn: async () => {
      const res = await api.get<Garden & { members: GardenMember[]; locations: Location[] }>(
        `/gardens/${id}`
      );
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateGarden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Garden>("/gardens", { name }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gardens"] }),
  });
}

export function useMembers(gardenId: string | null) {
  return useQuery({
    queryKey: ["members", gardenId],
    queryFn: async () => {
      const res = await api.get<GardenMember[]>(`/gardens/${gardenId}/members`);
      return res.data;
    },
    enabled: !!gardenId,
  });
}

export function useInviteMember(gardenId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: InviteMemberBody) =>
      api.post(`/gardens/${gardenId}/members`, { email, role }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", gardenId] }),
  });
}

export function useRemoveMember(gardenId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/gardens/${gardenId}/members/${userId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", gardenId] }),
  });
}

export function useLocations(gardenId: string | null) {
  return useQuery({
    queryKey: ["locations", gardenId],
    queryFn: async () => {
      const res = await api.get<Location[]>("/locations", { params: { gardenId } });
      await syncLocationsToLocal(res.data);
      return res.data;
    },
    enabled: !!gardenId,
  });
}

export function useCreateLocation(gardenId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<Location>("/locations", { gardenId, name }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations", gardenId] }),
  });
}

export function useDeleteLocation(gardenId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/locations/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations", gardenId] });
      qc.invalidateQueries({ queryKey: ["plants", gardenId] });
    },
  });
}
