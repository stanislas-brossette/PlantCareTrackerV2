import { create } from "zustand";

interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncError: string | null;
  setOnline: (v: boolean) => void;
  setSyncing: (v: boolean) => void;
  setPendingCount: (n: number) => void;
  setLastSyncError: (value: string | null) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: false,
  isSyncing: false,
  pendingCount: 0,
  lastSyncError: null,
  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncError: (lastSyncError) => set({ lastSyncError }),
}));
