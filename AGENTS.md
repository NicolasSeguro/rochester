# Rochester · Automatización de facturas — Contexto del proyecto

> Documento maestro para el agente (Cursor / Claude Code). Leelo entero antes de construir.
> Guardalo en la raíz del repo como `AGENTS.md` (o `.cursor/rules/rochester.md`).
> Regla de oro: ante la duda, respetá los **principios de seguridad** de la sección 3. No los rompas por conveniencia.

---

## 1. Qué es esto

Sistema que automatiza la **carga de facturas de proveedores** de un grupo hotelero (Rochester) hacia su PMS, **CQR**. Las facturas llegan por mail y WhatsApp; el sistema las lee, valida contra reglas de control interno y, si pasan, las carga en CQR. Todo se refleja en un **panel de operaciones** ("Rochester Ops").

Es el **tenant #001** de un producto multi-cliente más grande (panel unificado + asistente conversacional). Por eso todo se diseña multi-tenant desde el día uno, aunque hoy solo exista Rochester.

**Cliente:** grupo con 5 razones sociales. Interlocutores: Julio (CEO), Walter (admin / nexo con CQR / admin de usuarios), Daniel (contador, dueño del control interno), Luis Maestre (equipo, comunicación).

---

## 2. Arquitectura (dos capas)

El principio rector: **la IA extrae y propone; una capa determinística valida y decide.** La IA nunca decide pagos ni montos.

```
Fuentes            Ingesta            Procesamiento                     Destino
─────────          ─────────          ─────────────────────            ─────────
Gmail (mail  ──►   Gate de      ──►   Extracción IA (PDF/foto/link ──► Store Postgres
 único)            identidad          → JSON) + dedup                   (normalizado,
WhatsApp (Kapso,   (remitente                │                          multi-tenant)
 nº interno)        autorizado?)             ▼                              │
                        │            Batería de controles                  ▼
                     rebota si       (determinística)                  Panel + Asistente
                     no autorizado         │
                                           ▼
                                  3 resultados:
                                  • Autorizada → carga en CQR (API)
                                  • En espera  → alta manual (proveedor nuevo)
                                  • Rechazada  → vuelve con causal
```

### Flujo de decisión (orden exacto)
1. **Gate 0 — identidad del remitente.** ¿El mail/WhatsApp está en el maestro de autorizaciones? Si no → rebote automático con causal, **sin leer la factura**. Corta acá.
2. **Extracción IA.** PDF / foto / link → JSON estructurado. Split de multi-factura (un mail puede traer varias). Dedup por `CUIT emisor + tipo + punto de venta + número` (o por CAE).
3. **Batería de controles (corren todos, arman checklist):**
   - Tipo de comprobante y sumas (neto + IVA = total).
   - Empresa por **CUIT receptor** (resuelve a cuál de las 5 razones sociales va).
   - Proveedor existe en el maestro de CQR.
   - Tope por factura.
   - Tope mensual acumulado (leído **en vivo**, ver §4).
   - CAE / ARCA → **Fase 2**.
4. **Resultado por factura** (no por mail):
   - **Autorizada** → se carga en CQR vía API.
   - **En espera** → proveedor nuevo NO se autocarga; va a alta manual con doble control (requisito de Daniel).
   - **Rechazada** → vuelve al origen con el checklist de causales.

---

## 3. Principios de seguridad — NO NEGOCIABLES

1. **La IA nunca decide pagos ni montos.** Solo extrae datos y propone. La autorización la da la capa de reglas determinística.
2. **Nunca escribir directo en las tablas de CQR.** La carga va SIEMPRE por el API de CQR, para que corran sus validaciones.
3. **Mínimo privilegio en lectura.** Conectarse solo a las tablas necesarias del espejo, nunca a la base completa.
4. **Proveedor nuevo no se autocarga.** Siempre alta manual con segregación de funciones.
5. **Multi-tenant siempre.** Toda tabla del store lleva `tenant_id` y `empresa_id`. Rochester = tenant #001.
6. **Secrets en variables de entorno** (Railway), nunca hardcodeados ni en el repo.
7. **Idempotencia.** El dedup evita cargar dos veces la misma factura.

---

## 4. Integración con CQR (definida con el proveedor)

