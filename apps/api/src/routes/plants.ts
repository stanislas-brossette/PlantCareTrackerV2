import { FastifyPluginAsync } from "fastify";
import { CreatePlantSchema, UpdatePlantSchema } from "@plantcare/shared";
import { saveImage, deleteImage } from "../utils/images.js";
import { getEffectiveFreq, serializeMonthlyFreq } from "../utils/freq.js";
import { recordChanges } from "../utils/changes.js";
import { ensureMvpContext } from "../utils/mvp.js";
import { getPlantWithStatus, getPlantsWithStatusForGarden } from "../utils/snapshot.js";

const plantRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { archived?: string } }>("/", async (req, reply) => {
    const { garden } = await ensureMvpContext(fastify);
    const archived = req.query.archived === "true";
    reply.send(await getPlantsWithStatusForGarden(fastify.prisma, garden.id, archived));
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const plant = await getPlantWithStatus(fastify.prisma, req.params.id);
    if (!plant) return reply.status(404).send({ error: "Not found" });
    reply.send(plant);
  });

  fastify.post("/", async (req, reply) => {
    const parsedBody = CreatePlantSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Invalid plant payload" });
    }

    const { garden } = await ensureMvpContext(fastify);
    const { wateringFreqByMonth, fertilizingFreqByMonth, ...rest } = parsedBody.data;

    const plant = await fastify.prisma.plant.create({
      data: {
        gardenId: garden.id,
        ...rest,
        wateringFreqByMonth: serializeMonthlyFreq(wateringFreqByMonth),
        fertilizingFreqByMonth: serializeMonthlyFreq(fertilizingFreqByMonth),
      },
      include: { location: true },
    });

    await recordChanges(fastify, garden.id, [
      { entityType: "PLANT", entityId: plant.id, changeType: "UPSERT" },
    ]);

    reply.status(201).send({
      ...plant,
      wateringFreqByMonth: wateringFreqByMonth ?? null,
      fertilizingFreqByMonth: fertilizingFreqByMonth ?? null,
      lastWatered: null,
      lastFertilized: null,
      needsWatering: false,
      needsFertilizing: false,
      currentWateringFreq: getEffectiveFreq(plant.wateringFreqByMonth, plant.wateringFreqDays),
      currentFertilizingFreq: getEffectiveFreq(plant.fertilizingFreqByMonth, plant.fertilizingFreqDays),
    });
  });

  fastify.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const parsedBody = UpdatePlantSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Invalid plant payload" });
    }

    const existing = await fastify.prisma.plant.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const { wateringFreqByMonth, fertilizingFreqByMonth, ...rest } = parsedBody.data;
    await fastify.prisma.plant.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(wateringFreqByMonth !== undefined && {
          wateringFreqByMonth: serializeMonthlyFreq(wateringFreqByMonth),
        }),
        ...(fertilizingFreqByMonth !== undefined && {
          fertilizingFreqByMonth: serializeMonthlyFreq(fertilizingFreqByMonth),
        }),
      },
    });

    await recordChanges(fastify, existing.gardenId, [
      { entityType: "PLANT", entityId: req.params.id, changeType: "UPSERT" },
    ]);

    reply.send(await getPlantWithStatus(fastify.prisma, req.params.id));
  });

  fastify.post<{ Params: { id: string } }>("/:id/photo", async (req, reply) => {
    const existing = await fastify.prisma.plant.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "No file uploaded" });

    const buffer = await data.toBuffer();
    const photoUrl = await saveImage(buffer, data.mimetype);

    if (existing.photoUrl) await deleteImage(existing.photoUrl);

    const plant = await fastify.prisma.plant.update({
      where: { id: req.params.id },
      data: { photoUrl },
    });
    await recordChanges(fastify, existing.gardenId, [
      { entityType: "PLANT", entityId: plant.id, changeType: "UPSERT" },
    ]);
    reply.send({ photoUrl: plant.photoUrl });
  });

  fastify.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const existing = await fastify.prisma.plant.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const careEvents = await fastify.prisma.careEvent.findMany({
      where: { plantId: existing.id },
      select: { id: true },
    });

    if (existing.photoUrl) await deleteImage(existing.photoUrl);
    await fastify.prisma.plant.delete({ where: { id: req.params.id } });
    await recordChanges(fastify, existing.gardenId, [
      { entityType: "PLANT", entityId: existing.id, changeType: "DELETE" },
      ...careEvents.map((event) => ({
        entityType: "CARE_EVENT" as const,
        entityId: event.id,
        changeType: "DELETE" as const,
      })),
    ]);
    reply.send({ ok: true });
  });
};

export default plantRoutes;
