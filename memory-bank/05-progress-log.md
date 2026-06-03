# 05 — Progress Log

> Registro cronológico. Una entrada por fase/hito completado.

## 2026-06-01 — Estado pre-migración (baseline)

Punto de partida: app Next.js 16 + Supabase en producción (Vercel + Supabase
Cloud). Monolito con lógica en route handlers (`app/api/**`, 64 rutas), queries
directas a Supabase, ~45 tablas, sin ORM ni capas. Auth Supabase. IA Gemini.
Email Resend. Tests Playwright E2E.

## 2026-06-01 — Fase 0: Auditoría (completada)

- Inventariadas 64 rutas API, ~45 tablas (top: profiles, appointments,
  consultations, patients), env vars, stack real.
- Detectado: stack más maduro que el documentado (módulos extra: cobros,
  cita-360, templates, offices, billing, crm). IA = Gemini, no OpenAI/Anthropic.
- Sin `.env` commiteados (secretos fuera del repo). ✅
- Memory Bank inicializado (archivos 00-06).

## 2026-06-01 — Fase 1: Fundación NX (casi completa)

- Decisiones: monorepo in-place; pnpm user-local; NX+Next vía `nx:run-commands`.
- pnpm instalado (`~/.local/share/pnpm`), PATH en `.zshenv`.
- Rama `feature/fase-1-nx-monorepo`. Commits: 0cdfb8a (docs), 70febed (restructure),
  adfbcbb (CLAUDE+docker), 520b4cb (gitignore).
- [x] Memory Bank (7 archivos)
- [x] `.cursor/rules` (6 .mdc) + CLAUDE.md raíz monorepo
- [x] Scaffolding NX (nx.json, pnpm-workspace, tsconfig.base @delta/\*, libs skeletons)
- [x] Frontend movido a `apps/frontend/` (git mv, historial preservado)
- [x] Docker compose (Postgres16+Redis7) + init.sql + docker-reset.sh
- [x] Verificación: `nx show projects` lista 4 proyectos; `next build` compila (paths OK)
- [x] Husky + commitlint + lint-staged (Paso 7). lint-staged = solo prettier (eslint a CI). Hooks: pre-commit branch-aware + commit-msg conventional.
- [x] Rama `develop` creada (local) en la fundación del monorepo.
- [ ] PENDIENTE (acción usuario): push + branch protection en GitHub; fijar identidad git real (`user.email`) antes de push.
- [ ] NOTA: Docker Desktop no instalado aún (requerido en Fase 3).
- [ ] NOTA: `next build` falla en prerender por env Supabase faltante (esperado, no es la migración).

**FASE 1 COMPLETA.**

## 2026-06-01 — Fase 2: shared-types (Zod) — completada (base)

- Rama `feature/fase-2-shared-types` (desde `develop`).
- Sub-agente Sonnet construyó la base: zod 4.4.3, 14 archivos en `libs/shared-types/src`.
- enums (anclados al SQL real: AppointmentStatus 7 valores, UserRole con assistant,
  SubscriptionStatus con trialing/cancelled), envelope/Result, 7 entidades núcleo + 4 DTOs.
- Hallazgo: columna real es `medication` (no `medication_name`); `payment_method` es
  texto libre en la práctica. Documentado en los schemas.
- `nx build shared-types` ✓ (tsc, 0 errores).
- Pendiente: que un consumidor (backend Fase 3) valide el alias `@delta/shared-types`.
- Próximo: Fase 3 — backend NestJS (requiere Docker instalado).

## 2026-06-02 — Infraestructura local (Docker) — desbloqueada

- Docker instalado (Engine 29.5.2 + Compose v5.1.4). Homebrew en `/opt/homebrew`
  (Apple Silicon), fuera del PATH por defecto — prefijar como con pnpm.
- `docker/docker-compose.yml` levantado: Postgres 18.4 (`5432`) y Redis 7 (`6379`),
  ambos `healthy`. Extensiones `uuid-ossp` + `pgcrypto` aplicadas por `init.sql`.
- Subido a Postgres 18 (estable más reciente). OJO: PG18+ cambió la convención del
  data dir — el mount del volumen va en `/var/lib/postgresql` (no en `/data`).
- Sin tablas aún (esperado: el esquema lo crean las migraciones Sequelize en Fase 3).
- Redis responde `PONG` con auth (`redis_dev_password`, default del compose).
- **Bloqueante de Fase 3 (Docker) resuelto.** Listos para scaffold del backend NestJS.

## 2026-06-02 — Fase 3: scaffold base backend NestJS — completada (base)

