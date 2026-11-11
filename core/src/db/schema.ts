import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const canalEnum = pgEnum("canal", ["email", "whatsapp"]);

export const estadoFacturaEnum = pgEnum("estado_factura", [
  "autorizada",
  "en_espera",
  "rechazada",
]);

export const resultadoControlEnum = pgEnum("resultado_control", [
  "ok",
  "fail",
  "warn",
]);

// Estado de un mensaje entrante frente al Gate 0.
export const estadoMensajeEnum = pgEnum("estado_mensaje", [
  "pendiente",
  "aceptado",
  "rebotado",
  "ignorado",
  "error",
]);

export const causalGateEnum = pgEnum("causal_gate", [
  "remitente_no_autorizado",
  "remitente_inactivo",
  "remitente_no_verificado",
]);

// ─── Tenants ─────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  slug: text("slug").notNull().unique(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

// ─── Empresas (razones sociales) ─────────────────────────────────────────────

export const empresas = pgTable("empresas", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  nombre: text("nombre").notNull(),
  slug: text("slug").notNull(),       // classic | calafate | bariloche | lobos | concept
  cuit: text("cuit"),                 // pendiente de Rochester
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

// ─── Autorizaciones (Gate 0) ──────────────────────────────────────────────────
// Quién puede enviar facturas. Si no está acá → rebote automático.

export const autorizaciones = pgTable(
  "autorizaciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    nombre: text("nombre").notNull(),
    email: text("email"),
    whatsapp: text("whatsapp"),
    rubro: text("rubro"),
    cc: text("cc"),                     // centro de costo sugerido
    topePorFactura: numeric("tope_por_factura", { precision: 14, scale: 2 }),
    topeMensual: numeric("tope_mensual", { precision: 14, scale: 2 }),
    activo: boolean("activo").notNull().default(true),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
  },
  (t) => [
    // Un mismo remitente no puede estar dos veces en el maestro del tenant.
    // Los NULL (autorizaciones solo por WhatsApp) no chocan entre sí en Postgres.
    uniqueIndex("autorizaciones_tenant_email_uq").on(t.tenantId, sql`lower(${t.email})`),
  ],
);

// ─── Mensajes entrantes (Gate 0) ──────────────────────────────────────────────
// Un registro por mail recibido. gmail_message_id UNIQUE es la clave de
// idempotencia: reprocesar el mismo mail nunca duplica el rebote.

export const mensajesEntrantes = pgTable(
  "mensajes_entrantes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    canal: canalEnum("canal").notNull().default("email"),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id"),
    remitente: text("remitente"),            // mail normalizado, null si el From era ilegible
    asunto: text("asunto"),
    estado: estadoMensajeEnum("estado").notNull().default("pendiente"),
    causal: causalGateEnum("causal"),
    motivoIgnorado: text("motivo_ignorado"), // auto_submitted, precedence, propia_casilla, ...
    reboteEnviadoEn: timestamp("rebote_enviado_en"),
    intentos: integer("intentos").notNull().default(0),
    error: text("error"),
    creadoEn: timestamp("creado_en").notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mensajes_entrantes_gmail_message_id_uq").on(t.gmailMessageId)],
);

// ─── Sync state ───────────────────────────────────────────────────────────────
// Cursor de cada fuente de ingesta (hoy solo Gmail: historyId).

export const syncState = pgTable(
  "sync_state",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fuente: text("fuente").notNull(),        // "gmail"
    historyId: text("history_id"),
    ultimoPollOkEn: timestamp("ultimo_poll_ok_en"),
    actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.fuente] })],
);

// ─── Proveedores ──────────────────────────────────────────────────────────────
// Espejo del maestro de CQR. Se sincroniza desde el espejo MySQL (Fase 2).

export const proveedores = pgTable("proveedores", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  cuit: text("cuit").notNull(),
  nombre: text("nombre").notNull(),
  emailAutorizacion: text("email_autorizacion"),
  emailPago: text("email_pago"),
  cbu: text("cbu"),
  imputacion: text("imputacion"),
  cc: text("cc"),
  topePorFactura: numeric("tope_por_factura", { precision: 14, scale: 2 }),
  topeMensual: numeric("tope_mensual", { precision: 14, scale: 2 }),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
});

// ─── Facturas ─────────────────────────────────────────────────────────────────

export const facturas = pgTable("facturas", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  empresaId: uuid("empresa_id").references(() => empresas.id),
  proveedorId: uuid("proveedor_id").references(() => proveedores.id),

  // Origen
  canal: canalEnum("canal").notNull(),
  remitente: text("remitente").notNull(),   // email o número

  // Datos del comprobante
  tipo: text("tipo"),                        // FC A, FC B, etc.
  puntaVenta: integer("punta_venta"),
  numero: integer("numero"),
  cae: text("cae"),
  fechaEmision: timestamp("fecha_emision"),
  fechaVencimiento: timestamp("fecha_vencimiento"),

  // Montos
  neto: numeric("neto", { precision: 14, scale: 2 }),
  iva: numeric("iva", { precision: 14, scale: 2 }),
  total: numeric("total", { precision: 14, scale: 2 }),

  // Resultado
  estado: estadoFacturaEnum("estado").notNull().default("en_espera"),
  causal: text("causal"),

  // Archivo original
  archivoR2Key: text("archivo_r2_key"),

  // Lo que extrajo la IA (JSON crudo)
  rawJson: text("raw_json"),

  // ID en CQR una vez cargada (Fase 3)
  cqrId: text("cqr_id"),

  creadoEn: timestamp("creado_en").notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
});

// ─── Controles ────────────────────────────────────────────────────────────────
// Resultado de cada control para una factura. Arma el checklist del panel.

export const controles = pgTable("controles", {
  id: uuid("id").primaryKey().defaultRandom(),
  facturaId: uuid("factura_id")
    .notNull()
    .references(() => facturas.id),
  nombre: text("nombre").notNull(),          // ej: "sumas_correctas", "tope_factura"
  resultado: resultadoControlEnum("resultado").notNull(),
  detalle: text("detalle"),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});
