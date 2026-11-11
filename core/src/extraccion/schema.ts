// zod/v4: el helper zodOutputFormat del SDK de Anthropic solo entiende schemas v4.
// zod 3.25 lo expone como subpath, sin migrar el resto del proyecto (config.ts sigue en v3).
import { z } from "zod/v4";

/**
 * Contrato de salida de la IA. Todo lo que la IA no ve impreso en el comprobante
 * va como null: PROHIBIDO inventar. La capa determinística (verificar.ts) decide
 * si lo extraído sirve; la IA solo propone.
 */

const parte = z.object({
  cuit: z.string().nullable().describe("CUIT tal cual figura, con o sin guiones"),
  razon_social: z.string().nullable(),
});

const alicuota = z.object({
  alicuota: z.number().describe("Porcentaje, ej. 21 o 10.5"),
  base: z.number().nullable(),
  importe: z.number(),
});

export const facturaSchema = z.object({
  es_comprobante: z
    .boolean()
    .describe("false si el documento no es una factura/nota (ej. remito, presupuesto, texto suelto)"),
  tipo: z.enum(["factura", "nota_credito", "nota_debito", "recibo", "otro"]),
  letra: z.enum(["A", "B", "C", "M", "E"]).nullable(),
  punto_venta: z.string().nullable().describe("Solo dígitos, ej. 00004"),
  numero: z.string().nullable().describe("Solo dígitos, ej. 00012345"),
  fecha_emision: z.string().nullable().describe("YYYY-MM-DD"),
  fecha_vencimiento_pago: z.string().nullable().describe("YYYY-MM-DD"),
  emisor: parte,
  receptor: parte,
  cae: z.string().nullable(),
  cae_vencimiento: z.string().nullable().describe("YYYY-MM-DD"),
  moneda: z.string().nullable().describe("ARS, USD, etc."),
  importes: z.object({
    neto_gravado: z.number().nullable(),
    no_gravado: z.number().nullable(),
    exento: z.number().nullable(),
    iva_total: z.number().nullable(),
    otros_tributos: z.number().nullable().describe("Percepciones, impuestos internos, etc."),
    total: z.number().nullable(),
  }),
  alicuotas: z.array(alicuota),
  observaciones: z
    .array(z.string())
    .describe("Ambigüedades, texto ilegible, datos dudosos. Vacío si no hay."),
});

export const loteSchema = z.object({
  facturas: z
    .array(facturaSchema)
    .describe("Un elemento por comprobante. Un archivo puede traer varios."),
});

export type FacturaExtraida = z.infer<typeof facturaSchema>;
export type LoteExtraido = z.infer<typeof loteSchema>;