- App `apps/backend` generada con `@nx/nest:application` (NestJS 11, jest, webpack).
- Estructura DDD 4 capas creada: `domain/` (errors), `application/` (use-cases,
  ports, dtos), `infrastructure/` (database, cache, auth, config), `presentation/`
  (controllers, guards, decorators, filters, interceptors, pipes).
- Piezas base: `DomainError` (clase base), `databaseConfig` (Sequelize, synchronize
  off), `RedisModule` (ioredis global, token `REDIS_CLIENT`), `DevAuthGuard`,
  `CurrentUser`/`Roles` decorators, `GlobalExceptionFilter`, `ZodValidationPipe`,
  `LoggingInterceptor` (no loguea bodies → PII), `HealthController`.
- `app.module.ts` cablea ConfigModule (envFilePath apps/backend/.env), SequelizeModule,
  RedisModule, filtro+interceptor globales. `main.ts`: prefijo `api`, CORS, puerto 3001.
- `.env` (gitignored) + `.env.example` creados.
- **Verificación ✓**: `nx build backend` compila; `GET /api/health` → 200
  `{status:ok, dependencies:{postgres:up, redis:up}}`; `nx test backend` 3/3 verdes.
- **Alias `@delta/shared-types` validado** desde el backend (spec del ZodValidationPipe
  importa enum + schema reales). Confirmado pendiente de Fase 2.
- Hallazgo: zod v4 `.uuid()` exige RFC estricto (versión `[1-8]`, variante `[89ab]`).
- Sin lint target en backend (coherente: eslint a CI, no en commits).
- Pendiente Fase 3 (próxima sesión): primer módulo de negocio (appointments) con endpoint funcional.

## 2026-06-02 — Fase 3 Unidad A: Migración inicial Sequelize — completada

- `sequelize-cli` instalado como devDep root (`pnpm add -D -w sequelize-cli@6.6.5`).
- Creados: `apps/backend/.sequelizerc` y `apps/backend/src/infrastructure/database/config.json`
  (dev → deltamedical local Docker; test → deltamedical_test; production → DATABASE_URL env var).
- Migración inicial creada en CommonJS (`.cjs`) en lugar de TypeScript. Motivo: `sequelize-cli`
  no soporta TS nativo sin `ts-node` con configuración especial en monorepos NX. CJS es más
  robusto y garantiza que la migración corre en verde.
- Migración `20260602000000-initial-schema.cjs` implementa exactamente el spec `03b-schema-real.md`:
  - 10 enums: user_role, subscription_plan, subscription_status, appointment_status,
    reminder_channel, reminder_offset, lead_source, lead_status, payment_method, payment_status.
  - 18 tablas en orden de dependencias FK: profiles, plan_configs, plan_features, subscriptions,
    patients, pricing_plans, leads, patient_packages, appointments (sin FK circular), consultations,
    ALTER TABLE appointments ADD consultation_id + FK, ehr_records, prescriptions, patient_messages,
    reminders_settings, reminders_queue, doctor_invitations, access_audit_log, active_sessions.
  - FK circular appointments<->consultations: appointments creada sin consultation_id; FK añadida
    con ALTER TABLE post consultations. Constraint: `fk_appointments_consultation_id`.
  - patient_packages.package_template_id: columna uuid nullable SIN FK formal (package_templates
    fuera del scope de 18 tablas).
  - Decisiones D-01 a D-17 aplicadas: leads.channel = TEXT, leads.stage = TEXT+CHECK,
    appointments.payment_method = TEXT, consultations.payment_status = TEXT+CHECK('pending','approved'),
    reminders_queue.patient_id -> profiles(id) (no patients.id), etc.
  - Bug encontrado y corregido: índice parcial `appointments_doctor_slot_uq` usaba `status::text IN (...)`
    en el WHERE predicate, lo que Postgres rechaza por no ser IMMUTABLE. Corregido comparando
    con valores del enum directamente: `status IN ('scheduled'::appointment_status, ...)`.
  - 61 índices totales (PKs, UNIQUEs, custom idx\_\*) + 5 CHECK constraints + 23 FK constraints.
  - down() revierte todo limpiamente (tablas en orden inverso + DROP TYPE).
- Targets NX añadidos a `apps/backend/project.json`: `migrate`, `migrate:undo`, `migrate:undo:all`,
  `migrate:status` (executor `nx:run-commands`, cwd `apps/backend`).
