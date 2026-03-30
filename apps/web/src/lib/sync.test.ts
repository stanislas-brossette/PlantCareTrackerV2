import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeSetPayload, LocalPlant, PendingAction } from "@plantcare/shared";

const pendingActions: PendingAction[] = [];
const plants = new Map<string, LocalPlant>();
const locations = new Map<string, { id: string; name: string; gardenId: string }>();
const careEvents = new Map<string, { id: string; plantId: string; type: string; performedAt: string }>();

vi.mock("./api", () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("./photos", () => ({
  cacheAllPlantPhotos: vi.fn(),
  cachePhotoForPlant: vi.fn(async () => null),
  uploadPhotoDataUrl: vi.fn(),
}));

const appState = {
  lastSeenChangeVersion: 0,
  setGardenContext: vi.fn(),
  setLastSuccessfulSyncAt: vi.fn(),
  setLastSeenChangeVersion: vi.fn((version: number) => {
    appState.lastSeenChangeVersion = version;
  }),
};

vi.mock("../stores/app", () => ({
  useAppStore: {
    getState: () => appState,
  },
}));

vi.mock("./db", () => ({
  db: {
    plants: {
      get: vi.fn(async (id: string) => plants.get(id)),
      delete: vi.fn(async (id: string) => {
        plants.delete(id);
      }),
      put: vi.fn(async (plant: LocalPlant) => {
        plants.set(plant.id, plant);
      }),
      where: vi.fn((field: "locationId") => ({
        equals: (value: string) => ({
          toArray: async () =>
            Array.from(plants.values()).filter((plant) => plant[field] === value),
        }),
      })),
    },
    careEvents: {
      where: vi.fn((field: "plantId") => ({
        equals: (value: string) => ({
          toArray: async () =>
            Array.from(careEvents.values()).filter((event) => event[field] === value),
        }),
      })),
      put: vi.fn(async (event: { id: string; plantId: string; type: string; performedAt: string }) => {
        careEvents.set(event.id, event);
      }),
    },
    locations: {
      delete: vi.fn(async (id: string) => {
        locations.delete(id);
      }),
      put: vi.fn(async (location: { id: string; name: string; gardenId: string }) => {
        locations.set(location.id, location);
      }),
    },
    pendingActions: {
      orderBy: vi.fn(() => ({
        toArray: async () =>
          [...pendingActions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      })),
      toArray: vi.fn(async () => [...pendingActions]),
      update: vi.fn(async (id: string, changes: Partial<PendingAction>) => {
        const index = pendingActions.findIndex((action) => action.id === id);
        if (index >= 0) {
          pendingActions[index] = {
            ...pendingActions[index],
            ...changes,
          };
        }
      }),
      count: vi.fn(async () => pendingActions.length),
    },
  },
  hydrateBootstrapToLocal: vi.fn(),
  applyChangeSetToLocal: vi.fn(),
  removeAction: vi.fn(async (id: string) => {
    const index = pendingActions.findIndex((action) => action.id === id);
    if (index >= 0) {
      pendingActions.splice(index, 1);
    }
  }),
}));

import api from "./api";
import { cachePhotoForPlant, uploadPhotoDataUrl } from "./photos";
import { applyChangeSetToLocal } from "./db";
import { flushPendingActions, syncRemoteChanges } from "./sync";

const basePlant: LocalPlant = {
  id: "temp-plant",
  name: "Monstera",
  archived: false,
  photoUrl: null,
  cachedPhotoUrl: "data:image/jpeg;base64,abc",
  notes: null,
  gardenId: "local-garden",
  locationId: "temp-location",
  location: null,
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
  createdAt: "2026-03-30T10:00:00.000Z",
  updatedAt: "2026-03-30T10:00:00.000Z",
  _localOnly: true,
};

describe("sync queue", () => {
  beforeEach(() => {
    pendingActions.length = 0;
    plants.clear();
    locations.clear();
    careEvents.clear();
    appState.lastSeenChangeVersion = 0;
    vi.clearAllMocks();
  });

  it("remaps temp location and plant ids across queued dependent actions", async () => {
    plants.set(basePlant.id, { ...basePlant });
    locations.set("temp-location", {
      id: "temp-location",
      name: "Salon",
      gardenId: "local-garden",
    });

    pendingActions.push(
      {
        id: "1",
        createdAt: "2026-03-30T10:00:00.000Z",
        retries: 0,
        lastError: null,
        action: { kind: "CREATE_LOCATION", payload: { tempId: "temp-location", name: "Salon" } },
      },
      {
        id: "2",
        createdAt: "2026-03-30T10:01:00.000Z",
        retries: 0,
        lastError: null,
        action: {
          kind: "CREATE_PLANT",
          payload: { tempId: "temp-plant", name: "Monstera", locationId: "temp-location" },
        },
      },
      {
        id: "3",
        createdAt: "2026-03-30T10:02:00.000Z",
        retries: 0,
        lastError: null,
        action: {
          kind: "RECORD_CARE",
          payload: { plantId: "temp-plant", type: "WATERING", performedAt: "2026-03-30T10:02:00.000Z" },
        },
      },
      {
        id: "4",
        createdAt: "2026-03-30T10:03:00.000Z",
        retries: 0,
        lastError: null,
        action: {
          kind: "UPLOAD_PHOTO",
          payload: { plantId: "temp-plant", photoDataUrl: "data:image/jpeg;base64,abc", filename: "leaf.jpg" },
        },
      },
    );

    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { id: "loc-server", name: "Salon", gardenId: "garden-1" } })
      .mockResolvedValueOnce({ data: { id: "plant-server" } })
      .mockResolvedValueOnce({ data: { id: "care-1" } });
    vi.mocked(uploadPhotoDataUrl).mockResolvedValue("/uploads/leaf.jpg");

    const result = await flushPendingActions();

    expect(api.post).toHaveBeenNthCalledWith(1, "/locations", { name: "Salon" });
    expect(api.post).toHaveBeenNthCalledWith(2, "/plants", { name: "Monstera", locationId: "loc-server" });
    expect(api.post).toHaveBeenNthCalledWith(3, "/care", {
      plantId: "plant-server",
      type: "WATERING",
      performedAt: "2026-03-30T10:02:00.000Z",
    });
    expect(uploadPhotoDataUrl).toHaveBeenCalledWith(
      "plant-server",
      "data:image/jpeg;base64,abc",
      "leaf.jpg",
    );
    expect(plants.has("temp-plant")).toBe(false);
    expect(plants.has("plant-server")).toBe(true);
    expect(result).toEqual({ success: 4, failed: 0, remaining: 0 });
  });

  it("retains permanently failing actions in the queue", async () => {
    pendingActions.push({
      id: "bad-update",
      createdAt: "2026-03-30T11:00:00.000Z",
      retries: 0,
      lastError: null,
      action: { kind: "UPDATE_PLANT", payload: { id: "missing-plant", name: "Ghost" } },
    });

    vi.mocked(api.patch).mockRejectedValue({ response: { status: 404 } });

    const result = await flushPendingActions();

    expect(result).toEqual({ success: 0, failed: 1, remaining: 1 });
    expect(pendingActions[0]?.lastError).toBe("Permanent failure (404)");
    expect(pendingActions[0]?.action).toEqual({
      kind: "UPDATE_PLANT",
      payload: { id: "missing-plant", name: "Ghost" },
    });
  });

  it("applies remote deltas only when a newer change version exists", async () => {
    const changeSet: ChangeSetPayload = {
      since: 0,
      currentVersion: 4,
      generatedAt: new Date().toISOString(),
      changes: {
        plants: [
          {
            ...basePlant,
            id: "remote-plant",
            name: "Calathea",
            photoUrl: "/uploads/calathea.jpg",
          },
        ],
        deletedPlantIds: [],
        locations: [],
        deletedLocationIds: [],
        careEvents: [],
        deletedCareEventIds: [],
      },
    };

    vi.mocked(api.get).mockResolvedValue({ data: changeSet });

    const first = await syncRemoteChanges();
    const second = await syncRemoteChanges();

    expect(first?.currentVersion).toBe(4);
    expect(second).toBeNull();
    expect(applyChangeSetToLocal).toHaveBeenCalledTimes(1);
    expect(cachePhotoForPlant).toHaveBeenCalledWith("remote-plant", "/uploads/calathea.jpg");
    expect(appState.setLastSeenChangeVersion).toHaveBeenCalledWith(4);
  });
});
