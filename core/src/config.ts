import { z } from "zod";

const esquema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3001),
  TENANT_SLUG: z.string().min(1).default("rochester"),

  GMAIL_POLLING_ENABLED: z.enum(["true", "false"]).default("false"),
  POLL_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),
  BOUNCE_COOLDOWN_HOURS: z.coerce.number().positive().default(24),

  GMAIL_CLIENT_ID: z.string().min(1).optional(),
  GMAIL_CLIENT_SECRET: z.string().min(1).optional(),
  GMAIL_REFRESH_TOKEN: z.string().min(1).optional(),
  GMAIL_USER: z.string().email().optional(),
  GMAIL_AUTHSERV_ID: z.string().min(1).default("mx.google.com"),
});

export type Config = {
  databaseUrl: string;
  port: number;
  tenantSlug: string;
  pollIntervalMs: number;
  bounceCooldownHours: number;
  /** null cuando el polling está apagado: no se exigen credenciales. */
  gmail: null | {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    user: string;
    authservId: string;
  };
};

const CAMPOS_GMAIL = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_USER"] as const;

/**
 * Valida el entorno y falla al arrancar con un mensaje claro, en vez de romper
 * a las 3 AM cuando el poller intente autenticar con undefined.
 * Pura: recibe el env como parámetro para poder testearla.
 */
export function cargarConfig(env: Record<string, string | undefined>): Config {
  const parsed = esquema.safeParse(env);
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida -> ${detalle}`);
  }
  const e = parsed.data;

  let gmail: Config["gmail"] = null;
  if (e.GMAIL_POLLING_ENABLED === "true") {
    const faltantes = CAMPOS_GMAIL.filter((k) => !e[k]);
    if (faltantes.length > 0) {
      throw new Error(`Configuración inválida -> con GMAIL_POLLING_ENABLED=true faltan: ${faltantes.join(", ")}`);
    }
    gmail = {
      clientId: e.GMAIL_CLIENT_ID!,
      clientSecret: e.GMAIL_CLIENT_SECRET!,
      refreshToken: e.GMAIL_REFRESH_TOKEN!,
      user: e.GMAIL_USER!,
      authservId: e.GMAIL_AUTHSERV_ID,
    };
  }

  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    tenantSlug: e.TENANT_SLUG,
    pollIntervalMs: e.POLL_INTERVAL_MS,
    bounceCooldownHours: e.BOUNCE_COOLDOWN_HOURS,
    gmail,
  };
}
