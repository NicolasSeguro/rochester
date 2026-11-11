export type Header = { name: string; value: string };

/** Todos los valores de un header (puede repetirse), sin importar mayúsculas. */
export function getHeaders(headers: Header[], name: string): string[] {
  const buscado = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === buscado).map((h) => h.value);
}

/** Primer valor de un header, o undefined si no está. */
export function getHeader(headers: Header[], name: string): string | undefined {
  return getHeaders(headers, name)[0];
}
