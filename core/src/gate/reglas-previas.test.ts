import { describe, expect, it } from "vitest";
import type { Header } from "./headers.js";
import { evaluarReglasPrevias } from "./reglas-previas.js";

const PROPIA = "proveedores@rochester-hotel.com";

function h(...pares: Array<[string, string]>): Header[] {
  return pares.map(([name, value]) => ({ name, value }));
}

describe("evaluarReglasPrevias", () => {
  it("no ignora un mail normal", () => {
    const r = evaluarReglasPrevias(h(["From", "Ana <ana@proveedor.com>"]), PROPIA);
    expect(r).toEqual({ ignorar: false });
  });

  it("ignora Auto-Submitted distinto de 'no'", () => {
    const r = evaluarReglasPrevias(
      h(["From", "ana@proveedor.com"], ["Auto-Submitted", "auto-replied"]),
      PROPIA,
    );
    expect(r).toEqual({ ignorar: true, motivo: "auto_submitted" });
  });

  it("no ignora Auto-Submitted: no", () => {
    const r = evaluarReglasPrevias(
      h(["From", "ana@proveedor.com"], ["Auto-Submitted", "no"]),
      PROPIA,
    );
    expect(r.ignorar).toBe(false);
  });

  it.each(["bulk", "list", "junk", "BULK"])("ignora Precedence: %s", (valor) => {
    const r = evaluarReglasPrevias(h(["From", "ana@proveedor.com"], ["Precedence", valor]), PROPIA);
    expect(r).toEqual({ ignorar: true, motivo: "precedence" });
  });

  it.each([
    "MAILER-DAEMON@googlemail.com",
    "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
    "noreply@banco.com",
    "no-reply@banco.com",
    "do-not-reply@banco.com",
    "postmaster@proveedor.com",
  ])("ignora remitentes de sistema: %s", (from) => {
    const r = evaluarReglasPrevias(h(["From", from]), PROPIA);
    expect(r).toEqual({ ignorar: true, motivo: "remitente_sistema" });
  });

  it("ignora mails de la propia casilla (evita loops)", () => {
    const r = evaluarReglasPrevias(h(["From", `Rochester <${PROPIA}>`]), PROPIA);
    expect(r).toEqual({ ignorar: true, motivo: "propia_casilla" });
  });

  it("la comparación de la propia casilla es case-insensitive", () => {
    const r = evaluarReglasPrevias(h(["From", "PROVEEDORES@Rochester-Hotel.com"]), PROPIA);
    expect(r).toEqual({ ignorar: true, motivo: "propia_casilla" });
  });

  it("los nombres de header son case-insensitive", () => {
    const r = evaluarReglasPrevias(
      h(["from", "ana@proveedor.com"], ["auto-submitted", "auto-generated"]),
      PROPIA,
    );
    expect(r).toEqual({ ignorar: true, motivo: "auto_submitted" });
  });
});
