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
  lumiere: "Lumiere indirecte vive.",
  temperature: "18 a 28 C",
  toxicite: "Toxique pour animaux",
  conseils: "Eviter le plein soleil",
};

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  (globalThis as typeof globalThis & { __openaiMockIdentification?: unknown })
                    .__openaiMockIdentification ?? defaultIdentification
                ),
              },
            },
          ],
        }),
      },
    };
  }

  return { default: MockOpenAI };
});

import { createTestApp, registerUser, authHeader, buildMultipartBody } from "./test/testApp.js";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  delete (globalThis as typeof globalThis & { __openaiMockIdentification?: unknown })
    .__openaiMockIdentification;
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe.sequential("Critical API flows", () => {
  it("registers a user, creates a default garden, and returns /me", async () => {
    const ctx = await createTestApp();
    cleanup = ctx.cleanup;

    const { response, body, token } = await registerUser(ctx.app, {
      email: "alice@example.com",
      name: "Alice",
    });

    expect(response.statusCode).toBe(200);
    expect(body.user.email).toBe("alice@example.com");
    expect(token).toBeTruthy();

    const gardens = await ctx.app.prisma.garden.findMany({
      where: { ownerId: body.user.id },
      include: { members: true },
    });
    expect(gardens).toHaveLength(1);
    expect(gardens[0].members).toHaveLength(1);
    expect(gardens[0].members[0].role).toBe("OWNER");

    const me = await ctx.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeader(token),
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe("alice@example.com");
  });

  it("rejects invalid garden roles and accepts valid ones", async () => {
    const ctx = await createTestApp();
    cleanup = ctx.cleanup;

    const owner = await registerUser(ctx.app, { email: "owner@example.com", name: "Owner" });
    const invitee = await registerUser(ctx.app, { email: "member@example.com", name: "Member" });

    const garden = await ctx.app.prisma.garden.findFirstOrThrow({
      where: { ownerId: owner.body.user.id },
    });

    const invalidInvite = await ctx.app.inject({
      method: "POST",
      url: `/api/gardens/${garden.id}/members`,
      headers: authHeader(owner.token),
      payload: { email: "member@example.com", role: "ADMIN" },
    });
    expect(invalidInvite.statusCode).toBe(400);
    expect(invalidInvite.json().error).toBe("Invalid role");

    const validInvite = await ctx.app.inject({
      method: "POST",
      url: `/api/gardens/${garden.id}/members`,
      headers: authHeader(owner.token),
      payload: { email: "member@example.com", role: "EDITOR" },
    });
    expect(validInvite.statusCode).toBe(201);
    expect(validInvite.json().role).toBe("EDITOR");

    const invalidUpdate = await ctx.app.inject({
      method: "PATCH",
      url: `/api/gardens/${garden.id}/members/${invitee.body.user.id}`,
      headers: authHeader(owner.token),
      payload: { role: "SUPER_OWNER" },
    });
    expect(invalidUpdate.statusCode).toBe(400);
    expect(invalidUpdate.json().error).toBe("Invalid role");
  });

  it("validates care type and performedAt, then records and undoes a care event", async () => {
    const ctx = await createTestApp();
    cleanup = ctx.cleanup;

    const owner = await registerUser(ctx.app, { email: "care@example.com", name: "Care" });
    const garden = await ctx.app.prisma.garden.findFirstOrThrow({
      where: { ownerId: owner.body.user.id },
    });
    const plant = await ctx.app.prisma.plant.create({
      data: {
        name: "Test Plant",
        gardenId: garden.id,
      },
    });

    const invalidType = await ctx.app.inject({
      method: "POST",
      url: "/api/care",
      headers: authHeader(owner.token),
      payload: { plantId: plant.id, type: "MISTING" },
    });
    expect(invalidType.statusCode).toBe(400);
    expect(invalidType.json().error).toBe("Invalid care type");

    const invalidDate = await ctx.app.inject({
      method: "POST",
      url: "/api/care",
      headers: authHeader(owner.token),
      payload: { plantId: plant.id, type: "WATERING", performedAt: "not-a-date" },
    });
    expect(invalidDate.statusCode).toBe(400);
    expect(invalidDate.json().error).toBe("Invalid performedAt date");

    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/care",
      headers: authHeader(owner.token),
      payload: { plantId: plant.id, type: "WATERING", note: "Done" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().type).toBe("WATERING");

    const invalidUndo = await ctx.app.inject({
      method: "DELETE",
      url: "/api/care/undo?plantId=" + plant.id + "&type=SPRAY",
      headers: authHeader(owner.token),
    });
    expect(invalidUndo.statusCode).toBe(400);
    expect(invalidUndo.json().error).toBe("Invalid care type");

    const undone = await ctx.app.inject({
      method: "DELETE",
      url: "/api/care/undo?plantId=" + plant.id + "&type=WATERING",
      headers: authHeader(owner.token),
    });
    expect(undone.statusCode).toBe(200);
    expect(undone.json().deleted.type).toBe("WATERING");
  });

  it("returns AI identification preview from an uploaded photo", async () => {
    const ctx = await createTestApp();
    cleanup = ctx.cleanup;

    const user = await registerUser(ctx.app, { email: "identify@example.com", name: "Identify" });
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
        ...authHeader(user.token),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().identification.nom_commun).toBe("Monstera deliciosa");
    expect(response.json().identification.arrosage_freq_par_mois).toHaveLength(12);
  });

  it("normalizes overly aggressive low-water schedules from AI previews", async () => {
    const ctx = await createTestApp();
    cleanup = ctx.cleanup;

    (
      globalThis as typeof globalThis & { __openaiMockIdentification?: unknown }
    ).__openaiMockIdentification = {
      nom_commun: "Zamioculcas zamiifolia",
      nom_latin: "Zamioculcas zamiifolia",
      description: "Plante d'interieur tres tolerante a la secheresse.",
      arrosage: "Laisser le substrat devenir completement sec entre deux arrosages.",
      arrosage_freq_par_mois: [7, 7, 6, 5, 4, 4, 4, 4, 5, 6, 7, 7],
      fertilisation: "Engrais leger pendant la croissance.",
      fertilisation_freq_par_mois: [7, 7, 21, 21, 14, 14, 14, 14, 21, 7, 7, 7],
    };

    const user = await registerUser(ctx.app, { email: "zz@example.com", name: "ZZ" });
    const { boundary, payload } = buildMultipartBody(
      "file",
      "zz.jpg",
      "image/jpeg",
      Buffer.from("fake-image-content-zz")
    );

    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/identify/preview",
      headers: {
        ...authHeader(user.token),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().identification.arrosage_freq_par_mois).toEqual([
      28, 28, 21, 18, 14, 14, 14, 14, 18, 21, 28, 28,
    ]);
    expect(response.json().identification.fertilisation_freq_par_mois).toEqual([
      0, 0, 30, 30, 30, 30, 30, 30, 30, 0, 0, 0,
    ]);
  });

  it("applies identification updates independently on an existing plant", async () => {
    const ctx = await createTestApp();
    cleanup = ctx.cleanup;

    const user = await registerUser(ctx.app, { email: "apply@example.com", name: "Apply" });
    const garden = await ctx.app.prisma.garden.findFirstOrThrow({
      where: { ownerId: user.body.user.id },
    });
    const plant = await ctx.app.prisma.plant.create({
      data: {
        name: "Unknown plant",
        notes: "Original notes",
        gardenId: garden.id,
      },
    });

    const identification = {
      ...defaultIdentification,
    };

    const nameOnly = await ctx.app.inject({
      method: "PATCH",
      url: `/api/identify/${plant.id}`,
      headers: authHeader(user.token),
      payload: {
        identification,
        apply: { name: true },
      },
    });
    expect(nameOnly.statusCode).toBe(200);

    let updatedPlant = await ctx.app.prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    expect(updatedPlant.name).toBe("Monstera deliciosa");
    expect(updatedPlant.notes).toBe("Original notes");
    expect(updatedPlant.wateringFreqByMonth).toBeNull();

    const detailsAndPlanning = await ctx.app.inject({
      method: "PATCH",
      url: `/api/identify/${plant.id}`,
      headers: authHeader(user.token),
      payload: {
        identification,
        apply: { details: true, planning: true },
      },
    });
    expect(detailsAndPlanning.statusCode).toBe(200);

    updatedPlant = await ctx.app.prisma.plant.findUniqueOrThrow({ where: { id: plant.id } });
    expect(updatedPlant.notes).toContain("Nom latin : Monstera deliciosa");
    expect(updatedPlant.notes).toContain("Grande plante tropicale.");
    expect(updatedPlant.wateringFreqByMonth).toBe(JSON.stringify(identification.arrosage_freq_par_mois));
    expect(updatedPlant.fertilizingFreqByMonth).toBe(
      JSON.stringify(identification.fertilisation_freq_par_mois)
    );
    expect(updatedPlant.wateringFreqDays).toBe(9);
    expect(updatedPlant.fertilizingFreqDays).toBe(25);
  });
});
