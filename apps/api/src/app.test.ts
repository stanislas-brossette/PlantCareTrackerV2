import { afterEach, describe, expect, it, vi } from "vitest";

const defaultIdentification = {
  nom_commun: "Monstera deliciosa",
  nom_latin: "Monstera deliciosa",
  famille: "Araceae",
  description: "Grande plante tropicale.",
  arrosage: "Arroser quand le terreau seche en surface.",
  arrosage_freq_par_mois: [10, 10, 9, 8, 7, 7, 7, 7, 8, 9, 10, 10],
  fertilisation: "Engrais mensuel au printemps et en ete.",
  fertilisation_freq_par_mois: [0, 0, 30, 30, 21, 21, 21, 21, 30, 0, 0, 0],
};

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify(defaultIdentification) } }],
        }),
      },
    };
  }

  return { default: MockOpenAI };
});

import { buildMultipartBody, createTestApp } from "./test/testApp.js";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe.sequential("MVP API", () => {
  it("bootstraps local-household data and records care events", async () => {
    const ctx = await createTestApp();
    cleanup = ctx.cleanup;

    const createdPlant = await ctx.app.inject({
      method: "POST",
      url: "/api/plants",
      payload: { name: "Monstera", wateringFreqDays: 7 },
    });
    expect(createdPlant.statusCode).toBe(201);

    const care = await ctx.app.inject({
      method: "POST",
      url: "/api/care",
      payload: { plantId: createdPlant.json().id, type: "WATERING" },
    });
    expect(care.statusCode).toBe(201);

    const bootstrap = await ctx.app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().plants).toHaveLength(1);
    expect(bootstrap.json().careEvents).toHaveLength(1);
    expect(bootstrap.json().context.gardenName).toBeTruthy();
  });

  it("returns AI identification preview from an uploaded photo", async () => {
    const ctx = await createTestApp();
    cleanup = ctx.cleanup;

    const { boundary, payload } = buildMultipartBody(
      "file",
      "leaf.jpg",
      "image/jpeg",
      Buffer.from("fake-image-content")
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/identify/preview",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().identification.nom_commun).toBe("Monstera deliciosa");
  });
});