CQR es el PMS. No tiene APIs públicas por seguridad (datos de tarjeta). El acceso se resolvió así:

### Lectura — base espejo MySQL
- CQR migra su motor a un **servidor nuevo en AWS con MySQL actualizado** y monta **replicación en tiempo real** a un **servidor espejo (slave)**.
- Nos conectamos **al espejo**, no a producción. Las consultas de la IA no impactan el sistema operativo.
- La réplica es **instantánea (milisegundos)** → el **acumulado mensual se lee del espejo en vivo** y refleja lo cargado a mano al momento. Este es el dato crítico para el control de tope mensual.
- Sobre el espejo, CQR **depura datos sensibles** (tarjetas): no quedan expuestos.
- Qué leemos: maestro de proveedores (por CUIT), catálogos (plan de cuentas, centros de costo por empresa), acumulado mensual por proveedor/empresa.

### Escritura — API JSON de CQR
- El alta de factura autorizada va por un **API de CQR que recibe un objeto JSON en tiempo real** (push). Alternativa por lote (1×hora o 1×día).
- **Adjuntos/imágenes de la factura en base64** dentro del JSON.
- Campos a enviar: empresa (por CUIT receptor), proveedor (CUIT), tipo de comprobante, PV y número, CAE, fechas, netos/IVA/total, imputación/CC, fecha de pago pactada.
- **Pendiente de confirmar con CQR:** que el endpoint da de alta con las validaciones de CQR y devuelve respuesta (ID / estado / errores); y que haya **entorno de prueba** separado de producción. No cargar contra producción hasta tener el entorno de prueba.

### Seguridad de conexión
- CQR habilita el acceso **por IP pública fija**: generan credenciales restringidas a esa IP. Ver §6 para obtenerla en Railway. **Hay que pasarles la(s) IP(s) antes de que generen credenciales.**

### Parámetros en el maestro de CQR
Los topes y parámetros viven en **campos alfanuméricos reusados** del maestro de proveedores de CQR (sin Excels paralelos): mail autorizado a facturar, mail de notificación de pago, CBU, imputación/CC, tope por factura, tope por mes.

### Timeline
- Adecuaciones + migración: semana del **05/10**.
- Cambio de motor + activación de la réplica: **noche del martes 06/10** (ventana ~6 h, Rochester sin sistema).
- El conector al espejo se puede desarrollar antes (contra mocks), pero **conecta a datos reales recién después del 06/10**.

---

## 5. Empresas (razones sociales) — fuente única

Definir los nombres en UN solo lugar (config/constante) y usar esa referencia en todo el código y el panel. Si se renombra una, se cambia acá.

| id | Razón social | CUIT | Nota |
|----|--------------|------|------|
| classic | RH Classic | (pendiente real) | ex "Rochester Hotelería" |
| calafate | Rochester Calafate | (pendiente real) | |
| bariloche | Rochester Bariloche | (pendiente real) | |
| lobos | Rochester Lobos | (pendiente real) | |
| concept | RH Concept | (pendiente real) | ex "Rochester Servicios" |

Un **único mail de recepción** para las 5; la empresa destino se resuelve por el **CUIT receptor** de cada factura. Los CUIT reales están pendientes de que los pase el cliente.

---

## 6. Tarea inmediata: IP fija de salida en Railway

CQR necesita una IP pública fija para atar las credenciales. Railway lo ofrece nativo (plan Pro).

**Pasos (dashboard):**
1. Estar en plan **Pro**. La IP se asigna **por servicio**: usar el servicio del **conector** que se conecta a CQR (crear uno mínimo si no existe todavía).
2. En ese servicio: **Settings → Networking**.
3. Activar **"Enable Static IPs"** (opción HA → asigna varias IPs con balanceo).
4. Railway muestra las IPv4 de la región. Copiar **todas** (hoy son 3).
5. **Redeploy** del servicio.

**CLI:** `railway outbound-network static-ip enable` y luego redeploy. Verificar estado con `railway outbound-network static-ip status`.

**Verificar egress** (desde el servicio, una vez desplegado): pegarle a un echo de IP (ej. `curl https://api.ipify.org`) y confirmar que sale por las IPs asignadas.

