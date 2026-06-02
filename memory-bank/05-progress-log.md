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
