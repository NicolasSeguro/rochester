import { getHeaders, type Header } from "./headers.js";

export type ResultadoAuth = "pass" | "fail" | "none" | "otro";

export type AuthResults = {
  spf: ResultadoAuth;
  dkim: ResultadoAuth;
  dmarc: ResultadoAuth;
};

const SIN_DATOS: AuthResults = { spf: "none", dkim: "none", dmarc: "none" };

function normalizar(valor: string): ResultadoAuth {
  if (valor === "pass" || valor === "fail" || valor === "none") return valor;
  return "otro";
}

/**
 * Parsea UN valor de Authentication-Results (RFC 8601).
 * Los comentarios entre paréntesis se descartan antes de parsear: ahí puede
 * aparecer cualquier texto, incluido "dmarc=pass".
 */
export function parseAuthenticationResults(header: string | undefined): AuthResults {
  if (!header) return { ...SIN_DATOS };

  const limpio = header.replace(/\([^)]*\)/g, " ");
  const resultado: AuthResults = { ...SIN_DATOS };

  for (const segmento of limpio.split(";")) {
    const m = segmento.match(/^\s*(spf|dkim|dmarc)\s*=\s*([a-z]+)/i);
    if (!m) continue;
    const metodo = m[1]!.toLowerCase() as keyof AuthResults;
    const valor = normalizar(m[2]!.toLowerCase());
    // Un mail puede tener varias firmas DKIM: si alguna pasa, cuenta como pass.
    if (resultado[metodo] === "pass") continue;
    if (resultado[metodo] === "none" || valor === "pass") resultado[metodo] = valor;
  }

  return resultado;
}

/**
 * Elige, entre los headers Authentication-Results del mensaje, SOLO el que
 * agregó nuestro receptor (authserv-id). Cualquier otro puede haber sido
 * inyectado por el remitente.
 */
export function resultadosConfiables(headers: Header[], authservId: string): AuthResults {
  const id = authservId.toLowerCase();
  const propio = getHeaders(headers, "Authentication-Results").find(
    (v) => v.split(";")[0]!.trim().toLowerCase() === id,
  );
  return parseAuthenticationResults(propio);
}

/**
 * Remitente verificado = DMARC pass. DMARC exige alineación entre el dominio
 * del From y SPF/DKIM, que es justo lo que nos importa: que el From no sea falso.
 * SPF o DKIM solos NO alcanzan (validan otro dominio, no el que ve el humano).
 */
export function remitenteVerificado(auth: AuthResults): boolean {
  return auth.dmarc === "pass";
}