**Avisos importantes:**
- Son **3 IPs**, no una → pasarle las 3 a CQR para el allowlist.
- Son **por región** → si se mueve el servicio de región, cambian. No mover después de darlas.
- No están garantizadas como **dedicadas** (pueden compartirse). Para atar credenciales alcanza (lo que importa es que sean estables). Si CQR exigiera IP exclusiva, ahí sí meter un proxy dedicado (QuotaGuard/Fixie).
- Son **solo de salida** (no reciben tráfico entrante) — es justo lo que necesitamos.

Entregable de esta tarea: las IPs copiadas y enviadas a CQR.

---

## 7. Stack

- **Panel:** hoy vitrina HTML single-file en **Vercel** (`rochester-ops.vercel.app`). A futuro, app que lee del store.
- **Núcleo / store:** **Railway** — Node.js/TypeScript + **Postgres** + Redis/BullMQ (colas).
- **Archivos** (comprobantes): **Cloudflare R2**.
- **IA:** **Anthropic API** (Sonnet como agente principal; Haiku/Groq para clasificación barata). Visión para extraer datos de facturas.
- **Ingesta:** **Gmail API** (casilla única) + **Kapso** (WhatsApp, número interno).
- Secrets: variables de entorno de Railway.

---

## 8. Store (Postgres) — modelo mínimo sugerido

Todas las tablas con `tenant_id` y (donde aplique) `empresa_id`.

- `tenants` — Rochester = #001.
- `empresas` — las 5 razones sociales (id, nombre, cuit).
- `autorizaciones` — maestro de autorizaciones: quién puede enviar (nombre, mail, whatsapp, rubro/CC, topes). **Enciende el Gate 0.**
- `proveedores` — espejo de lo relevante del maestro de CQR (cuit, nombre, topes, imputación/CC, campos reusados).
- `facturas` — cada comprobante: emisor, receptor (empresa por CUIT), tipo, PV, número, CAE, fechas, neto/IVA/total, canal, estado (autorizada/en_espera/rechazada), causal, ref a archivo en R2.
- `controles` — resultado por control de cada factura (para el checklist del panel).
- `acumulados` — o leído en vivo del espejo; no duplicar la fuente de verdad del tope.

Clave de dedup: `cuit_emisor + tipo + punto_venta + numero` (o CAE).

---

## 9. Roadmap por fases

- **Fase 0 — Rebote de Gmail.** No depende de CQR. Si el remitente no está autorizado, responde con la causal y no procesa. (Requiere Gmail API + maestro de autorizaciones.)
- **Fase 1 — Extracción IA + controles formales.** Tipo/sumas, empresa por CUIT, dedup. Sin CQR todavía (o contra mocks).
- **Fase 2 — Lecturas de CQR.** Conector al espejo MySQL: maestro, catálogos, acumulado en vivo. Requiere IP fija + credenciales + espejo activo (post 06/10).
- **Fase 3 — Carga en CQR.** Writer contra el API JSON (alta con validaciones, base64, manejo de respuesta y duplicados). Requiere entorno de prueba confirmado.

Construir por módulos chicos que dejen algo funcionando en cada paso.

---

## 10. Panel "Rochester Ops"

- Vistas: Resumen (KPIs), Facturas, Proveedores, Empresas, Asistente, Flujo de decisión.
- Selector de razón social (grupo o una de las 5); los KPIs y la tabla se filtran.
- Cada factura es **clickeable** → abre el comprobante original + lo que leyó la IA (JSON) + el checklist de controles + veredicto. (Pedido explícito de Daniel.)
- Estados: Autorizada (verde), En espera (ámbar), Rechazada (rojo).
- Estética: fondo crema cálido, acento naranja (#F04E0F), tipos DM Sans / DM Mono / Bebas Neue. Sobrio, operativo, confiable.

---

## 11. Qué falta del lado del cliente (bloqueantes)

- **Maestro de autorizaciones** (Rochester): quién puede enviar facturas. Enciende el Gate 0.
- **CUIT reales** de las 5 razones sociales.
- **Casilla de mail única** de recepción + número de WhatsApp interno definidos.
- **Confirmar con CQR:** endpoint da de alta con validaciones y devuelve respuesta; entorno de prueba.
- **Ventana de mantenimiento 06/10** confirmada por los equipos de Rochester.
