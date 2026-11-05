import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return { ok: true, service: "rochester-core", db: "connected" };
    } catch {
      return reply.status(503).send({ ok: false, service: "rochester-core", db: "unreachable" });
    }
  });
}
