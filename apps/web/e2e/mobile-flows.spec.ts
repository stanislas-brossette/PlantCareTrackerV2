import { expect, test } from "@playwright/test";

type MockPlant = {
  id: string;
  name: string;
  archived: boolean;
  photoUrl: string | null;
  notes: string | null;
  gardenId: string;
  locationId: string | null;
  location: { id: string; name: string; gardenId: string } | null;
  wateringFreqDays: number | null;
  fertilizingFreqDays: number | null;
  wateringFreqByMonth: number[] | null;
  fertilizingFreqByMonth: number[] | null;
  lastWatered: string | null;
  lastFertilized: string | null;
  needsWatering: boolean;
  needsFertilizing: boolean;
  currentWateringFreq: number | null;
  currentFertilizingFreq: number | null;
  createdAt: string;
  updatedAt: string;
};

function buildPlant(overrides: Partial<MockPlant>): MockPlant {
  return {
    id: "plant-1",
    name: "Monstera",
    archived: false,
    photoUrl: null,
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
    ...overrides,
  };
}

async function mockAppApi(page: Parameters<typeof test.beforeEach>[0]["page"], initialPlants: MockPlant[]) {
  const plants = [...initialPlants];

  await page.addInitScript(() => {
    localStorage.setItem(
      "plantcare-auth",
      JSON.stringify({
        state: {
          user: {
            id: "user-1",
            email: "user@example.com",
            name: "User",
            createdAt: "2026-03-26T10:00:00.000Z",
          },
          accessToken: "token",
          activeGardenId: "garden-1",
        },
        version: 0,
      })
    );

    window.confirm = () => true;
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === "/api/auth/logout") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (url.pathname === "/api/plants" && method === "GET") {
      const archived = url.searchParams.get("archived") === "true";
      const gardenId = url.searchParams.get("gardenId");
      const filtered = plants.filter(
        (plant) => plant.gardenId === gardenId && plant.archived === archived
      );
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(filtered) });
      return;
    }

    if (url.pathname.startsWith("/api/plants/")) {
      const plantId = url.pathname.split("/").pop()!;
      const plant = plants.find((entry) => entry.id === plantId);

      if (method === "GET") {
        await route.fulfill({
          status: plant ? 200 : 404,
          contentType: "application/json",
          body: JSON.stringify(plant ?? { error: "Not found" }),
        });
        return;
      }

      if (method === "PATCH" && plant) {
        const body = route.request().postDataJSON() as { archived?: boolean };
        plant.archived = body.archived ?? plant.archived;
        plant.updatedAt = "2026-03-26T11:00:00.000Z";
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(plant) });
        return;
      }

      if (method === "DELETE") {
        const index = plants.findIndex((entry) => entry.id === plantId);
        if (index >= 0) {
          plants.splice(index, 1);
        }
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
        return;
      }
    }

    if (url.pathname.startsWith("/api/care/plant/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

test("shows grouped plants on home and exposes archived plants on mobile", async ({ page }) => {
  await mockAppApi(page, [
    buildPlant({ id: "plant-1", name: "Monstera", location: { id: "loc-1", name: "Salon", gardenId: "garden-1" } }),
    buildPlant({ id: "plant-2", name: "Pothos", location: { id: "loc-2", name: "Balcon", gardenId: "garden-1" } }),
    buildPlant({ id: "plant-3", name: "ZZ", archived: true, location: null, locationId: null }),
  ]);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Mes plantes" })).toBeVisible();
  await expect(page.getByText("Salon")).toBeVisible();
  await expect(page.getByText("Balcon")).toBeVisible();
  await expect(page.getByText("Monstera")).toBeVisible();
  await expect(page.getByText("Pothos")).toBeVisible();

  await page.getByRole("button", { name: /Archivées \(1\)/ }).click();

  await expect(page.getByRole("heading", { name: "Plantes archivées" })).toBeVisible();
  await expect(page.getByText("ZZ")).toBeVisible();
  await expect(page.getByText("Sans emplacement")).toBeVisible();
});

test("archives then deletes a plant with immediate list updates on mobile", async ({ page }) => {
  await mockAppApi(page, [
    buildPlant({ id: "plant-1", name: "Monstera" }),
    buildPlant({ id: "plant-2", name: "Pothos" }),
  ]);

  await page.goto("/");
  await page.getByText("Monstera").click();

  await page.getByLabel("Ouvrir le menu de la plante").click();
  await page.getByRole("button", { name: "Archiver la plante" }).click();

  await expect(page.getByRole("heading", { name: "Mes plantes" })).toBeVisible();
  await expect(page.getByText("Monstera")).toHaveCount(0);

  await page.getByRole("button", { name: /Archivées \(1\)/ }).click();
  await expect(page.getByText("Monstera")).toBeVisible();

  await page.getByText("Monstera").click();
  await page.getByLabel("Ouvrir le menu de la plante").click();
  await page.getByRole("button", { name: "Supprimer la plante" }).click();

  await expect(page.getByRole("heading", { name: "Mes plantes" })).toBeVisible();
  await page.getByRole("button", { name: /Archivées \(0\)/ }).click();
  await expect(page.getByText("Monstera")).toHaveCount(0);
});
