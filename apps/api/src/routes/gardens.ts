import { FastifyPluginAsync } from "fastify";
import {
  CreateGardenSchema,
  EDITABLE_GARDEN_ROLES,
  GardenRole,
  InviteMemberSchema,
  ROLE_WEIGHT,
  UpdateGardenMemberRoleSchema,
} from "@plantcare/shared";

const gardenRoutes: FastifyPluginAsync = async (fastify) => {
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
      const parsedBody = CreateGardenSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid garden payload" });
      }

      const garden = await fastify.prisma.garden.create({
        data: {
          name: parsedBody.data.name,
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
      const parsedBody = CreateGardenSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid garden payload" });
      }

      await assertGardenAccess(req.params.id, req.userId, "OWNER");
      const garden = await fastify.prisma.garden.update({
        where: { id: req.params.id },
        data: { name: parsedBody.data.name },
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
      if (
        req.body.role !== undefined &&
        !EDITABLE_GARDEN_ROLES.includes(req.body.role as (typeof EDITABLE_GARDEN_ROLES)[number])
      ) {
        return reply.status(400).send({ error: "Invalid role" });
      }
      const parsedBody = InviteMemberSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid member payload" });
      }

      const invitee = await fastify.prisma.user.findUnique({
        where: { email: parsedBody.data.email },
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
          role: parsedBody.data.role,
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
      if (
        !EDITABLE_GARDEN_ROLES.includes(req.body.role as (typeof EDITABLE_GARDEN_ROLES)[number])
      ) {
        return reply.status(400).send({ error: "Invalid role" });
      }
      const parsedBody = UpdateGardenMemberRoleSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid member payload" });
      }

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
        data: { role: parsedBody.data.role },
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
