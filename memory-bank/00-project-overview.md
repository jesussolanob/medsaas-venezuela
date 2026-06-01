# 00 — Project Overview

> Delta Medical CRM — SaaS médico multi-tenant para especialistas en Venezuela.
> Documento vivo. Actualizar cuando cambie el stack o la visión del producto.

## Qué es

CRM clínico omnicanal para médicos especialistas: gestión de agenda, pacientes,
consultas, historia clínica (EHR), recetas, finanzas, cobros, paquetes prepagados,
portal del paciente y booking público. Nombre comercial: **Delta Medical CRM**.

Modelo de negocio: suscripción por médico (beta privada → 1 año gratis). Planes
configurables: Trial, Basic ($10), Professional ($30), Clinic ($100).

## Estado de la migración

Migrando de **Next.js monolítico + Supabase** → **monorepo NX** con:
- `apps/frontend` — Next.js 16 (App Router) — UI existente migrada
- `apps/backend` — NestJS con DDD (4 capas) — lógica de negocio
- `libs/shared-types` — Zod schemas + tipos compartidos
- `libs/shared-utils` — utilidades puras
- `libs/shared-crypto` — AES-256-GCM + HMAC (PHI)

Etapa 1 (actual): construir todo en local — `DevAuthGuard`, Postgres/Redis Docker,
clave de cifrado fija en `.env`. Sin Auth0/GCP/Cloudflare.
Etapa 2 (después): producción — Auth0 BFF, GCP (Cloud Run/SQL/GCS), Cloudflare.

Decisión de arranque (2026-06-01): monorepo **in-place** en el repo actual
(conserva historial git + remote `jesussolanob/medsaas-venezuela`); gestor **pnpm**.

## Stack actual (pre-migración) — detectado en auditoría Fase 0

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js **16.2.3** (App Router), React **19.2.4**, TypeScript 5 |
| UI | Tailwind CSS **v4**, shadcn 4, radix-ui, lucide-react, recharts |
| Auth | Supabase Auth (`@supabase/ssr`) |
| BD | PostgreSQL vía Supabase (RLS) — sin ORM, queries directas + `pg` |
| Storage | Supabase Storage |
| IA | **Google Gemini** (texto + transcripción de audio) |
| Email | **Resend** |
| Integraciones | Google OAuth (Calendar sync) |
| Testing | Playwright (E2E) |
| Deploy | Vercel + Supabase Cloud |

## Stack objetivo (post-migración)

Next.js 16 (apps/frontend) · NestJS + Sequelize (apps/backend) · PostgreSQL 16 +
Redis 7 (Docker local → Cloud SQL/Memorystore) · Auth0 (BFF) · GCS · Cloudflare ·
NX monorepo · pnpm · GitHub Actions CI/CD.

## Entornos

| Entorno | Frontend | Backend | BD |
|---------|----------|---------|-----|
| Local | localhost:3000 | localhost:3001 | Docker Postgres :5432 |
| Producción (futuro) | Cloud Run + Cloudflare | Cloud Run `--ingress=internal` | Cloud SQL |

Supabase actual: `https://azsismbgfanszkygzwaz.supabase.co`

## Contactos

- Super Admin: jesussolano4@gmail.com
- Doctor de prueba: ing.jesussolanob@gmail.com
- GitHub: jesussolanob
- Repo: github.com/jesussolanob/medsaas-venezuela

## Idioma

- Código y comentarios técnicos: **inglés**
- UI y mensajes al usuario: **español (Venezuela)**, locale `es-VE`
