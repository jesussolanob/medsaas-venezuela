# Delta Medical CRM — Instrucciones para Claude Code (monorepo NX)

> Este es el `CLAUDE.md` raíz del **monorepo**. El doc de la app Next.js legacy
> vive en `apps/frontend/CLAUDE.md`. Los planes de migración están en `migracion/`.

## PASO 0 — OBLIGATORIO antes de cualquier cambio
Lee SIEMPRE antes de sugerir o aplicar modificaciones:
1. `memory-bank/00-project-overview.md`
2. `memory-bank/01-architecture.md`
3. `memory-bank/02-components.md`
4. `memory-bank/06-mvp-planning.md`  ← prioridades de negocio

Para implementar un módulo: leer también `migracion/modulos/00-estructura-modulo.md`
+ el `.md` del módulo activo (NO cargar todos los módulos — ahorro de tokens).

## PASO FINAL — OBLIGATORIO al terminar
Actualiza el Memory Bank correspondiente:
- Nuevo endpoint → `memory-bank/04-api-documentation.md`
- Decisión de arquitectura → `memory-bank/01-architecture.md`
- Nuevo componente/módulo → `memory-bank/02-components.md`
- Fase/unidad completada → `memory-bank/05-progress-log.md`
- Cambio de prioridad MVP → `memory-bank/06-mvp-planning.md`

## Estructura del monorepo
```
apps/frontend   Next.js 16 (App Router) — UI existente
apps/backend    NestJS DDD (4 capas) — se crea en Fase 3
libs/shared-types | shared-utils | shared-crypto
memory-bank/    contexto persistente (leer arriba)
migracion/      planes de migración (README → master-plan → modulos/)
```
- Gestor: **pnpm** (user-local). Si un shell no encuentra `pnpm`, prefijar
  `export PATH="$HOME/.local/share/pnpm/bin:$PATH"`.
- NX integra Next 16 vía `nx:run-commands` (NO `@nx/next`).
- Comandos: `pnpm nx show projects`, `pnpm nx build frontend`, `pnpm nx graph`.

## Arquitectura — reglas críticas
- Backend: 4 capas DDD `presentation → application → domain ← infrastructure`.
- NUNCA importar `apps/backend` desde `apps/frontend` — comunicación vía HTTP (BFF).
- NUNCA tipos inline si existen en `@delta/shared-types`.
- NUNCA `any` (error ESLint). NUNCA queries directas a BD desde `apps/frontend`.
- SIEMPRE validar inputs con Zod de `@delta/shared-types`.
- SIEMPRE manejar errores — ninguna promesa sin await ni catch.

## Etapa 1 (local) vs Etapa 2 (producción)
Actual = Etapa 1: `DevAuthGuard` (headers `x-dev-user-id`/`x-dev-user-role`),
Postgres/Redis Docker, clave de cifrado fija en `.env`. SIN Auth0/GCP/Cloudflare.
Etapa 2 (después): `migracion/03-seguridad.md` + `migracion/04-gcp-infra.md`.

## SOLID — no negociable
S: una responsabilidad · O: extender por composición · L: sustituibilidad ·
I: interfaces pequeñas · D: depender de abstracciones.

## Manejo de errores — cero errores sin controlar
- Backend: errores de dominio propios (extienden `DomainError`), nunca `throw new Error('str')`.
- Frontend: `apiClient` convierte errores HTTP a `Result<T, AppError>`.
- `GlobalExceptionFilter` captura lo no capturado. ESLint `no-floating-promises` activo.

## Seguridad — reglas críticas
- Encriptación AES-256-GCM SOLO en `apps/backend`.
- NUNCA loguear PII de pacientes (cedula, diagnosis, treatment, medication_name, phone, email).
- Datos de pacientes en listas: SIEMPRE enmascarados; `/reveal` registra en `access_audit_log`.
- Verificar ownership del doctor antes de retornar datos de un paciente (anti-IDOR).
- Endpoints admin con `@Roles('super_admin')`.

## Equipo de agentes
`.claude/agents/`: orchestrator (coordina) → backend-agent + frontend-agent
(paralelo) → code-reviewer (bloquea CRITICAL/HIGH) → qa-agent + security-agent.
Un módulo por sesión. Ver `migracion/06-agentes-equipo.md`.

## Git Flow
Ramas: main · develop · feature/* · release/* · hotfix/*. Nunca commit directo a
main/develop. Commits `<tipo>(<scope>): <desc>` (feat|fix|chore|docs|refactor|test|perf|ci).

## Idioma
Código y comentarios: inglés. UI y mensajes al usuario: español Venezuela (`es-VE`).
