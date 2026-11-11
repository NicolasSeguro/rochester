import type { FacturaExtraida } from "./schema.js";

/**
 * Capa determinística. Recibe lo que la IA PROPUSO y decide, sin IA.
 * Resultados alineados con resultado_control del schema (pass | fail | warn).
 */

export type ResultadoControl = "pass" | "fail" | "warn";
export type Control = { resultado: ResultadoControl; detalle: string };

export type Verificacion = {
  ok: boolean;
  esComprobante: Control;
  sumas: Control;
  cuitEmisor: Control;
  cuitReceptor: Control;
  cae: Control;
};

const TOLERANCIA = 0.02; // redondeo: hasta 2 centavos

export function normalizarCuit(cuit: string | null): string | null {
  if (cuit === null) return null;
  const d = cuit.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

export function cuitValido(cuit: string | null): boolean {
  const d = normalizarCuit(cuit);
  if (d === null || d.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return false; // CUIT con dv 10 no existe
  return dv === Number(d[10]);
}

function pad(valor: string | null, largo: number): string | null {
  if (valor === null) return null;
  const d = valor.replace(/\D/g, "");
  return d.length > 0 ? d.padStart(largo, "0") : null;
}

/** Clave de idempotencia: CUIT emisor + tipo + letra + PV + número. null si está incompleta. */
export function claveDedup(f: FacturaExtraida): string | null {
  const cuit = normalizarCuit(f.emisor.cuit);
  const pv = pad(f.punto_venta, 5);
  const nro = pad(f.numero, 8);
  if (cuit === null || pv === null || nro === null) return null;
  return [cuit, f.tipo, f.letra ?? "-", pv, nro].join("|");
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function controlSumas(f: FacturaExtraida): Control {
  const i = f.importes;
  if (i.total === null) return { resultado: "warn", detalle: "Sin total legible: no se puede verificar la suma." };
  if (i.neto_gravado === null && i.no_gravado === null && i.exento === null) {
    return { resultado: "warn", detalle: "Sin neto/no gravado/exento legible: no se puede verificar la suma." };
  }
  const esperado = r2(
    (i.neto_gravado ?? 0) + (i.no_gravado ?? 0) + (i.exento ?? 0) + (i.iva_total ?? 0) + (i.otros_tributos ?? 0),
  );
  const diff = Math.abs(esperado - i.total);
  return diff <= TOLERANCIA
    ? { resultado: "pass", detalle: `Componentes suman ${esperado} = total ${i.total}.` }
    : { resultado: "fail", detalle: `Componentes suman ${esperado} pero el total declarado es ${i.total} (dif ${r2(diff)}).` };
}

function controlCuit(cuit: string | null, rol: string): Control {
  if (cuit === null) return { resultado: "fail", detalle: `CUIT ${rol} no encontrado.` };
  return cuitValido(cuit)
    ? { resultado: "pass", detalle: `CUIT ${rol} ${cuit} válido.` }
    : { resultado: "fail", detalle: `CUIT ${rol} ${cuit} con dígito verificador inválido (¿mal leído?).` };
}

function controlCae(cae: string | null): Control {
  if (cae === null) return { resultado: "fail", detalle: "CAE no encontrado." };
  return /^\d{14}$/.test(cae.replace(/\s/g, ""))
    ? { resultado: "pass", detalle: "CAE de 14 dígitos." }
    : { resultado: "fail", detalle: `CAE "${cae}" no tiene 14 dígitos.` };
}

export function verificarFactura(f: FacturaExtraida): Verificacion {
  const esComprobante: Control = f.es_comprobante
    ? { resultado: "pass", detalle: "Es un comprobante." }
    : { resultado: "fail", detalle: "El documento no es una factura/nota." };

  const sumas = controlSumas(f);
  const cuitEmisor = controlCuit(f.emisor.cuit, "emisor");
  const cuitReceptor = controlCuit(f.receptor.cuit, "receptor");
  const cae = controlCae(f.cae);

  const ok = [esComprobante, sumas, cuitEmisor, cuitReceptor, cae].every((c) => c.resultado === "pass");
  return { ok, esComprobante, sumas, cuitEmisor, cuitReceptor, cae };
}

export type ItemLote = { archivo: string; factura: FacturaExtraida };

/** Marca, para cada factura, el archivo donde ya apareció antes la misma clave (o null). */
export function marcarDuplicados(lote: ItemLote[]): Array<ItemLote & { clave: string | null; duplicadoDe: string | null }> {
  const vistas = new Map<string, string>();
  return lote.map((item) => {
    const clave = claveDedup(item.factura);
    if (clave === null) return { ...item, clave, duplicadoDe: null };
    const previa = vistas.get(clave);
    if (previa === undefined) {
      vistas.set(clave, item.archivo);
      return { ...item, clave, duplicadoDe: null };
    }
    return { ...item, clave, duplicadoDe: previa };
  });
}
