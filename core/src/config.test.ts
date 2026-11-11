import { describe, expect, it } from "vitest";
import { cargarConfig } from "./config.js";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/rochester" };

const gmail = {
  GMAIL_CLIENT_ID: "id",
  GMAIL_CLIENT_SECRET: "secret",
  GMAIL_REFRESH_TOKEN: "refresh",
  GMAIL_USER: "proveedores@rochester-hotel.com",
};

describe("cargarConfig", () => {
  it("aplica defaults y deja el polling apagado", () => {
    const c = cargarConfig(base);
    expect(c.port).toBe(3001);
    expect(c.tenantSlug).toBe("rochester");
    expect(c.pollIntervalMs).toBe(60_000);
    expect(c.bounceCooldownHours).toBe(24);
    expect(c.gmail).toBeNull();
  });

  it("falla si falta DATABASE_URL", () => {
    expect(() => cargarConfig({})).toThrow(/DATABASE_URL/);
  });

  it("con polling apagado no exige credenciales de Gmail", () => {
    expect(() => cargarConfig({ ...base, GMAIL_POLLING_ENABLED: "false" })).not.toThrow();
  });

  it("con polling encendido exige TODAS las credenciales de Gmail", () => {
    expect(() => cargarConfig({ ...base, GMAIL_POLLING_ENABLED: "true" })).toThrow(/GMAIL_CLIENT_ID/);
    const { GMAIL_REFRESH_TOKEN: _omitido, ...incompleto } = gmail;
    expect(() => cargarConfig({ ...base, GMAIL_POLLING_ENABLED: "true", ...incompleto })).toThrow(
      /GMAIL_REFRESH_TOKEN/,
    );
  });

  it("con polling encendido y credenciales completas arma el bloque gmail", () => {
    const c = cargarConfig({ ...base, ...gmail, GMAIL_POLLING_ENABLED: "true" });
    expect(c.gmail).toEqual({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
      user: "proveedores@rochester-hotel.com",
      authservId: "mx.google.com",
    });
  });

  it("rechaza un intervalo de polling demasiado agresivo", () => {
    expect(() => cargarConfig({ ...base, POLL_INTERVAL_MS: "500" })).toThrow(/POLL_INTERVAL_MS/);
  });

  it("convierte strings numéricos de env a número", () => {
    const c = cargarConfig({ ...base, PORT: "8080", POLL_INTERVAL_MS: "30000", BOUNCE_COOLDOWN_HOURS: "12" });
    expect(c.port).toBe(8080);
    expect(c.pollIntervalMs).toBe(30_000);
    expect(c.bounceCooldownHours).toBe(12);
  });

  it("GMAIL_POLLING_ENABLED solo acepta 'true' o 'false': otro valor falla fuerte, no apaga en silencio", () => {
    expect(() => cargarConfig({ ...base, GMAIL_POLLING_ENABLED: "TRUE", ...gmail })).toThrow(
      /GMAIL_POLLING_ENABLED/,
    );
    expect(() => cargarConfig({ ...base, GMAIL_POLLING_ENABLED: "1", ...gmail })).toThrow(
      /GMAIL_POLLING_ENABLED/,
    );
  });
});
