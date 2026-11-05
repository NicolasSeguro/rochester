import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
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

export const autorizaciones = pgTable("autorizaciones", {
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
});

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
