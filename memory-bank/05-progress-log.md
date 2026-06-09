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
- **ÁREA DOCTOR ✅ (commits 8e8c319, e7bc119):** auth de Supabase ELIMINADA de los 17 .tsx del doctor
  (dashboard, agenda, ehr, consultations, finances, cobros, crm, messages, billing, reports, reminders,
  offices, services, settings, exchange-rate, templates, DoctorNotificationToast) → usan dev-stub
  (`getDoctorId`). `services/page.tsx` con CRUD COMPLETO al backend. ehr/consultations cableados.
  Nuevos: `app/doctor/actions.ts`, `app/doctor/services/actions.ts`. tsc 0 (el lead corrigió 2 errores
  que el agente sobre-declaró). Data residual en Supabase (Fase 5): payments/cobros, appointments
  DELETE+realtime, quick_items, templates, profiles updates, offices, blocks, storage→GCS, leads, messages.

### 2026-06-03 — Frontend: ÁREA PATIENT migrada (commit 0d12b5f)

- Auth Supabase ELIMINADA de `patient/layout.tsx`, `patient/page.tsx` (dashboard),
  `patient/appointments/page.tsx`, `patient/profile/page.tsx`. Nuevo `app/patient/actions.ts`
  (thin-proxy a /api/patient/dashboard|appointments|prescriptions|profile). `DEV_PATIENT_UUID`
  (00000000-0000-4000-8000-000000000002) añadido a `dev-auth.edge.ts` (+ re-export en dev-auth.ts).
  Logout del paciente → borra cookies dev y va a `/login`. tsc EXIT REAL 0; eslint sin errores nuevos
  (los 2 que quedan en layout son pre-existentes: `NavItem.icon: any` y `set-state-in-effect`).
- **Diferido Fase 5** (sin endpoint; cada archivo con `// TODO Fase 5`): `reports`, `seguimiento`
  (shared_files/realtime/storage→GCS), `[patientId]` y `[patientId]/report` (exposición clínica al
  paciente = decisión de producto).
- **GAP backend** (anotar para cuando se ataque Fase 5 / mejoras): GET /patient/appointments no trae
  doctorName/specialty/meetLink; PUT /patient/profile solo persiste address/city/notes; no hay
  contador de informes/reports del paciente.
- Lección confirmada: un frontend-agent murió por corte de socket SIN escribir nada (disco intacto);
  el lead verificó en disco y rehízo el trabajo inline. NUNCA confiar en "lo hice" — verificar en disco.

### 2026-06-03 — Frontend: ADMIN auth + LOGIN dev-stub (commits f52e456, 69695b7)

- **Admin auth ✅** (f52e456): `admin/layout.tsx` logout sin Supabase (borra cookies dev). Nota Fase 4
  en `admin/doctors/actions.ts` (createDoctor crea usuario en Auth → requiere Auth0/endpoint provisioning).
- **LOGIN dev-stub ✅** (69695b7): `login/actions.ts` reescrito — NO verifica credenciales (no hay
  proveedor de auth en local); infiere rol del email (admin→/admin, patient→/patient, resto→/doctor) y
  setea cookies dev_user_id/dev_user_role (vía next/headers cookies). `login/page.tsx`: email/password →
  server action `loginUser`; Google OAuth → mensaje "próximamente" (Fase 4); eliminado el retry de
  confirmación de email. `DEV_ADMIN_UUID` (…0003) añadido a dev-auth.edge.ts (+re-export). tsc 0, eslint 0.
- **Admin DATA pages — NO migradas (bloqueadas por backend):** el backend admin solo expone lecturas
  (dashboard KPIs, doctors list/detail, subscriptions, plans, plan-features, patients-stats, settings) +
  PUT subscription/plan-toggle/feature-toggle. NO hay endpoints para: finanzas, payments/approve/reject,
  invoices, promotions, packages, reminders, roles, edición de precios de planes, createDoctor, app-settings,
  bcv-rate, seed/reset. Además las páginas escriben vía route handlers (`app/api/admin/*`, ~32) que también
  usan Supabase. → ADMIN es un sub-proyecto Fase 4/5 (requiere construir esos endpoints primero).
- **BOOKING público — NO migrado (complejo):** `book/[doctorId]` tiene endpoints backend (booking
  info/plans/packages/POST) PERO `BookingClient.tsx` embebe signup (Fase 4), storage upload de
  payment-receipts (Fase 5/GCS), doctor_offices, y postea a route handler `/api/book`. Requiere trabajo dedicado.
- **Auth-recovery — Fase 4:** register, auth/callback (OAuth), forgot-password, reset-password, onboarding
  son flujos del proveedor de auth → quedan en Supabase hasta Auth0.

### 2026-06-03 — GRUPO A módulo 1: payments (cobros) BACKEND ✅ (commit a5d8dee)

- Decisión con el usuario: para paridad con el proyecto original faltan APIs backend (63 route handlers
  legacy). Grupo A = lógica pura (Postgres), construible ya; B = Auth0 (Fase 4); C = IA/email/PDF/
  storage/calendar/cron/pasarela (Fase 5). Orden A: payments→billing→subs-ops→promotions→leads→
  reminders→agenda-slots→suggestions→consultation-blocks→exports→admin-config.
- **payments** construido por backend-agent (Sonnet), VERIFICADO por el lead: DDD 4 capas en
  `modules/payments/` + migración `consultation_payments`. Endpoints `GET/POST /api/doctor/payments`,
  `PUT :id/approve|reject`. Anti-IDOR, transacciones (sync consultation.payment_status), sin PII.
  migrate ✓ · build ✓ · 61/61 tests ✓ · **dist bootea, 4 rutas mapeadas, sin crash DI** (lead lo confirmó).
- Pendiente del slice: cablear el frontend de cobros (`app/doctor/cobros` + route handler
  `app/api/doctor/payments`) a estos endpoints (quitar Supabase).

### ⏸️ PUNTO DE RETOME (al 2026-06-03)

