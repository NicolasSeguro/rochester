/**
 * Prueba manual de extracción IA. NO toca base de datos ni CQR.
 *
 *   npx tsx src/scripts/extraer-factura.ts "<archivo-o-carpeta>" [--out <dir>]
 *
 * Requiere ANTHROPIC_API_KEY (y opcional ANTHROPIC_MODEL) en core/.env.
 * Guarda un JSON por archivo en --out (default: .salida-extraccion/, ignorado por git).
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { EXTENSIONES_SOPORTADAS, extraerFacturas } from "../extraccion/extraer.js";
import { marcarDuplicados, verificarFactura, type ItemLote } from "../extraccion/verificar.js";

try {
  process.loadEnvFile(".env");
} catch {
  // sin .env: puede que las variables ya estén en el entorno
}

const args = process.argv.slice(2);
const iOut = args.indexOf("--out");
const outDir = resolve(iOut >= 0 ? (args[iOut + 1] ?? "") : ".salida-extraccion");
const entrada = args.find((a, i) => !a.startsWith("--") && (iOut < 0 || i !== iOut + 1));

if (!entrada) {
  console.error('Uso: npx tsx src/scripts/extraer-factura.ts "<archivo-o-carpeta>" [--out <dir>]');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY en core/.env");
  process.exit(1);
}

const modelo = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

async function listarArchivos(ruta: string): Promise<string[]> {
  const info = await stat(ruta);
  if (info.isFile()) return [ruta];
  const nombres = await readdir(ruta);
  return nombres
    .filter((n) => EXTENSIONES_SOPORTADAS.includes(extname(n).toLowerCase()))
    .sort()
    .map((n) => join(ruta, n));
}

const icono = (r: string) => (r === "pass" ? "OK  " : r === "warn" ? "WARN" : "FAIL");

const client = new Anthropic();
const archivos = await listarArchivos(resolve(entrada));
await mkdir(outDir, { recursive: true });
console.log(`Modelo: ${modelo} | Archivos: ${archivos.length} | Salida: ${outDir}\n`);

const lote: ItemLote[] = [];
let tokIn = 0;
let tokOut = 0;

for (const ruta of archivos) {
  const nombre = basename(ruta);
  try {
    const r = await extraerFacturas(client, modelo, ruta);
    tokIn += r.tokensEntrada;
    tokOut += r.tokensSalida;
    r.lote.facturas.forEach((factura, i) => {
      lote.push({ archivo: r.lote.facturas.length > 1 ? `${nombre}#${i + 1}` : nombre, factura });
    });
    await writeFile(join(outDir, `${nombre}.json`), JSON.stringify(r.lote, null, 2));
  } catch (e) {
    console.error(`ERROR ${nombre}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("─".repeat(80));
for (const item of marcarDuplicados(lote)) {
  const f = item.factura;
  const v = verificarFactura(f);
  const t = f.importes.total;
  console.log(`${v.ok && !item.duplicadoDe ? "✔" : "✘"} ${item.archivo}`);
  console.log(
    `    ${f.tipo} ${f.letra ?? "?"} ${f.punto_venta ?? "?"}-${f.numero ?? "?"} | ${f.emisor.razon_social ?? "?"} (${f.emisor.cuit ?? "?"}) → ${f.receptor.razon_social ?? "?"} (${f.receptor.cuit ?? "?"}) | total ${t ?? "?"} ${f.moneda ?? ""}`,
  );
  console.log(
    `    sumas ${icono(v.sumas.resultado)} | cuit emisor ${icono(v.cuitEmisor.resultado)} | cuit receptor ${icono(v.cuitReceptor.resultado)} | cae ${icono(v.cae.resultado)}`,
  );
  for (const c of [v.esComprobante, v.sumas, v.cuitEmisor, v.cuitReceptor, v.cae]) {
    if (c.resultado !== "pass") console.log(`    · ${c.detalle}`);
  }
  if (item.duplicadoDe) console.log(`    · DUPLICADA de ${item.duplicadoDe}`);
  for (const o of f.observaciones) console.log(`    · IA: ${o}`);
}
console.log("─".repeat(80));
console.log(`Tokens: ${tokIn} entrada / ${tokOut} salida`);
