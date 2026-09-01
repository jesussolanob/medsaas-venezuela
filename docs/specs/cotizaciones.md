# Spec — Módulo Cotizaciones / Presupuestos (`quotes`)

> Escrito por el lead el 2026-09-01. **Depende de que el módulo Inventario ya exista**
> (`docs/specs/inventario.md`): una cotización puede incluir productos.
>
> Decisiones del dueño ya tomadas — NO re-preguntar:
>
> | Tema              | Definición                                                                        |
> | ----------------- | --------------------------------------------------------------------------------- |
> | Plan              | **Solo `delta_plus`** (y su espejo `free_trial`)                                  |
> | Envío por correo  | **Enlace al documento**, no PDF adjunto                                           |
> | Destinatario      | Un paciente existente **o** un cliente potencial nuevo (nombre, apellido, correo) |
> | Cliente potencial | **NO se crea como paciente.** Queda en su propio listado                          |

## 1. Qué es

El especialista arma un presupuesto sumando **servicios** que ya tiene definidos y **productos** de
su inventario, se lo manda a un paciente o a alguien que todavía no es paciente, y queda registrado.

## 2. El cliente potencial — por qué no puede ser un paciente

`CreatePatientDtoSchema` exige **cédula obligatoria** (mínimo 4 caracteres) y además correo o
teléfono. No es un capricho del formulario: la cédula alimenta el dedupe (`cedula_search_hash`) y la
tabla maestra `patient_identities`. Relajarlo rompe las dos cosas para todo el sistema.

**El lugar correcto es `leads`**, que ya es exactamente eso: un prospecto con dueño = especialista.
Le faltan dos columnas: `email` y `last_name`.

Reusarla tiene un premio grande: **el módulo CRM (`/doctor/crm`) está construido, gateado y no está
en el menú lateral** — nadie llega. Igual que `ehr`, `billing`, `reports`, `messages` e
`invitations`. El listado de clientes potenciales es la puerta que además destapa el CRM.

⚠️ **Dos cosas a hacer conscientemente:**

1. El correo del prospecto queda **sin cifrar**, igual que el teléfono, que ya está así con un
   comentario explícito en `lead.model.ts` ("no es PHI, es dato de prospecto"). Es coherente, pero
   se documenta en un ADR — no se decide por omisión.
2. `apps/frontend/app/doctor/crm/page.tsx:167` **auto-siembra 8 leads de demostración** si el
   especialista no tiene ninguno. Hay que sacarlo **antes** de que convivan con prospectos reales.
   Nadie quiere descubrir a "Juan Pérez (demo)" en su listado de clientes.

## 3. Datos

### 3.1 `quotes`

| Columna                     | Tipo                               | Notas                                                                               |
| --------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `id`                        | uuid PK                            |                                                                                     |
| `doctor_id`                 | uuid NOT NULL                      | FK `profiles` ON DELETE CASCADE                                                     |
| `quote_number`              | text NOT NULL                      | correlativo **por especialista** (`COT-0001`). UNIQUE (`doctor_id`, `quote_number`) |
| `patient_id`                | uuid NULL                          | FK `patients`                                                                       |
| `lead_id`                   | uuid NULL                          | FK `leads`                                                                          |
| `status`                    | text NOT NULL DEFAULT `'draft'`    | CHECK IN (`draft`,`sent`,`accepted`,`rejected`,`expired`)                           |
| `valid_until`               | date NULL                          | vigencia del presupuesto                                                            |
| `notes`                     | text NOT NULL DEFAULT `''`         |                                                                                     |
| `subtotal_usd`              | numeric(12,2) NOT NULL DEFAULT 0   |                                                                                     |
| `discount_usd`              | numeric(12,2) NOT NULL DEFAULT 0   |                                                                                     |
| `total_usd`                 | numeric(12,2) NOT NULL DEFAULT 0   |                                                                                     |
| `bcv_rate` / `total_bs`     | numeric(12,4) / numeric(14,2) NULL | congelados **al emitir**, no al mirar                                               |
| `sent_at`                   | timestamptz NULL                   |                                                                                     |
| `created_at` / `updated_at` | timestamptz NOT NULL               |                                                                                     |

