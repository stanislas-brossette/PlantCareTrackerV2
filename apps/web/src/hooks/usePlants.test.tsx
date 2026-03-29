import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalPlant } from "@plantcare/shared";

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../lib/db", () => ({
  db: {
    plants: {
      delete: vi.fn(),
      put: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
  queueAction: vi.fn(),
  syncPlantsToLocal: vi.fn(),
}));

vi.mock("../lib/photos", () => ({
  cachePhotoForPlant: vi.fn().mockResolvedValue(null),
}));

import { useLiveQuery } from "dexie-react-hooks";
import api from "../lib/api";
import { db, syncPlantsToLocal } from "../lib/db";
import { useOfflineStore } from "../stores/offline";
import { usePlants } from "./usePlants";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

const activePlant: LocalPlant = {
  id: "plant-active",
  name: "Monstera",
  archived: false,
  photoUrl: null,
  cachedPhotoUrl: null,
  notes: null,
  gardenId: "garden-1",
  locationId: "loc-1",
  location: { id: "loc-1", name: "Salon", gardenId: "garden-1" },
  wateringFreqDays: 7,
  fertilizingFreqDays: 30,
  wateringFreqByMonth: null,
  fertilizingFreqByMonth: null,
  lastWatered: null,
  lastFertilized: null,
  needsWatering: false,
  needsFertilizing: false,
  currentWateringFreq: 7,
  currentFertilizingFreq: 30,
  createdAt: "2026-03-26T10:00:00.000Z",
  updatedAt: "2026-03-26T10:00:00.000Z",
};

describe("usePlants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOfflineStore.setState({ isOnline: true, isSyncing: false, pendingCount: 0, lastSyncError: null });
    vi.mocked(useLiveQuery).mockReturnValue([]);
  });

  it("fetches active and archived plants and syncs local storage", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [activePlant] })
      .mockResolvedValueOnce({ data: [] });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlants(), { wrapper });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

    expect(api.get).toHaveBeenNthCalledWith(1, "/plants", { params: { archived: false } });
    expect(api.get).toHaveBeenNthCalledWith(2, "/plants", { params: { archived: true } });
    expect(syncPlantsToLocal).toHaveBeenCalled();
    expect(result.current.plants).toEqual([]);
  });

  it("falls back to local plants when offline without calling the API", () => {
    useOfflineStore.setState({ isOnline: false, isSyncing: false, pendingCount: 0, lastSyncError: null });
    vi.mocked(useLiveQuery).mockReturnValue([activePlant]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlants(), { wrapper });

    expect(result.current.plants).toEqual([activePlant]);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("preserves locally cached photos while online", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [{ ...activePlant, cachedPhotoUrl: null }] })
      .mockResolvedValueOnce({ data: [] });
    vi.mocked(useLiveQuery).mockReturnValue([
      { ...activePlant, cachedPhotoUrl: "data:image/jpeg;base64,abc123" },
    ]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlants(), { wrapper });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

    expect(result.current.plants[0]?.cachedPhotoUrl).toBe("data:image/jpeg;base64,abc123");
  });

  it("deletes locally first, then calls the API when online", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [activePlant] })
      .mockResolvedValueOnce({ data: [] });
    vi.mocked(api.delete).mockResolvedValue({ data: { ok: true } });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlants(), { wrapper });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await result.current.deletePlant.mutateAsync(activePlant.id);

    expect(db.plants.delete).toHaveBeenCalledWith(activePlant.id);
    expect(api.delete).toHaveBeenCalledWith(`/plants/${activePlant.id}`);
  });

  it("stores a newly created online plant locally right away", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [activePlant] })
      .mockResolvedValueOnce({ data: [] });
    vi.mocked(api.post).mockResolvedValue({ data: activePlant });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlants(), { wrapper });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await result.current.createPlant.mutateAsync({ name: "Monstera" });

    expect(api.post).toHaveBeenCalledWith("/plants", { name: "Monstera" });
    expect(db.plants.put).toHaveBeenCalledWith(activePlant);
  });
});
