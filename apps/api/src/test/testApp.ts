import fs from "fs";
import os from "os";
import path from "path";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import { PrismaClient } from "@prisma/client";

import prismaPlugin from "../plugins/prisma.js";
import authPlugin from "../plugins/auth.js";
import authRoutes from "../routes/auth.js";
import gardenRoutes from "../routes/gardens.js";
import careRoutes from "../routes/care.js";
import identifyRoutes from "../routes/identify.js";

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
    JWT_SECRET: process.env.JWT_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
  };

  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = "test-secret";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.UPLOAD_DIR = uploadDir;

  fs.mkdirSync(uploadDir, { recursive: true });
  await initializeTestDatabase(databaseUrl);

  const app = Fastify({ logger: false });

  await app.register(fastifyCors, {
    origin: "http://localhost:5173",
    credentials: true,
  });
  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  await prismaPlugin(app, {});
  await authPlugin(app, {});

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(gardenRoutes, { prefix: "/api/gardens" });
  app.register(careRoutes, { prefix: "/api/care" });
  app.register(identifyRoutes, { prefix: "/api/identify" });

  await app.ready();

  async function cleanup() {
    await app.close();

    process.env.DATABASE_URL = previousEnv.DATABASE_URL;
    process.env.JWT_SECRET = previousEnv.JWT_SECRET;
    process.env.OPENAI_API_KEY = previousEnv.OPENAI_API_KEY;
    process.env.UPLOAD_DIR = previousEnv.UPLOAD_DIR;

    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { app, cleanup, tempDir, uploadDir };
}

export async function registerUser(
  app: Awaited<ReturnType<typeof createTestApp>>["app"],
  {
    email,
    password = "password123",
    name = "Test User",
  }: { email: string; password?: string; name?: string }
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password, name },
  });

  return {
    response,
    body: response.json(),
    token: response.json().accessToken as string,
  };
}

export function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
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
