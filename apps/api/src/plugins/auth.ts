import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";

export interface JwtPayload {
  sub: string; // userId
  email: string;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCookie);

  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || "change-me-in-production-please",
    cookie: {
      cookieName: "token",
      signed: false,
    },
    sign: { expiresIn: "15m" },
  });

  fastify.decorate(
    "authenticate",
    async function (req: FastifyRequest, reply: FastifyReply) {
      try {
        // Support both Bearer token and httpOnly cookie
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          await req.jwtVerify();
        } else {
          await req.jwtVerify({ onlyCookie: true });
        }
        req.userId = req.user.sub;
      } catch {
        reply.status(401).send({ error: "Unauthorized" });
      }
    }
  );
};

export default authPlugin;
