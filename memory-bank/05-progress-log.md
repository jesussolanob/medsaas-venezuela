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
