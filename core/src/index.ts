import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";

const app = Fastify({ logger: true });

await app.register(cors);
await app.register(healthRoutes);

const PORT = Number(process.env.PORT) || 3001;

await app.listen({ port: PORT, host: "0.0.0.0" });