`CHECK ((patient_id IS NOT NULL) <> (lead_id IS NOT NULL))` — exactamente uno de los dos. Una
cotización sin destinatario o con dos no significa nada.

### 3.2 `quote_items`

`id`, `quote_id` (FK ON DELETE CASCADE), `doctor_id`, `kind` (`service` | `product`), `source_id`
(id del `pricing_plan` o del `product`, **nullable y sin FK dura**), `name`, `description`,
`quantity` numeric(12,2), `unit_price_usd` numeric(12,2), `amount_usd` numeric(12,2), `sort_order`.

🔴 **Nombre, descripción y precio se COPIAN, no se referencian.** Una cotización que cambia sola
cuando tocás el catálogo no es una cotización: es una consulta al catálogo con fecha vieja. Por eso
`source_id` no lleva FK dura — el producto se puede dar de baja y el presupuesto emitido sobrevive
intacto.

### 3.3 `quote_share_links`

`id`, `quote_id`, `token` (48 bytes `base64url`), `expires_at`, `created_at`, `revoked_at`.

## 4. El envío por correo — enlace, no adjunto

El correo del repo **no sabe adjuntar archivos** (`EmailSendInput` tiene `to/subject/html/text/from`
y nada más). Decisión del dueño: **enlace**.

El flujo de `document-sharing` que ya existe **no sirve tal cual**: exige la **cédula del paciente**
como segundo factor, y un cliente potencial no tiene cédula. Entonces:

- **Enlace con token largo e irreconocible, sin código**, que vence en `valid_until` (o 30 días si
  no hay). El destinatario abre `/quotes/<token>`, ve el presupuesto y descarga el PDF.
- Plantilla nueva en `email_templates` (`quote_sent`), sembrada por migración idempotente con
  `ON CONFLICT (name) DO NOTHING` — copiar `20260618000002-shared-documents-email-template.cjs`.
- El nombre del archivo **no lleva PII** (`Cotizacion-COT-0001.pdf`), igual que los documentos
  compartidos.

⚠️ **Decisión de privacidad que el dueño puede revertir:** una cotización no lleva diagnóstico ni
datos clínicos —son servicios, productos y precios— por eso alcanza el token. Pero si la cotización
es para un **paciente**, el enlace revela que esa persona es paciente de ese especialista y qué se
le presupuestó. El modelo de amenaza es el de cualquier enlace mágico: el token es inadivinable y
viaja solo al correo del destinatario. Si el dueño prefiere el segundo factor, se agrega el código
de 6 dígitos **solo para cotizaciones de pacientes** (los prospectos no pueden tenerlo).

### 4.1 Las notas son públicas — y el especialista tiene que saberlo

`notes` viaja al enlace público y se imprime en el PDF: son las **condiciones del presupuesto**,
escritas para que el cliente las lea. **Se queda así.**

Lo que falta es que la pantalla lo diga. La auditoría de seguridad (2026-09-01) marcó el riesgo real:
un especialista puede escribir ahí algo clínico —"consulta por ca. de cuello uterino, incluye
biopsia"— sin sospechar que eso queda visible para cualquiera que tenga el enlace. Nada en la
interfaz se lo advierte.

**Obligatorio en el formulario:** rótulo explícito junto al campo, del tipo _"Estas notas las va a
ver el destinatario del presupuesto"_. Es más barato y más honesto que agregar un segundo campo, y
ataca la causa: hoy el campo no dice para quién escribe.

## 5. El PDF — composición, no obra nueva

