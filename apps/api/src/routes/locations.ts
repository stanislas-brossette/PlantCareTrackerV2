import { FastifyPluginAsync } from "fastify";
import { CreateLocationSchema, GardenRole, ROLE_WEIGHT } from "@plantcare/shared";

const locationRoutes: FastifyPluginAsync = async (fastify) => {
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

  // List locations
  fastify.get<{ Querystring: { gardenId: string } }>(
    "/",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { gardenId } = req.query;
      if (!gardenId) return reply.status(400).send({ error: "gardenId required" });
      await assertGardenAccess(gardenId, req.userId);

      const locations = await fastify.prisma.location.findMany({
        where: { gardenId },
        include: { _count: { select: { plants: true } } },
        orderBy: { name: "asc" },
      });
      reply.send(locations);
    }
  );

  // Create location
  fastify.post<{ Body: { gardenId: string; name: string } }>(
    "/",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const parsedBody = CreateLocationSchema.safeParse({ name: req.body.name });
      if (!parsedBody.success || !req.body.gardenId) {
        return reply.status(400).send({ error: "Invalid location payload" });
      }

      const { gardenId } = req.body;
      const { name } = parsedBody.data;
      await assertGardenAccess(gardenId, req.userId, "EDITOR");

      const existing = await fastify.prisma.location.findFirst({
        where: { gardenId, name },
      });
      if (existing) return reply.status(200).send(existing);

      const location = await fastify.prisma.location.create({
        data: { gardenId, name },
      });
      reply.status(201).send(location);
    }
  );

  // Delete location (nullify plants' locationId)
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const location = await fastify.prisma.location.findUnique({
        where: { id: req.params.id },
      });
      if (!location) return reply.status(404).send({ error: "Not found" });
      await assertGardenAccess(location.gardenId, req.userId, "EDITOR");

      await fastify.prisma.plant.updateMany({
        where: { locationId: req.params.id },
        data: { locationId: null },
      });
      await fastify.prisma.location.delete({ where: { id: req.params.id } });
      reply.send({ ok: true });
    }
  );
};

export default locationRoutes;
