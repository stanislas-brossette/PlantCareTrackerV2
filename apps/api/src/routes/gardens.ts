import { FastifyPluginAsync } from "fastify";

const gardenRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper: assert user has access to garden with minimum role
  const roleWeight: Record<string, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

  async function assertGardenAccess(
    gardenId: string,
    userId: string,
    minRole: "VIEWER" | "EDITOR" | "OWNER" = "VIEWER"
  ) {
    const member = await fastify.prisma.gardenMember.findUnique({
      where: { userId_gardenId: { userId, gardenId } },
    });
    if (!member || roleWeight[member.role] < roleWeight[minRole]) {
      throw { statusCode: 403, message: "Insufficient permissions" };
    }
    return member;
  }

  // List my gardens
  fastify.get("/", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const gardens = await fastify.prisma.garden.findMany({
      where: { members: { some: { userId: req.userId } } },
      include: {
        _count: { select: { plants: true, members: true } },
        members: { where: { userId: req.userId }, select: { role: true } },
      },
    });
    reply.send(
      gardens.map((g) => ({
        id: g.id,
        name: g.name,
        ownerId: g.ownerId,
        createdAt: g.createdAt,
        plantCount: g._count.plants,
        memberCount: g._count.members,
        myRole: g.members[0]?.role ?? "VIEWER",
      }))
    );
  });

  // Create garden
  fastify.post<{ Body: { name: string } }>(
    "/",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const garden = await fastify.prisma.garden.create({
        data: {
          name: req.body.name,
          ownerId: req.userId,
          members: { create: { userId: req.userId, role: "OWNER" } },
        },
      });
      reply.status(201).send(garden);
    }
  );

  // Get single garden
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      await assertGardenAccess(req.params.id, req.userId);
      const garden = await fastify.prisma.garden.findUnique({
        where: { id: req.params.id },
        include: {
          locations: true,
          members: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          },
        },
      });
      if (!garden) return reply.status(404).send({ error: "Not found" });
      reply.send(garden);
    }
  );

  // Update garden name
  fastify.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      await assertGardenAccess(req.params.id, req.userId, "OWNER");
      const garden = await fastify.prisma.garden.update({
        where: { id: req.params.id },
        data: { name: req.body.name },
      });
      reply.send(garden);
    }
  );

  // Delete garden
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      await assertGardenAccess(req.params.id, req.userId, "OWNER");
      await fastify.prisma.garden.delete({ where: { id: req.params.id } });
      reply.send({ ok: true });
    }
  );

  // List members
  fastify.get<{ Params: { id: string } }>(
    "/:id/members",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      await assertGardenAccess(req.params.id, req.userId);
      const members = await fastify.prisma.gardenMember.findMany({
        where: { gardenId: req.params.id },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      reply.send(members);
    }
  );

  // Invite member by email
  fastify.post<{
    Params: { id: string };
    Body: { email: string; role: string };
  }>(
    "/:id/members",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      await assertGardenAccess(req.params.id, req.userId, "OWNER");

      const invitee = await fastify.prisma.user.findUnique({
        where: { email: req.body.email },
      });
      if (!invitee) {
        return reply.status(404).send({ error: "User not found. They must register first." });
      }

      const existing = await fastify.prisma.gardenMember.findUnique({
        where: { userId_gardenId: { userId: invitee.id, gardenId: req.params.id } },
      });
      if (existing) {
        return reply.status(409).send({ error: "Already a member" });
      }

      const member = await fastify.prisma.gardenMember.create({
        data: {
          userId: invitee.id,
          gardenId: req.params.id,
          role: req.body.role || "VIEWER",
        },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      reply.status(201).send(member);
    }
  );

  // Update member role
  fastify.patch<{
    Params: { id: string; userId: string };
    Body: { role: string };
  }>(
    "/:id/members/:userId",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      await assertGardenAccess(req.params.id, req.userId, "OWNER");

      if (req.params.userId === req.userId) {
        return reply.status(400).send({ error: "Cannot change your own role" });
      }

      const member = await fastify.prisma.gardenMember.update({
        where: {
          userId_gardenId: {
            userId: req.params.userId,
            gardenId: req.params.id,
          },
        },
        data: { role: req.body.role },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      reply.send(member);
    }
  );

  // Remove member
  fastify.delete<{ Params: { id: string; userId: string } }>(
    "/:id/members/:userId",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      // Owner can remove anyone; members can remove themselves
      if (req.params.userId !== req.userId) {
        await assertGardenAccess(req.params.id, req.userId, "OWNER");
      }
      // Cannot remove the owner
      const garden = await fastify.prisma.garden.findUnique({
        where: { id: req.params.id },
      });
      if (garden?.ownerId === req.params.userId) {
        return reply.status(400).send({ error: "Cannot remove the owner" });
      }

      await fastify.prisma.gardenMember.delete({
        where: {
          userId_gardenId: {
            userId: req.params.userId,
            gardenId: req.params.id,
          },
        },
      });
      reply.send({ ok: true });
    }
  );
};

export default gardenRoutes;
