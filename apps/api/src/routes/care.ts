import { FastifyPluginAsync } from "fastify";
import { CareTypeSchema } from "@plantcare/shared";
import { recordChanges } from "../utils/changes.js";
import { ensureMvpContext } from "../utils/mvp.js";

const careRoutes: FastifyPluginAsync = async (fastify) => {
  async function assertPlantExists(plantId: string) {
    const plant = await fastify.prisma.plant.findUnique({ where: { id: plantId } });
    if (!plant) throw { statusCode: 404, message: "Plant not found" };
    return plant;
  }

  fastify.get<{ Params: { plantId: string } }>("/plant/:plantId", async (req, reply) => {
    await assertPlantExists(req.params.plantId);
    const events = await fastify.prisma.careEvent.findMany({
      where: { plantId: req.params.plantId },
      orderBy: { performedAt: "desc" },
      take: 200,
    });
    reply.send(events);
  });

  fastify.post("/", async (req, reply) => {
    const payload = req.body as {
      type: string;
      plantId: string;
      performedAt?: string;
      note?: string;
    };

    const parsedType = CareTypeSchema.safeParse(payload.type);
    if (!parsedType.success) {
      return reply.status(400).send({ error: "Invalid care type" });
    }

    const performedAt = payload.performedAt ? new Date(payload.performedAt) : new Date();
    if (Number.isNaN(performedAt.getTime())) {
      return reply.status(400).send({ error: "Invalid performedAt date" });
    }

    const plant = await assertPlantExists(payload.plantId);
    const { user } = await ensureMvpContext(fastify);

    const event = await fastify.prisma.careEvent.create({
      data: {
        type: parsedType.data,
        plantId: payload.plantId,
        userId: user.id,
        performedAt,
        note: payload.note ?? null,
      },
    });
    await recordChanges(fastify, plant.gardenId, [
      { entityType: "CARE_EVENT", entityId: event.id, changeType: "UPSERT" },
      { entityType: "PLANT", entityId: plant.id, changeType: "UPSERT" },
    ]);
    reply.status(201).send(event);
  });

  fastify.delete<{ Querystring: { plantId: string; type: string } }>("/undo", async (req, reply) => {
    const parsedType = CareTypeSchema.safeParse(req.query.type);
    if (!parsedType.success) {
      return reply.status(400).send({ error: "Invalid care type" });
    }

    const plant = await assertPlantExists(req.query.plantId);

    const last = await fastify.prisma.careEvent.findFirst({
      where: { plantId: req.query.plantId, type: parsedType.data },
      orderBy: { performedAt: "desc" },
    });
    if (!last) return reply.status(404).send({ error: "Nothing to undo" });

    await fastify.prisma.careEvent.delete({ where: { id: last.id } });
    await recordChanges(fastify, plant.gardenId, [
      { entityType: "CARE_EVENT", entityId: last.id, changeType: "DELETE" },
      { entityType: "PLANT", entityId: plant.id, changeType: "UPSERT" },
    ]);
    reply.send({ ok: true, deleted: last });
  });
};

export default careRoutes;