| Pieza                                                   | De dónde sale                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Encabezado con logo, especialidad, M.P.P.S., y la firma | `components/pdf/MedicalDocumentPdf.tsx` (`PageContent`, `signatureArea`, `footer` fijo) |
| Tabla de ítems con zebra                                | `components/pdf/SpecialistsReportPdf.tsx` (`COL_WIDTHS`, `tableHeader`/`tableRow`)      |
| Totales USD + Bs a la tasa                              | `lib/receipt-pdf.ts` (`buildReceiptHtml`, fila `tr.total`)                              |
| Branding (color, encabezado, pie)                       | `doctor_templates` — ya existe, no se inventa nada                                      |

Dos caminos, los dos necesarios:

- **Descarga desde la app**: `pdf().toBlob()` con import dinámico, como
  `GenerateDocumentModal.tsx:368`.
- **Descarga desde el enlace público**: render server-side, como
  `app/api/documents/[token]/pdf/route.ts`. 🔴 **Obligatorio el paso `imageUrlToDataUri()`**: del
  lado del servidor `@react-pdf` **no embebe URLs remotas de forma fiable — las omite en silencio**
  y el PDF sale sin logo y sin firma, sin ningún error.

## 6. Listado y filtros

Listado con: número, destinatario, fecha, vigencia, total, estado. Filtros pedidos por el dueño:
**nombre de producto, proveedor, y nombre de paciente o cliente**.

🔴 **Los nombres de pacientes están cifrados (AES-256-GCM), así que no hay `LIKE` posible en SQL.**
No inventar una solución nueva: reusar la búsqueda de pacientes que ya funciona para resolver
`nombre → ids` y filtrar cotizaciones por esos ids. Por producto, proveedor y nombre de prospecto
(que no está cifrado) sí es texto libre normal, con join a `quote_items` / `products` / `leads`.

## 7. Backend

Módulo `apps/backend/src/modules/quotes/`, DDD de 4 capas, registrado en `app.module.ts`.
Controller `@Controller('doctor/quotes')` + `AppAuthGuard`, `doctorId` de `@CurrentUser().sub`,
envelope `{ success, data }`.

`GET /` (con filtros y paginación) · `POST /` · `GET /:id` · `PUT /:id` · `DELETE /:id` ·
`POST /:id/send` (emite: congela tasa y total en Bs, crea el enlace, manda el correo, pasa a
`sent`) · `PUT /:id/status`. Público: `GET /api/quotes/:token` (sin auth, valida vigencia).

Migración `role_capabilities` (`quotes`, 4 acciones para `doctor`) + `plan_features` **una fila por
cada plan** (`delta_plus` y `free_trial` en true; el resto en false). Sin fila = denegado y el
módulo ni aparece en la matriz del admin.

## 8. Frontend

Página `/doctor/quotes` (listado + filtros), `/doctor/quotes/[id]` (detalle y edición), y la vista
pública `/quotes/[token]`. Gating visible: los **4 archivos** de siempre (`navSections`,
`PLAN_GATED_ROUTES`, `PLAN_GATED_MODULES`, `FEATURE_LABELS` de `UpgradeClient`).

Junto con esto: **agregar el CRM al menú lateral** y sacarle la auto-siembra de leads demo.

## 9. Tests obligatorios

1. Una cotización con `patient_id` **y** `lead_id` a la vez es rechazada; sin ninguno también.
2. Cambiar el precio de un producto **no** cambia el total de una cotización ya emitida.
3. El correlativo `quote_number` no se repite por especialista bajo escritura concurrente.
4. El enlace vencido devuelve 404/410, no el documento.
5. Anti-IDOR: cotización de otro especialista → mismo error que un id inexistente.
6. `total_usd = Σ amount_usd − discount_usd`, calculado en el backend.

## 10. Verificación (igual que inventario)

`nx build backend` · `nx test backend` **completo** · lint acotado a los archivos tocados · `tsc`
del frontend. **Sin Docker, sin migraciones contra una base, sin boot del `dist`** — eso lo hace el
lead en la ventana de QA.
