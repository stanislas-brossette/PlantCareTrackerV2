import { create } from "zustand";

interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  setOnline: (v: boolean) => void;
  setPendingCount: (n: number) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: navigator.onLine,
  pendingCount: 0,
  setOnline: (isOnline) => set({ isOnline }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
}));
