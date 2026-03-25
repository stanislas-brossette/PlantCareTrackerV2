import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";

import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";

import authRoutes from "./routes/auth.js";
import gardenRoutes from "./routes/gardens.js";
import plantRoutes from "./routes/plants.js";
import locationRoutes from "./routes/locations.js";
import careRoutes from "./routes/care.js";
import identifyRoutes from "./routes/identify.js";
import pushRoutes from "./routes/push.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
const WEB_DIST = path.resolve(process.cwd(), "../../apps/web/dist");

async function build() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "warn" : "info",
    },
  });

  // CORS (allow frontend dev server)
  await fastify.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  });

  // Multipart (file uploads)
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  });

  // Ensure upload dir exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  // Serve uploaded images
  await fastify.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: "/uploads/",
    decorateReply: false,
  });

  // Serve built frontend (production only)
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
      reply.sendFile("index.html", WEB_DIST);
    });
  } else {
    fastify.log.info("Frontend dist not found — running in API-only mode (use Vite dev server)");
  }

  // Core app setup
  await prismaPlugin(fastify, {});
  await authPlugin(fastify, {});

  // Routes
  fastify.register(authRoutes, { prefix: "/api/auth" });
  fastify.register(gardenRoutes, { prefix: "/api/gardens" });
  fastify.register(plantRoutes, { prefix: "/api/plants" });
  fastify.register(locationRoutes, { prefix: "/api/locations" });
  fastify.register(careRoutes, { prefix: "/api/care" });
  fastify.register(identifyRoutes, { prefix: "/api/identify" });
  fastify.register(pushRoutes, { prefix: "/api/push" });

  // Health check
  fastify.get("/api/health", async () => ({ ok: true, ts: new Date().toISOString() }));

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
