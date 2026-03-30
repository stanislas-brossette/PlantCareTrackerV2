import api from "./api";
import { applyChangeSetToLocal, db, hydrateBootstrapToLocal, removeAction } from "./db";
import { cacheAllPlantPhotos, cachePhotoForPlant, uploadPhotoDataUrl } from "./photos";
import type { BootstrapPayload, ChangeSetPayload, Location, PendingAction } from "@plantcare/shared";
import { useAppStore } from "../stores/app";
import { getApiBaseUrl } from "./serverConfig";

const MAX_RETRIES = 5;
let realtimeApplyPromise: Promise<ChangeSetPayload | null> | null = null;

type IdRemapState = {
  plantIds: Map<string, string>;
  locationIds: Map<string, string>;
};

function isTerminalFailure(lastError: string | null | undefined) {
  return (
    lastError?.startsWith("Permanent failure") === true ||
    lastError === "Exceeded retry budget"
  );
}

function remapAction(action: PendingAction["action"], remaps: IdRemapState): PendingAction["action"] {
  switch (action.kind) {
    case "RECORD_CARE":
      return {
        kind: "RECORD_CARE",
        payload: {
          ...action.payload,
          plantId: remaps.plantIds.get(action.payload.plantId) ?? action.payload.plantId,
        },
      };
    case "UNDO_CARE":
      return {
        kind: "UNDO_CARE",
        payload: {
          ...action.payload,
          plantId: remaps.plantIds.get(action.payload.plantId) ?? action.payload.plantId,
        },
      };
    case "CREATE_PLANT":
      return {
        kind: "CREATE_PLANT",
        payload: {
          ...action.payload,
          locationId: action.payload.locationId
            ? remaps.locationIds.get(action.payload.locationId) ?? action.payload.locationId
            : action.payload.locationId,
        },
      };
    case "UPDATE_PLANT":
      return {
        kind: "UPDATE_PLANT",
        payload: {
          ...action.payload,
          id: remaps.plantIds.get(action.payload.id) ?? action.payload.id,
          locationId: action.payload.locationId
            ? remaps.locationIds.get(action.payload.locationId) ?? action.payload.locationId
            : action.payload.locationId,
        },
      };
    case "DELETE_PLANT":
      return {
        kind: "DELETE_PLANT",
        payload: {
          id: remaps.plantIds.get(action.payload.id) ?? action.payload.id,
        },
      };
    case "CREATE_LOCATION":
      return action;
    case "DELETE_LOCATION":
      return {
        kind: "DELETE_LOCATION",
        payload: {
          id: remaps.locationIds.get(action.payload.id) ?? action.payload.id,
        },
      };
    case "UPLOAD_PHOTO":
      return {
        kind: "UPLOAD_PHOTO",
        payload: {
          ...action.payload,
          plantId: remaps.plantIds.get(action.payload.plantId) ?? action.payload.plantId,
        },
      };
  }
}

async function replacePlantIdReferences(tempId: string, serverId: string) {
  const [localPlant, careEvents, pendingActions] = await Promise.all([
    db.plants.get(tempId),
    db.careEvents.where("plantId").equals(tempId).toArray(),
    db.pendingActions.toArray(),
  ]);

  if (localPlant) {
    await db.plants.delete(tempId);
    await db.plants.put({
      ...localPlant,
      id: serverId,
      _localOnly: false,
    });
  }

  await Promise.all(
    careEvents.map((event) =>
      db.careEvents.put({
        ...event,
        plantId: serverId,
      }),
    ),
  );

  await Promise.all(
    pendingActions.map(async (pending) => {
      const remapped = remapAction(pending.action, {
        plantIds: new Map([[tempId, serverId]]),
        locationIds: new Map(),
      });

      if (JSON.stringify(remapped) !== JSON.stringify(pending.action)) {
        await db.pendingActions.update(pending.id, {
          action: remapped,
        });
      }
    }),
  );
}

async function replaceLocationIdReferences(tempId: string, location: Location) {
  const [pendingActions, plants] = await Promise.all([
    db.pendingActions.toArray(),
    db.plants.where("locationId").equals(tempId).toArray(),
  ]);

  await db.locations.delete(tempId);
  await db.locations.put(location);

  await Promise.all(
    plants.map((plant) =>
      db.plants.put({
        ...plant,
        locationId: location.id,
        location,
      }),
    ),
  );

  await Promise.all(
    pendingActions.map(async (pending) => {
      const remapped = remapAction(pending.action, {
        plantIds: new Map(),
        locationIds: new Map([[tempId, location.id]]),
      });

      if (JSON.stringify(remapped) !== JSON.stringify(pending.action)) {
        await db.pendingActions.update(pending.id, {
          action: remapped,
        });
      }
    }),
  );
}

async function executeAction(pending: PendingAction, remaps: IdRemapState): Promise<void> {
  const action = remapAction(pending.action, remaps);

  if (JSON.stringify(action) !== JSON.stringify(pending.action)) {
    await db.pendingActions.update(pending.id, {
      action,
    });
  }

  switch (action.kind) {
    case "RECORD_CARE":
      await api.post("/care", action.payload);
      break;
    case "UNDO_CARE":
      await api.delete("/care/undo", {
        params: { plantId: action.payload.plantId, type: action.payload.type },
      });
      break;
    case "CREATE_PLANT": {
      const { tempId, ...payload } = action.payload;
      const res = await api.post<{ id: string }>("/plants", payload);
      remaps.plantIds.set(tempId, res.data.id);
      await replacePlantIdReferences(tempId, res.data.id);
      break;
    }
    case "UPDATE_PLANT": {
      const { id, ...rest } = action.payload;
      await api.patch(`/plants/${id}`, rest);
      break;
    }
    case "DELETE_PLANT":
      await api.delete(`/plants/${action.payload.id}`);
      break;
    case "CREATE_LOCATION": {
      const { tempId, ...payload } = action.payload;
      const res = await api.post<Location>("/locations", payload);
      remaps.locationIds.set(tempId, res.data.id);
      await replaceLocationIdReferences(tempId, res.data);
      break;
    }
    case "DELETE_LOCATION":
      await api.delete(`/locations/${action.payload.id}`);
      break;
    case "UPLOAD_PHOTO":
      await uploadPhotoDataUrl(
        action.payload.plantId,
        action.payload.photoDataUrl,
        action.payload.filename
      );
      break;
  }
}

