import { describe, expect, it } from "vitest";
import { evaluarRemitente, extraerEmail } from "./evaluar-remitente.js";

const verificado = { spf: "pass", dkim: "pass", dmarc: "pass" } as const;
const sinVerificar = { spf: "none", dkim: "none", dmarc: "none" } as const;

const maestro = [
  { email: "ana@proveedor.com", activo: true },
  { email: "luis@otro.com", activo: false },
];

describe("extraerEmail", () => {
  it("extrae de 'Nombre <mail>'", () => {
    expect(extraerEmail("Ana Pérez <Ana@Proveedor.com>")).toBe("ana@proveedor.com");
  });

  it("acepta mail pelado y recorta espacios", () => {
    expect(extraerEmail("  ana@proveedor.com  ")).toBe("ana@proveedor.com");
  });

  it("acepta nombre entre comillas con coma", () => {
    expect(extraerEmail('"Pérez, Ana" <ana@proveedor.com>')).toBe("ana@proveedor.com");
  });

  it("devuelve null si no hay mail válido", () => {
    expect(extraerEmail("sin mail")).toBeNull();
    expect(extraerEmail("")).toBeNull();
  });

  it("devuelve null si hay más de un remitente (anómalo)", () => {
    expect(extraerEmail("a@x.com, b@y.com")).toBeNull();
    expect(extraerEmail("A <a@x.com>, B <b@y.com>")).toBeNull();
  });
});

describe("evaluarRemitente", () => {
  it("acepta a un remitente activo y verificado", () => {
    expect(evaluarRemitente({ from: "Ana <ana@proveedor.com>", auth: verificado, maestro })).toEqual({
      decision: "aceptar",
    });
  });

  it("normaliza mayúsculas y espacios al buscar en el maestro", () => {
    const r = evaluarRemitente({ from: "  ANA@Proveedor.COM ", auth: verificado, maestro });
    expect(r.decision).toBe("aceptar");
  });

  it("rebota a un remitente verificado que no está en el maestro", () => {
    expect(evaluarRemitente({ from: "x@desconocido.com", auth: verificado, maestro })).toEqual({
      decision: "rebotar",
      causal: "remitente_no_autorizado",
    });
  });

  it("rebota a un remitente inactivo", () => {
    expect(evaluarRemitente({ from: "luis@otro.com", auth: verificado, maestro })).toEqual({
      decision: "rebotar",
      causal: "remitente_inactivo",
    });
  });

  it("IGNORA (no responde) si el remitente no está verificado, aunque esté en el maestro", () => {
    expect(evaluarRemitente({ from: "ana@proveedor.com", auth: sinVerificar, maestro })).toEqual({
      decision: "ignorar",
      causal: "remitente_no_verificado",
    });
  });

  it("IGNORA si no está verificado y tampoco está en el maestro (evita backscatter)", () => {
    expect(evaluarRemitente({ from: "x@desconocido.com", auth: sinVerificar, maestro })).toEqual({
      decision: "ignorar",
      causal: "remitente_no_verificado",
    });
  });

  it("IGNORA un From ilegible, sin responder a nadie", () => {
    expect(evaluarRemitente({ from: "basura", auth: verificado, maestro })).toEqual({
      decision: "ignorar",
      causal: "remitente_no_autorizado",
    });
  });

  it("IGNORA un From múltiple", () => {
    const r = evaluarRemitente({ from: "a@x.com, ana@proveedor.com", auth: verificado, maestro });
    expect(r.decision).toBe("ignorar");
  });

  it("con maestro vacío rebota a todo remitente verificado", () => {
    expect(evaluarRemitente({ from: "ana@proveedor.com", auth: verificado, maestro: [] })).toEqual({
      decision: "rebotar",
      causal: "remitente_no_autorizado",
    });
  });
});
