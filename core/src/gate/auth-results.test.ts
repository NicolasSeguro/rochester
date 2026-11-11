import { describe, expect, it } from "vitest";
import { parseAuthenticationResults, remitenteVerificado, resultadosConfiables } from "./auth-results.js";
import type { Header } from "./headers.js";

describe("resultadosConfiables", () => {
  const auth = (value: string): Header => ({ name: "Authentication-Results", value });

  it("usa solo el header cuyo authserv-id es el del receptor", () => {
    const r = resultadosConfiables(
      [
        auth("evil.example.com; dmarc=pass header.from=a.com"), // inyectado por el remitente
        auth("mx.google.com; dmarc=fail header.from=a.com"),
      ],
      "mx.google.com",
    );
    expect(r.dmarc).toBe("fail");
  });

  it("si ningún header es del receptor, no verifica nada", () => {
    const r = resultadosConfiables([auth("evil.example.com; dmarc=pass header.from=a.com")], "mx.google.com");
    expect(r).toEqual({ spf: "none", dkim: "none", dmarc: "none" });
  });

  it("sin headers devuelve todo none", () => {
    expect(resultadosConfiables([], "mx.google.com")).toEqual({ spf: "none", dkim: "none", dmarc: "none" });
  });
});

describe("parseAuthenticationResults", () => {
  it("extrae spf, dkim y dmarc en pass", () => {
    const h =
      "mx.google.com; dkim=pass header.i=@proveedor.com; spf=pass smtp.mailfrom=a@proveedor.com; dmarc=pass (p=NONE) header.from=proveedor.com";
    expect(parseAuthenticationResults(h)).toEqual({
      spf: "pass",
      dkim: "pass",
      dmarc: "pass",
    });
  });

  it("detecta fail en dmarc", () => {
    const h = "mx.google.com; spf=fail smtp.mailfrom=x@y.com; dmarc=fail header.from=y.com";
    const r = parseAuthenticationResults(h);
    expect(r.dmarc).toBe("fail");
    expect(r.spf).toBe("fail");
  });

  it("devuelve none para métodos ausentes", () => {
    expect(parseAuthenticationResults("mx.google.com; spf=pass smtp.mailfrom=a@b.com")).toEqual({
      spf: "pass",
      dkim: "none",
      dmarc: "none",
    });
  });

  it("devuelve todo none si el header es undefined o vacío", () => {
    const vacio = { spf: "none", dkim: "none", dmarc: "none" };
    expect(parseAuthenticationResults(undefined)).toEqual(vacio);
    expect(parseAuthenticationResults("")).toEqual(vacio);
  });

  it("es case-insensitive", () => {
    expect(parseAuthenticationResults("mx.google.com; DMARC=PASS header.from=a.com").dmarc).toBe("pass");
  });

  it("no confunde un valor dentro de un comentario ni de otro campo", () => {
    // 'dmarc=pass' aparece solo dentro de un comentario: no debe contar
    const h = "mx.google.com; dmarc=fail header.from=a.com (nota: antes dmarc=pass)";
    expect(parseAuthenticationResults(h).dmarc).toBe("fail");
  });
});

describe("remitenteVerificado", () => {
  it("verdadero solo si dmarc=pass", () => {
    expect(remitenteVerificado({ spf: "fail", dkim: "fail", dmarc: "pass" })).toBe(true);
  });

  it("falso si dmarc no es pass aunque spf y dkim pasen", () => {
    expect(remitenteVerificado({ spf: "pass", dkim: "pass", dmarc: "none" })).toBe(false);
    expect(remitenteVerificado({ spf: "pass", dkim: "pass", dmarc: "fail" })).toBe(false);
  });
});