- Criterios de aceptación verificados:
  - [x] `pnpm nx run backend:migrate` → verde (migrated 0.074s).
  - [x] `\dt` → 18 tablas de negocio + SequelizeMeta = 19 filas.
  - [x] `\dT` → 10 tipos enum.
  - [x] `pnpm nx run backend:migrate:undo:all` → verde, BD sin tablas de negocio ni enums.
  - [x] Re-migrate → verde, BD vuelve a estado completo.
  - [x] `pnpm nx build backend` → webpack compiled successfully.
- Próxima sesión: primer módulo de negocio (appointments) con endpoint funcional.

### Decisión de monorepo: un solo package.json

- Eliminados los `package.json` redundantes de `libs/*` (eran vestigios del scaffold).
  NX detecta proyectos por `project.json`; los `@delta/*` resuelven por tsconfig paths,
  no por pnpm linking. `zod` movido al `package.json` raíz.
- `pnpm-workspace.yaml`: `packages` reducido a `apps/frontend` (única app legacy con
  package.json propio, se fusionará al root cuando se migre el frontend).
- Añadido `baseUrl: "."` a `tsconfig.base.json` (faltaba; TS5090 sin él).

## 2026-06-02 — Fase 3 Unidad B: módulo appointments — completada

- Implementado con **equipo de agentes** (Agent Teams): `implementer` (backend-agent)
  construyó → `reviewer` (code-reviewer) revisó y mandó hallazgos directo al implementer →
  implementer iteró → lead (orquestador) verificó y cerró. QA dedicado DIFERIDO al final
  por ahorro de tokens (decisión del usuario).
- Módulo en `apps/backend/src/modules/appointments/` (DDD 4 capas):
  - domain: entidad `Appointment` (transiciones canTransitionTo de los 5 canónicos;
    legacy pending/accepted terminales; canBeModifiedBy = ownership), 5 errores que
    extienden DomainError, `IAppointmentRepository` (token `APPOINTMENT_REPOSITORY`).
  - application: use cases CreateAppointment (duplicado ±15min, slot ocupado, optimistic
    lock de patient_packages.used_sessions), UpdateAppointmentStatus (transición+ownership+
    audit log), GetDoctorAgenda (paginada), GetAppointmentById.
  - infrastructure: `appointment.model.ts`, `appointment-changes-log.model.ts`,
    `SequelizeAppointmentRepository`, migración `20260602000001-appointment-changes-log.cjs`.
  - presentation: `appointments.controller.ts` (GET /, GET /:id, POST /, PUT /:id/status)
    con DevAuthGuard + ZodValidationPipe; masking de PII en `presentation/mappers/`.
- Tabla nueva `appointment_changes_log` (auditoría de cambios de estado): FK a appointments,
  índices en appointment_id y actor_id, down() limpio.
- DIFERIDO: GetDoctorSlots y Reschedule (requieren tabla doctor_schedule inexistente).
- Code review: 0 CRITICAL, 1 HIGH + 3 MEDIUM + 2 LOW — TODOS corregidos. Más relevantes:
  masking movido de use-case a presentation/mappers (HIGH); anti-IDOR en POST (doctor_id
  se sobreescribe con user.sub, no se confía en el body); fallo de optimistic lock lanza
  InsufficientSessionsError; `as never` → QueryTypes; `[Op.gte as unknown]` → WhereOptions.
- Verificación de cierre (lead): `nx build backend` ✓; `nx test backend` 68/68 en 9 suites;
  cobertura domain 100% / use-cases 95.5% / repo 71.9% / controller 100%;
  `GET /api/appointments` con headers x-dev-\* → 200 envelope; sin headers → 403.
- **FASE 3 COMPLETA** (scaffold + migración inicial + módulo de referencia appointments).
- Pendiente global: QA dedicado (cobertura+smoke formal) cuando el usuario lo indique;
  warning Redis NOAUTH al arrancar fuera del cwd raíz (revisar en QA, no afecta módulos).
- Próximo: Fase 4 (seguridad/identidad) o siguiente módulo de negocio según prioridad MVP.

## 2026-06-02 — libs/shared-crypto + módulo patients (con cifrado de PII) — completada

- **libs/shared-crypto**: encrypt/decrypt AES-256-GCM (IV aleatorio 12B, authTag, base64
  iv||ct||tag) + hashForSearch HMAC-SHA256 (normaliza: trim, lowercase, NFD+strip acentos,
  colapsa espacios) → 64 hex. 100% cobertura. Cero deps externas (módulo `crypto` de Node).
