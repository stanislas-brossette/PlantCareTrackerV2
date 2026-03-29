import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db", () => ({
  getLocalSnapshotInfo: vi.fn(),
}));

import { getLocalSnapshotInfo } from "../lib/db";
import { useAppBootstrap } from "./useAppBootstrap";
import { useAppStore } from "../stores/app";
import type { LocalPlant } from "@plantcare/shared";

const cachedPlant = {
  id: "plant-1",
  name: "Monstera",
  photoUrl: null,
  notes: null,
  wateringFreqDays: null,
  fertilizingFreqDays: null,
  wateringFreqByMonth: null,
  fertilizingFreqByMonth: null,
  archived: false,
  gardenId: "garden-1",
  locationId: null,
  location: null,
  createdAt: "2026-03-29T00:00:00.000Z",
  updatedAt: "2026-03-29T00:00:00.000Z",
  lastWatered: null,
  lastFertilized: null,
  needsWatering: false,
  needsFertilizing: false,
  currentWateringFreq: null,
  currentFertilizingFreq: null,
} satisfies LocalPlant;

describe("useAppBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      gardenId: null,
      gardenName: null,
      serverHost: "192.168.1.42",
      serverPort: "3000",
      protocol: "http",
      lastSuccessfulSyncAt: null,
      setupComplete: true,
      hasHydrated: true,
      hasLocalData: false,
    });
  });

  it("marks local data available and reconstructs garden context from cached plants", async () => {
    vi.mocked(getLocalSnapshotInfo).mockResolvedValue({
      hasLocalData: true,
      plantCount: 1,
      locationCount: 0,
      careEventCount: 0,
      firstPlant: cachedPlant,
    });

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => expect(result.current.appReady).toBe(true));

    expect(useAppStore.getState().hasLocalData).toBe(true);
    expect(useAppStore.getState().gardenId).toBe("garden-1");
    expect(useAppStore.getState().gardenName).toBe("Mes plantes");
  });

  it("does not query Dexie before persisted app state is hydrated", () => {
    useAppStore.setState({ hasHydrated: false });

    renderHook(() => useAppBootstrap());

    expect(getLocalSnapshotInfo).not.toHaveBeenCalled();
  });
});
