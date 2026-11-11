import { describe, expect, it } from "vitest";
import type { FacturaExtraida } from "./schema.js";
import { claveDedup, cuitValido, normalizarCuit, verificarFactura, marcarDuplicados } from "./verificar.js";

function factura(over: Partial<FacturaExtraida> = {}): FacturaExtraida {
  return {
    es_comprobante: true,
    tipo: "factura",
    letra: "A",
    punto_venta: "00004",
    numero: "00012345",
    fecha_emision: "2026-10-01",
    fecha_vencimiento_pago: null,
    emisor: { cuit: "30-71234567-1", razon_social: "Proveedor SA" },
    receptor: { cuit: "30-50001091-2", razon_social: "Rochester SA" },
    cae: "12345678901234",
    cae_vencimiento: "2026-10-11",
    moneda: "ARS",
    importes: { neto_gravado: 100, no_gravado: null, exento: null, iva_total: 21, otros_tributos: null, total: 121 },
    alicuotas: [],
    observaciones: [],
    ...over,
  };
}

describe("cuit", () => {
  it("normaliza quitando todo lo que no es dígito", () => {
    expect(normalizarCuit("30-50001091-2")).toBe("30500010912");
    expect(normalizarCuit(null)).toBeNull();
  });

  it("valida el dígito verificador (módulo 11)", () => {
    expect(cuitValido("30-50001091-2")).toBe(true);
    expect(cuitValido("30-50001091-3")).toBe(false);
    expect(cuitValido("123")).toBe(false);
    expect(cuitValido(null)).toBe(false);
  });
});

describe("claveDedup", () => {
  it("arma CUIT emisor + tipo + letra + PV + número normalizados", () => {
    expect(claveDedup(factura())).toBe("30712345671|factura|A|00004|00012345");
  });

  it("rellena con ceros PV y número para que 4 y 00004 sean la misma", () => {
    const a = claveDedup(factura({ punto_venta: "4", numero: "12345" }));
    expect(a).toBe(claveDedup(factura()));
  });

  it("devuelve null si falta algún componente de la clave", () => {
    expect(claveDedup(factura({ numero: null }))).toBeNull();
    expect(claveDedup(factura({ emisor: { cuit: null, razon_social: null } }))).toBeNull();
  });
});

describe("verificarFactura", () => {
  it("pasa cuando neto + IVA = total", () => {
    const r = verificarFactura(factura());
    expect(r.sumas.resultado).toBe("pass");
  });

  it("tolera diferencias de centavos por redondeo", () => {
    const r = verificarFactura(
      factura({ importes: { neto_gravado: 100, no_gravado: null, exento: null, iva_total: 21, otros_tributos: null, total: 121.01 } }),
    );
    expect(r.sumas.resultado).toBe("pass");
  });

  it("falla cuando las sumas no cierran", () => {
    const r = verificarFactura(
      factura({ importes: { neto_gravado: 100, no_gravado: null, exento: null, iva_total: 21, otros_tributos: null, total: 150 } }),
    );
    expect(r.sumas.resultado).toBe("fail");
    expect(r.sumas.detalle).toContain("121");
  });

  it("suma no gravado, exento y otros tributos", () => {
    const r = verificarFactura(
      factura({ importes: { neto_gravado: 100, no_gravado: 10, exento: 5, iva_total: 21, otros_tributos: 3, total: 139 } }),
    );
    expect(r.sumas.resultado).toBe("pass");
  });

  it("warn (no pass) si falta el total: no se puede afirmar nada", () => {
    const r = verificarFactura(
      factura({ importes: { neto_gravado: 100, no_gravado: null, exento: null, iva_total: 21, otros_tributos: null, total: null } }),
    );
    expect(r.sumas.resultado).toBe("warn");
  });

  it("trata el IVA nulo como 0 (factura C / monotributo)", () => {
    const r = verificarFactura(
      factura({ letra: "C", importes: { neto_gravado: 100, no_gravado: null, exento: null, iva_total: null, otros_tributos: null, total: 100 } }),
    );
    expect(r.sumas.resultado).toBe("pass");
  });

  it("marca CUIT emisor inválido", () => {
    const r = verificarFactura(factura({ emisor: { cuit: "30-71234567-0", razon_social: "X" } }));
    expect(r.cuitEmisor.resultado).toBe("fail");
  });

  it("marca CAE con largo distinto de 14 dígitos", () => {
    expect(verificarFactura(factura({ cae: "123" })).cae.resultado).toBe("fail");
    expect(verificarFactura(factura()).cae.resultado).toBe("pass");
  });

  it("un documento que no es comprobante no se verifica como factura", () => {
    const r = verificarFactura(factura({ es_comprobante: false }));
    expect(r.ok).toBe(false);
  });

  it("ok solo si todos los controles pasan", () => {
    expect(verificarFactura(factura()).ok).toBe(true);
    expect(verificarFactura(factura({ cae: null })).ok).toBe(false);
  });
});

describe("marcarDuplicados", () => {
  it("detecta la segunda aparición de la misma clave", () => {
    const lote = [
      { archivo: "a.pdf", factura: factura() },
      { archivo: "b.pdf", factura: factura() },
      { archivo: "c.pdf", factura: factura({ numero: "00099999" }) },
    ];
    const r = marcarDuplicados(lote);
    expect(r.map((x) => x.duplicadoDe)).toEqual([null, "a.pdf", null]);
  });

  it("no marca duplicado cuando la clave es incompleta", () => {
    const lote = [
      { archivo: "a.pdf", factura: factura({ numero: null }) },
      { archivo: "b.pdf", factura: factura({ numero: null }) },
    ];
    expect(marcarDuplicados(lote).map((x) => x.duplicadoDe)).toEqual([null, null]);
  });
});
