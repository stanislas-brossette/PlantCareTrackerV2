import { FastifyPluginAsync } from "fastify";
import { CreateLocationSchema } from "@plantcare/shared";
import { ensureMvpContext } from "../utils/mvp.js";

const locationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (_req, reply) => {
    const { garden } = await ensureMvpContext(fastify);
    const locations = await fastify.prisma.location.findMany({
      where: { gardenId: garden.id },
      include: { _count: { select: { plants: true } } },
      orderBy: { name: "asc" },
    });
    reply.send(locations);
  });

  fastify.post("/", async (req, reply) => {
    const parsedBody = CreateLocationSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Invalid location payload" });
    }

    const { garden } = await ensureMvpContext(fastify);
    const existing = await fastify.prisma.location.findFirst({
      where: { gardenId: garden.id, name: parsedBody.data.name },
    });
    if (existing) return reply.status(200).send(existing);

    const location = await fastify.prisma.location.create({
      data: { gardenId: garden.id, name: parsedBody.data.name },
    });
    reply.status(201).send(location);
  });

  fastify.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const location = await fastify.prisma.location.findUnique({
      where: { id: req.params.id },
    });
    if (!location) return reply.status(404).send({ error: "Not found" });

    await fastify.prisma.plant.updateMany({
      where: { locationId: req.params.id },
      data: { locationId: null },
    });
    await fastify.prisma.location.delete({ where: { id: req.params.id } });
    reply.send({ ok: true });
  });
};

export default locationRoutes;
