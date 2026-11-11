import { extraerEmail } from "./evaluar-remitente.js";
import { getHeader, type Header } from "./headers.js";

export type MotivoIgnorado = "propia_casilla" | "auto_submitted" | "precedence" | "remitente_sistema";

export type ReglasPrevias = { ignorar: false } | { ignorar: true; motivo: MotivoIgnorado };

const PRECEDENCE_IGNORADAS = new Set(["bulk", "list", "junk"]);
const LOCAL_PART_SISTEMA = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)$/;

/**
 * Filtra lo que NUNCA debe recibir una respuesta automática: auto-respuestas,
 * listas, bounces y nuestra propia casilla. Sin esto, dos robots se contestan
 * entre sí indefinidamente.
 */
export function evaluarReglasPrevias(headers: Header[], casillaPropia: string): ReglasPrevias {
  const email = extraerEmail(getHeader(headers, "From") ?? "");

  if (email && email === casillaPropia.trim().toLowerCase()) {
    return { ignorar: true, motivo: "propia_casilla" };
  }

  const autoSubmitted = getHeader(headers, "Auto-Submitted")?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") {
    return { ignorar: true, motivo: "auto_submitted" };
  }

  const precedence = getHeader(headers, "Precedence")?.trim().toLowerCase();
  if (precedence && PRECEDENCE_IGNORADAS.has(precedence)) {
    return { ignorar: true, motivo: "precedence" };
  }

  const localPart = email?.split("@")[0];
  if (localPart && LOCAL_PART_SISTEMA.test(localPart)) {
    return { ignorar: true, motivo: "remitente_sistema" };
  }

  return { ignorar: false };
}
