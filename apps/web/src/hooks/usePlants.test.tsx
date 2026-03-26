import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plant } from "@plantcare/shared";

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
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
  },
  queueAction: vi.fn(),
  syncPlantsToLocal: vi.fn(),
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
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

const activePlant: Plant = {
  id: "plant-active",
  name: "Monstera",
  archived: false,
  photoUrl: null,
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

const archivedPlant: Plant = {
  ...activePlant,
  id: "plant-archived",
  name: "Pothos",
  archived: true,
  locationId: null,
  location: null,
};

describe("usePlants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOfflineStore.setState({ isOnline: true, pendingCount: 0 });
    vi.mocked(useLiveQuery).mockReturnValue([]);
  });

  it("fetches active and archived plants, merges them, and syncs local storage", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [activePlant] })
      .mockResolvedValueOnce({ data: [archivedPlant] });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlants("garden-1"), { wrapper });

    await waitFor(() => expect(result.current.plants).toHaveLength(2));

    expect(api.get).toHaveBeenNthCalledWith(1, "/plants", {
      params: { gardenId: "garden-1", archived: false },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, "/plants", {
      params: { gardenId: "garden-1", archived: true },
    });
    expect(syncPlantsToLocal).toHaveBeenCalledWith([activePlant, archivedPlant], "garden-1");
  });

  it("falls back to local plants when offline without calling the API", () => {
    useOfflineStore.setState({ isOnline: false, pendingCount: 0 });
    vi.mocked(useLiveQuery).mockReturnValue([activePlant, archivedPlant]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlants("garden-1"), { wrapper });

    expect(result.current.plants).toEqual([activePlant, archivedPlant]);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("deletes locally first, then calls the API when online", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [activePlant] })
      .mockResolvedValueOnce({ data: [] });
    vi.mocked(api.delete).mockResolvedValue({ data: { ok: true } });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlants("garden-1"), { wrapper });

    await waitFor(() => expect(result.current.plants).toHaveLength(1));
    await result.current.deletePlant.mutateAsync(activePlant.id);

    expect(db.plants.delete).toHaveBeenCalledWith(activePlant.id);
    expect(api.delete).toHaveBeenCalledWith(`/plants/${activePlant.id}`);
  });
});