export async function bootstrapFromServer() {
  const res = await api.get<BootstrapPayload>("/bootstrap");
  await hydrateBootstrapToLocal(res.data);
  await cacheAllPlantPhotos();
  const appState = useAppStore.getState();
  appState.setGardenContext(res.data.context.gardenId, res.data.context.gardenName);
  appState.setLastSuccessfulSyncAt(new Date().toISOString());
  appState.setLastSeenChangeVersion(res.data.changeVersion);
  return res.data;
}

export async function checkServerHealth(timeout = 1500) {
  const res = await api.get<{
    ok: boolean;
    ts: string;
    gardenId: string;
    gardenName: string;
    latestChangeVersion: number;
  }>("/health", {
    timeout,
  });
  return res.data;
}

export async function fetchChangesSince(since: number) {
  const res = await api.get<ChangeSetPayload>("/changes", {
    params: { since },
  });
  return res.data;
}

export async function applyRemoteChanges(changeSet: ChangeSetPayload) {
  if (changeSet.currentVersion <= useAppStore.getState().lastSeenChangeVersion) {
    return changeSet;
  }

  await applyChangeSetToLocal(changeSet);
  await Promise.all(
    changeSet.changes.plants.map((plant) => cachePhotoForPlant(plant.id, plant.photoUrl).catch(() => null)),
  );

  const appState = useAppStore.getState();
  if (changeSet.currentVersion > appState.lastSeenChangeVersion) {
    appState.setLastSeenChangeVersion(changeSet.currentVersion);
    appState.setLastSuccessfulSyncAt(new Date().toISOString());
  }

  return changeSet;
}

export async function syncRemoteChanges() {
  if (realtimeApplyPromise) {
    return realtimeApplyPromise;
  }

  realtimeApplyPromise = (async () => {
    const since = useAppStore.getState().lastSeenChangeVersion ?? 0;
    const changeSet = await fetchChangesSince(since);
    if (changeSet.currentVersion <= since) {
      return null;
    }

    await applyRemoteChanges(changeSet);
    return changeSet;
  })();

  try {
    return await realtimeApplyPromise;
  } finally {
    realtimeApplyPromise = null;
  }
}

export function subscribeToServerEvents(handlers: {
  onVersion: (version: number) => void;
  onDisconnect?: () => void;
}) {
  const url = new URL(`${getApiBaseUrl()}/events`);
  const source = new EventSource(url.toString());

  source.addEventListener("change", (event) => {
    try {
      const data = JSON.parse((event as MessageEvent<string>).data) as { version?: number };
      if (typeof data.version === "number") {
        handlers.onVersion(data.version);
      }
    } catch {
      // Ignore malformed events.
    }
  });

  source.onerror = () => {
    handlers.onDisconnect?.();
    source.close();
  };

  return () => source.close();
}

export async function flushPendingActions(
  onProgress?: (done: number, total: number) => void
): Promise<{ success: number; failed: number; remaining: number }> {
  const allPending = await db.pendingActions.orderBy("createdAt").toArray();
  const pending = allPending.filter((action) => !isTerminalFailure(action.lastError));
  if (allPending.length === 0) return { success: 0, failed: 0, remaining: 0 };
  if (pending.length === 0) return { success: 0, failed: 0, remaining: allPending.length };

  let success = 0;
  let failed = 0;
  const remaps: IdRemapState = {
    plantIds: new Map(),
    locationIds: new Map(),
  };

  for (const action of pending) {
    try {
      await executeAction(action, remaps);
      await removeAction(action.id);
      success++;
    } catch (err: unknown) {
      const status = (err as { response?: { status: number } }).response?.status;
      if (status && status >= 400 && status < 500) {
        await db.pendingActions.update(action.id, {
          lastError: `Permanent failure (${status})`,
          retries: action.retries + 1,
        });
        failed++;
      } else if (action.retries + 1 >= MAX_RETRIES) {
        await db.pendingActions.update(action.id, {
          lastError: "Exceeded retry budget",
          retries: action.retries + 1,
        });
        failed++;
      } else {
        await db.pendingActions.update(action.id, {
          retries: action.retries + 1,
          lastError: "Temporary sync failure",
        });
        failed++;
      }
    }
    onProgress?.(success + failed, pending.length);
  }

  const remaining = await db.pendingActions.count();
  return { success, failed, remaining };
}

export async function runFullResync() {
  await checkServerHealth();
  const queued = await flushPendingActions();
  const bootstrap = queued.remaining === 0 ? await bootstrapFromServer() : null;
  if (!bootstrap) {
    await syncRemoteChanges();
  }

  return {
    bootstrap,
    queued,
  };
}

export function initOfflineSync(onFlush?: (result: { success: number; failed: number }) => void) {
  const handleOnline = async () => {
    const result = await flushPendingActions();
    if (result.success > 0 || result.failed > 0) {
      onFlush?.(result);
    }
  };

  window.addEventListener("online", handleOnline);
  if (navigator.onLine) {
    setTimeout(handleOnline, 2000);
  }

  return () => window.removeEventListener("online", handleOnline);
}
