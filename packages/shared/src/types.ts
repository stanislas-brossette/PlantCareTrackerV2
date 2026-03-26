export type { CareType, EditableGardenRole, GardenRole } from "./schemas";
import type { CareType, GardenRole } from "./schemas";

// ─── Domain models ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface Garden {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  memberCount?: number;
  plantCount?: number;
}

export interface GardenMember {
  userId: string;
  gardenId: string;
  role: GardenRole;
  user: Pick<User, "id" | "email" | "name">;
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
  // 12-value arrays, one per month (index 0 = January)
  wateringFreqByMonth: number[] | null;
  fertilizingFreqByMonth: number[] | null;
  archived: boolean;
  gardenId: string;
  locationId: string | null;
  location: Location | null;
  createdAt: string;
  updatedAt: string;
  // computed fields returned by API
  lastWatered: string | null;
  lastFertilized: string | null;
  needsWatering: boolean;
  needsFertilizing: boolean;
  // current month's effective frequency (computed by API)
  currentWateringFreq: number | null;
  currentFertilizingFreq: number | null;
}

export interface CareEvent {
  id: string;
  type: CareType;
  plantId: string;
  userId: string;
  performedAt: string;
  note: string | null;
  user?: Pick<User, "id" | "name" | "email">;
}

// ─── API payloads ─────────────────────────────────────────────────────────────

export interface RegisterBody {
  email: string;
  password: string;
  name?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface CreateGardenBody {
  name: string;
}

export interface InviteMemberBody {
  email: string;
  role: GardenRole;
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

// ─── Offline sync types ───────────────────────────────────────────────────────

export type SyncAction =
  | { kind: "RECORD_CARE"; payload: RecordCareBody }
  | { kind: "UNDO_CARE"; payload: UndoCareBody }
  | { kind: "CREATE_PLANT"; payload: CreatePlantBody & { gardenId: string; tempId: string } }
  | { kind: "UPDATE_PLANT"; payload: { id: string } & UpdatePlantBody }
  | { kind: "DELETE_PLANT"; payload: { id: string } }
  | { kind: "CREATE_LOCATION"; payload: CreateLocationBody & { gardenId: string } }
  | { kind: "DELETE_LOCATION"; payload: { id: string } };

export interface PendingAction {
  id: string; // local uuid
  action: SyncAction;
  createdAt: string;
  retries: number;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface PlantStats {
  plantId: string;
  plantName: string;
  wateringCount: number;
  fertilizingCount: number;
  avgWateringIntervalDays: number | null;
  lastCare: string | null;
  adherenceScore: number | null; // 0-100
}

export interface GardenStats {
  totalPlants: number;
  plantsNeedingAttention: number;
  careEventsThisWeek: number;
  careEventsThisMonth: number;
  plantStats: PlantStats[];
}

// ─── Push notifications ───────────────────────────────────────────────────────

export interface PushSubscriptionBody {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
