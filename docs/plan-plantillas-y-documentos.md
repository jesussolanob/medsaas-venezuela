# Blueprint: Plantillas de contenido + Récipes/paraclínicos/reposos sin consulta

> Investigación read-only sobre el repo `medsaas-venezuela`, rama `feature/plantillas-y-documentos`,
> para los ítems #2 y #3 de "Cambios 12-10" (`memory-bank/06-mvp-planning.md`). Ningún archivo del
> repo fue modificado para producir este documento.

## Hallazgo principal (lee esto primero)

**Los editores de récipe/paraclínicos/reposo NO son componentes de modal separados.** Son bloques
JSX inline dentro del monolito de 8,086 líneas `apps/frontend/app/doctor/consultations/ConsultationsClient.tsx`
(modal `showRecipe` en `:6107-6166+`, tab paraclínico en `:4521-4674`, tab reposo en `:4674+`). No existe
un `RecipeModal.tsx`/`ParaclinicalModal.tsx`/`ReposoModal.tsx` para importar. "Reutilizar el mismo modal"
del pedido del dueño debe leerse como **reutilizar las mismas formas de datos + el mismo pipeline de
render de PDF**, no como import literal de un componente. Esto cambia materialmente el blueprint
respecto de lo que el pedido sugiere a primera vista — ver Riesgo abierto #1.

---

## A. Piezas existentes a reutilizar

### A1. Editor de récipe

`ConsultationsClient.tsx`. Estado: `recipe: Recipe` (`:853`), `type Recipe = { medications: Medication[]; notes: string }`
(`:242-245`), `type Medication = { name, dose, route, frequency, duration, presentation, indications }` (`:231-239`).
Persiste vía tabla `prescriptions` (una fila por medicamento, ver A5) y/o `blocks_snapshot['prescription']`.
Modal JSX: `:6107-6166+` (estado booleano `showRecipe`). Botón "Generar receta" en `:4346`.

### A2. Editor de paraclínicos

Mismo archivo. Estado: `prescripciones: Prescripcion[]`, `type Prescripcion = { exam_name: string; notes: string }`
(`:413-416`). Se serializa a `string[]` ("examen — indicaciones") vía `serializeParaclinical`/`parseParaclinical`
(`:425-455`) y se persiste en `consultations.blocks_snapshot['paraclinical']` (sin tabla propia). Tab JSX en
`:4521-4674`. Botón "+ Agregar examen" en `:4614`.

### A3. Editor de reposo

Mismo archivo. Estado: `reposoDiagnosis, reposoDays, reposoFrom, reposoTo, reposoComments` (`:741-745`),
persistido como `{diagnosis, days, from, to, comments}` en `blocks_snapshot['reposo']` (`:3174-3189`).
Tab JSX en `:4674+`.

### A4. Pipeline de render de PDF (reutilizar TAL CUAL)

`apps/frontend/components/pdf/MedicalDocumentPdf.tsx` toma `ContentBlock[]` o `DocumentPage[]`
(`docType`, `templateConfig`, `doctor`, `patient`, `content`/`documents`) — totalmente desacoplado
de "consulta", no necesita un objeto de consulta. La capa de pegamento es
`apps/frontend/app/doctor/consultations/consultation-documents.ts`, que exporta funciones constructoras
puras ya suficientemente agnósticas de la consulta como para llamarlas directo para documentos standalone:

- `buildRecetasContent(prescriptions: SavedPrescription[])` (`:126`) — récipe hoja 1
- `buildRecipeHoja2Content(prescriptions)` (`:146`) — récipe hoja 2 (indicaciones)
- `buildRestBlocks(rest: RestData | null)` (`:506`) — reposo
- **no existe** un equivalente `buildParaclinicalContent` — el contenido paraclínico solo se construye
  dentro de `buildConsolidatedContent` (`:380`) leyendo `blocksSnapshot['paraclinical']`. Se necesita una
  función pura nueva `buildParaclinicalContent(items: {exam_name,notes}[])` que imite a
  `buildRecetasContent` (aditiva, ~15 líneas, riesgo cero).
- `GenerateDocumentModal.tsx` (`apps/frontend/app/doctor/consultations/GenerateDocumentModal.tsx`) es la UI
  existente que maneja este pipeline para documentos _de consulta_ — no reutilizable como componente para
  documentos standalone (props hardcodeadas a consulta: `consultationCode`, `patientConsultationCount`,
  `patientEhrCount`), pero su **patrón** (import dinámico de react-pdf, `pdf().toBlob()`) debe imitarse en
  un nuevo `StandaloneDocumentPdfButton`/generador.

### A5. Tabla `prescriptions`

`apps/backend/src/modules/prescriptions/domain/entities/prescription.entity.ts`. `consultationId` **ya es
nullable** (`:21,36,50`), las columnas son `medication`/`notes`, no `medication_name`/`instructions`
(`:10-12`). Buena noticia: los récipes standalone pueden reutilizar esta tabla para las filas de
medicamentos, pero **no tiene concepto de agrupación/estado/código** — no hay `status` (draft/issued/voided),
no hay código de documento, no hay "este grupo de N filas de medicamento = un récipe". De todos modos se
necesita una tabla cabecera nueva (ver B).

### A6. Módulo Quotes (presupuestos)