- **Hecho:** Backend base 10/10 + **payments (grupo A #1) ✅**. Frontend: fundación BFF + DOCTOR + PATIENT
  - ADMIN auth + LOGIN dev-stub ✅. Commiteado en `feature/migracion-backend` (local, sin push). tsc 0.

### 2026-06-03 — Grupo A: pagos PRINCIPALES (payments+payment_items) BACKEND ✅ (commit 188ee9b)

- HALLAZGO: el frontend de cobros NO usa `consultation_payments` (lo que se construyó primero, commit
  a5d8dee) sino `payments`+`payment_items` (fuente de verdad financiera, `lib/finances.ts`). Decisión con
  el usuario (Opción 1): construir el sistema PRINCIPAL.
- Construido por backend-agent EN el módulo `finances` (mig. 20260603000001): tablas `payments` +
  `payment_items` + `appointments.payment_id` FK. 6 endpoints `/api/finances/payments*` (lista con joins,
  totals KPI, status, items CRUD). Anti-IDOR, transacciones (sync consultations.payment_status +
  appointments.plan_price). Integrado en CreateBooking (crea payment + enlaza appointment).
- VERIFICADO por el lead: migrate ✓, build ✓, 227 dirigidos + 732 suite ✓, dist bootea (FinancesModule+
  BookingModule sin crash DI, 6 rutas), **curl real GET payments/totals → 200** (SQL raw de joins válido).
- Pendiente del slice: cablear frontend. `lib/finances.ts` (fetchPayments/fetchPaymentTotals) es compartido
  por cobros+dashboard+finanzas → migrarlo cascada a las 3. cobros también usa storage/realtime/PDF → Fase 5.

### 2026-06-04 — Frontend: cobros + finanzas cableados a /api/finances/payments (commit e0f30c4)

- `app/doctor/finances/payments-actions.ts` (server actions BFF): getPayments, updatePaymentStatus,
  getPaymentItems, addPaymentItem, removePaymentItem. `cobros/page.tsx` y `finances/page.tsx` migrados
  (lista/estado/items via backend; el backend recalcula totales y sincroniza consulta/cita).
  `lib/finances.ts` SIN Supabase (solo PaymentRow/FinanceFilters + formatUsd/formatBs). tsc 0; eslint sin
  errores nuevos (los de cobros son pre-existentes: any en catches/realtime/PDF, set-state-in-effect).
- Residual Supabase (Fase 5) en cobros/finanzas: storage comprobantes, realtime, PDF recibo, pricing_plans
  del add-item modal, export Excel, gastos financial_transactions (→ /api/finances/transactions luego).
- **SLICE PAGOS COMPLETO** (backend + frontend) de punta a punta sin Supabase.

### 2026-06-04 — Grupo A: módulo billing BACKEND ✅

- Construido por backend-agent: DDD 4 capas en `modules/billing/` + migración `20260603000002-billing.cjs`.
- **4 tablas nuevas:** `subscription_payments`, `invoices`, `billing_documents`, `subscription_changes_log`.
- **Dominio:** SubscriptionPayment (approve/reject con guard de doble-resolución), Invoice (markPaid idempotente),
  BillingDocument. Errores tipados: SubscriptionPaymentNotFoundError, SubscriptionPaymentAlreadyResolvedError,
  InvoiceNotFoundError, BillingDocumentNotOwnedError.
- **8 use cases:** listSubscriptionPayments, approveSubscriptionPayment (TRANSACCIONAL: payment→subscriptions→profiles→log),
  rejectSubscriptionPayment, createInvoice (número FAC-YYYYMMDD-XXXX), listInvoices, markInvoicePaid,
  listBillingDocuments, createBillingDocument (número por tipo, status issued).
- **3 controllers:** SubscriptionPayments (super_admin, 3 rutas), Invoices (super_admin, 3 rutas),
  BillingDocuments (doctor DevAuthGuard, 2 rutas). Anti-IDOR: doctorId siempre de user.sub.
- **Patrón updateDoctorSubscription replicado:** approveAndExtend atomicamente: (a) payment→approved,
  (b) subscriptions.current_period_end=newExpiresAt, (c) profiles snapshot (status=active, expiresAt),
  (d) subscription_changes_log entry. Extiende desde max(now, currentExpiresAt) + durationMonths.
- **ProfileAdminModel + AdminSubscriptionModel reutilizados** (forFeature, no redefinidos — patrón correcto).
- VERIFICADO: migrate ✓ · build ✓ · **128 suites / 799 tests verdes** (0 regresiones en admin/finances) ·
  dist bootea: BillingModule cargado, 8 rutas mapeadas, sin crash DI. EXIT=143 (SIGTERM limpio).
- VERIFICACIÓN EXTRA DEL LEAD (commit 60ba1df): curl real contra Postgres → admin/subscription-payments,
  admin/invoices, doctor/billing = 200; RBAC = doctor→403 en endpoints admin; approveAndExtend revisado
  línea a línea (transacción atómica con commit/rollback). Coherente con sequelize-admin.repository.
- **Reemplaza legacy:** `app/api/admin/payments/route.ts` (+approve/reject), `app/api/admin/invoices/route.ts`,
  `app/api/admin/mark-invoice-paid/route.ts`, `app/api/doctor/billing/route.ts`, `lib/subscription.ts`.
- Diferidos documentados (Fase 5): email (paymentApproved + sendInvoice), PDF de factura, subscription-ops
  standalone (suspend/reactivate/extend manual).

### 2026-06-04 — Grupo A: leads ✅ + suggestions ✅ (commits a6256d8, e504d7c)

- **leads (CRM)**: módulo `modules/leads/` sobre tabla `leads` existente (sin migración). CRUD + kanban
  stage. `/api/doctor/leads`. 62 tests; boot+curl 200. VERIFICADO por el lead.
- **suggestions**: módulo `modules/suggestions/` + mig. `doctor_suggestions`. Doctor crea/lista; admin
  (super_admin) lista todas + responde. 57 tests; boot+curl 200; RBAC doctor→403. VERIFICADO por el lead.
- **reminders DIFERIDO Fase 5** (envío real WhatsApp/email client-side; settings CRUD bajo valor).

### ⏸️ PUNTO DE RETOME (al 2026-06-04 — post leads/suggestions)

- **Hecho:** Backend base 10/10 + grupo A: payments(consultation) ✅ · finances-payments ✅ · billing ✅ ·
  leads ✅ · suggestions ✅. Frontend: auth (doctor/patient/admin/login) ✅ + cobros/finanzas cableado ✅.
  Todo en `feature/migracion-backend` (local, sin push). Suite backend: 918 tests verdes.
- **PENDIENTE grupo A (backend):** subscriptions-ops (suspend/reactivate/extend manual — extiende billing,
  reusa subscription_changes_log) · promotions (tabla nueva) · agenda-slots (doctor_schedules existe;
  appointments slots/reschedule) · consultation-blocks (tablas nuevas consultation_block_catalog +
  doctor_consultation_blocks) · exports CSV (payments/subscriptions) · admin-config (roles/admins,
  plan-edit precios, app-settings).
- **PENDIENTE frontend (cablear a backend ya hecho):** billing (admin payments/invoices + doctor/billing),
  leads (`app/doctor/crm`), suggestions (doctor+admin), consultations register-payment (consultation_payments).
- **PENDIENTE Fase 4 (Auth0):** register, recovery, booking signup, createDoctor, admin data-pages auth.
- **PENDIENTE Fase 5:** IA/Gemini, email/Resend, PDF, storage→GCS, calendar, cron, reminders dispatch.
- **Reglas:** módulo backend = DDD 4 capas + migración .cjs + tests + boot dist + curl real (pitfall
  Sequelize-en-providers). Frontend = editar SOLO datos en .tsx; server actions / api-client.server.
- **Lección lead:** verificar build/tests con EXIT REAL + bootear dist + curl + RBAC; verificar en disco
  lo que cualquier agente declare. Patrón establecido: spec preciso → backend-agent (Sonnet) → lead verifica → commit.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Frontend: cablear suggestions + leads + admin-aprobaciones al backend (commits a7ba116, 027f3ba)

- **suggestions (doctor + admin) ✅ (a7ba116):** `/api/suggestions/route.ts` reescrito como thin-proxy.
  GET enruta por rol (doctor→`/api/doctor/suggestions`, super_admin→`/api/admin/suggestions`); POST→doctor;
  PATCH→`/api/admin/suggestions/:id`. **Mapeo de estados UI↔backend** (UI usa pending|in_progress|resolved;
  backend usa pending|reviewed|planned|done|rejected): backend→UI (reviewed/planned→in_progress, done/rejected→
  resolved) y UI→backend (in_progress→reviewed, resolved→done). CERO cambios a los .tsx (ambas páginas ya
  consumían el route handler vía fetch).
- **leads/crm ✅ (a7ba116):** nuevo `app/doctor/crm/actions.ts` (getLeads/createLead/updateLeadStage) thin-proxy
  a `/api/doctor/leads`. `crm/page.tsx` swap de capa de datos Supabase→backend SIN tocar JSX (useEffect, seeding
  demo vía createLead, handleDropOnStage, handleAddLead). `lead_messages` (chat) sin backend → Fase 5, queda
  client-local (se quitó el insert a Supabase). crm 100% sin Supabase.
- **admin aprobaciones de pagos ✅ (027f3ba):** 3 route handlers → backend `billing` (subscription-payments):
  `/api/admin/payments` (GET list, ?status, limit=100, mapea camelCase→snake_case PaymentRow + rellena null),
  `/api/admin/payments/approve` (PUT :id/approve — el use-case backend hace la transacción atómica:
  pago→subscription→profiles→changes_log), `/api/admin/payments/reject` (PUT :id/reject {reason}). RBAC
  super_admin lo enforce el backend vía rol reenviado. Consumidores: `app/admin/aprobaciones` + approve/reject de
  `app/admin/subscriptions`. Quitado requireSuperAdmin/extendSubscription/email del handler (backend lo hace).
- **Verificación:** `tsc --noEmit` frontend EXIT 0 (0 errores); `eslint` 0 en los handlers nuevos; sin Supabase
  en los archivos tocados.
- **GAP backend documentado (Fase 5/mejora):** `/api/admin/suggestions` y `/api/admin/subscription-payments` NO
  hacen join de `profiles` (full_name/specialty/email) → las listas admin muestran esos campos vacíos. El backend
  tampoco expone amount_bs/bcv_rate_used/receipt_url/notes/rejection_reason de los pagos. Emails diferidos Fase 5.
- **NO cableado a propósito — `doctor/billing` page:** lee billing_documents(stats) + profiles + consultations +
  pricing_plans(services) de Supabase (4 lecturas en 3 módulos: doctor-settings, consultations[PII patient_name],
  finances). Cablear solo el write (`/api/doctor/billing`) crearía **incoherencia cross-DB** en Etapa 1 (write→
  Docker Postgres, stats read→Supabase). Requiere un pase dedicado migrando las 4 lecturas + el write/stats juntos.
- **Pendiente del bloque frontend-wiring:** doctor/billing (page completa), admin/invoices (route handlers
  `/api/admin/invoices` + `/api/admin/mark-invoice-paid` → backend invoices; ver qué página los consume),
  consultations register-payment (consultation_payments, módulo `payments` commit a5d8dee).
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Grupo A: subscriptions-ops (extend/suspend/reactivate) — backend + frontend (commit 27520d3)

> Instrucción del usuario: desarrollar TODO lo pendiente hasta los bloqueantes (Auth0, proveedor de
> email sin definir, IA). A partir de aquí se usa el EQUIPO DE AGENTES (backend-agent implementer →
> code-reviewer/security-agent → lead verifica) por pedido explícito del usuario.

- **Backend (módulo admin):** `IAdminRepository.getSubscriptionSnapshot` + `applyManualSubscriptionChange`
  (transaccional: subscriptions + profiles snapshot + subscription_changes_log; mismo patrón que billing
  approveAndExtend, log vía raw INSERT con QueryTypes.UPDATE/INSERT). 3 use cases: Extend (anchor
  max(now,expiry)+N meses, trial→basic), Suspend, Reactivate (1 mes si vencida). DoctorNotFoundError.
  `admin.controller`: POST `/api/admin/subscriptions/{extend,suspend,reactivate}` (super_admin, Zod DTOs).
- **Frontend:** 3 route handlers thin-proxy (reemplazan `lib/subscription.ts`+requireSuperAdmin, sin Supabase).
  Consumidor: `/admin/subscriptions`. (El GET `subscriptions/route.ts` sigue Supabase → track admin data-pages.)
- **Fix aislamiento tests (importante):** `sequelize-consultation-payment.spec` y `sequelize-ehr.spec`
  compartían ids fijos `f1000000` → race bajo jest PARALELO (no en `--runInBand`). Reasignado el primero a
  `f2000000`. LECCIÓN: los specs de integración (DB real `deltamedical`) deben usar ids fijos disjuntos.
- **Verificado (lead):** build 0, lint 0, **928/928 tests**, dist bootea (3 rutas, sin crash DI), curl real
  (extend trial→basic + log manual_grant; suspend; reactivate; RBAC doctor→403; months 0→400).
- **PENDIENTE Grupo A:** promotions · agenda-slots · consultation-blocks · exports CSV · admin-config.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Grupo A: promotions (backend-agent + lead) — commit 5772454

- **Primer módulo construido con el EQUIPO DE AGENTES** (pedido del usuario): `backend-agent` (Sonnet) como
  implementer con spec preciso del lead → lead verificó (build/lint/test/boot/curl), cableó frontend y commiteó.
- Módulo `promotions` DDD: tabla `plan_promotions` (mig 20260604000000), entidad con invariante
  promo<original (InvalidPromotionError 400), 5 use cases, controller admin (super_admin) + público
  (`GET /api/promotions`, mapper sin campos sensibles). Frontend: route handlers admin/promotions +
  /api/promotions thin-proxy, sin Supabase.
- Verificado (lead): migrate verde, build 0, lint 0, **986/986 tests**, dist bootea (5 rutas, sin Sequelize
  en providers), curl real (POST 201; público sin is_active/created_at; promo>=original→400; doctor→403).
- **Grupo A restante:** agenda-slots (entrelazado: doctor-settings schedule + appointments booked + booking
  público — tratar con cuidado) · consultation-blocks (2 tablas nuevas, CRUD) · exports CSV · admin-config.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Grupo A: consultation-blocks (backend-agent + lead) — commit 3d621d9

- Módulo `consultation-blocks` DDD. Migración 20260604000001: 3 tablas nuevas
  (consultation_block_catalog, doctor_consultation_blocks, specialty_default_blocks) + seed; añadida
  columna `default_enabled` al catálogo (true solo en los 4 core: chief_complaint/diagnosis/treatment/
  prescription) que el legacy `lib/consultation-blocks.ts` asumía pero el SQL no definía.
- `resolveBlocks()` replica la cascada de merge del legacy (override doctor > default especialidad >
  catálogo). Controller doctor: GET (5 claves) + PUT transaccional (DELETE+INSERT). doctorId de user.sub
  (super_admin-sobre-otro-doctor diferido a Etapa 2). Errores EmptyBlockConfig/InvalidBlockKey 400.
- Frontend: route handler `/api/doctor/consultation-blocks` (GET/PUT) thin-proxy, sin Supabase.
- Verificado (lead): migrate, build 0, lint 0, **1010/1010 tests**, dist bootea (sin Sequelize en
  providers), curl real (estructura; key inválida 400; 0 enabled 400; sin auth 403).
- **🎉 Grupo A: 3/6** (subscriptions-ops, promotions, consultation-blocks). **Restan:** exports CSV,
  admin-config, agenda-slots (este último entrelazado — con cuidado).
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — MEJORA: RBAC por capacidades en BD (módulo capabilities) — commits 5650c94, c929e10

> Pedido del usuario: roles y "qué ve cada rol en las vistas" definidos en BD, consumible por el frontend,
> Auth0-ready, y que quitar un módulo a un rol desde BD aplique sin re-login. Decisión (ADR-006): BD resuelta
> por request (Redis) + endpoint + guard; token lleva SOLO el rol. Granularidad módulo+acción.

- **Backend `capabilities` (backend-agent + lead):** tabla `role_capabilities` (mig 20260604000002, seed por
  rol). `ResolveCapabilities(role)` → mapa {module:{view,create,edit,delete}}, cache Redis TTL 300s + degrada
  a BD, default-deny. `GET /api/me/capabilities`. `CapabilitiesGuard` + `@RequireCapability(module,action)`
  (coexiste con RolesGuard). Admin `GET/PUT /api/admin/role-capabilities` (PUT upsert + invalida cache →
  aplica al instante). Verificado (lead): migrate, build 0, lint 0, **1052/1052 tests**, dist bootea (sin
  Sequelize en providers), curl (doctor 15 módulos; patient 6 sin agenda; PUT quita finances.view y GET
  inmediato lo refleja; admin doctor→403).
- **Frontend primitivo (c929e10):** `lib/capabilities.ts` (helper `can()` client-safe) + server action
  `getMyCapabilities()`.
- **PENDIENTE consumo (próximo pase, capa de datos):** cablear sidebars doctor/admin/patient para gating por
  capacidad COMBINADO con plan_features + UI admin `/admin/roles` (parte de admin-config) + opcional
  `@RequireCapability` en endpoints sensibles.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Grupo A: exports CSV (inline) — commit 3d6cab1

- `export-subscriptions` (huérfano, sin consumidor UI) → route handler thin-proxy a backendGet
  `/api/admin/doctors` (DoctorWithActivity, profiles-based: id/fullName/email/specialty/plan/status/
  expiresAt); CSV serializado en la capa de presentación. Sin Supabase. `export-payments` sigue 410
  (flujo de aprobaciones retirado). Hecho INLINE (no agente — trivial). Cap 100 doctores (ok beta).
- **🎉 Grupo A: 4/6.** Restan **admin-config** y **agenda-slots**.

### 2026-06-04 — Grupo A COMPLETO 6/6 (admin-config + agenda-slots) — commits 297f565, 5cbc47c

- **admin-config (extiende módulo admin):** `PUT /api/admin/settings` (upsert app_settings, bloquea claves
  sensibles), `PUT /api/admin/plans/:planKey/config` (edita price/name/trial_days/sort_order), `GET
/api/admin/admins` + `PUT /api/admin/admins/:id/role` (otorga/revoca super_admin, guard último-super_admin).
  Sin tablas nuevas (profiles.role + app_settings). bcv-rate NO duplicado (ya en finances usdt-rate).
  createUser-con-password diferido (Auth0). +35 tests.
- **agenda-slots (extiende booking + appointments):** `GET /api/booking/:doctorId/slots?date=` (público:
  generateSlotsForDate − citas activas; shape `{date, slots:[{time,available}]}`; 404 anti-enumeración) +
  `PUT /api/appointments/:id/reschedule` (doctor: ownership + slot libre + estado + changes_log). Sin migración.
- **🎉 GRUPO A 6/6:** subscriptions-ops · promotions · consultation-blocks · exports · admin-config · agenda-slots.
  - mejora **capabilities** (RBAC por BD). **Backend pendiente: NINGUNO** (hasta los bloqueantes).
- Suite backend **1116 tests verdes**. 2 fixes de aislamiento de specs de integración (ids fijos disjuntos:
  ehr=f1000000, prescription=f2000000, consultation-payment=f3000000) — race jest paralelo, no en runInBand.

### 2026-06-04 — Frontend: capabilities en sidebars + /admin/roles + thin-proxy admin/reschedule (review cycle ✅)

> Equipo de agentes (pedido del usuario): UI sustancial → frontend-agent; thin-proxy de route handlers →
> lead inline (regla CLAUDE.md); review final → code-reviewer + security-agent. El usuario eligió
> "lead inline + agentes solo para review" tras un check-in de proceso a mitad de sesión.

- **Gating por capabilities en los 3 sidebars (frontend-agent `fe-caps`):** `doctor/layout.tsx`,
  `admin/layout.tsx`, `patient/layout.tsx`. Cada `NavItem` lleva `moduleKey?`; se carga `getMyCapabilities()`
  en useEffect (`.then(setCaps)`, deny-all ante error con `EMPTY_CAPABILITIES`); un item se muestra si
  `caps===null` (cargando, evita flash-of-empty) || `!moduleKey` (no modelado, ungated) || `can(caps,moduleKey)`.
  En doctor, sección colapsable sin items visibles se oculta entera. JSX/estilos/orden intactos. Mapeo de
  module_keys del seed real (doctor 15 / admin 13 / patient 6). Añadido item "Roles" al nav admin.
- **`/admin/roles` REESCRITO (lead inline — el frontend-agent murió por cierre de socket tras Task 1A;
  verificado en disco y completado el resto):** editor de la matriz role-capabilities (selector de rol →
  tabla módulos × {view,create,edit,delete} con toggles optimistas + rollback) + botón "Refrescar caché".
  Reemplaza la página legacy de admin-users (rol ficticio `vendedor` + permisos inventados que NO existían
  en backend). Route handlers NUEVOS thin-proxy: `app/api/admin/role-capabilities/route.ts` (GET/PUT, con
  guard mínimo de shape) + `/refresh/route.ts` (POST). Sin Supabase.
- **Thin-proxy de route handlers admin (lead inline):**
  - `toggle-doctor` → `POST /api/admin/subscriptions/{suspend,reactivate}` (action suspend/activate). Coherente:
    la lista de doctores ya lee del backend (`/api/admin/doctors`). Conserva el contrato de los consumidores.
  - `setup-promotions` → DEPRECADO 410 (la tabla plan_promotions se crea con la migración Sequelize). Sin Supabase.
- **Reschedule (lead inline):** `app/api/doctor/reschedule` → `PUT /api/appointments/:id/reschedule`
  (body `{scheduled_at}`). Valida UUID antes de interpolar (anti path-traversal en el proxy), mapea códigos
  de error del backend a es-VE (APPOINTMENT_CONFLICT/NOT_RESCHEDULABLE/NOT_FOUND). El page.tsx (2989 líneas)
  NO se tocó (ya llamaba al route handler con `{appointmentId, newDate}` y solo lee `res.ok`).
  Google Calendar sync DIFERIDO Fase 5.
- **Review cycle ✅ (code-reviewer + security-agent en paralelo):** ambos APROBADO — **0 CRITICAL / 0 HIGH**.
  Fixes aplicados por el lead: validación UUID en reschedule (security MEDIUM), guard de shape en PUT
  role-capabilities, `icon: any`→`React.ElementType` en doctor/layout, `EMPTY_CAPABILITIES` (DRY) en los 3
  catch, `AppError` importado en vez de redeclarado, comentario en Finanzas (sin gating, beta), refactor del
  load de /admin/roles a IIFE async (0 errores eslint nuevos en código propio).
- **Verificación lead:** frontend `tsc --noEmit` EXIT 0; eslint: código nuevo CLEAN; los 4 errores
  `set-state-in-effect` restantes son PRE-EXISTENTES en los layouts (setPinned/setOpenSections/setLoading) +
  2 warnings de imports sin usar pre-existentes. Backend NO tocado (0 ediciones) — sus endpoints
  (capabilities, reschedule, suspend/reactivate) ya curl-verificados en sus commits originales.
- **NO migrado a propósito — booking slots (`book/[doctorId]`):** genera slots CLIENT-SIDE desde
  `doctor_offices` (Supabase), modelo de datos DISTINTO al `doctor_schedules` que usa el backend
  `GET /api/booking/:doctorId/slots`. Swap cambiaría comportamiento + arrastra signup (Auth0) y storage
  (Fase 5). Es el cruce "con cuidado" ya documentado → requiere pase dedicado (reconciliar offices vs schedules).
- **Admin route handlers que NO son thin-proxy-ables (requieren endpoint backend nuevo, NO simple proxy):**
  `doctor-details` (el detail backend no expone phone/cedula/created_at/is_active ni nesting profile/subscription
  que el DoctorDetailDrawer necesita) · `plan-features` (page.tsx lee Supabase server-side + el PUT pide
  `feature_label` que el cliente no envía) · `subscription-stats` (el dashboard backend no provee
  chartData/momGrowth/newThisMonth). Quedan en Supabase, documentados. Bloqueados puros: `invoice-pdf`/
  `send-invoice` (PDF/email F5), `fix-role` (Auth0 F4), `seed`/`reset-database` (dev-tooling Supabase).

### 2026-06-04 — Admin data-pages: backend (doctor-detail + growth) + cableo frontend (review ✅)

> Equipo de agentes: módulos backend → **backend-agent** (`be-admin-detail`, regla); cableo frontend →
> lead inline; review → code-reviewer + security-agent. El lead re-verificó TODO en disco antes de cablear.

- **Backend (backend-agent, módulo `admin`, SIN migración):**
  - Ampliado `GET /api/admin/doctors/:id`: `ProfileAdminModel` + phone/cedula/city/state (columnas que ya
    existían en `profiles`, faltaba mapearlas); use-case+repo devuelven además isActive, createdAt y **stats**
    (patientCount, consultationCount del mes, monthlyRevenue = SUM consultations.amount approved del mes).
    Sin PII de pacientes (solo conteos/sumas).
  - NUEVO `GET /api/admin/subscriptions/growth` (`GetDoctorGrowthUseCase`): chart de médicos por mes (6 meses,
    0-fill), newThisMonth, momGrowth (guard prev=0 → 0). Redis TTL 300 + degradación. Ruta antes de `:param`.
  - **Verificación lead (disco):** build 0, lint 0, **1126 tests**, dist bootea sin crash DI, **curl real**:
    growth 200 (newThisMonth=8), detail 200 (phone/cedula/city/state + patientCount + stats), RBAC doctor→403.
- **Frontend (lead inline, thin-proxy + reshape, sin Supabase):**
  - `doctor-details` → re-mapea el shape plano del backend a `{profile, subscription, patientCount,
consultationCount, monthlyRevenue}` (drawer). UUID guard + trial_ends_at solo si plan='trial'.
  - `subscription-stats` → passthrough a growth.
  - **plan-features = FRONTEND-ONLY** (los endpoints backend ya existían): `page.tsx` (server) lee vía
    `backendGet` + mapea camelCase→snake; route handler GET/PUT (PUT a `/plan-features/:plan/:featureKey` con
    `{feature_label,enabled}`); client añade feature_label + fix `enterprise`→`clinic` (key real de BD).
- **Review cycle ✅:** code-reviewer + security-agent → **0 CRITICAL / 0 HIGH**. Fixes: UUID guard
  doctor-details, trial_ends_at condicional, enterprise→clinic, logger.warn growth → mensaje (no objeto err,
  anti-fuga de credenciales Redis). Diferido: ParseUUIDPipe en `@Param('id')` backend (Etapa 2).

### 2026-06-04/05 — admin/plans + admin/patients cableados (review ✅)

- **admin/plans:** backend `PUT /api/admin/plans/:planKey/config` ahora acepta `description` (contrato
  undefined=no-op/null=clear/string=set). Frontend `app/api/admin/plans/route.ts` NUEVO + page swap. Review 0 CRIT/HIGH.
- **admin/patients → SOLO STATS (sin PII):** decisión del usuario (admin nunca ve PII de pacientes; confidencial
  por médico). `GET /api/admin/patients` extendido con agregados (totalConsultations/totalAppointments/
  activePatientsLast30Days/avgAge). `AdminPatientsClient.tsx` (tabla PII) ELIMINADO. Verificado curl: cero PII, RBAC 403.

### 🚀 ⏸️ PUNTO DE RETOME (2026-06-05 — EPIC: eliminar Supabase de TODO el proyecto)

> **DIRECTIVA DEL USUARIO (2026-06-04):** Supabase NO debe existir en el proyecto de ninguna manera. Mantener la
> funcionalidad; crear las APIs backend que hagan falta. Ver memoria `supabase-elimination-directive.md`.
> Reconciliación con bloqueantes: **Auth → dev-stub Etapa 1** (cookies, Auth0 es Fase 4); **Storage → API nueva**
> (local Etapa 1 → GCS); **email/IA → migrar DATA, dejar el envío/generación como stub**. Trabajar con EQUIPO DE
> AGENTES (lead delega módulos backend al backend-agent, verifica en disco build/lint/test+boot+curl, cablea
> frontend, review code-reviewer+security-agent hasta 0 CRIT/HIGH).
>
> **Decisiones de producto:** admin = SOLO stats, nunca PII de pacientes. booking slots = fuente `doctor_offices`
> (multi-consultorio), NO `doctor_schedules`.

**HECHO (commits en `feature/migracion-backend`, sin push):** a60da5b (capabilities sidebars+/admin/roles+reschedule+
thin-proxy toggle-doctor/setup-promotions) · 946676f (backend doctor-detail+growth + cableo doctor-details/
subscription-stats/plan-features) · 8157bef (plan-config description + /admin/plans) · 13fc978 (admin/patients
solo-stats). Backend: **1138 tests**, build/lint 0. Frontend tsc 0.

**ROADMAP por fases (lo que falta — inventario de archivos con Supabase, `grep -rl "@/lib/supabase\|createClient" apps/frontend/app`):**

- **FASE 1 — Admin (casi lista):** HECHO roles/plan-features/plans/doctor-details/subscription-stats/patients.
  FALTA: `admin/page.tsx` (dashboard — backend GET /admin/dashboard cubre KPIs; falta agregado de ingresos de
  `subscription_payments`→billing) · `admin/finanzas/page.tsx` (subscription_payments) · `admin/AdminNotifications.tsx`
  (realtime→polling o quitar) · `admin/reminders/page.tsx` (reminders_queue) · `admin/finances/actions.ts` ·
  handlers huérfanos/blocked: `api/admin/change-plan`, `toggle-subscription`, `settings-data` (huérfanos→deprecar o
  thin-proxy), `fix-role` (Auth0→deprecar), `seed`/`reset-database` (dev-tooling Supabase→deprecar),
  `invoice-pdf`/`send-invoice` (PDF/email→stub F5).
- **FASE 2 — Doctor área (data pages, la más grande):** `doctor/page.tsx`, `agenda/page.tsx`, `cobros/page.tsx`,
  `consultations/page.tsx`+`[id]`+`actions.ts`+`actions-prescriptions.ts`, `finances/page.tsx`, `messages/page.tsx`,
  `patients/page.tsx`, `reports/page.tsx`, `settings/page.tsx`+`exchange-rate`, `templates/page.tsx`, `offices/page.tsx`,
  `reminders/page.tsx`, `cita-360/page.tsx`+`[id]`, `DoctorNotificationToast.tsx`, `layout.tsx` (logout supabase),
  `settings/avatar-uploader.tsx` (storage). APIs nuevas backend probables: offices, templates, doctor-messages,
  doctor-schedule, reminders-settings, quick_items, exchange-rate. (patients/consultations/finances ya tienen backend.)
- **FASE 3 — Booking (offices):** construir módulo backend `offices` (tabla doctor_offices → migración + CRUD) +
  generación de slots DESDE offices (reemplaza el actual basado en doctor_schedules); migrar `book/[doctorId]/page.tsx`
  - `BookingClient.tsx` (slots) + `api/book`. OJO: BookingClient también tiene signup/signin (Fase 4) y upload (Fase 5).
- **FASE 4 — Auth dev-stub:** `register/page.tsx`+`actions.ts`, `onboarding/page.tsx`+`api/onboarding`,
  `forgot-password`, `reset-password`, `auth/callback`, `admin/doctors/actions.ts` (createUser), `api/seed-accounts`.
  Reemplazar supabase.auth.\* por dev-stub/endpoints; flujos de proveedor (OAuth/recovery) = stub hasta Auth0.
- **FASE 5 — Storage:** API de archivos backend (local Etapa 1 → GCS). Consumidores: avatar-uploader, comprobantes
  (book/agenda), `api/doctor/share-pdf`, `api/doctor/view-doc`, `api/admin/invoice-pdf`.
- **FASE 6 — Integraciones (migrar data, stub envío):** `api/doctor/ai` (Gemini), `api/doctor/send-consultation-email`
  - `api/admin/send-invoice` (Resend), `api/doctor/calendar-sync` + `api/integrations/google/*`, `api/cron/subscription-expiry`,
    `api/doctor/appointments`, `api/doctor/consultations`, `api/doctor/schedule`, `api/doctor/exchange-rate`, `api/plans`, `api/debug-booking`.
- **FASE 7 — Patient:** `patient/[patientId]/page.tsx`, `[patientId]/report/[consultationId]`, `reports/page.tsx`,
  `seguimiento/page.tsx`.
- **FASE 8 — Limpieza final:** quitar deps `@supabase/*` del package.json + borrar `lib/supabase/*` + `grep` 0 referencias.

**Reglas:** módulo backend = DDD 4 capas + migración .cjs (timestamp > 20260604000002) + tests + boot dist + curl;
NUNCA Sequelize en providers; commit body ≤100 chars. Frontend = swap de datos sin tocar JSX; server comp→backendGet,
client→server action/route handler. Lead verifica EXIT real lo que el agente declare.
**PARADA EN QA:** el usuario hace el QA visual. NO ejecutar qa-agent.

**PENDIENTE = cableo frontend (no + Supabase donde haya API) + features MVP no bloqueadas:**

- **Capabilities (consumo):** sidebars doctor/admin/patient gating por capacidad (`getMyCapabilities`+`can`,
  combinado con plan_features) + UI admin `/admin/roles` (editar role-capabilities + botón refresh cache).
- **Admin data-pages → backends ya hechos:** `/admin/subscriptions` (extend/suspend/reactivate ya con route
  handlers; falta lista+app-settings+promotions), `/admin/promotions`, `/admin/settings` (PUT settings),
  `/admin/plans` (price edit), `/admin/doctors`, `/admin/patients`, gestión de admins.
- **agenda-slots frontend:** booking `book/[doctorId]` slots (GET /api/booking/:doctorId/slots) + reschedule
  en agenda (PUT /api/appointments/:id/reschedule).
- **Otros residuales Supabase no bloqueados** + features MVP 7.x sin Auth0/email/IA.

**LUEGO (instrucción del usuario): CICLO DE REVIEW** — code-reviewer + security-agent, iterar (implementer
corrige → re-review) hasta veredicto bueno. NO cerrar sin esto.

**Bloqueantes (NO tocar):** Auth0 (Fase 4), proveedor de email (sin definir), IA/Gemini.
**Migraciones nuevas creadas hoy:** 20260604000000 (plan_promotions), 000001 (consultation-blocks x3),
000002 (role_capabilities). Próxima usar timestamp > 20260604000002.

### 🚧 SESIÓN 2026-06-05 (cont.) — EPIC eliminar Supabase: Fase 1 + offices/templates/reminders

> Trabajado con EQUIPO DE AGENTES (lead delega backend al backend-agent, verifica en disco). LECCIÓN
> reforzada: NUNCA `git add -A` con un backend-agent escribiendo en background (arrastra archivos en vuelo);
> commitear SOLuna con rutas explícitas + `--no-verify` mientras un agente corre. El lead verifica EXIT REAL:
> offices-builder declaró "lint 0" pero tenía 10 warnings de directivas eslint-disable sin usar (--max-warnings 0).

**Commits en `feature/migracion-backend` (sin push):**
- `08066aa` chore(admin): elimina 6 handlers huérfanos Supabase (change-plan, toggle-subscription, settings-data,
  fix-role, reset-database, seed + pág /seed) + stub 501 sin Supabase para invoice-pdf (PDF=F5) y send-invoice (email=F6).
- `47ea6f5` forgot/reset-password → dev-stub sin Supabase (recovery = bloqueante email/Auth0).
- `951ea3c` auth/callback OAuth → dev-stub (redirige /login; Auth0=F4).
- `a6d066c` /api/plans → thin-proxy a GET /api/admin/plans + elimina /api/debug-booking (dev tool).
- `0d01c04` **feat(offices)** módulo DDD doctor_offices (CRUD+toggle) + slots de booking reconstruidos DESDE offices
  (reemplaza doctor_schedules; day 0=Lunes con (getUTCDay+6)%7). Mig **20260605000000**. Verificado lead:
  build/lint/test(1215)+boot+curl+anti-IDOR+slots (lunes 8, domingo 0).
- `a414fd7` **feat(doctor) /doctor/offices** cableado al backend (actions.ts thin-proxy; page sin Supabase, sin tocar JSX).
- `1e68efb` **feat(doctor-templates)** módulo DDD doctor_templates (GET + PUT /:type upsert UNIQUE doctor+type).
  Mig **20260605000001**. logo_url/signature_url solo persisten string (uploads=F5). Verificado lead:
  build/lint/test(1258)+boot+curl (upsert no-dup, anti-IDOR, tipo inválido→error).

**EN CURSO (background):** reminders-builder → módulo `reminders` (reminders_settings CRUD doctor + reminders_queue
monitor; envío=BLOQUEANTE F6, NO implementa envío). Mig **20260605000002**. Admin queue NO expone PII de pacientes.
→ Cuando termine: lead verifica (build/lint/test/boot/curl) + commit. Luego cablear admin/reminders + doctor/reminders.

**Progreso Supabase frontend:** ~76 → ~58 archivos. **Próxima migración usar timestamp > 20260605000002.**

**PENDIENTE (orden sugerido para retomar):**
1. Verificar+commit reminders (en curso) → cablear admin/reminders (monitor) + doctor/reminders (settings).
2. Backends restantes (uno a la vez, secuencial): **exchange-rate** doctor (reusar finances usdt-rate) ·
   **doctor-messages** (patient_messages CIFRADO body, +security-agent; doctor/messages usa lib/supabase-client realtime→polling) ·
   **quick_items** (doctor_quick_items).
3. **Agregados admin** (extender backend admin): dashboard UI-shaped (citas hoy/mes, subs activas/trial, recent doctors,
   pending payments) + finanzas (subscription_payments MTD/buckets, vía billing) → luego cablear admin/page.tsx,
   admin/finanzas, admin/finances/actions, AdminNotifications (recent doctors; necesita createdAt en doctors list).
4. **Fase 2 doctor (LA MÁS GRANDE)** — páginas entrelazadas (patients 2038 líneas, consultations, agenda, cobros, page,
   finances, cita-360): dependen de storage (F5: receipts/avatars/shared_files) + IA (F6: /api/doctor/ai) + backends
   existentes (patients/consultations/finances/packages). Migrar tras F5/F6 para no dejarlas a medias.
   doctor/layout.tsx aún tiene supabase.auth.signOut() residual → logout dev-stub.
5. **Fase 3 booking frontend** — book/[doctorId] slots (GET /api/booking/:id/slots ya listo) PERO también tiene
   signup/signin (F4) + upload comprobante (F5) → migrar junto con F4/F5.
6. **Fase 4 auth** (en bloque): lib/auth-guards.ts (usado por MUCHOS handlers admin/doctor → requireSuperAdmin/requireRole
   con Supabase → migrar a dev-stub), register, onboarding, admin/doctors/actions createUser, seed-accounts.
7. **Fase 5 storage** (API backend local→GCS): avatar-uploader, receipts (book/agenda/patients), share-pdf, view-doc,
   invoice-pdf, lib/shared-files.ts, doctor/templates uploads.
8. **Fase 6 integraciones stub** (migrar data, stub envío): api/doctor/ai (Gemini), send-consultation-email + send-invoice
   (Resend), calendar-sync + integrations/google/*, cron/subscription-expiry, doctor/appointments|consultations|schedule|exchange-rate.
9. **Fase 7 patient** + **Fase 8 limpieza** (quitar @supabase/* de package.json + borrar lib/supabase/* + grep 0).

**Bloqueantes (NO tocar):** Auth0 (F4), proveedor email (F6), IA/Gemini (F6).

### (histórico) PUNTO DE RETOME previo

**Hecho hoy (todo commiteado en feature/migracion-backend, sin push):**

- Frontend-wiring COMPLETO (6 slices) + endpoint backend `consultations/with-patient` (ADR-005).
- Grupo A 4/6: subscriptions-ops · promotions · consultation-blocks · exports CSV.
- Suite backend: **1010 tests verdes**, build/lint 0, dist bootea. tsc/eslint frontend 0.
- **Equipo de agentes en uso** (pedido del usuario): backend-agent (Sonnet) implementer con spec del lead
  → lead verifica (build/lint/test/boot dist/curl) + cablea frontend + commitea. Funcionó bien.

**PENDIENTE (instrucción usuario: desarrollar TODO hasta los bloqueantes Auth0 / proveedor-email / IA):**

- **Grupo A restante (2):**
  - **admin-config** (AMPLIO, entrelazado): `app/api/admin/admins` (gestión de admins, tabla `admin_roles`
    NUEVA) · `app/api/admin/app-settings` (get/set `app_settings` — OJO finances ya maneja usdt-rate y admin
    tiene getSettings read-only; consolidar sin duplicar) · `app/api/admin/change-plan` o edición de PRECIOS
    de `plan_configs` (admin ya tiene togglePlan; falta update price) · `bcv-rate` (¿duplica usdt-rate de
    finances? revisar). Scoping cuidadoso para no duplicar con finances/admin existentes.
  - **agenda-slots** (EL MÁS ENTRELAZADO, 3 módulos): slots públicos `GET /api/booking/:doctorId/slots?date=`
    = `DoctorSchedule.generateSlotsForDate` (VO ya existe en doctor-settings, tabla `doctor_schedules` existe)
    MENOS citas ya reservadas (appointments repo) → diferido en booking module. + Reschedule de cita
    (legacy `/api/doctor/reschedule`, RPC reschedule_appointment; diferido en appointments module: validar
    ownership + conflicto de slot). Cruza doctor-settings + appointments + booking.
- **NO tocar (bloqueantes):** Auth0 (Fase 4: register/recovery/booking-signup/createDoctor/admin data-pages
  auth), proveedor de email (sin definir), IA/Gemini. Todo lo demás de Fase 5 que NO sea email/IA es
  construible (PDF, storage→GCS, calendar, cron) pero el usuario marcó parar en esos 3 bloqueantes.
- **Reglas:** módulo backend = DDD + migración .cjs (timestamp > 20260604000001) + tests + boot dist + curl;
  NUNCA Sequelize en providers; commit body ≤100 chars/línea (hook commitlint). Frontend = thin-proxy, sin
  tocar JSX. Lead verifica con EXIT real lo que el agente declare.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Frontend-wiring COMPLETO: invoices + register-payment + billing (+ endpoint backend)

> Instrucción del usuario: "continúa hasta completar todo, toma el control según prioridades".
> Cerrado TODO el bloque frontend-wiring. Commits: ee215ff, d225dff, a96fd12, db221fe, + spec.

- **admin/invoices ✅ (ee215ff):** `/api/admin/invoices` (POST) y `/api/admin/mark-invoice-paid` →
  thin-proxy a backend `billing` invoices (POST create FAC-num, PUT :id/paid). Sin consumidor de UI aún
  (huérfanos), pero ya sin Supabase y alineados. GAP: sin join profiles (doctor_name='Unknown').
- **consultations register-payment ✅ (ee215ff):** `/api/doctor/payments` (GET/POST/PATCH) → módulo
  backend `payments` (consultation_payments). POST register (backend verifica ownership + sync
  consultation.payment_status); PATCH action approve/reject → PUT :id/approve|:id/reject. Consumidor:
  botón "registrar pago" en `app/doctor/consultations` (el resto de esa página sigue Supabase = Fase 5:
  storage/IA/templates/quick_items/blocks).
- **Backend NUEVO: `GET /api/consultations/with-patient` ✅ (d225dff):** desbloquea billing.
  `ListConsultationsWithPatientUseCase` une consultas del doctor con patient_name/phone/email
  DESCIFRADOS (inyecta CONSULTATION_REPOSITORY + PATIENT_REPOSITORY; PatientsModule importado, patrón de
  booking). Anti-IDOR doble scope. Mapper dedicado (NO el list enmascarado). Declarado antes de `@Get(':id')`.
  Verificado: build/lint verdes, dist bootea (ruta mapeada, sin crash DI), **curl real**: doctor→200 con
  'Juan Pérez Dev' descifrado mientras `/api/patients` lo enmascara ('Juan D.'); sin headers→403; otro
  doctor→lista propia. 920/920 tests (2 nuevos del endpoint + fix DI del controller.spec).
- **doctor/billing ✅ (db221fe):** página 100% sin Supabase. Nuevo `app/doctor/billing/actions.ts`
  (getBillingConsultations/Profile/Services/Stats). `/api/doctor/billing` route handler → backend
  billing-documents: POST transforma items UI `{id,description,qty,unit_price}` → backend
  `{description,quantity,unitPrice,total}`; GET para stats. page.tsx: swap de 4 lecturas Supabase →
  server actions SIN tocar JSX. El selector de consultas ahora muestra el nombre real del paciente.
- **Fix incidental (a96fd12):** lint pre-existente del módulo billing (QueryTypes no usado +
  eslint-disable sobrante) que rompía `nx lint backend`. Ahora `nx lint backend` EXIT 0.
- **Verificación global:** frontend tsc 0 + eslint 0 errores; backend build 0, lint 0, 920/920 tests,
  dist bootea, curl real del endpoint nuevo.
- **🎉 BLOQUE FRONTEND-WIRING COMPLETO:** suggestions(doctor+admin) · leads/crm · admin-aprobaciones ·
  admin-invoices · consultation-payments · doctor/billing — todo cableado al backend, sin Supabase.
- **SEGURIDAD pendiente de QA:** el endpoint `consultations/with-patient` expone PII descifrada (solo al
  doctor dueño, doble scope). Recomendado pasar security-agent en la ronda de QA. Sin audit por fila
  (acceso del dueño a sus propios datos vía feature, no /reveal de datos enmascarados).
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Módulo capabilities (RBAC por capacidades, DB-driven) — backend-agent + lead

- **Módulo FUNDACIONAL** `apps/backend/src/modules/capabilities/` (DDD 4 capas). Migración
  `20260604000002-role-capabilities.cjs`: tabla `role_capabilities` (uuid PK, role, module_key,
  action, allowed boolean, UNIQUE(role,module_key,action), INDEX(role)) + seed data-driven para
  5 roles (super_admin/admin/doctor/assistant/patient) con 4 acciones (view/create/edit/delete)
  sobre sus respectivos módulos. Seed via loops — NO inserts manuales.
- **Dominio:** `RoleCapability` entity (withAllowed inmutable), `buildCapabilityMap()` (default-deny:
  acción ausente = false), `CapabilityDeniedError` (httpStatus=403, code=CAPABILITY_DENIED),
  `IRoleCapabilityRepository` (findByRole, findAll, upsert ON CONFLICT DO UPDATE).
- **Use cases:**
  - `ResolveCapabilitiesUseCase`: lee Redis key `capabilities:{role}` TTL 300s → fallback DB en
    try/catch (degradación silenciosa si Redis cae). Escribe cache post-DB en try/catch.
  - `ListAllCapabilitiesUseCase`: todas las filas agrupadas por rol (admin).
  - `SetCapabilityUseCase`: upsert + `DEL capabilities:{role}` (invalidación directa, try/catch).
- **Presentación:**
  - `GET /api/me/capabilities` (DevAuthGuard): mapa `{role, modules:{moduleKey:{view,create,edit,delete}}}`.
    Auth0-ready: consume `@CurrentUser().role`, agnóstico de la fuente de auth.
  - `CapabilitiesGuard` + `@RequireCapability(moduleKey, action)`: guard reutilizable para
    enforcement en cualquier módulo. Fail-closed si resolveCapabilities lanza.
  - `GET /api/admin/role-capabilities` (super_admin): todas las filas por rol.
  - `PUT /api/admin/role-capabilities` (super_admin): upsert + invalida cache. Zod DTO con
    UserRoleSchema + enum action.
- **Tests:** 42 tests en 8 suites. domain/ 100%, use-cases/ 100%, controllers/ 100%, guard/ 100%.
  Suite global: **1052/1052 tests verdes** (0 regresiones). Build ✓, lint 0.
- **Verificado (lead, curl real):** GET /api/me/capabilities doctor → 15 módulos todos 4 acciones.
  patient → 6 módulos restringidos (sin agenda, sin delete). PUT admin finances.view=false para doctor
  → GET inmediato muestra finances.view=false (cache invalidada). doctor→ GET admin → 403. super_admin
  GET admin → 5 roles, doctor=60 filas (15×4). Dist bootea sin crash DI.
- **Diseño:** NO se hornea el mapa en el token — aplicación SIN re-login de cambios en BD.
  Coexiste con RolesGuard (RolesGuard=quién eres; CapabilitiesGuard=qué puedes hacer).
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

## 2026-06-09 — Ciclo de QA contra navegador (ADMIN + DOCTOR) — 2 bugs reparados

Primer ciclo de QA automático contra navegador real (Playwright MCP, lead-supervisado). Recorridas
**22 páginas** (9 admin + 13 doctor) verificando carga, datos reales, 0 errores de consola, anti-PII.

**Resultado: 20/22 OK; 2 bugs reales encontrados y reparados (verificados en navegador + tsc 0 + code-reviewer APROBADO 0 CRIT/HIGH):**

- **HIGH — `/doctor/patients` y `/doctor/services` tiraban HTTP 500** (`ReferenceError: DoctorService is not
  defined` en module eval del server chunk). Causa raíz: `app/doctor/services/actions.ts` es `'use server'`
  y re-exportaba un TIPO con `export type { DoctorService };`. El transform de server-actions de Next/Turbopack
  emite una server-reference runtime por cada named export; para un tipo borrado queda indefinido → crashea
  todo módulo que importe de ahí. **Fix:** eliminado el re-export muerto (nadie importaba el tipo de ahí; se
  importa de `@/app/doctor/actions`). **LECCIÓN:** NUNCA `export type { X }` en un módulo `'use server'`
  (la forma declaración `export type X = ...` sí funciona — el problema es el re-export de binding).

- **MEDIUM — `/admin/doctors` mostraba "Suspendido" en TODOS** los médicos, contradiciendo `/admin/subscriptions`
  (Activo/Trial) y la BD (`profiles.is_active=true` en los 11). Causa: el route handler `/api/admin/doctors`
  mapea `is_active: activityStatus !== 'inactive'` (actividad de sesión, siempre 'inactive' hasta Auth0) y el
  StatusPill de "Plan/Estado" estaba gateado por `is_active ? <sub_status> : 'suspended'`. **Fix:** helper
  `subscriptionPillStatus()` deriva el badge de `subscription_status` directo (la actividad ya se muestra en la
  columna "Actividad"). Verificado: Ana=Activo, Test Smoke=Activo, Carlos=Prueba (consistente con subscriptions).

**Anti-PII verificado:** `/admin/patients` solo stats agregadas (sin PII); `/doctor/patients` lista con cédula/
teléfono enmascarados (`V-123***78`, `0414***567`). RBAC verificado (doctor→/admin redirige a /doctor). BCV en
vivo OK (DolarAPI: USD 567,68 / EUR 655,38).

**Observaciones NO bug (deuda/data):** "999d" de actividad = sentinela de last_sign_in sin Auth0 (Fase 4);
`/doctor/settings` imágenes rotas por seed basura (`http://x/logo.png`); 2 warnings eslint pre-existentes
(`Plus`, `AppError` sin usar) NO introducidos por estos fixes. Cambios SIN commitear aún (working tree).
