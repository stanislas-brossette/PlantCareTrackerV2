import type { FastifyInstance } from "fastify";

const SYSTEM_EMAIL = "local@plantcare.mvp";
const SYSTEM_PASSWORD = "mvp-no-login";
const GARDEN_NAME = "Maison";

export async function ensureMvpContext(fastify: FastifyInstance) {
  let user = await fastify.prisma.user.findUnique({
    where: { email: SYSTEM_EMAIL },
  });

  if (!user) {
    user = await fastify.prisma.user.create({
      data: {
        email: SYSTEM_EMAIL,
        password: SYSTEM_PASSWORD,
        name: "Local Household",
      },
    });
  }

  let garden = await fastify.prisma.garden.findFirst({
    where: { ownerId: user.id },
  });

  if (!garden) {
    garden = await fastify.prisma.garden.create({
      data: {
        name: GARDEN_NAME,
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    });
  }

  return {
    user,
    garden,
  };
}
