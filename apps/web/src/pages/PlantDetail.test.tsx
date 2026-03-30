import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { LocalPlant } from "@plantcare/shared";

vi.mock("../hooks/usePlants", () => ({
  usePlant: vi.fn(),
  usePlants: vi.fn(),
}));

vi.mock("../hooks/useCare", () => ({
  useCareEvents: vi.fn(),
  useRecordCare: vi.fn(),
  useUndoCare: vi.fn(),
}));

vi.mock("../stores/offline", () => ({
  useOfflineStore: vi.fn(),
}));

vi.mock("../components/IdentifyModal", () => ({
  default: () => null,
}));

vi.mock("../lib/haptics", () => ({
  triggerLightHaptic: vi.fn(),
}));

vi.mock("../lib/serverConfig", () => ({
  resolveAssetUrl: vi.fn((value: string | null) => value),
}));

import PlantDetail from "./PlantDetail";
import { usePlant, usePlants } from "../hooks/usePlants";
import { useCareEvents, useRecordCare, useUndoCare } from "../hooks/useCare";
import { useOfflineStore } from "../stores/offline";

const plant: LocalPlant = {
  id: "plant-1",
  name: "Monstera",
  archived: false,
  photoUrl: null,
  cachedPhotoUrl: null,
  notes: "Coin salon",
  gardenId: "garden-1",
  locationId: "loc-1",
  location: { id: "loc-1", name: "Salon", gardenId: "garden-1" },
  wateringFreqDays: 7,
  fertilizingFreqDays: 30,
  wateringFreqByMonth: [10, 10, 9, 8, 7, 6, 6, 6, 7, 8, 9, 10],
  fertilizingFreqByMonth: [0, 0, 30, 21, 21, 14, 14, 14, 21, 30, 0, 0],
  lastWatered: null,
  lastFertilized: null,
  needsWatering: false,
  needsFertilizing: false,
  currentWateringFreq: 7,
  currentFertilizingFreq: 30,
  createdAt: "2026-03-26T10:00:00.000Z",
  updatedAt: "2026-03-26T10:00:00.000Z",
};

function renderWithProviders(ui: ReactNode, initialEntries = ["/plants/plant-1"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/plants/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PlantDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePlant).mockReturnValue({
      data: plant,
      isLoading: false,
    } as unknown as ReturnType<typeof usePlant>);
    vi.mocked(usePlants).mockReturnValue({
      plants: [plant],
      isLoading: false,
      createPlant: { mutateAsync: vi.fn() },
      updatePlant: { mutateAsync: vi.fn() },
      deletePlant: { mutateAsync: vi.fn() },
    } as unknown as ReturnType<typeof usePlants>);
    vi.mocked(useCareEvents).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useCareEvents>);
    vi.mocked(useRecordCare).mockReturnValue({ mutateAsync: vi.fn() } as unknown as ReturnType<typeof useRecordCare>);
    vi.mocked(useUndoCare).mockReturnValue({ mutateAsync: vi.fn() } as unknown as ReturnType<typeof useUndoCare>);
    vi.mocked(useOfflineStore).mockImplementation((selector) =>
      selector({ isOnline: true } as never),
    );
  });

  it("renders plant details without crashing when opened directly", () => {
    renderWithProviders(<PlantDetail />);

    expect(screen.getByText("Monstera")).toBeInTheDocument();
    expect(screen.getByText("Coin salon")).toBeInTheDocument();
  });

  it("renders plant details when navigated to with swipe direction state", () => {
    renderWithProviders(<PlantDetail />, [{ pathname: "/plants/plant-1", state: { direction: "next" } } as never]);

    expect(screen.getByText("Monstera")).toBeInTheDocument();
  });

  it("shows watering and fertilizing histograms", () => {
    renderWithProviders(<PlantDetail />);

    expect(screen.getByText(/Planning d'arrosage/i)).toBeInTheDocument();
    expect(screen.getByText(/Planning de fertilisation/i)).toBeInTheDocument();
    expect(screen.getAllByText("Jan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dec").length).toBeGreaterThan(0);
  });
});
