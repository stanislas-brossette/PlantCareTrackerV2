import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock("../lib/sync", () => ({
  bootstrapFromServer: vi.fn(),
  checkServerHealth: vi.fn(),
  flushPendingActions: vi.fn(),
}));

import { useLiveQuery } from "dexie-react-hooks";
import { bootstrapFromServer, checkServerHealth, flushPendingActions } from "../lib/sync";
import { useAppStore } from "../stores/app";
import { useOfflineStore } from "../stores/offline";
import { useOfflineSync } from "./useOfflineSync";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("useOfflineSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLiveQuery).mockReturnValue(0);
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    useAppStore.setState({
      gardenId: "garden-1",
      gardenName: "Maison",
      serverHost: "192.168.1.42",
      serverPort: "3000",
      protocol: "http",
      lastSuccessfulSyncAt: null,
      setupComplete: true,
      hasHydrated: true,
      hasLocalData: true,
    });
    useOfflineStore.setState({
      isOnline: false,
      isSyncing: false,
      pendingCount: 0,
      lastSyncError: null,
    });
  });

  it("marks the app online only after the Pi health check succeeds", async () => {
    vi.mocked(checkServerHealth).mockResolvedValue({
      ok: true,
      ts: new Date().toISOString(),
      gardenId: "garden-1",
      gardenName: "Maison",
    });
    vi.mocked(bootstrapFromServer).mockResolvedValue({} as never);
    vi.mocked(flushPendingActions).mockResolvedValue({ success: 0, failed: 0 });

    const { wrapper } = createWrapper();
    renderHook(() => useOfflineSync(), { wrapper });

    await waitFor(() => expect(useOfflineStore.getState().isOnline).toBe(true));
    expect(checkServerHealth).toHaveBeenCalled();
    expect(bootstrapFromServer).toHaveBeenCalled();
  });

  it("stays offline and skips bootstrap when the Pi is unreachable", async () => {
    vi.mocked(checkServerHealth).mockRejectedValue(new Error("unreachable"));

    const { wrapper } = createWrapper();
    renderHook(() => useOfflineSync(), { wrapper });

    await waitFor(() =>
      expect(useOfflineStore.getState().lastSyncError).toBe("Serveur Raspberry Pi inaccessible")
    );

    expect(useOfflineStore.getState().isOnline).toBe(false);
    expect(bootstrapFromServer).not.toHaveBeenCalled();
  });
});
