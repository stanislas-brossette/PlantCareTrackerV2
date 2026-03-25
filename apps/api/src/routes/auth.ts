import { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register
  fastify.post<{ Body: { email: string; password: string; name?: string } }>(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            name: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { email, password, name } = req.body;

      const existing = await fastify.prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({ error: "Email already in use" });
      }

      const hashed = await bcrypt.hash(password, 12);
      const user = await fastify.prisma.user.create({
        data: { email, password: hashed, name: name ?? null },
        select: { id: true, email: true, name: true, createdAt: true },
      });

      // Auto-create a default garden
      await fastify.prisma.garden.create({
        data: {
          name: `${name ?? email}'s Garden`,
          ownerId: user.id,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      });

      const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email });
      const refreshToken = fastify.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: "30d" }
      );

      reply
        .setCookie("token", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 15,
        })
        .setCookie("refresh", refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/api/auth",
          maxAge: 60 * 60 * 24 * 30,
        })
        .send({ user, accessToken });
    }
  );

  // Login
  fastify.post<{ Body: { email: string; password: string } }>(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string" },
            password: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { email, password } = req.body;

      const user = await fastify.prisma.user.findUnique({ where: { email } });
      if (!user) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email });
      const refreshToken = fastify.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: "30d" }
      );

      const { password: _, ...safeUser } = user;

      reply
        .setCookie("token", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 15,
        })
        .setCookie("refresh", refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/api/auth",
          maxAge: 60 * 60 * 24 * 30,
        })
        .send({ user: safeUser, accessToken });
    }
  );

  // Refresh token
  fastify.post("/refresh", async (req, reply) => {
    const refreshToken = req.cookies?.refresh;
    if (!refreshToken) {
      return reply.status(401).send({ error: "No refresh token" });
    }
    try {
      const decoded = fastify.jwt.verify<{ sub: string; email: string }>(refreshToken);
      const accessToken = fastify.jwt.sign({ sub: decoded.sub, email: decoded.email });

      reply
        .setCookie("token", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 15,
        })
        .send({ accessToken });
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }
  });

  // Me
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, name: true, createdAt: true },
      });
      if (!user) return reply.status(404).send({ error: "User not found" });
      reply.send(user);
    }
  );

  // Update profile
  fastify.patch<{ Body: { name?: string; password?: string } }>(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { name, password } = req.body;
      const data: Record<string, string> = {};
      if (name !== undefined) data.name = name;
      if (password) data.password = await bcrypt.hash(password, 12);

      const user = await fastify.prisma.user.update({
        where: { id: req.userId },
        data,
        select: { id: true, email: true, name: true, createdAt: true },
      });
      reply.send(user);
    }
  );

  // Logout
  fastify.post("/logout", async (_req, reply) => {
    reply
      .clearCookie("token", { path: "/" })
      .clearCookie("refresh", { path: "/api/auth" })
      .send({ ok: true });
  });
};

export default authRoutes;