- **Módulo patients** (`apps/backend/src/modules/patients/`, DDD 4 capas):
  - Cifrado en el REPOSITORIO vía `CryptoService` inyectable (lee ENCRYPTION_KEY +
    ENCRYPTION_HMAC_SECRET de ConfigService; guard al boot que rechaza llaves triviales
    fuera de development). NO en hooks del modelo. Dominio siempre en plaintext.
  - Campos cifrados: full_name, cedula, phone, email. Hashes de búsqueda: full_name,
    cedula, email (los 3, VARCHAR(64)).
  - **Búsqueda híbrida** (decisión del usuario): lookup exacto por hash (cédula/email) +
    búsqueda parcial/orden descifrando in-app dentro del scope del doctor.
  - `/reveal` → plaintext + inserta 1 fila por campo PII en access_audit_log (4 filas).
  - Lista MÍNIMA (id, fullName, cedula, phone, email, source, createdAt) enmascarada;
    campos clínicos solo en detalle y reveal. Masking en presentation/mappers.
  - Anti-IDOR: doctor_id del actor (user.sub), nunca del body; doctor_id en el WHERE de
    findById/update/softDelete (acceso cross-doctor → not found). Ownership doble capa.
  - Soft delete: migración 20260602000002 (deleted_at) + Sequelize paranoid.
- **Gate de ESLint** configurado para el backend (eslint.config.mjs flat, no-explicit-any,
  no-floating-promises, no-console; target `lint` vía nx:run-commands). `nx lint backend` verde.
- Equipo de agentes: implementer → code-reviewer + security-agent (paralelo) → fixes → lead.
  Reviews: 0 CRITICAL; 2 HIGH (code) + 3 HIGH (security) + medios — TODOS corregidos.
  **El lead detectó que el implementer sobre-declaró**: 5 fixes (varios de seguridad) no
  estaban en la 1ª ronda; se exigió prueba por punto y se re-verificó en código.
- Verificación de cierre (lead, smoke real con perfil de doctor sembrado): POST 201 masked;
  anti-IDOR override OK; lista keys mínimas; cross-doctor 0; reveal plaintext + 4 audit;
  full_name cifrado en BD + hashes 64. `nx test backend` 131/131; lint verde; build verde.
- Hallazgo menor diferido: violaciones de FK (ej. doctor sin perfil) salen como 500 genérico
  — mejorable mapeándolas a 422 en GlobalExceptionFilter (no bloqueante; el doctor autenticado
  siempre existe en uso real). También: GlobalExceptionFilter no loguea el `.parent` de errores
  Sequelize (poco depurable) — mejora pendiente.
- Próximo: siguiente módulo (consultations / finances) o Fase 4, según prioridad.

## 2026-06-02 — CryptoModule global + módulo consultations — completada

- **CryptoService extraído a módulo global** `apps/backend/src/infrastructure/crypto/` (@Global,
  CryptoModule) reutilizable por consultations/ehr/prescriptions. patients actualizado a la nueva
  ruta; sus tests siguen verdes. Commit 3ba36d2.
- **Módulo consultations** (`apps/backend/src/modules/consultations/`, DDD): entidad Consultation
  (canBeModifiedBy, canApprovePayment), VO ConsultationCode (DLT-YYYYMM-XXXX), errores propios,
  repo con cifrado de chief_complaint/diagnosis/treatment/notes vía CryptoService global. Use cases:
  Create (código único con retry ante colisión), Update, ApprovePayment (pending→approved), GetById,
  GetPatientHistory (ownership), List (filtros). Controller con DevAuthGuard + Zod, doctor_id de
  user.sub. Migración 20260602000003 (payment_date). Commit 00e514c.
- Reconciliación: columna real `amount` (no payment_amount); consultation_code ya tenía UNIQUE.
- Equipo: implementer → code-reviewer + security-agent. security APROBADO (0 CRIT/HIGH).
  reviewer APROBADO C/CORRECCIONES: **2 HIGH** (race condition del consultation_code + Error genérico)
  - 3 MEDIUM + 4 LOW. **TODOS los aplicables corregidos (9 fixes)**: race condition real (save()
    captura UniqueConstraintError → ConsultationCodeConflictError → retry; agota → ConsultationCodeExhaustedError),
    ConsultationCodeExhaustedError, DTO legacy eliminado, payment_status validado, VO isValid/generate
    coherentes (≥4 dígitos), DecryptionError en decrypt, validación ISO de fechas, update/updatePayment
    en transacción, unique en el modelo.
