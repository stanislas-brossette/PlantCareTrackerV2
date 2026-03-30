import { FastifyPluginAsync } from "fastify";
import { ensureMvpContext } from "../utils/mvp.js";
import {
  buildChangesPayload,
  getLatestChangeVersion,
  subscribeToChangeFeed,
} from "../utils/changes.js";

const changeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { since?: string } }>("/changes", async (req, reply) => {
    const { garden } = await ensureMvpContext(fastify);
    const since = Number.parseInt(req.query.since ?? "0", 10);

    if (Number.isNaN(since) || since < 0) {
      return reply.status(400).send({ error: "Invalid since version" });
    }

    reply.send(await buildChangesPayload(fastify.prisma, garden.id, since));
  });

  fastify.get("/events", async (_req, reply) => {
    const { garden } = await ensureMvpContext(fastify);

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders?.();

    const sendVersion = (version: number) => {
      reply.raw.write("event: change\n");
      reply.raw.write(`data: ${JSON.stringify({ version })}\n\n`);
    };

    sendVersion(await getLatestChangeVersion(fastify.prisma, garden.id));

    const heartbeat = setInterval(() => {
      reply.raw.write("event: ping\n");
      reply.raw.write(`data: ${Date.now()}\n\n`);
    }, 15_000);

    const unsubscribe = subscribeToChangeFeed((version) => {
      sendVersion(version);
    });

    reply.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    });
  });
};

export default changeRoutes;
