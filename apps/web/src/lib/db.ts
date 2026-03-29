import Dexie, { Table } from "dexie";
import type { BootstrapPayload, CareEvent, LocalPlant, Location, PendingAction } from "@plantcare/shared";

export class PlantCareDB extends Dexie {
  plants!: Table<LocalPlant>;
  careEvents!: Table<CareEvent & { _localOnly?: boolean }>;
  locations!: Table<Location>;
  pendingActions!: Table<PendingAction>;

  constructor() {
    super("PlantCareDB");
    this.version(2).stores({
      plants: "id, gardenId, locationId, archived, name",
      careEvents: "id, plantId, type, performedAt, userId",
      locations: "id, gardenId",
      pendingActions: "id, createdAt",
    });
  }
}

export const db = new PlantCareDB();

export async function hydrateBootstrapToLocal(snapshot: BootstrapPayload) {
  await db.transaction("rw", db.plants, db.locations, db.careEvents, async () => {
    await db.plants.clear();
    await db.locations.clear();
    await db.careEvents.clear();
    await db.plants.bulkPut(snapshot.plants as LocalPlant[]);
    await db.locations.bulkPut(snapshot.locations);
    await db.careEvents.bulkPut(snapshot.careEvents);
  });
}

export async function syncPlantsToLocal(plants: LocalPlant[]) {
  await db.plants.bulkPut(plants);
}

export async function syncCareEventsToLocal(events: CareEvent[]) {
  await db.careEvents.bulkPut(events);
}

export async function syncLocationsToLocal(locations: Location[]) {
  await db.locations.bulkPut(locations);
}

export async function queueAction(action: PendingAction["action"]) {
  const id = crypto.randomUUID();
  await db.pendingActions.add({
    id,
    action,
    createdAt: new Date().toISOString(),
    retries: 0,
    lastError: null,
  });
  return id;
}

export async function removeAction(id: string) {
  await db.pendingActions.delete(id);
}

export async function getLocalSnapshotInfo() {
  const [plantCount, locationCount, careEventCount, firstPlant] = await Promise.all([
    db.plants.count(),
    db.locations.count(),
    db.careEvents.count(),
    db.plants.orderBy("createdAt").first(),
  ]);

  return {
    hasLocalData: plantCount > 0 || locationCount > 0 || careEventCount > 0,
    plantCount,
    locationCount,
    careEventCount,
    firstPlant,
  };
}
