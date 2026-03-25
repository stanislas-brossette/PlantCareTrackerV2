import { FastifyPluginAsync } from "fastify";
import webpush from "web-push";

// Generate VAPID keys once with: npx web-push generate-vapid-keys
// Then set in .env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL
function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:admin@plantcare.local";

  if (publicKey && privateKey) {
    webpush.setVapidDetails(email, publicKey, privateKey);
    return true;
  }
  return false;
}

const pushRoutes: FastifyPluginAsync = async (fastify) => {
  const pushEnabled = initWebPush();

  // Get VAPID public key
  fastify.get("/vapid-public-key", async (_req, reply) => {
    reply.send({ key: process.env.VAPID_PUBLIC_KEY || null, enabled: pushEnabled });
  });

  // Subscribe
  fastify.post<{
    Body: { endpoint: string; keys: { p256dh: string; auth: string } };
  }>(
    "/subscribe",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      if (!pushEnabled) {
        return reply.status(503).send({ error: "Push notifications not configured" });
      }

      const { endpoint, keys } = req.body;
      await fastify.prisma.pushSubscription.upsert({
        where: { endpoint },
        update: { p256dh: keys.p256dh, auth: keys.auth },
        create: {
          userId: req.userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
      });
      reply.status(201).send({ ok: true });
    }
  );

  // Unsubscribe
  fastify.delete<{ Body: { endpoint: string } }>(
    "/unsubscribe",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      await fastify.prisma.pushSubscription.deleteMany({
        where: { endpoint: req.body.endpoint, userId: req.userId },
      });
      reply.send({ ok: true });
    }
  );

  // Send daily care reminders (call this from a cron job)
  fastify.post(
    "/send-reminders",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      if (!pushEnabled) {
        return reply.status(503).send({ error: "Push notifications not configured" });
      }

      const now = new Date();

      // Find all plants needing watering for the requesting user
      const memberships = await fastify.prisma.gardenMember.findMany({
        where: { userId: req.userId },
        select: { gardenId: true },
      });
      const gardenIds = memberships.map((m) => m.gardenId);

      const plants = await fastify.prisma.plant.findMany({
        where: { gardenId: { in: gardenIds }, archived: false, wateringFreqDays: { not: null } },
      });

      const needsWatering = [];
      for (const plant of plants) {
        const last = await fastify.prisma.careEvent.findFirst({
          where: { plantId: plant.id, type: "WATERING" },
          orderBy: { performedAt: "desc" },
        });
        const daysSince = last
          ? (now.getTime() - last.performedAt.getTime()) / (1000 * 60 * 60 * 24)
          : Infinity;
        if (plant.wateringFreqDays && daysSince >= plant.wateringFreqDays) {
          needsWatering.push(plant.name);
        }
      }

      if (needsWatering.length === 0) {
        return reply.send({ sent: 0, message: "All plants are fine!" });
      }

      const subs = await fastify.prisma.pushSubscription.findMany({
        where: { userId: req.userId },
      });

      let sent = 0;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: "🌱 Plantes à arroser !",
              body: needsWatering.join(", "),
              icon: "/icons/icon-192.png",
              url: "/",
            })
          );
          sent++;
        } catch (err: unknown) {
          // Remove invalid subscriptions
          if ((err as { statusCode?: number }).statusCode === 410) {
            await fastify.prisma.pushSubscription.delete({
              where: { endpoint: sub.endpoint },
            });
          }
        }
      }

      reply.send({ sent, plants: needsWatering });
    }
  );
};

export default pushRoutes;