`apps/backend/src/modules/quotes/`. Entidad `QuoteItem` (`quote-item.entity.ts`) —
`{kind: 'service'|'product'|'manual', sourceId, name, description, quantity, unitPriceUsd, amountUsd}`,
el monto siempre se computa en el servidor, los valores del catálogo se **congelan al crear** (nunca los
actualiza un cambio posterior del catálogo — `:4-5`). Frontend: `apps/frontend/app/doctor/quotes/QuoteCreateModal.tsx`.
Fila de ítems con dropdowns "+ Servicio"/"+ Producto" en `:653-800` (header de sección "Ítems" en `:656`);
`options.services`/`options.products` ya cargados en el estado del modal (`:138`) desde
`getQuoteFormOptions()` — esto es exactamente lo que necesita un nuevo botón dropdown "Plantillas" para
re-resolver el precio **actual** por `kind`+`source_id` al aplicar una plantilla (requisito del dueño:
"precio actual del inventario").

### A7. Búsqueda/creación de paciente de consulta inmediata

`apps/frontend/components/doctor/ImmediateConsultationModal.tsx`. Estado de búsqueda/creación de paciente
en `:82-90` (`query`, `results`, `patient`, `showCreate`, `newPatient`), construido sobre helpers
compartidos `fetchDoctorOffices`, `normalizePatient`, `normalizeService` de
`apps/frontend/components/appointment-flow/appointment-flow.utils.ts`. Este modal **no** es un
subcomponente reutilizable para búsqueda de paciente — es monolítico para la semántica de "consulta
inmediata" (consultorios, servicio, ventana de agenda). El sub-flujo de buscar-o-crear paciente
actualmente NO está extraído en su propio componente; debe extraerse (nuevo `PatientSearchOrCreate.tsx`,
props: `onSelect(patient)`) para evitar duplicar esa lógica una 3ra vez (una en `ImmediateConsultationModal`,
una en el flujo "paciente nuevo" de `QuoteCreateModal`, una para el nuevo modal de documento standalone).
Este es un candidato genuino de refactor-sin-cambiar-comportamiento — riesgo bajo porque es estado de UI
puro, sin lógica de negocio, pero toca un archivo existente (riesgo en D).

### A8. Compartir documentos (document-sharing)

La entidad backend `SharedDocumentLink`
(`apps/backend/src/modules/document-sharing/domain/entities/shared-document-link.entity.ts`) tiene
**`consultationId: string` como campo requerido, no-nulo** (`:38,58`). La ruta del controlador es
literalmente `POST /consultations/:consultationId/share` (`document-sharing.controller.ts:67`).
`GetDocumentRenderDataUseCase` (`get-document-render-data.use-case.ts:228`) llama
`consultationRepo.findById(link.consultationId, ...)` directamente y **lanza `DocumentLinkNotFoundError`
si no encuentra la consulta** (`:239-242`) — es decir, hoy no puede representar un link a nada que no sea
una consulta. El frontend `ShareDocumentsModal.tsx` requiere igualmente `consultationId: string` como prop
(`:45`). **Cambio aditivo mínimo requerido**: agregar columna nullable `standaloneDocumentId` + hacer
`consultationId` nullable con un CHECK XOR (mismo patrón que `quotes_recipient_xor`, migración estilo A6),
ramificar `GetDocumentRenderDataUseCase.execute()` temprano según cuál ID está presente, agregar una ruta
nueva `POST /standalone-documents/:id/share` reutilizando la misma lógica de `ShareConsultationUseCase`
(tolerante a renombre) — el camino existente de compartir consultas queda intacto.

### A9. Generación de código de consulta

`apps/backend/src/modules/consultations/domain/value-objects/consultation-code.vo.ts`. VO puro:
`ConsultationCode.generate(date, sequence)` → `DLT-YYYYMM-NNNN` (rellena a 4 dígitos, `:26-32`);
`isValid()` regex `:38`. Trivialmente imitable para `REC-`/`PAR-`/`REP-` — ya sea parametrizando este VO
con un argumento `prefix` (aditivo, compatible hacia atrás con default `'DLT'`) o creando 3 VOs hermanos
pequeños. La unicidad de la secuencia la maneja el repositorio (patrón retry-on-conflict — hay que grepear
el uso de `ConsultationCodeConflictError`/`ConsultationCodeExhaustedError` en
`sequelize-consultation.repository.ts` para el loop de retry a imitar exactamente).

### A10. Módulo doctor-templates (el "Plantillas" existente = branding PDF, NO contenido)

