import Dexie, { Table } from "dexie";
import type { Plant, CareEvent, Location, Garden, PendingAction } from "@plantcare/shared";

export class PlantCareDB extends Dexie {
  plants!: Table<Plant & { _localOnly?: boolean }>;
  careEvents!: Table<CareEvent & { _localOnly?: boolean }>;
  locations!: Table<Location>;
  gardens!: Table<Garden>;
  pendingActions!: Table<PendingAction>;

  constructor() {
    super("PlantCareDB");
    this.version(1).stores({
      plants: "id, gardenId, locationId, archived, name",
      careEvents: "id, plantId, type, performedAt, userId",
      locations: "id, gardenId",
      gardens: "id",
      pendingActions: "id, createdAt",
    });
  }
}

export const db = new PlantCareDB();

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function syncPlantsToLocal(plants: Plant[]) {
  await db.plants.bulkPut(plants);
}

export async function syncCareEventsToLocal(events: CareEvent[]) {
  await db.careEvents.bulkPut(events);
}

export async function syncLocationsToLocal(locations: Location[]) {
  await db.locations.bulkPut(locations);
}

export async function syncGardensToLocal(gardens: Garden[]) {
  await db.gardens.bulkPut(gardens);
}

export async function queueAction(action: PendingAction["action"]) {
  const id = crypto.randomUUID();
  await db.pendingActions.add({
    id,
    action,
    createdAt: new Date().toISOString(),
    retries: 0,
  });
  return id;
}

export async function removeAction(id: string) {
  await db.pendingActions.delete(id);
}
