# 03 — Development Process

> Cómo trabajar en el monorepo. Actualizar cuando cambie el proceso.

## Entorno local

### Requisitos
- Node 22 · pnpm (user-local en `~/.local/share/pnpm/bin` — añadido a `.zshenv`)
- Docker Desktop (**pendiente de instalar** — necesario en Fase 3 para Postgres/Redis)

> Nota: los shells no-interactivos no sourcean `.zshrc`. pnpm está en `.zshenv`.
> Si un comando no encuentra `pnpm`, prefijar:
> `export PATH="$HOME/.local/share/pnpm/bin:$PATH"`.

### Arrancar
```bash
pnpm install
# Etapa 3+:
cd docker && docker compose up -d         # Postgres + Redis
pnpm nx run backend:migrate               # migraciones Sequelize
pnpm nx serve backend                     # NestJS :3001
pnpm nx serve frontend                    # Next.js :3000
```

## Comandos NX

```bash
pnpm nx graph                             # ver el grafo de proyectos
pnpm nx run-many --target=lint --all
pnpm nx affected --target=test --base=origin/develop
pnpm nx build shared-types
```

## Estructura de un módulo (ver `migracion/modulos/00-estructura-modulo.md`)

domain/ (entities+spec, value-objects, errors) → application/use-cases/<modulo>/
(1 archivo por acción + spec) → infrastructure/database/(models, repositories) →
presentation/controllers. Cobertura: domain 100%, use-cases 90%, repos 70%,
controllers 80%, global ≥ 80%.

## TDD obligatorio

RED → GREEN → REFACTOR. Tests antes de pasar al siguiente módulo. `DevAuthGuard`
en tests de integración (sin JWT real en Etapa 1).

## Migraciones (Sequelize CLI, Fase 3)

`NNN-descripcion-en-kebab-case.ts` secuencial. `nx run backend:migrate` /
`backend:migrate:undo`. `synchronize: false` siempre.

## Git Flow

Ramas: `main` (prod) · `develop` (integración) · `feature/*` (desde develop) ·
`release/<version>` (desde develop) · `hotfix/*` (desde main). Nunca commit directo
a main/develop — siempre PR. Commits: `<tipo>(<scope>): <desc>` —
feat|fix|chore|docs|refactor|test|perf|ci. commitlint + Husky.

### Estado de ramas (2026-06-01)
Solo existe `main` + rama de trabajo `feature/fase-1-nx-monorepo`. `develop` se
crea al cerrar Fase 1.

## Pre-commit hook (Husky)
- `develop`/`main`: lint-staged + `nx affected --target=test`
- `feature/*`,`hotfix/*`,`release/*`: solo lint-staged (más rápido)

## Equipo de agentes (`.claude/agents/`)

orchestrator (coordina) → backend-agent + frontend-agent (paralelo) →
code-reviewer (bloquea CRITICAL/HIGH) → qa-agent + security-agent → orchestrator
consolida. Un módulo por sesión para ahorrar tokens.
