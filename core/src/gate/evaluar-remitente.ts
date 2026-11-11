import { remitenteVerificado, type AuthResults } from "./auth-results.js";

export type Causal = "remitente_no_autorizado" | "remitente_inactivo" | "remitente_no_verificado";

export type Decision =
  | { decision: "aceptar" }
  | { decision: "rebotar"; causal: Causal }
  | { decision: "ignorar"; causal: Causal };

export type EntradaMaestro = { email: string | null; activo: boolean };

const EMAIL = /[^\s<>,"';()]+@[^\s<>,"';()]+\.[^\s<>,"';()]+/g;

/**
 * Extrae el mail de un header From. Devuelve null si no hay ninguno válido o si
 * hay más de uno: un From con varios remitentes es anómalo y no se le responde a nadie.
 */
export function extraerEmail(from: string): string | null {
  const sinComillas = from.replace(/"[^"]*"/g, " ");
  const encontrados = sinComillas.match(EMAIL) ?? [];
  if (encontrados.length !== 1) return null;
  return encontrados[0]!.trim().toLowerCase();
}

/**
 * Gate 0. Función pura: no lee la factura, no toca red ni DB.
 *
 * Orden deliberado:
 *  1. From ilegible o múltiple  -> ignorar (no hay a quién responder).
 *  2. No verificado (DMARC)     -> ignorar. Responder a un From falsificado sería
 *                                  backscatter: le escribiríamos a una víctima.
 *  3. No está en el maestro     -> rebotar.
 *  4. Está pero inactivo        -> rebotar.
 *  5. Resto                     -> aceptar.
 */
export function evaluarRemitente(input: {
  from: string;
  auth: AuthResults;
  maestro: EntradaMaestro[];
}): Decision {
  const email = extraerEmail(input.from);
  if (!email) return { decision: "ignorar", causal: "remitente_no_autorizado" };

  if (!remitenteVerificado(input.auth)) {
    return { decision: "ignorar", causal: "remitente_no_verificado" };
  }

  const coincidencias = input.maestro.filter((m) => m.email?.trim().toLowerCase() === email);
  if (coincidencias.length === 0) return { decision: "rebotar", causal: "remitente_no_autorizado" };
  if (!coincidencias.some((m) => m.activo)) return { decision: "rebotar", causal: "remitente_inactivo" };

  return { decision: "aceptar" };
}
