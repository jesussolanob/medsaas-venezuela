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
- Pendiente Fase 3 (próxima sesión): migración inicial Sequelize (18 tablas) + primer
  módulo de negocio (appointments) con endpoint funcional.

### Decisión de monorepo: un solo package.json

- Eliminados los `package.json` redundantes de `libs/*` (eran vestigios del scaffold).
  NX detecta proyectos por `project.json`; los `@delta/*` resuelven por tsconfig paths,
  no por pnpm linking. `zod` movido al `package.json` raíz.
- `pnpm-workspace.yaml`: `packages` reducido a `apps/frontend` (única app legacy con
  package.json propio, se fusionará al root cuando se migre el frontend).
- Añadido `baseUrl: "."` a `tsconfig.base.json` (faltaba; TS5090 sin él).
