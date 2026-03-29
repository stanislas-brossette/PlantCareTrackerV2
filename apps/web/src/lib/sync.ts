import api from "./api";
import { db, hydrateBootstrapToLocal, removeAction } from "./db";
import { cacheAllPlantPhotos, uploadPhotoDataUrl } from "./photos";
import type { BootstrapPayload, PendingAction } from "@plantcare/shared";
import { useAppStore } from "../stores/app";

const MAX_RETRIES = 5;

async function executeAction(pending: PendingAction): Promise<void> {
  const { action } = pending;

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
      const localPlant = await db.plants.get(tempId);
      await db.plants.delete(tempId);
      if (localPlant) {
        await db.plants.put({
          ...localPlant,
          id: res.data.id,
          _localOnly: false,
        });
      }
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
    case "CREATE_LOCATION":
      await api.post("/locations", action.payload);
      break;
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
  useAppStore.getState().setGardenContext(res.data.context.gardenId, res.data.context.gardenName);
  useAppStore.getState().setLastSuccessfulSyncAt(new Date().toISOString());
  return res.data;
}

export async function checkServerHealth() {
  const res = await api.get<{
    ok: boolean;
    ts: string;
    gardenId: string;
    gardenName: string;
  }>("/health");
  return res.data;
}

export async function flushPendingActions(
  onProgress?: (done: number, total: number) => void
): Promise<{ success: number; failed: number }> {
  const pending = await db.pendingActions.orderBy("createdAt").toArray();
  if (pending.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  for (const action of pending) {
    try {
      await executeAction(action);
      await removeAction(action.id);
      success++;
    } catch (err: unknown) {
      const status = (err as { response?: { status: number } }).response?.status;
      if (status && status >= 400 && status < 500) {
        await db.pendingActions.update(action.id, {
          lastError: `Permanent failure (${status})`,
        });
        await removeAction(action.id);
        failed++;
      } else if (action.retries >= MAX_RETRIES) {
        await db.pendingActions.update(action.id, {
          lastError: "Exceeded retry budget",
        });
        await removeAction(action.id);
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

  if (success > 0) {
    await bootstrapFromServer();
  }

  return { success, failed };
}

export async function runFullResync() {
  const bootstrap = await bootstrapFromServer();
  const queued = await flushPendingActions();

  if (queued.success > 0) {
    await bootstrapFromServer();
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
