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

Migrado de **Next.js monolítico + Supabase** → **monorepo NX**. **Supabase
eliminado por completo** (auth, BD y storage propios). Estructura:
- `apps/frontend` — Next.js 16 (App Router) — UI existente migrada + BFF
- `apps/backend` — NestJS con DDD (4 capas) — lógica de negocio
- `libs/shared-types` — Zod schemas + tipos compartidos
- `libs/shared-utils` — utilidades puras (safeStringify, parseErrorLocation, …)
- `libs/shared-crypto` — AES-256-GCM + HMAC (PHI)

Avances clave (2026-06): módulos backend del Grupo A migrados (DDD + Sequelize),
**Auth0** integrado env-gated (dev-stub sigue por defecto), **Resend** con
plantillas en BD, **Sentry** + observabilidad sin `console.error`, storage
**MinIO/GCS** por driver. Pendiente: re-cableo de IA (Gemini), cron de
recordatorios, deploy GCP. Portal del paciente diferido (sale sin él).

Etapa 1 (actual): construir todo en local — `DevAuthGuard`, Postgres/Redis/MinIO
Docker, clave de cifrado fija en `.env`. Sin GCP/Cloudflare.
Etapa 2 (después): producción — Auth0 BFF, GCP (Cloud Run/SQL/GCS), Cloudflare.

Decisión de arranque (2026-06-01): monorepo **in-place** en el repo actual
(conserva historial git + remote `jesussolanob/medsaas-venezuela`); gestor **pnpm**.

## Stack de origen (pre-migración) — detectado en auditoría Fase 0

> Histórico: de aquí venimos. Lo de Supabase ya **no aplica** (eliminado).

| Capa | Tecnología (origen) |
|------|-----------|
| Frontend | Next.js **16.2.3** (App Router), React **19.2.4**, TypeScript 5 |
| UI | Tailwind CSS **v4**, shadcn 4, radix-ui, lucide-react, recharts |
| Auth | ~~Supabase Auth (`@supabase/ssr`)~~ → dev-stub / Auth0 |
| BD | ~~PostgreSQL vía Supabase (RLS), queries directas~~ → NestJS + Sequelize |
| Storage | ~~Supabase Storage~~ → MinIO (local) / GCS (prod) |
| IA | **Google Gemini** (texto + transcripción) — pendiente de re-cableo |
| Email | **Resend** |
| Integraciones | Google OAuth (Calendar sync) |
| Testing | Jest (unit) · Playwright (E2E) |
| Deploy | ~~Vercel + Supabase Cloud~~ → GCP (Cloud Run/SQL/GCS) |

## Stack actual / objetivo (post-migración)

Next.js 16 (apps/frontend) · NestJS + Sequelize (apps/backend) · PostgreSQL 16 +
Redis 7 + MinIO (Docker local → Cloud SQL/Memorystore/GCS) · Auth0 BFF
(env-gated, dev-stub por defecto en local) · Resend (plantillas en BD) · Sentry ·
NX monorepo · pnpm · GitHub Actions CI/CD.

## Entornos

| Entorno | Frontend | Backend | BD |
|---------|----------|---------|-----|
| Local | localhost:3000 | localhost:3001 | Docker Postgres :5432 (+ Redis :6379, MinIO :9000/:9001) |
| Producción (futuro) | Cloud Run + Cloudflare | Cloud Run `--ingress=internal` | Cloud SQL |

BD local: `postgres://delta:delta_dev_password@localhost:5432/deltamedical`

## Contactos

- Super Admin: jesussolano4@gmail.com
- Doctor de prueba: ing.jesussolanob@gmail.com
- GitHub: jesussolanob
- Repo: github.com/jesussolanob/medsaas-venezuela

## Idioma

- Código y comentarios técnicos: **inglés**
- UI y mensajes al usuario: **español (Venezuela)**, locale `es-VE`
