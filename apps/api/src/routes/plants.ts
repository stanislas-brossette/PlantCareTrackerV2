import { FastifyPluginAsync } from "fastify";
import { CreatePlantSchema, GardenRole, ROLE_WEIGHT, UpdatePlantSchema } from "@plantcare/shared";
import { saveImage, deleteImage } from "../utils/images.js";
import { getEffectiveFreq, parseMonthlyFreq, serializeMonthlyFreq } from "../utils/freq.js";

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
  async function assertGardenAccess(
    gardenId: string,
    userId: string,
    minRole: GardenRole = "VIEWER"
  ) {
    const member = await fastify.prisma.gardenMember.findUnique({
      where: { userId_gardenId: { userId, gardenId } },
    });
    if (!member || !(member.role in ROLE_WEIGHT) || ROLE_WEIGHT[member.role as GardenRole] < ROLE_WEIGHT[minRole]) {
      throw { statusCode: 403, message: "Insufficient permissions" };
    }
  }

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
      computePlantStatus(
        plant,
        lastWateringEvent?.performedAt ?? null,
        lastFertilizingEvent?.performedAt ?? null
      );

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

  // List plants in a garden
  fastify.get<{ Querystring: { gardenId: string; archived?: string } }>(
    "/",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { gardenId, archived } = req.query;
      if (!gardenId) return reply.status(400).send({ error: "gardenId required" });

      await assertGardenAccess(gardenId, req.userId);

      const plants = await fastify.prisma.plant.findMany({
        where: {
          gardenId,
          archived: archived === "true" ? true : false,
        },
        include: { location: true },
        orderBy: { name: "asc" },
      });

      // Batch-fetch last care events for all plants
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
        computePlantStatus(
          plant,
          lastWMap[plant.id] ?? null,
          lastFMap[plant.id] ?? null
        );
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
    }
  );

  // Get single plant
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const plant = await getPlantWithStatus(req.params.id);
      if (!plant) return reply.status(404).send({ error: "Not found" });
      await assertGardenAccess(plant.gardenId, req.userId);
      reply.send(plant);
    }
  );

  // Create plant
  fastify.post<{
    Body: {
      gardenId: string;
      name: string;
      notes?: string;
      wateringFreqDays?: number;
      fertilizingFreqDays?: number;
      wateringFreqByMonth?: number[];
      fertilizingFreqByMonth?: number[];
      locationId?: string;
    };
  }>(
    "/",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      if (!req.body.gardenId) {
        return reply.status(400).send({ error: "Invalid plant payload" });
      }

      const { gardenId, ...body } = req.body;
      const parsedBody = CreatePlantSchema.safeParse(body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid plant payload" });
      }

      const { wateringFreqByMonth, fertilizingFreqByMonth, ...rest } = parsedBody.data;
      await assertGardenAccess(gardenId, req.userId, "EDITOR");

      const plant = await fastify.prisma.plant.create({
        data: {
          gardenId,
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
    }
  );

  // Update plant
  fastify.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      notes?: string;
      wateringFreqDays?: number;
      fertilizingFreqDays?: number;
      wateringFreqByMonth?: number[] | null;
      fertilizingFreqByMonth?: number[] | null;
      locationId?: string;
      archived?: boolean;
    };
  }>(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const parsedBody = UpdatePlantSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid plant payload" });
      }

      const existing = await fastify.prisma.plant.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await assertGardenAccess(existing.gardenId, req.userId, "EDITOR");

      const { wateringFreqByMonth, fertilizingFreqByMonth, ...rest } = parsedBody.data;
      const plant = await fastify.prisma.plant.update({
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
        include: { location: true },
      });
      reply.send(await getPlantWithStatus(plant.id));
    }
  );

  // Upload photo
  fastify.post<{ Params: { id: string } }>(
    "/:id/photo",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const existing = await fastify.prisma.plant.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await assertGardenAccess(existing.gardenId, req.userId, "EDITOR");

      const data = await req.file();
      if (!data) return reply.status(400).send({ error: "No file uploaded" });

      const buffer = await data.toBuffer();
      const photoUrl = await saveImage(buffer, data.mimetype);

      // Delete old photo if any
      if (existing.photoUrl) await deleteImage(existing.photoUrl);

      const plant = await fastify.prisma.plant.update({
        where: { id: req.params.id },
        data: { photoUrl },
      });
      reply.send({ photoUrl: plant.photoUrl });
    }
  );

  // Delete plant
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const existing = await fastify.prisma.plant.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await assertGardenAccess(existing.gardenId, req.userId, "EDITOR");

      if (existing.photoUrl) await deleteImage(existing.photoUrl);
      await fastify.prisma.plant.delete({ where: { id: req.params.id } });
      reply.send({ ok: true });
    }
  );
};

export default plantRoutes;