`apps/backend/src/modules/doctor-templates/`: entidad `DoctorTemplate`, `template-type.vo.ts`
(`BACKEND_VALID_TYPES` en el frontend refleja esto: `informe, recipe, prescripciones, reposo, recibo,
presupuesto` — `apps/frontend/app/doctor/templates/page.tsx:117-124`), una fila por
`(doctorId, templateType)` — config puramente visual (logo/firma/colores/encabezado/pie), **no** contenido.
Este es un concepto distinto de las nuevas "plantillas de contenido" (ítem #2) — misma página, tab nueva,
no debe colisionar nombres. Página frontend: `apps/frontend/app/doctor/templates/page.tsx` (923 líneas) —
estado `templateTabs` (`:196`), barra de tabs JSX `:558-578`, el item de nav "Plantillas" ya existe y **no
tiene `moduleKey`** en el sidebar (`apps/frontend/app/doctor/layout.tsx:90`) → siempre visible hoy sin
importar el plan. Este es el conflicto central tratado en B/D más abajo: las tabs de branding _existentes_
deben seguir sin gating; solo la tab nueva "Plantillas de contenido" (y su CRUD) debe estar gateada por la
nueva feature `content_templates`.

### A11. Tabs de detalle de paciente

`apps/frontend/app/doctor/patients/page.tsx`. Tipo `DetailTab` + estado `detailTab` en `:218`; barra de
tabs en `:1478-1528` (`Historial de Consultas` `:1482-1490`, `Historial Médico` `:1492-1500`,
`Seguimiento` `:1502-1527`); los paneles de tab arrancan en `:1531` (`consultas`), `:1615` (`historial`),
`:1808` (`seguimiento`). Un 4to botón "Recipes y paraclínicos" + panel `detailTab === 'standalone_docs'`
encaja justo después de `:1527`, antes de `:1531`. Adición pura, riesgo cero para las 3 tabs existentes.

### A12. Sidebar + inicio del doctor

`apps/frontend/app/doctor/layout.tsx`. Modelo de nav: `topItems` (`:71-74`, "Inicio"/"Agenda"),
`navSections` (`:76-118`), la sección "Consultorio" es `navSections[0]` (`:77-96`, incluye
Pacientes/Consultas/Consultorios/Plantillas/Consultas por agendar/Solicitudes). El gating a nivel de ruta
es **independiente** de lo que muestra el sidebar: el array `PLAN_GATED_ROUTES` (`:129-144`) mapea prefijo
de URL → `moduleKey`, aplicado por `resolveGatedModuleKey()` (`:147-151`) — esto es lo que realmente
bloquea el acceso por URL directa, independiente de lo que muestre el sidebar. Botón de inicio:
`apps/frontend/app/doctor/page.tsx` ya importa `ImmediateConsultationModal` (`:33`) y renderiza un botón
"Generar consulta inmediata" con ícono `Zap` cerca de `:910`/`:1441` — el nuevo botón de inicio "Generar
recipe/paraclínico" sigue exactamente el mismo patrón (import de modal nuevo + botón cerca del botón Zap
existente).

### A13. Gating por feature de plan, de punta a punta

La columna `feature_key` es `DataType.TEXT`
(`apps/backend/src/modules/admin/infrastructure/database/models/plan-feature.model.ts:31`), **no es un
ENUM de Postgres** — confirma que no hay riesgo de la clase de caída `enums-de-postgres-sin-el-valor` para
este trabajo. `GetDoctorFeaturesV2UseCase`
(`apps/backend/src/modules/doctor-settings/application/use-cases/doctor-settings/get-doctor-features-v2.use-case.ts`)
resuelve `effective_plan_key` (consciente del lazy-downgrade) y luego carga
`features: Record<string, boolean>` desde `plan_features` filtrado por plan (`:150-175`, cacheado en Redis
1h, clave `features:${planKey}`). Fallback frontend: `apps/frontend/app/doctor/plan-features-actions.ts` —
`FALLBACK` retorna `features: {}` ante cualquier error del backend (deny-safe, `:24-29`), consumido vía
`getDoctorPlanFeatures()`. **Registrar una feature key nueva es puramente un INSERT de migración en
`plan_features`** — plantilla exacta a imitar:
`apps/backend/src/infrastructure/database/migrations/20260901000003-quotes-module.cjs`, Parte 6
(`:~86-105`) — una fila por plan key (`delta_plus, free_trial, delta_base, delta_free, trial, basic,
professional, clinic`), `ON CONFLICT (plan, feature_key) DO UPDATE`. `/admin/plan-features`
(`apps/frontend/app/admin/plan-features/PlanFeaturesClient.tsx`) lee `feature_label` **directo de la
fila** (sin catálogo de labels separado al que tocar) — los toggles funcionan de inmediato para cualquier
key nueva sin cambios de frontend en esa página admin. El seed de role capability (Parte 5 de la misma
migración) cubre RBAC por separado de las features de plan — probablemente se necesiten ambos (`role_capabilities`
para `doctor:content_templates:*` y `doctor:standalone_documents:*`).

### A14. Guías del asistente de ayuda

`apps/backend/src/modules/help-assistant/guides/specialist-guide.content.ts` es la que hay que actualizar
(también `super-admin-guide.content.ts` si los cambios de plan/feature son visibles para el admin). Según
CLAUDE.md esto es **obligatorio**, no opcional.

---

## B. Diseño propuesto

### B1. Tablas (TEXT + CHECK, sin ENUM, imitando el patrón `quotes_recipient_xor`)

```sql
-- Plantillas de contenido (decisión del dueño: privadas por especialista, sin plantillas "de fábrica")
CREATE TABLE content_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('recipe','paraclinical','reposo','presupuesto')),
  name        TEXT NOT NULL,
  -- la forma de `content` depende de `type` — se valida en el límite del DTO/Zod, no en SQL:
  --   recipe       -> { medications: Medication[], notes: string }
  --   paraclinical -> { items: {exam_name, notes}[] }
  --   reposo       -> { diagnosis, days, comments }   (sin from/to — esas son fechas por uso)
  --   presupuesto  -> { items: QuoteItemTemplate[] }  (kind, source_id, name, description, quantity; SIN precio guardado)
  content     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_content_templates_doctor_type ON content_templates (doctor_id, type);
```

