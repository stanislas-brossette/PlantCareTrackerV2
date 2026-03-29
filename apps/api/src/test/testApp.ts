import fs from "fs";
import os from "os";
import path from "path";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import { PrismaClient } from "@prisma/client";

import prismaPlugin from "../plugins/prisma.js";
import plantRoutes from "../routes/plants.js";
import careRoutes from "../routes/care.js";
import identifyRoutes from "../routes/identify.js";
import locationRoutes from "../routes/locations.js";
import bootstrapRoutes from "../routes/bootstrap.js";
import { ensureMvpContext } from "../utils/mvp.js";

async function initializeTestDatabase(databaseUrl: string) {
  const migrationPath = path.resolve(
    process.cwd(),
    "prisma/migrations/20260325122221_init/migration.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  const statements = migrationSql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) =>
      statement
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(Boolean);

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  await prisma.$connect();
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  await prisma.$disconnect();
}

export async function createTestApp() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plantcare-api-test-"));
  const dbPath = path.join(tempDir, "test.db");
  const uploadDir = path.join(tempDir, "uploads");
  const databaseUrl = `file:${dbPath}`;

  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
  };

  process.env.DATABASE_URL = databaseUrl;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.UPLOAD_DIR = uploadDir;

  fs.mkdirSync(uploadDir, { recursive: true });
  await initializeTestDatabase(databaseUrl);

  const app = Fastify({ logger: false });

  await app.register(fastifyCors, {
    origin: true,
    credentials: false,
  });
  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  await prismaPlugin(app, {});
  await ensureMvpContext(app);

  app.register(bootstrapRoutes, { prefix: "/api" });
  app.register(plantRoutes, { prefix: "/api/plants" });
  app.register(locationRoutes, { prefix: "/api/locations" });
  app.register(careRoutes, { prefix: "/api/care" });
  app.register(identifyRoutes, { prefix: "/api/identify" });

  await app.ready();

  async function cleanup() {
    await app.close();

    process.env.DATABASE_URL = previousEnv.DATABASE_URL;
    process.env.OPENAI_API_KEY = previousEnv.OPENAI_API_KEY;
    process.env.UPLOAD_DIR = previousEnv.UPLOAD_DIR;

    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { app, cleanup };
}

export function buildMultipartBody(
  fieldName: string,
  filename: string,
  contentType: string,
  content: Buffer
) {
  const boundary = `----PlantCareBoundary${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    boundary,
    payload: Buffer.concat([head, content, tail]),
  };
}
