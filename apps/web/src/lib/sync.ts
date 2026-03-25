import api from "./api";
import { db, removeAction } from "./db";
import type { PendingAction } from "@plantcare/shared";

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
    case "CREATE_PLANT":
      await api.post("/plants", action.payload);
      break;
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
  }
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
      // 4xx errors won't succeed on retry → drop them
      if (status && status >= 400 && status < 500) {
        await removeAction(action.id);
        failed++;
      } else if (action.retries >= MAX_RETRIES) {
        await removeAction(action.id);
        failed++;
      } else {
        await db.pendingActions.update(action.id, { retries: action.retries + 1 });
        failed++;
      }
    }
    onProgress?.(success + failed, pending.length);
  }

  return { success, failed };
}

// Listen for online event and auto-flush
export function initOfflineSync(onFlush?: (result: { success: number; failed: number }) => void) {
  const handleOnline = async () => {
    const result = await flushPendingActions();
    if (result.success > 0 || result.failed > 0) {
      onFlush?.(result);
    }
  };

  window.addEventListener("online", handleOnline);
  // Also try on init (in case actions queued and page reloaded)
  if (navigator.onLine) {
    setTimeout(handleOnline, 2000);
  }

  return () => window.removeEventListener("online", handleOnline);
}