```sql
-- Documentos standalone (récipe/paraclínico/reposo emitidos sin consulta)
CREATE TABLE standalone_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('recipe','paraclinical','reposo')),
  code           TEXT NULL,  -- NULL mientras es borrador; se asigna al emitir. Formato REC-/PAR-/REP- + YYYYMM-NNNN
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','voided')),
  content        JSONB NOT NULL,         -- misma forma por tipo que content_templates.content
  issued_at      TIMESTAMPTZ NULL,
  voided_at      TIMESTAMPTZ NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT standalone_documents_code_unique UNIQUE (doctor_id, code)
);
CREATE INDEX idx_standalone_documents_doctor ON standalone_documents (doctor_id, created_at DESC);
CREATE INDEX idx_standalone_documents_patient ON standalone_documents (patient_id, created_at DESC);
```

```sql
-- document-sharing: XOR aditivo, imita el estilo de quotes_recipient_xor
ALTER TABLE shared_document_links
  ALTER COLUMN consultation_id DROP NOT NULL,
  ADD COLUMN standalone_document_id UUID NULL REFERENCES standalone_documents(id) ON DELETE CASCADE,
  ADD CONSTRAINT shared_document_links_source_xor
    CHECK ((consultation_id IS NOT NULL) <> (standalone_document_id IS NOT NULL));
```

```sql
-- seed de plan_features (patrón Parte 6 de 20260901000003-quotes-module.cjs)
-- content_templates: enabled para delta_base, delta_plus, free_trial; false en el resto
-- standalone_documents: mismo set de enabled
```

Por qué TEXT+CHECK y no ENUM: mitigación directa de las dos caídas de producción previas registradas en
memoria (`enums-de-postgres-sin-el-valor`).

### B2. Módulos backend (DDD, imita `docs/guides/estructura-modulo.md`)

**`apps/backend/src/modules/content-templates/`**

- `domain/entities/content-template.entity.ts` — `canBeModifiedBy(doctorId)` anti-IDOR, mismo patrón que
  `Prescription`/`QuoteItem`.
- `domain/value-objects/content-template-type.vo.ts` — imita `template-type.vo.ts`.
- `domain/errors/content-template-not-found.error.ts`, `content-template-not-owned.error.ts`.
- `application/use-cases/content-templates/{create,update,delete,list,get}-content-template.use-case.ts`.
- `infrastructure/database/models/content-template.model.ts`,
  `infrastructure/database/repositories/sequelize-content-template.repository.ts`.
- `presentation/controllers/content-templates.controller.ts` — rutas: `GET/POST /api/doctor/content-templates`,
  `GET/PUT/DELETE /api/doctor/content-templates/:id`, filtrable por `?type=`. Guard: `AppAuthGuard` +
  `@RequireCapability('content_templates','view'|'create'|...)`.

**`apps/backend/src/modules/standalone-documents/`**

- `domain/entities/standalone-document.entity.ts` — transiciones de estado como métodos de dominio:
  `issue()` (draft→issued, asigna código), `void()` (issued→voided), guarda contra editar una vez que
  `status !== 'draft'` (regla del dueño: "lo emitido no se edita, se anula").
- `domain/value-objects/standalone-document-code.vo.ts` — versión parametrizada con prefijo del
  `ConsultationCode` existente, o 3 VOs pequeños (`RecipeCode`, `ParaclinicalCode`, `ReposoCode`) si el
  equipo prefiere no tocar el VO existente en absoluto (opción de riesgo cero, ligera duplicación —
  recomendada, ver D).
- `domain/errors/standalone-document-not-found.error.ts`, `-not-owned.error.ts`, `-already-issued.error.ts`
  (se lanza al intentar editar/emitir dos veces), `-code-conflict.error.ts`/`-code-exhausted.error.ts`
  (imita el patrón de retry de consulta).
- `application/use-cases/standalone-documents/{create-draft,update-draft,issue,void,list,get}.use-case.ts`.
- `infrastructure/database/{models,repositories}` — el repositorio maneja el loop de retry de número de
  secuencia para asignar código en `issue()`, imitando `sequelize-consultation.repository.ts`'s manejo de
  `ConsultationCodeConflictError`.
- `presentation/controllers/standalone-documents.controller.ts` — rutas: `GET/POST /api/doctor/standalone-documents`,
  `GET/PATCH /api/doctor/standalone-documents/:id` (solo edición de borrador),
  `POST /api/doctor/standalone-documents/:id/issue`, `POST /api/doctor/standalone-documents/:id/void`,
  `GET /api/doctor/patients/:patientId/standalone-documents` (para la 4ta tab de detalle de paciente).

**Cambios al módulo `document-sharing` (aditivos, archivos existentes)**

- `shared-document-link.entity.ts`: agregar campo `standaloneDocumentId: string | null` + parámetro de
  constructor, agregar `static createForStandaloneDocument(...)` factory junto a la existente (mantener
  el comportamiento del factory de `consultationId` idéntico).
- `GetDocumentRenderDataUseCase.execute()`: ramificar al inicio según
  `link.consultationId ?? link.standaloneDocumentId` — nuevo método privado
  `buildRenderDataFromStandaloneDocument()` que sintetiza un objeto con forma de `RenderConsultationData`
  (`id`, un campo `consultationCode` reutilizado para llevar el código propio del doc,
  `blocksSnapshot: { [doc.type]: doc.content }`) para que el flujo **existente** de render de
  `MedicalDocumentPdf` no necesite cambios aguas abajo.
