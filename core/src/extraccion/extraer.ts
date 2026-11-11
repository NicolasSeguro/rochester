import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { loteSchema, type LoteExtraido } from "./schema.js";

const SYSTEM = `Sos un extractor de datos de comprobantes fiscales argentinos (facturas, notas de crédito/débito).
Tu única tarea es TRANSCRIBIR lo que está impreso en el documento. No decidís nada: otra capa valida y autoriza.

Reglas:
- Extraé SOLO lo que se ve en el documento. Si un dato no está o no se lee con certeza, devolvé null y explicalo en "observaciones". Nunca inventes ni deduzcas CUIT, CAE, números ni importes.
- NO recalcules importes: copiá los valores impresos, aunque no te cierren. Si las sumas del comprobante no cierran, igual transcribilas tal cual y anotalo en "observaciones".
- Números en formato argentino ("1.234,56") se devuelven como número decimal (1234.56).
- Fechas en formato YYYY-MM-DD.
- "emisor" es quien vende/factura (el proveedor). "receptor" es el cliente a quien se factura.
- punto_venta y numero: solo dígitos, tal cual impresos (ej. "00004" y "00012345").
- Si el archivo contiene varios comprobantes, devolvé uno por cada uno. Si no es un comprobante, devolvé un elemento con es_comprobante=false.`;

const MEDIA: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const EXTENSIONES_SOPORTADAS = [".pdf", ...Object.keys(MEDIA)];

export type ResultadoExtraccion = {
  lote: LoteExtraido;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
};

async function bloqueArchivo(ruta: string): Promise<Anthropic.ContentBlockParam> {
  const ext = extname(ruta).toLowerCase();
  const data = (await readFile(ruta)).toString("base64");
  if (ext === ".pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  const media = MEDIA[ext];
  if (!media) throw new Error(`Extensión no soportada: ${ext}`);
  return { type: "image", source: { type: "base64", media_type: media, data } };
}

export async function extraerFacturas(
  client: Anthropic,
  modelo: string,
  ruta: string,
): Promise<ResultadoExtraccion> {
  const response = await client.messages.parse({
    model: modelo,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [await bloqueArchivo(ruta), { type: "text", text: "Extraé los comprobantes de este archivo." }],
      },
    ],
    output_config: { format: zodOutputFormat(loteSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`La IA rechazó la solicitud (${response.stop_details?.category ?? "sin categoría"}).`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Respuesta truncada por max_tokens: el archivo trae demasiados comprobantes.");
  }
  if (response.parsed_output === null) {
    throw new Error("La IA devolvió una salida que no cumple el schema.");
  }

  return {
    lote: response.parsed_output,
    modelo: response.model,
    tokensEntrada: response.usage.input_tokens,
    tokensSalida: response.usage.output_tokens,
  };
}
