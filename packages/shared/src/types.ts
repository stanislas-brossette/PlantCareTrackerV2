export type { CareType } from "./schemas";
import type { CareType } from "./schemas";

export interface MvpContext {
  gardenId: string;
  gardenName: string;
}

export interface Location {
  id: string;
  name: string;
  gardenId: string;
}

export interface Plant {
  id: string;
  name: string;
  photoUrl: string | null;
  notes: string | null;
  wateringFreqDays: number | null;
  fertilizingFreqDays: number | null;
  wateringFreqByMonth: number[] | null;
  fertilizingFreqByMonth: number[] | null;
  archived: boolean;
  gardenId: string;
  locationId: string | null;
  location: Location | null;
  createdAt: string;
  updatedAt: string;
  lastWatered: string | null;
  lastFertilized: string | null;
  needsWatering: boolean;
  needsFertilizing: boolean;
  currentWateringFreq: number | null;
  currentFertilizingFreq: number | null;
}

export interface LocalPlant extends Plant {
  cachedPhotoUrl?: string | null;
  _localOnly?: boolean;
}

export interface CareEvent {
  id: string;
  type: CareType;
  plantId: string;
  userId: string;
  performedAt: string;
  note: string | null;
}

export interface CreatePlantBody {
  name: string;
  notes?: string;
  wateringFreqDays?: number;
  fertilizingFreqDays?: number;
  wateringFreqByMonth?: number[];
  fertilizingFreqByMonth?: number[];
  locationId?: string;
}

export interface UpdatePlantBody extends Partial<CreatePlantBody> {
  archived?: boolean;
  photoUrl?: string;
}

export interface CreateLocationBody {
  name: string;
}

export interface RecordCareBody {
  type: CareType;
  plantId: string;
  performedAt?: string;
  note?: string;
}

export interface UndoCareBody {
  plantId: string;
  type: CareType;
}

export interface BootstrapPayload {
  context: MvpContext;
  plants: Plant[];
  locations: Location[];
  careEvents: CareEvent[];
  generatedAt: string;
}

export interface ServerConfig {
  serverHost: string;
  serverPort: string;
  protocol: "http" | "https";
  lastSuccessfulSyncAt: string | null;
}

export type SyncAction =
  | { kind: "RECORD_CARE"; payload: RecordCareBody }
  | { kind: "UNDO_CARE"; payload: UndoCareBody }
  | { kind: "CREATE_PLANT"; payload: CreatePlantBody & { tempId: string } }
  | { kind: "UPDATE_PLANT"; payload: { id: string } & UpdatePlantBody }
  | { kind: "DELETE_PLANT"; payload: { id: string } }
  | { kind: "CREATE_LOCATION"; payload: CreateLocationBody & { tempId: string } }
  | { kind: "DELETE_LOCATION"; payload: { id: string } }
  | { kind: "UPLOAD_PHOTO"; payload: { plantId: string; photoDataUrl: string; filename: string } };

export interface PendingAction {
  id: string;
  action: SyncAction;
  createdAt: string;
  retries: number;
  lastError?: string | null;
}
