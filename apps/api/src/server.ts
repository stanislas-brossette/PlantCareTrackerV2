import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";

import prismaPlugin from "./plugins/prisma.js";
import plantRoutes from "./routes/plants.js";
import locationRoutes from "./routes/locations.js";
import careRoutes from "./routes/care.js";
import identifyRoutes from "./routes/identify.js";
import bootstrapRoutes from "./routes/bootstrap.js";
import { ensureMvpContext } from "./utils/mvp.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const API_ROOT = path.resolve(__dirname, "..");
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(API_ROOT, "uploads"));
const WEB_DIST = path.resolve(API_ROOT, "../web/dist");

async function build() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "warn" : "info",
    },
  });

  await fastify.register(fastifyCors, {
    origin: true,
    credentials: false,
  });

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  await fastify.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: "/uploads/",
    decorateReply: false,
  });

  if (fs.existsSync(WEB_DIST)) {
    await fastify.register(fastifyStatic, {
      root: WEB_DIST,
      prefix: "/",
      decorateReply: false,
    });
    fastify.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "Not found" });
      }
      reply.type("text/html; charset=utf-8").send(fs.createReadStream(path.join(WEB_DIST, "index.html")));
    });
  } else {
    fastify.log.info("Frontend dist not found — running in API-only mode (use Vite dev server)");
  }

  await prismaPlugin(fastify, {});
  await ensureMvpContext(fastify);

  fastify.register(bootstrapRoutes, { prefix: "/api" });
  fastify.register(plantRoutes, { prefix: "/api/plants" });
  fastify.register(locationRoutes, { prefix: "/api/locations" });
  fastify.register(careRoutes, { prefix: "/api/care" });
  fastify.register(identifyRoutes, { prefix: "/api/identify" });

  fastify.get("/api/health", async () => {
    const { garden } = await ensureMvpContext(fastify);
    return {
      ok: true,
      ts: new Date().toISOString(),
      gardenId: garden.id,
      gardenName: garden.name,
    };
  });

  return fastify;
}

async function main() {
  const fastify = await build();
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n🌱 PlantCareTracker API running at http://${HOST}:${PORT}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();

export { build };