- Nueva ruta de controlador `POST /api/standalone-documents/:id/share` en el `DocumentSharingController`
  existente, delegando a la misma `ShareConsultationUseCase` (renombrar a `ShareDocumentUseCase`
  internamente es opcional/cosmético — no renombrar la ruta pública de consulta).

### B3. Shared-types (`libs/shared-types`)

- `ContentTemplateDtoSchema` (unión discriminada de Zod por `type`, un schema por forma de contenido —
  `RecipeTemplateContentSchema`, `ParaclinicalTemplateContentSchema`, `ReposoTemplateContentSchema`,
  `PresupuestoTemplateContentSchema`).
- `StandaloneDocumentDtoSchema` similar, discriminado por `type`.
- Reutilizar la forma estilo `QuoteItemInputSchema` existente para el ítem de plantilla de presupuesto
  (sin campo de precio nuevo — el precio **nunca** se guarda en la plantilla).

### B4. BFF (route handlers / server actions del frontend)

- `apps/frontend/app/doctor/templates/content-actions.ts` — thin-proxy imitando exactamente el patrón de
  `templates/actions.ts` (`backendGet`/`backendPost`/`backendPut`/`backendDelete`, tabla de mapeo
  camelCase↔snake_case documentada en el header del archivo como la existente).
- `apps/frontend/app/doctor/standalone-documents/actions.ts` — mismo patrón thin-proxy.
- Extender las props de `apps/frontend/app/doctor/consultations/ShareDocumentsModal.tsx` para aceptar
  `consultationId` O `standaloneDocumentId` (prop de unión discriminada), y su action para llamar a la
  nueva ruta de compartir cuando este último está presente.

### B5. Componentes/páginas frontend

- `apps/frontend/app/doctor/templates/page.tsx`: nueva tab `'content_templates'` agregada en un estado
  adyacente-pero-separado del array `templateTabs` de branding (NO mezclar en el array `templateTabs` —
  concepto distinto, datos distintos). Nuevos subcomponentes: `ContentTemplatesTab.tsx`,
  `ContentTemplateListClient.tsx`, modales `CreateRecipeTemplateModal.tsx`/`CreateParaclinicalTemplateModal.tsx`/
  `CreateReposoTemplateModal.tsx`/`CreatePresupuestoTemplateModal.tsx` — cada uno es un **wrapper delgado que
  extrae el JSX inline relevante de `ConsultationsClient.tsx` (récipe/paraclínico/reposo) o
  `QuoteCreateModal.tsx` (ítems de presupuesto) a un componente editor standalone reutilizable**,
  parametrizado para (a) guardar en `content_templates` con un campo de nombre, o (b) embeberse dentro del
  flujo de consulta/presupuesto como disparador de "Usar plantilla". Esta es la única pieza de refactor
  real e inevitable — ver C y D.
- `ConsultationsClient.tsx`: agregar botón "Usar plantilla" al lado de "Generar receta"→"Generar recipe"
  (renombrar), debajo de "+ Agregar examen" (paraclínico), arriba de los campos de reposo — cada uno abre
  un pequeño `UseTemplateDropdown` (listado filtrado por `type`) que llama a la función "apply" del editor
  extraído con semántica de agregar+confirmar-antes-de-reemplazar (decisión del dueño).
- `QuoteCreateModal.tsx`: agregar dropdown `<details>` "Plantillas" junto a "+ Servicio"/"+ Producto"
  (patrón `:658-683`) en el área `:656`; al seleccionar, re-resolver `unit_price_usd` contra
  `options.services`/`options.products` por `(kind, source_id)`, con fallback al nombre/descripción/cantidad
  guardados en la plantilla para ítems `manual` (no hay catálogo para re-resolver).
