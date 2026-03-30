import { FastifyPluginAsync } from "fastify";
import { ensureMvpContext } from "../utils/mvp.js";
import { getLatestChangeVersion } from "../utils/changes.js";
import { buildBootstrapPayload } from "../utils/snapshot.js";

const bootstrapRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/bootstrap", async (_req, reply) => {
    const { garden } = await ensureMvpContext(fastify);
    const changeVersion = await getLatestChangeVersion(fastify.prisma, garden.id);
    reply.send(await buildBootstrapPayload(fastify.prisma, garden.id, garden.name, changeVersion));
  });
};

export default bootstrapRoutes;