- **Lección de proceso:** el implementer volvió a sub-entregar (procesó una directiva vieja de 3
  fixes en vez de la corregida de 9). El lead verificó el código por línea, detectó los 6 faltantes
  y, ante edición concurrente, convergió con el implementer; verificación final en disco confirmó los 9. 193 tests verdes, lint verde, build verde.
- Diferidos documentados: masking en lista (Etapa 1 OK, doctor ve solo las suyas); audit_log en GET
  (pre-prod); imports de CryptoService en application/ de patients (deuda preexistente).
- **Progreso módulos: 3/10 (patients, appointments, consultations).** Próximo: ehr-prescriptions.

## 2026-06-02 — Módulo ehr-prescriptions — completada

- Dos sub-módulos: `apps/backend/src/modules/ehr/` y `modules/prescriptions/` (DDD). Reusan
  CryptoModule global. EHR cifra diagnosis/treatment_plan; prescriptions cifra medication/dosage
  (nombres reales `medication`/`notes`, NO medication_name/instructions; patient_id nullable;
  issued_date mapeado de created_at). Commits fe6659d, 9f232ad, 888a113.
- **Bug crítico encontrado por el implementer y corregido:** `ConsultationsModule` tenía
  `Sequelize` en el array `providers`, lo que hacía **crashear el servidor compilado (dist)** —
  los 193 tests no lo atraparon porque usan el TestingModule, no el dist. El lead había saltado
  el boot-smoke del dist en consultations. **Lección incorporada: el smoke de boot del dist es
  obligatorio por módulo.** Ningún otro módulo tenía el patrón (verificado). Commit fe6659d.
- Reviews: security APROBADO (0 CRIT/HIGH, 2 MEDIUM, 1 LOW); reviewer APROBADO (2 MEDIUM, 3 LOW).
  7 fixes aplicados: anti-IDOR de ESCRITURA en create-prescription (valida ownership del paciente
  vía PatientRepository → PatientNotOwnedError/NOT_FOUND), ParseUUIDPipe en path params, mensajes
  genéricos en DecryptionError (ehr/prescriptions/consultations), códigos de error unificados a
  \*\_NOT_FOUND (anti-enumeración), `requireDecrypt` para medication (sin `?? ''`), tests faltantes.
- **Verificación de cierre del lead:** build + lint + 276 tests verdes + **boot del servidor real**
  (POST ehr/prescriptions/consultations 201, cifrado confirmado en BD ilegible, anti-IDOR override).
- **Lección de proceso recurrente:** el implementer sub-entrega en directivas multi-item
  (procesa el primer lote, omite el addendum). El lead verifica por línea y aplica los pocos
  faltantes él mismo cuando son triviales (más eficiente que otra ronda).
- Diferidos: GeneratePrescriptionPdf (req. tabla doctor_templates + lib PDF); acceso rol-paciente
  a recetas (→ módulo patient-portal).
- **Progreso módulos: 4/10.** Próximo: packages-booking.

## 2026-06-02 — Módulo packages-booking — completada

- `apps/backend/src/modules/packages/` (paquetes prepagados) + `modules/booking/` (booking PÚBLICO).
  Commits d10b88b, 928946a, c4d5b0d.
- Packages: PatientPackage entity, ConsumePackageSession con OPTIMISTIC LOCK, CreatePackage,
  GetPatientPackages. Booking público (sin DevAuthGuard): GET /booking/:doctorId/info|plans|packages,
  POST /booking (find-or-create paciente vía patients repo [cifra PII] + crea cita reusando
  appointments + consume paquete, en TRANSACCIÓN Sequelize atómica).
- **Bug crítico encontrado y corregido (también en appointments):** el check del optimistic lock
  `affected === 1` era SIEMPRE false — Sequelize+pg con `QueryTypes.RAW` devuelve `[rows, QueryResult]`
  y el `?? rawResult` caía en comparar un objeto con 1. Fix correcto: `QueryTypes.UPDATE` (devuelve
  `[undefined, affectedCount]`). El lock de consumo de paquete estaba roto en runtime; los tests con
  mocks no lo atrapaban. Aplicado en sequelize-package y sequelize-appointment repos.
- `DomainError` ahora tiene `httpStatus?` (default 422); GlobalExceptionFilter lo respeta →
  DoctorNotFoundError 404, InvalidEmailError 400. Mejora transversal.
- Reviews: reviewer BLOQUEADO (2 HIGH: optimistic lock + atomicidad del booking) → ambos resueltos
  (QueryTypes.UPDATE + transacción Sequelize). security APROBADO c/correcciones (4 MEDIUM superficie
  pública). 9 fixes aplicados: no exponer patientId, 404 anti-enumeración doctor, validar email Zod,
  mensajes genéricos, lógica del controller a use cases, más entropía en appointmentCode, quitar
  paymentDetails sin uso.
