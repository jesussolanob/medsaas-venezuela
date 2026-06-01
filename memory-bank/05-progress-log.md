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

## 2026-06-01 — Fase 1: Fundación NX (en progreso)

- Decisiones: monorepo in-place; pnpm vía corepack user-local.
- pnpm instalado (`~/.local/share/pnpm`), PATH en `.zshenv`.
- Rama `feature/fase-1-nx-monorepo`.
- [x] Memory Bank
- [ ] CLAUDE.md monorepo + `.cursor/rules`
- [ ] Scaffolding NX (nx.json, workspaces, tsconfig.base, eslint/prettier, libs)
- [ ] Mover frontend a `apps/frontend/`
- [ ] Docker compose + Husky + commitlint
- [ ] Verificación: `nx graph`, `nx serve frontend`
