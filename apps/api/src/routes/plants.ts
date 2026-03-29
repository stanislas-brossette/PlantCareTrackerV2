import { FastifyPluginAsync } from "fastify";
import { CreatePlantSchema, UpdatePlantSchema } from "@plantcare/shared";
import { saveImage, deleteImage } from "../utils/images.js";
import { getEffectiveFreq, parseMonthlyFreq, serializeMonthlyFreq } from "../utils/freq.js";
import { ensureMvpContext } from "../utils/mvp.js";

function computePlantStatus(
  plant: {
    wateringFreqDays: number | null;
    fertilizingFreqDays: number | null;
    wateringFreqByMonth: string | null;
    fertilizingFreqByMonth: string | null;
  },
  lastWatered: Date | null,
  lastFertilized: Date | null
) {
  const now = new Date();
  const daysSince = (date: Date | null) =>
    date ? (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24) : Infinity;

  const waterFreq = getEffectiveFreq(plant.wateringFreqByMonth, plant.wateringFreqDays, now);
  const fertFreq = getEffectiveFreq(plant.fertilizingFreqByMonth, plant.fertilizingFreqDays, now);

  return {
    needsWatering: waterFreq != null && daysSince(lastWatered) >= waterFreq,
    needsFertilizing: fertFreq != null && daysSince(lastFertilized) >= fertFreq,
    currentWateringFreq: waterFreq,
    currentFertilizingFreq: fertFreq,
  };
}

const plantRoutes: FastifyPluginAsync = async (fastify) => {
  async function getPlantWithStatus(id: string) {
    const plant = await fastify.prisma.plant.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!plant) return null;

    const [lastWateringEvent, lastFertilizingEvent] = await Promise.all([
      fastify.prisma.careEvent.findFirst({
        where: { plantId: id, type: "WATERING" },
        orderBy: { performedAt: "desc" },
      }),
      fastify.prisma.careEvent.findFirst({
        where: { plantId: id, type: "FERTILIZING" },
        orderBy: { performedAt: "desc" },
      }),
    ]);

    const { needsWatering, needsFertilizing, currentWateringFreq, currentFertilizingFreq } =
      computePlantStatus(plant, lastWateringEvent?.performedAt ?? null, lastFertilizingEvent?.performedAt ?? null);

    return {
      ...plant,
      wateringFreqByMonth: parseMonthlyFreq(plant.wateringFreqByMonth),
      fertilizingFreqByMonth: parseMonthlyFreq(plant.fertilizingFreqByMonth),
      lastWatered: lastWateringEvent?.performedAt ?? null,
      lastFertilized: lastFertilizingEvent?.performedAt ?? null,
      needsWatering,
      needsFertilizing,
      currentWateringFreq,
      currentFertilizingFreq,
    };
  }

  fastify.get<{ Querystring: { archived?: string } }>("/", async (req, reply) => {
    const { garden } = await ensureMvpContext(fastify);
    const archived = req.query.archived === "true";

    const plants = await fastify.prisma.plant.findMany({
      where: {
        gardenId: garden.id,
        archived,
      },
      include: { location: true },
      orderBy: { name: "asc" },
    });

    const plantIds = plants.map((p) => p.id);
    const [lastWaterings, lastFertilizings] = await Promise.all([
      fastify.prisma.careEvent.findMany({
        where: { plantId: { in: plantIds }, type: "WATERING" },
        orderBy: { performedAt: "desc" },
        distinct: ["plantId"],
      }),
      fastify.prisma.careEvent.findMany({
        where: { plantId: { in: plantIds }, type: "FERTILIZING" },
        orderBy: { performedAt: "desc" },
        distinct: ["plantId"],
      }),
    ]);

    const lastWMap = Object.fromEntries(lastWaterings.map((e) => [e.plantId, e.performedAt]));
    const lastFMap = Object.fromEntries(lastFertilizings.map((e) => [e.plantId, e.performedAt]));

    reply.send(
      plants.map((plant) => {
        const { needsWatering, needsFertilizing, currentWateringFreq, currentFertilizingFreq } =
          computePlantStatus(plant, lastWMap[plant.id] ?? null, lastFMap[plant.id] ?? null);
        return {
          ...plant,
          wateringFreqByMonth: parseMonthlyFreq(plant.wateringFreqByMonth),
          fertilizingFreqByMonth: parseMonthlyFreq(plant.fertilizingFreqByMonth),
          lastWatered: lastWMap[plant.id] ?? null,
          lastFertilized: lastFMap[plant.id] ?? null,
          needsWatering,
          needsFertilizing,
          currentWateringFreq,
          currentFertilizingFreq,
        };
      })
    );
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const plant = await getPlantWithStatus(req.params.id);
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

    reply.send(await getPlantWithStatus(req.params.id));
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
    reply.send({ photoUrl: plant.photoUrl });
  });

  fastify.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const existing = await fastify.prisma.plant.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    if (existing.photoUrl) await deleteImage(existing.photoUrl);
    await fastify.prisma.plant.delete({ where: { id: req.params.id } });
    reply.send({ ok: true });
  });
};

export default plantRoutes;