- Verificación del lead: código por línea + build/lint/335 tests + BOOT DEL DIST + smoke real
  (booking 201 sin patientId, PII cifrada, 404 doctor, 400 email, rollback de transacción 6→6).
- **Diferido a Etapa 2 (deuda documentada):** Turnstile real (Cloudflare) + RATE LIMITING en el
  booking público — go-live blocker; hoy es un stub que acepta. También /booking/:doctorId/slots
  (requiere tabla doctor_schedule inexistente).
- **Progreso módulos: 5/10.** Próximo: finances.

## 2026-06-02 — Módulo finances — completada

- `apps/backend/src/modules/finances/` (DDD): Money VO (USD/BS, conversión, add), FinancialTransaction
  entity, resumen financiero, transacciones manuales (income/expense), tasa USDT con Redis. Migración
  20260602000004 (financial_transactions + app_settings). **RolesGuard reutilizable** (super_admin) en
  `presentation/guards/` — lo usará admin.
- GetFinancialSummary suma `consultations.amount` WHERE payment_status='approved' (columna REAL) +
  transacciones manuales. `net` es number con SIGNO (puede ser negativo — mes en rojo). Tasa USDT:
  Redis TTL 600s + fallback app_settings; GET /settings/usdt-rate público; POST /admin/settings/usdt-rate
  super_admin (RolesGuard).
- Reviews: security APROBADO (2 MEDIUM, 2 LOW); reviewer BLOQUEADO (3 HIGH). 5 fixes aplicados:
  net negativo (no floor), guard NaN en redis-usdt-rate, quitar actorRole muerto, tipar controller,
  validar month YYYY-MM.
- **Falso positivo del reviewer descartado por el lead:** reviewer marcó HIGH "columna amount vs
  payment_amount" guiándose por el spec del módulo DESACTUALIZADO; la columna real ES `amount`
  (03b T-07 + smoke lo confirman). NO se tocó. (Lección: el lead juzga los hallazgos, no los aplica a ciegas.)
- Verificación del lead: build/lint/423 tests + BOOT DEL DIST + smoke (net=-70 con gastos>ingresos;
  month inválido→400; RolesGuard doctor→403).
- **Progreso módulos: 6/10.** Próximo: doctor-settings.

## 2026-06-02 — Módulo doctor-settings — completada

- `apps/backend/src/modules/doctor-settings/` (DDD): DoctorProfile entity, DoctorSchedule VO
  (generateSlotsForDate), SubscriptionInfo VO (bannerLevel: suspended/critical≤3d/warning≤7d/none),
  perfil (con payment_details re-añadido al modelo propio), horario, features (Redis cache TTL 3600),
  suscripción, servicios (pricing_plans CRUD reusando/extendiendo el repo de packages).
- **Tabla nueva `doctor_schedules`** (migración 20260602000005) — la que faltaba para slots. Migración
  000006 dropea índice único redundante sobre la PK. Commit (feat doctor-settings).
- pricing_plans repo extendido con update/delete + PricingPlanNotFoundError (httpStatus 404).
- Reviews: code-reviewer APROBADO CON CORRECCIONES (2 HIGH, 4 MEDIUM). Fixes: Redis con try/catch
  (degrada a DB si Redis cae, en get-features e invalidateSlotCache); `currentPeriodEnd ?? null`;
  errores tipados (DoctorProfileNotFoundError/PricingPlanNotFoundError, no `throw new Error`);
  spec anti-IDOR de GetServices; índice redundante eliminado.
- **Lección de proceso:** el implementer mandó una auto-evaluación "APROBADO" prematura; el lead
  casi cierra con eso, pero el veredicto REAL del reviewer agent traía 2 HIGH. **Esperar siempre el
  veredicto del agente reviewer, no la auto-evaluación del implementer.** Además: apagar el implementer
  y esperar terminación ANTES de commitear (evita carrera de edición post-commit como en finances).
- Verificación del lead: código por línea + build/lint/497 tests + boot dist (health 200, schedule
  default 08:00-17:00). Diferido: templates (doctor_templates, con PDF); start/end_time como VARCHAR(5)
  (aceptable Etapa 1); double-select en UpdateProfile (optimización futura).
- **Progreso módulos: 7/10.** Próximo: patient-portal.

## 2026-06-02 — Módulo patient-portal — completada

