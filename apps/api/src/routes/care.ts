import { FastifyPluginAsync } from "fastify";

const careRoutes: FastifyPluginAsync = async (fastify) => {
  async function assertPlantAccess(
    plantId: string,
    userId: string,
    minRole: "VIEWER" | "EDITOR" | "OWNER" = "VIEWER"
  ) {
    const roleWeight: Record<string, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };
    const plant = await fastify.prisma.plant.findUnique({ where: { id: plantId } });
    if (!plant) throw { statusCode: 404, message: "Plant not found" };

    const member = await fastify.prisma.gardenMember.findUnique({
      where: { userId_gardenId: { userId, gardenId: plant.gardenId } },
    });
    if (!member || roleWeight[member.role] < roleWeight[minRole]) {
      throw { statusCode: 403, message: "Insufficient permissions" };
    }
    return plant;
  }

  // List care events for a plant
  fastify.get<{
    Params: { plantId: string };
    Querystring: { limit?: string; offset?: string; type?: string };
  }>(
    "/plant/:plantId",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      await assertPlantAccess(req.params.plantId, req.userId);
      const limit = parseInt(req.query.limit ?? "50", 10);
      const offset = parseInt(req.query.offset ?? "0", 10);

      const events = await fastify.prisma.careEvent.findMany({
        where: {
          plantId: req.params.plantId,
          ...(req.query.type ? { type: req.query.type } : {}),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { performedAt: "desc" },
        take: limit,
        skip: offset,
      });
      reply.send(events);
    }
  );

  // Calendar: care events for a garden in a date range
  fastify.get<{
    Querystring: { gardenId: string; from: string; to: string };
  }>(
    "/calendar",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { gardenId, from, to } = req.query;
      if (!gardenId || !from || !to) {
        return reply.status(400).send({ error: "gardenId, from, to required" });
      }

      const member = await fastify.prisma.gardenMember.findUnique({
        where: { userId_gardenId: { userId: req.userId, gardenId } },
      });
      if (!member) return reply.status(403).send({ error: "Forbidden" });

      const events = await fastify.prisma.careEvent.findMany({
        where: {
          plant: { gardenId },
          performedAt: { gte: new Date(from), lte: new Date(to) },
        },
        include: {
          plant: { select: { id: true, name: true, photoUrl: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { performedAt: "asc" },
      });
      reply.send(events);
    }
  );

  // Record a care event
  fastify.post<{
    Body: {
      type: string;
      plantId: string;
      performedAt?: string;
      note?: string;
    };
  }>(
    "/",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      await assertPlantAccess(req.body.plantId, req.userId, "EDITOR");

      const event = await fastify.prisma.careEvent.create({
        data: {
          type: req.body.type,
          plantId: req.body.plantId,
          userId: req.userId,
          performedAt: req.body.performedAt
            ? new Date(req.body.performedAt)
            : new Date(),
          note: req.body.note ?? null,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      reply.status(201).send(event);
    }
  );

  // Undo last care event of a type for a plant
  fastify.delete<{
    Querystring: { plantId: string; type: string };
  }>(
    "/undo",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { plantId, type } = req.query;
      await assertPlantAccess(plantId, req.userId, "EDITOR");

      const last = await fastify.prisma.careEvent.findFirst({
        where: { plantId, type, userId: req.userId },
        orderBy: { performedAt: "desc" },
      });
      if (!last) return reply.status(404).send({ error: "Nothing to undo" });

      await fastify.prisma.careEvent.delete({ where: { id: last.id } });
      reply.send({ ok: true, deleted: last });
    }
  );

  // Stats for a garden
  fastify.get<{ Querystring: { gardenId: string } }>(
    "/stats",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { gardenId } = req.query;
      if (!gardenId) return reply.status(400).send({ error: "gardenId required" });

      const member = await fastify.prisma.gardenMember.findUnique({
        where: { userId_gardenId: { userId: req.userId, gardenId } },
      });
      if (!member) return reply.status(403).send({ error: "Forbidden" });

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [plants, careWeek, careMonth] = await Promise.all([
        fastify.prisma.plant.findMany({
          where: { gardenId, archived: false },
          include: {
            careEvents: {
              orderBy: { performedAt: "desc" },
              take: 50,
            },
          },
        }),
        fastify.prisma.careEvent.count({
          where: { plant: { gardenId }, performedAt: { gte: weekAgo } },
        }),
        fastify.prisma.careEvent.count({
          where: { plant: { gardenId }, performedAt: { gte: monthAgo } },
        }),
      ]);

      const plantStats = plants.map((plant) => {
        const waterings = plant.careEvents
          .filter((e) => e.type === "WATERING")
          .map((e) => e.performedAt.getTime())
          .sort((a, b) => b - a);

        const fertilizings = plant.careEvents.filter((e) => e.type === "FERTILIZING");

        let avgWateringIntervalDays: number | null = null;
        if (waterings.length >= 2) {
          const intervals = [];
          for (let i = 0; i < waterings.length - 1; i++) {
            intervals.push((waterings[i] - waterings[i + 1]) / (1000 * 60 * 60 * 24));
          }
          avgWateringIntervalDays =
            Math.round((intervals.reduce((a, b) => a + b, 0) / intervals.length) * 10) / 10;
        }

        const lastCareDate = plant.careEvents[0]?.performedAt ?? null;

        // Adherence score: how often watering happened within expected window
        let adherenceScore: number | null = null;
        if (plant.wateringFreqDays && waterings.length >= 2) {
          const onTime = [];
          for (let i = 0; i < waterings.length - 1; i++) {
            const interval = (waterings[i] - waterings[i + 1]) / (1000 * 60 * 60 * 24);
            onTime.push(interval <= plant.wateringFreqDays * 1.2 ? 1 : 0);
          }
          adherenceScore = Math.round(
            (onTime.reduce((a: number, b: number) => a + b, 0) / onTime.length) * 100
          );
        }

        // Needs watering?
        const lastWatered = waterings[0] ? new Date(waterings[0]) : null;
        const needsWatering =
          plant.wateringFreqDays != null &&
          (!lastWatered ||
            (now.getTime() - lastWatered.getTime()) / (1000 * 60 * 60 * 24) >=
              plant.wateringFreqDays);

        return {
          plantId: plant.id,
          plantName: plant.name,
          wateringCount: waterings.length,
          fertilizingCount: fertilizings.length,
          avgWateringIntervalDays,
          lastCare: lastCareDate?.toISOString() ?? null,
          adherenceScore,
          needsWatering,
        };
      });

      const plantsNeedingAttention = plantStats.filter((s) => s.needsWatering).length;

      reply.send({
        totalPlants: plants.length,
        plantsNeedingAttention,
        careEventsThisWeek: careWeek,
        careEventsThisMonth: careMonth,
        plantStats,
      });
    }
  );
};

export default careRoutes;
