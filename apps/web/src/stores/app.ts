import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_SERVER_HOST = "192.168.1.123";
const DEFAULT_SERVER_PORT = "3000";

interface AppState {
  gardenId: string | null;
  gardenName: string | null;
  serverHost: string;
  serverPort: string;
  protocol: "http" | "https";
  lastSuccessfulSyncAt: string | null;
  setupComplete: boolean;
  hasHydrated: boolean;
  hasLocalData: boolean;
  setGardenContext: (gardenId: string, gardenName: string) => void;
  setServerConfig: (config: {
    serverHost: string;
    serverPort: string;
    protocol?: "http" | "https";
  }) => void;
  setLastSuccessfulSyncAt: (value: string | null) => void;
  markSetupComplete: () => void;
  markHydrated: () => void;
  setHasLocalData: (value: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      gardenId: null,
      gardenName: null,
      serverHost: DEFAULT_SERVER_HOST,
      serverPort: DEFAULT_SERVER_PORT,
      protocol: "http",
      lastSuccessfulSyncAt: null,
      setupComplete: true,
      hasHydrated: false,
      hasLocalData: false,
      setGardenContext: (gardenId, gardenName) => set({ gardenId, gardenName }),
      setServerConfig: ({ serverHost, serverPort, protocol = "http" }) =>
        set({
          serverHost: serverHost.trim(),
          serverPort: serverPort.trim() || "3000",
          protocol,
        }),
      setLastSuccessfulSyncAt: (lastSuccessfulSyncAt) => set({ lastSuccessfulSyncAt }),
      markSetupComplete: () => set({ setupComplete: true }),
      markHydrated: () => set({ hasHydrated: true }),
      setHasLocalData: (hasLocalData) => set({ hasLocalData }),
    }),
    {
      name: "plantcaretrackerv2-app",
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    }
  )
);
