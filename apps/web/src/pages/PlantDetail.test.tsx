import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plant } from "@plantcare/shared";

vi.mock("../hooks/usePlants", () => ({
  usePlant: vi.fn(),
  usePlants: vi.fn(),
}));

vi.mock("../hooks/useCare", () => ({
  useCareEvents: vi.fn(() => ({ data: [] })),
  useRecordCare: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useUndoCare: vi.fn(() => ({ mutateAsync: vi.fn() })),
}));

vi.mock("../components/IdentifyModal", () => ({
  default: () => null,
}));

vi.mock("../lib/api", () => ({
  default: {
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import api from "../lib/api";
import { usePlant, usePlants } from "../hooks/usePlants";
import { useAuthStore } from "../stores/auth";
import PlantDetail from "./PlantDetail";

const targetPlant: Plant = {
  id: "plant-1",
  name: "Monstera",
  archived: false,
  photoUrl: "/uploads/monstera.jpg",
  notes: "Belle plante",
  gardenId: "garden-1",
  locationId: "loc-1",
  location: { id: "loc-1", name: "Salon", gardenId: "garden-1" },
  wateringFreqDays: 7,
  fertilizingFreqDays: 30,
  wateringFreqByMonth: null,
  fertilizingFreqByMonth: null,
  lastWatered: null,
  lastFertilized: null,
  needsWatering: false,
  needsFertilizing: false,
  currentWateringFreq: 7,
  currentFertilizingFreq: 30,
  createdAt: "2026-03-26T10:00:00.000Z",
  updatedAt: "2026-03-26T10:00:00.000Z",
};

const siblingPlant: Plant = {
  ...targetPlant,
  id: "plant-2",
  name: "Pothos",
  photoUrl: null,
};

function renderPlantDetail(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <Routes>
          <Route path="/" element={<div>Accueil test</div>} />
          <Route path="/plants/:id" element={<PlantDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PlantDetail cache updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: "user-1", email: "user@example.com", name: "User", createdAt: "2026-03-26T10:00:00.000Z" },
      accessToken: "token",
      activeGardenId: "garden-1",
    });
    vi.mocked(usePlant).mockReturnValue({ data: targetPlant, isLoading: false } as never);
    vi.mocked(usePlants).mockReturnValue({
      plants: [targetPlant, siblingPlant],
      isLoading: false,
    } as never);
  });

  it("invalidates plant and list queries after archiving, then navigates home", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { ...targetPlant, archived: true } });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderPlantDetail(queryClient);

    fireEvent.click(screen.getByLabelText("Ouvrir le menu de la plante"));
    fireEvent.click(screen.getByRole("button", { name: "Archiver la plante" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(`/plants/${targetPlant.id}`, { archived: true })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["plant", targetPlant.id] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["plants", "garden-1"] });
    await screen.findByText("Accueil test");
  });

  it("removes the deleted plant from the cached list before navigating home", async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { ok: true } });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["plants", "garden-1"], [targetPlant, siblingPlant]);

    renderPlantDetail(queryClient);

    fireEvent.click(screen.getByLabelText("Ouvrir le menu de la plante"));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer la plante" }));
    fireEvent.click(screen.getByRole("button", { name: /^Supprimer$/ }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(`/plants/${targetPlant.id}`));
    expect(queryClient.getQueryData(["plants", "garden-1"])).toEqual([siblingPlant]);
    await screen.findByText("Accueil test");
  });
});