- `apps/backend/src/modules/patient-portal/` (DDD): portal del paciente (dashboard, citas, paquetes
  con info del doctor, recetas propias descifradas, mensajes get/send, perfil get/update). Implementa
  el acceso-paciente a recetas que se difirió en ehr-prescriptions.
- **Regla anti-IDOR central:** todo se scopea por `auth_user_id = user.sub`; nunca por ids del cliente.
  Maneja multi-patient-record (un auth_user_id con varios patients rows, uno por doctor). SendMessage
  valida relación paciente-doctor antes de insertar (direction='patient_to_doctor').
- Reviews: reviewer + security APROBADO C/OBSERVACIONES (0 CRITICAL; 0 HIGH bloqueante). 4 fixes:
  IPatientPortalRepository movida a domain/ (corrige inversión DDD), return types tipados, validación
  UUID de doctor_id en GET /messages, comentarios TODO/guard.
- **Falso/parcial descartado por el lead:** security marcó HIGH "auth_user_id NOT NULL" — DESCARTADO:
  es nullable POR DISEÑO (pacientes sin cuenta; solo los que tienen cuenta acceden al portal; rows sin
  auth_user_id invisibles en el portal es correcto). No se cambió el schema.
- Verificación del lead: código por línea (interfaz en domain/, sin ruta vieja) + build/lint/540 tests
  - boot dist (health 200) + anti-IDOR re-confirmado (atacante ve vacío; mensaje cross-doctor rechazado).
- Diferidos: /prescriptions/:id/pdf y /reports (PDF + decisión de producto); N+1 en packages (perf,
  batch antes de prod); updateProfile no atómico; cifrado de patient_messages.body (Etapa 2).
- **Progreso módulos: 8/10.** Próximo y ÚLTIMO: admin (depende de todos). Luego → QA (parada).

## 2026-06-02 — Módulo admin (ÚLTIMO) — completada

- `apps/backend/src/modules/admin/` (DDD): super_admin. DoctorWithActivity entity, PlanConfig VO,
  dashboard KPIs (Redis cache 300), lista de médicos, detalle, update suscripción, suscripciones,
  planes (toggle), plan-features (toggle + invalida features:{plan}), stats de pacientes (counts), settings.
  Migración 20260602000007 (seed plan_configs idempotent). Commit 85f4db5.
- **TODOS los endpoints exigen super_admin** (@UseGuards(DevAuthGuard, RolesGuard) + @Roles a nivel de
  clase). Verificado: super_admin→200, doctor→403 en múltiples endpoints.
- Reviews: reviewer BLOQUEADO (3 HIGH), security APROBADO C/OBSERVACIONES (1 HIGH). Fixes (4 HIGH + medios):
  **HIGH conflicto de models Sequelize** (SubscriptionModel duplicado admin/doctor-settings → renombrado a
  AdminSubscriptionModel; 0 colisiones en boot verificado), Redis try/catch en dashboard/toggle/update,
  paginación consistente con activityStatus, Zod en los 3 PUT de escritura, validación de enums en query.
- Reconciliación: lastSignInAt no existe en Etapa 1 (auth = Fase 4) → activityStatus limitado, documentado.
  usdt-rate NO duplicado (ya en finances).
- Verificación del lead: build/lint/614 tests + boot dist (0 colisiones) + 403 doctor + 400 body inválido.

## 2026-06-02 — 🎉 FASE 3 (backend) COMPLETA — 9/9 módulos de negocio + admin

- **Todos los módulos del plan implementados** (orden modulos/): 01 auth (DevAuthGuard, Etapa 1) ·
  02 patients · 03 appointments · 04 consultations · 05 ehr-prescriptions · 06 finances ·
  07 packages-booking · 08 admin · 09 doctor-settings · 10 patient-portal.
- 614 tests verdes / 101 suites; lint limpio; el dist boota todos los módulos sin colisión.
- Construido con equipo de agentes (implementer + code-reviewer + security-agent), verificación del
  lead por línea + boot del dist en cada módulo.
- **PARADA EN QA** (instrucción del usuario): NO se ejecutó el qa-agent dedicado (cobertura+smoke formal,
  E2E). Es el siguiente paso cuando el usuario lo indique.
- **Deuda diferida documentada (Etapa 2 / decisiones de producto):** Turnstile real + rate limiting en
  booking público; generación de PDF de recetas (+ tabla doctor_templates); slots de agenda
  (doctor_schedules ya existe → desbloqueable); cifrado de patient_messages.body; reports clínicos al
  paciente; N+1 en algunos listados; last_sign_in tracking (Auth0, Fase 4); GlobalExceptionFilter mapear
  FK violations a 422.