- Ruta nueva `apps/frontend/app/doctor/standalone-documents/page.tsx` (listado: tipo, código, paciente,
  fecha, estado, botón "Generar") + `GenerateStandaloneDocumentModal.tsx` (búsqueda/creación de paciente —
  idealmente vía el `PatientSearchOrCreate.tsx` extraído de A7 — selector de tipo, "Usar plantilla"/"Generar
  nuevo", botones Guardar/Cancelar/Crear/Crear y enviar).
- `apps/frontend/app/doctor/page.tsx`: nuevo botón "Generar recipe/paraclínico" cerca del botón Zap de
  consulta inmediata existente (patrón `:910`/`:1441`), abre el mismo `GenerateStandaloneDocumentModal`.
- `apps/frontend/app/doctor/layout.tsx`: nuevo item de nav dentro de la sección `consultorio` (`:81-95`) —
  `{ name: 'Recipes y paraclínicos', href: '/doctor/standalone-documents', icon: ..., moduleKey: 'standalone_documents' }`;
  nueva entrada en `PLAN_GATED_ROUTES` (`:129-144`)
  `{ prefix: '/doctor/standalone-documents', moduleKey: 'standalone_documents' }`. **No** agregar un
  `moduleKey` al item de nav "Plantillas" existente (`:90`) — gatear solo la tab/CRUD de plantillas de
  contenido nueva del lado del cliente dentro de `templates/page.tsx` usando
  `getDoctorPlanFeatures().features.content_templates`.
- `apps/frontend/app/doctor/patients/page.tsx`: botón de 4ta tab + panel según A11, llamando a una nueva
  action `getPatientStandaloneDocuments(patientId)`.

### B6. Actualización de guías del asistente de ayuda (obligatorio)

`apps/backend/src/modules/help-assistant/guides/specialist-guide.content.ts` — agregar secciones: (1) qué
es "Plantillas de contenido" y que son privadas/sin plantillas de fábrica; (2) comportamiento de "Usar
plantilla" en consultas (agregar + confirmar antes de reemplazar, editable después de aplicar); (3)
"Plantillas" en presupuestos (el precio siempre es el actual); (4) todo el flujo de "Recipes y
paraclínicos sin consulta", su propio formato de código, semántica de borrador vs emitido vs anulado, y
dónde se muestra en el detalle de paciente. También actualizar `super-admin-guide.content.ts` si
`/admin/plan-features` gana filas nuevas visibles que los admins van a preguntar.

### Seguridad

- Anti-IDOR: cada use case toma `doctorId` de `user.sub`, nunca del body — `canBeModifiedBy(doctorId)` en
  ambas entidades nuevas, imitando `Prescription`/`QuoteItem`/`SharedDocumentLink`.
- Cadena de ownership para documentos standalone: verificar `patient.doctorId === actorDoctorId` antes de
  crear (mismo patrón de chequeo que usan las consultas) — anti-IDOR a través de la relación con el
  paciente, no solo del documento.
- Sin PII en logs (el contenido del documento incluye diagnóstico/medicación — nunca se loguea, imita la
  disciplina existente de `GetDocumentRenderDataUseCase`).
- Entrada estilo `access_audit_log`/`logReveal` cuando se comparte o descarga un documento standalone,
  imitando `logRenderAccess()` en `get-document-render-data.use-case.ts:378-404`.
- Documentos emitidos inmutables a nivel de dominio (`canBeModifiedBy` + guarda explícita de
  `status==='draft'` en la entidad, no solo deshabilitado a nivel de UI).

---

## C. Plan de trabajo secuenciado (backend-first, ~1h cada paso)

1. **Migración: tablas `content_templates` + `standalone_documents` + seed de plan_features/role_capabilities.**
   Archivos: una migración `.cjs` imitando exactamente la estructura de `20260901000003-quotes-module.cjs`
   (partes: tablas, seed de role_capabilities, seed de plan_features). Test: migración up/down idempotente,
   `nx test backend` sin afectar. Riesgo: bajo — DDL puramente aditivo. Chequeo de "no toca lo existente":
   ninguna tabla existente se altera salvo el cambio de nullable/constraint de `shared_document_links`, que
   debe ir en una migración **separada** (paso 6) para poder revisarse aislado.

2. **Módulo backend `content-templates`** (dominio + aplicación + infra + presentación, capas DDD completas
   según `estructura-modulo.md`). Tests: entidad unitaria (100%), use-case unitario con repo mockeado (90%),
   test HTTP de controlador (80%). Riesgo: bajo, módulo nuevo, no toca código existente. Verificar:
   `nx build backend && nx lint backend && nx test backend`, boot del dist, curl
   `GET/POST /api/doctor/content-templates`.

3. **Módulo backend `standalone-documents`** (mismas capas). Incluye el VO de generación de código + la
   lógica de retry-on-conflict del repositorio (leer el loop de retry de
   `sequelize-consultation.repository.ts` antes de implementar). Tests + verificación como paso 2.

4. **Schemas Zod de shared-types** para ambos DTOs (unión discriminada por `type`). Test: tests de
   round-trip de schema. Riesgo: ninguno a schemas existentes — solo archivo(s) nuevo(s).

5. **Agregar `buildParaclinicalContent()`** a `consultation-documents.ts` (export nuevo, ningún export
   existente se toca). Test unitario solo para la función nueva. Riesgo: cero — export puramente aditivo.

6. **Cambio aditivo de document-sharing**: migración (columna `consultation_id` nullable +
   `standalone_document_id` + CHECK XOR), agregado de campo a la entidad, ramificación de
   `GetDocumentRenderDataUseCase`, ruta de controlador nueva. Tests: casos de spec nuevos para la rama
   standalone; **re-correr la suite de specs existente de `document-sharing` sin tocarla para confirmar que
   el camino de consulta es byte-idéntico** (chequeo de regresión explícito — este es el punto de mayor
   riesgo de todo el plan porque es un cambio a código en producción funcionando).

7. **Extraer `PatientSearchOrCreate.tsx`** de `ImmediateConsultationModal.tsx` (props: `onSelect`),
   reconectar `ImmediateConsultationModal` para usarlo **sin cambio de comportamiento** (verificar vía el
   guion de QA/E2E existente de consulta inmediata, ya que este componente está en un camino con tráfico
   real de producción). Riesgo: medio — toca un modal vivo y de uso frecuente. Hacerlo aislado, commitear
   por separado, QA en navegador antes de seguir.

8. **Extraer la UI de los editores de récipe/paraclínico/reposo** fuera de `ConsultationsClient.tsx` a
   componentes standalone (`RecipeEditor.tsx`, `ParaclinicalEditor.tsx`, `ReposoEditor.tsx`) con un prop
   controlado `value`/`onChange` + `mode: 'consultation' | 'template' | 'standalone'`, luego reconectar
   `ConsultationsClient.tsx` para que renderice el componente extraído en vez de su JSX inline, confirmando
   que la UI de consulta es idéntica en pixel/comportamiento antes de agregar nada nuevo. **Este es el paso
   de mayor riesgo y mayor valor** — hacerlo en su propio commit, hacer QA en navegador contra el flujo de
   consulta existente (según memoria `qa-browser-cycle-setup`) antes de que aterrice encima código de
   feature nueva.

9. **Frontend de plantillas de contenido** (tabs dentro de `templates/page.tsx`, modales de creación
   reutilizando los editores del paso 8 en `mode:'template'`, listado). Server actions thin-proxy BFF.
   Gatear del lado del cliente solo por el flag de feature `content_templates` (no a nivel de ruta).

10. **Cableado de "Usar plantilla" en `ConsultationsClient.tsx`** (récipe/paraclínico/reposo) usando los
    editores del paso 8 en `mode:'consultation'` + lógica de agregar/confirmar-reemplazo.

11. **Botón "Plantillas" de presupuestos** en `QuoteCreateModal.tsx` en la fila de ítems + re-resolución
    del precio actual.

12. **Frontend del módulo standalone-documents**: página de listado, modal de generación (reutilizando la
    búsqueda de paciente del paso 7 + los editores del paso 8 en `mode:'standalone'`), botones de
    sidebar/inicio, gating a nivel de ruta.

13. **4ta tab de detalle de paciente.**

14. **Cableado del flujo de compartir** para documentos standalone (prop de unión discriminada de
    `ShareDocumentsModal`) usando la ruta backend del paso 6.

15. **Actualización de guías del asistente de ayuda + entradas de memory-bank** (obligatorio según PASO
    FINAL de CLAUDE.md).

Cada paso backend debe terminar con la verificación obligatoria del lead:
`nx build backend && nx lint backend && nx test backend` con exit codes reales, boot del dist, curl, chequeo
de RBAC — según el protocolo de equipo en el `CLAUDE.md` raíz.

---

## D. Riesgos abiertos / incógnitas que necesitan una decisión

1. **"Reutilizar el mismo modal" no es literalmente posible hoy** — los editores de récipe/paraclínico/
   reposo son JSX inline en un archivo de 8 mil líneas, no componentes. Default recomendado: hacer la
   extracción (paso 8) como un refactor dedicado y revisado por separado, sin cambio de comportamiento,
   antes de construir nada encima, en vez de duplicar el JSX una 2da/3ra vez (lo cual violaría DRY y el
   espíritu de la regla del dueño "no tocar lo ya desarrollado", ya que cualquier cambio futuro a un campo
   de récipe necesitaría 3 ediciones sincronizadas).

2. **Forma del contenido de plantilla de reposo** — una plantilla no puede razonablemente guardar fechas
   `from`/`to` (son relativas al momento en que se usa). Default recomendado: la plantilla guarda solo
   `{diagnosis, days, comments}`; `from` toma "hoy" por defecto y `to` se calcula al aplicar, exactamente
   como el comportamiento default existente del tab de reposo (`ConsultationsClient.tsx:2032-2033`).

3. **VO de código de documento standalone** — parametrizar el VO `ConsultationCode` existente con un
   prefijo, o crear 3 VOs hermanos. Default recomendado: **3 VOs hermanos**
   (`RecipeCode`/`ParaclinicalCode`/`ReposoCode`), cada uno una copia delgada — riesgo cero de tocar el
   comportamiento 100%-cubierto de `consultation-code.vo.ts`, duplicación menor aceptable (el dueño dijo
   explícitamente "no tocar lo ya desarrollado").

4. **¿El contenido paraclínico como documento standalone necesita campos estructurados por examen o la
   forma de array de strings plano existente?** Default recomendado: mantener la forma existente
   `{exam_name, notes}[]` (coincide con lo que ya se renderiza/comparte hoy), tanto para plantillas como
   para documentos standalone — evita inventar un modelo de datos nuevo que el pipeline de PDF todavía no
   entiende.

5. **La migración de FK nullable de `shared_document_links` es el cambio de mayor radio de impacto de todo
   este plan** — toca una tabla con filas reales en producción que alimenta el visor público de documentos
   orientado al paciente. Default recomendado: entregarlo como su propia migración + cambio de código
   aislado (paso 6), con un test de regresión explícito que asegure que el camino existente de compartir
   consultas es byte-idéntico, revisado por `security-agent` dado que es adyacente a auth/PII según los
   disparadores de revisión de seguridad obligatoria de CLAUDE.md.

6. **¿"Crear y enviar" para un documento standalone debería ofrecer también WhatsApp**, igual que la opción
   de WhatsApp ya existente en `ShareDocumentsModal` (`:21` importa `MessageCircle`)? El texto del pedido
   del dueño para este ítem solo menciona "enlace + código + cédula por email" pero WhatsApp ya existe en
   el modal de compartir para consultas. Default recomendado: heredar lo que `ShareDocumentsModal` ya
   ofrece (WhatsApp + email) en vez de restringir los documentos standalone a solo-email — UX consistente,
   sin trabajo extra ya que es el mismo componente.

---

## E. Decisiones del lead (22/10, el dueño duerme) — PREVALECEN sobre A–D

1. **NO se extraen los editores de `ConsultationsClient.tsx` (descarta pasos 7 y 8).** Regla del dueño:
   "no tocar lo ya desarrollado". Se crean **editores nuevos** (`apps/frontend/components/doctor/document-editors/`)
   con las MISMAS formas de datos que la consulta (A1–A3). En `ConsultationsClient.tsx` solo se AGREGA:
   botón "Usar plantilla" por bloque + renombre "Generar receta" → "Generar recipe". Tampoco se toca
   `ImmediateConsultationModal.tsx`: se crea un `PatientSearchOrCreate.tsx` nuevo. Duplicación aceptada y
   anotada como deuda técnica.
2. Reposo en plantilla = `{diagnosis, days, comments}`; al aplicar, desde = hoy, hasta = desde + días − 1
   (mismo cálculo que el tab de reposo).
3. Código: VO NUEVO dentro del módulo nuevo (`StandaloneDocumentCode`, prefijo REC/PAR/REP); no se toca
   `ConsultationCode`. Secuencia **por doctor y por mes** (mes en hora de Caracas), único `(doctor_id, code)`,
   retry ante conflicto como en consultas.
4. Paraclínico mantiene `{exam_name, notes}[]`.
5. Document-sharing: cambio aditivo en migración PROPIA + regresión explícita del camino de consulta +
   security-agent. Solo se comparten documentos `issued` (nunca borradores ni anulados).
6. Compartir = el `ShareDocumentsModal` existente tal cual (lo que ofrezca hoy).
7. Planes: `delta_base`, `delta_plus`, `free_trial` = true (prueba = acceso completo, como `quotes`); resto false.
   Features: `content_templates` ("Plantillas de contenido") y `standalone_documents` ("Recipes y paraclínicos").
   role_capabilities doctor × {view, create, edit, delete} para ambos módulos.
8. Borradores se pueden eliminar (botón Cancelar/Descartar); emitidos NO (solo anular).

## F. Contrato de API (backend y frontend se construyen en paralelo contra esto)

Envelope `{ success: true, data }`. `doctorId` SIEMPRE de `user.sub`. Campos de respuesta camelCase;
cuerpos de entrada snake_case (convención del proyecto). Errores de dominio → 404 (no existe o es de otro
doctor), 409 (estado no permite la acción), 422 (validación).

### Plantillas de contenido — `/api/doctor/content-templates`

- `GET ?type=recipe|paraclinical|reposo|presupuesto` → `ContentTemplate[]` ordenado por `name`.
- `POST { type, name, content }` → 201 `ContentTemplate`.
- `GET /:id` → `ContentTemplate` · `PUT /:id { name?, content? }` (type inmutable) · `DELETE /:id` → `{ success: true }`.
- `ContentTemplate = { id, type, name, content, createdAt, updatedAt }`
- `content` por tipo:
  - `recipe`: `{ medications: [{ name, dose, route, frequency, duration, presentation, indications }], notes }`
  - `paraclinical`: `{ items: [{ exam_name, notes }] }`
  - `reposo`: `{ diagnosis, days: number (1..365), comments }`
  - `presupuesto`: `{ items: [{ kind: 'service'|'product'|'manual', source_id: uuid|null, name, description, quantity: number, unit_price_usd?: number }] }`
    (`unit_price_usd` SOLO para `manual`; para service/product se usa el precio ACTUAL del catálogo al aplicar).
- name: 1..120 chars, trim. Máx. 50 medicamentos / 50 exámenes / 100 ítems.

### Documentos sin consulta — `/api/doctor/standalone-documents`

- `GET ?patient_id=&type=&status=` → `StandaloneDocumentSummary[]` (más nuevos primero):
  `{ id, type, code|null, status, patientId, patientName, createdAt, issuedAt|null, voidedAt|null }`
- `POST { patient_id, type: 'recipe'|'paraclinical'|'reposo', content }` → 201 borrador (`StandaloneDocument`).
  Verifica que el paciente sea del doctor (anti-IDOR por la relación).
- `GET /:id` → `StandaloneDocument = { ...Summary, content, voidReason|null, patient: { id, fullName, cedula|null, age|null } }`
- `PATCH /:id { content }` → solo `draft` (si no, 409 `STANDALONE_DOCUMENT_NOT_DRAFT`).
- `DELETE /:id` → solo `draft` (409 si no).
- `POST /:id/issue` → `draft` → `issued`, asigna `code` (`REC|PAR|REP-YYYYMM-NNNN`), `issuedAt`. 409 si no es draft.
- `POST /:id/void { reason? }` → `issued` → `voided`, `voidedAt`. 409 si no es issued.
- `content` = mismas formas que plantillas; reposo de documento: `{ diagnosis, days, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', comments }`.

### Compartir documento sin consulta

- `POST /api/standalone-documents/:id/share` → misma entrada/salida que el share de consulta existente.
  Solo `issued`. El visor público `/documents/[token]` lo renderiza con el mismo PDF.

### Features / gating

- Backend: mismos guards que `quotes` (capability + feature de plan) con módulos `content_templates` y
  `standalone_documents`.
- Frontend: tab "Mis plantillas" y botones "Usar plantilla"/"Plantillas" visibles solo si
  `features.content_templates`; ruta `/doctor/standalone-documents`, item de menú y botón de inicio solo si
  `features.standalone_documents` (agregar a `PLAN_GATED_ROUTES`).