- Próximo posible: QA dedicado · Fase 4 (Auth0/sesión única/Cloudflare) · integración frontend (BFF).

## 2026-06-03 — Migración del FRONTEND (en curso) — fundación + piloto patients

- **Norte (instrucción del usuario):** ELIMINAR Supabase por completo del frontend; todo a GCP.
  Conservar 100% la UI y Next.js (no se reescriben componentes). Auth = **dev-stub** en Etapa 1
  (Auth0 en Fase 4). Storage Supabase → GCS (Fase 5). Objetivo: `apps/frontend` con CERO `@supabase/*`.
- **Estrategia (decisión del usuario):** thin-proxy — reescribir el CUERPO de los route handlers/
  `actions.ts` para llamar al backend NestJS vía un BFF client, sin tocar la UI (.tsx).
- **Fundación (✅ commiteada, e2e verificado):**
  - `apps/frontend/lib/api-client.server.ts` — BFF SERVER-ONLY → NestJS (BACKEND_INTERNAL_URL,
    default http://localhost:3001). Adjunta headers x-dev-user-id/role; parsea envelope; devuelve
    `Result<T, AppError>`. Listo para Auth0 en Fase 4 (solo cambia getDevUser()).
  - `apps/frontend/lib/dev-auth.ts` — STUB Etapa 1. `getDevUser()` (server) + `getDevUserFromRequest()`
    (edge, para proxy). `DEV_DOCTOR_UUID='00000000-0000-4000-8000-000000000001'` (sembrar profile con
    ese id para e2e). Reemplaza la sesión Supabase.
  - `apps/frontend/proxy.ts` — **middleware de Next 16** (convención `proxy` confirmada en el código de
    Next: PROXY_FILENAME='proxy', reemplaza a middleware). Gating por rol con dev-auth, CERO @supabase.
    `middleware.ts` ELIMINADO (Next 16 crashea si coexisten).
  - Piloto: `app/doctor/patients/actions.ts` → thin-proxy a NestJS, cero @supabase. UI intacta.
  - tsconfig frontend: `noUncheckedIndexedAccess:false` (override con comentario de deuda — el legacy
    no cumple strict en ~192 lugares; resolver en sprint de calidad).
- **E2E REAL verificado** (Docker + backend dist + next dev + profile sembrado): sin cookie→307 /login;
  patient en /doctor→307 /patient/dashboard (RBAC); doctor→200; /api/patients devuelve datos del NestJS
  con PII enmascarada; 0 referencias a Supabase en el HTML; proxy.ts activo en el log. tsc 0 errores.
- **Patrón establecido y replicable.** Próximo: encadenar el resto de módulos del frontend
  (appointments, consultations, ehr/prescriptions, packages/booking, finances, doctor-settings, admin,
  patient-portal) con el mismo thin-proxy, quitando @supabase; luego eliminar lib/supabase/\*.
- **Diferido (Fase 5, no parte del "funciona igual"):** rutas de integración sin endpoint backend —
  IA/Gemini, email/Resend, PDF de recetas, storage/uploads (→ GCS), calendar-sync, cron, promotions, onboarding.
- **PARADA EN QA:** el usuario hará el QA visual/funcional él mismo (que el front se vea/funcione igual
  que antes, sobre el backend nuevo). NO ejecutar qa-agent.
- **DECISIÓN DE ALCANCE (2026-06-03, confirmada por el usuario):** el acceso a Supabase NO está solo en
  route handlers/actions — **~47 `.tsx` llaman a Supabase DIRECTAMENTE** (`createClient()` en el
  componente). Medición: 47 .tsx + 39 route.ts + 4 actions.ts usan supabase. Para eliminar Supabase del
  todo HAY que editar el **fetch de datos dentro de esos .tsx**. REGLA: se cambia SOLO la capa de datos
  (swap Supabase→backend); NUNCA JSX/estilos/layout/comportamiento. Lo visual queda idéntico. Sin esto
  no se cumple "eliminar Supabase". El Lote 1 dejó actions.ts listos para ehr/consultations pero hay que
  CABLEARLOS en los .tsx. (Client components usan server actions; server components usan api-client.server.)
- **Lote 1 ✅ (commit 8e8c319):** appointment-status (route→backend), consultations route (GET/POST/PATCH),
  actions.ts de consultations/ehr/prescriptions creados. DELETE de appointments/consultations + financials
  - blocks + IA/PDF/email/calendar → Fase 5.
