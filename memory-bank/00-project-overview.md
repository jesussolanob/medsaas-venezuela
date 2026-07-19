# 00 — Project Overview

> Delta Medical CRM — SaaS médico multi-tenant para especialistas en Venezuela.
> Documento vivo. Actualizar cuando cambie el stack o la visión del producto.

## Qué es

CRM clínico omnicanal para médicos especialistas: gestión de agenda, pacientes,
consultas, historia clínica (EHR), recetas, finanzas, cobros, paquetes prepagados,
portal del paciente, booking público, compartir documentos con el paciente (enlace +
código) e IA de texto (mejorar/resumir/historial). Nombre comercial: **Delta Medical CRM**.

Modelo de negocio: **suscripción por médico**, con planes **100% parametrizables
desde admin** (`plan_configs` + `plan_prices` por período + `plan_features`):

- **Delta Free** — permanente (nunca expira), gratis. Solo `{dashboard, settings,
patients, consultations}` (+ Consultorios/Plantillas, sin moduleKey). SIN booking
  online ni agenda/finanzas/crm/ehr/reports/etc.
- **Delta Base** — $10/mes ($27 trim · $51 sem · $96 anual). Todos los módulos (incl. booking).
- **Delta Plus** — $30/mes ($81 trim · $153 sem · $288 anual), incluye features de IA.

> Los 4 planes legacy (trial/basic/professional/clinic) quedaron **desactivados** en
> `plan_configs`; el catálogo vendible es Free/Base/Plus. La tabla `subscriptions`
> está vacía (suscripciones se resuelven por plan efectivo + downgrade perezoso).

**Gating del doctor** = capacidades del ROL (`role_capabilities`) **∩** features del
PLAN (`plan_features`). Módulo no habilitado → candado → `/doctor/upgrade`. La página
pública `/book/:doctorId` se gatea con la feature `booking` (Free=off → "Reservas no
disponibles"; backend rechaza el POST con `BookingNotEnabledError` 403). Al expirar:
**downgrade perezoso** a Delta Free SIN perder datos (se persiste al **login**, sin cron).
**Pagos = MANUALES** (transferencia/Pago Móvil/etc.) + **aprobación de super_admin**
(módulo `billing`). Verificación de credenciales del doctor: **MPPS automática** vía SACS,
colegiado manual.

## Estado de la migración

Migrado de **Next.js monolítico + Supabase** → **monorepo NX**. **Supabase
eliminado por completo** (auth, BD y storage propios). Estructura:

- `apps/frontend` — Next.js 16 (App Router) — UI existente migrada + BFF
- `apps/backend` — NestJS con DDD (4 capas) — lógica de negocio
- `libs/shared-types` — Zod schemas + tipos compartidos
- `libs/shared-utils` — utilidades puras (safeStringify, parseErrorLocation, …)
- `libs/shared-crypto` — AES-256-GCM + HMAC (PHI)

Avances clave (2026-06): backend 10/10 módulos de negocio + Grupo A (DDD +
Sequelize), **Auth0** env-gated (dev-stub por defecto), **Resend** con plantillas
en BD, **Sentry**, storage **MinIO/GCS** por driver, **Google Calendar/Meet**
opt-in (con recordatorios 30min nativos + `.ics`/Jitsi fallback), **telemetría**
por sesión, **MPPS** automática (SACS).

**Foco de producto actual: módulo Doctor "vendible"** (Fases 1-8) — HECHO, revisado
(0 CRITICAL/HIGH) y **QA con Playwright (2026-06-12)**: planes paramétricos + gating,
registro/onboarding/verificación, consultorios, agenda + bloqueos, consultorio con
bloques dinámicos, finanzas/cobros/gastos, plantillas PDF, servicios, booking público.

**Avance MVP (`06-mvp-planning`):** 7.4 tasa USDT/Binance, 7.5 dashboard especialista,
7.6 KPIs agenda, 7.11 servicios — completos; 7.1/7.2/7.3/7.7/7.9 avanzados. Restan
landing (resto), export PDF, plantillas PDF de informe, cobro WhatsApp, limpieza BD.

**Sesión 2026-06-22:** super admin **"todo configurable"** — 4 features nuevas: bloqueo/desbloqueo
de acceso de doctor (ban duro independiente de verificación), **especialidades UI** (crear/editar/activar),
**app-settings genéricos** (editor key/value), **editor de plantillas de email** (9 plantillas, subject+html+text,
preview sandbox, variables visuales). Diagnóstico: **tabla `email_send_log`** (cero PII, para auditoría post-mortem).
**IA en prod:** key personal Gemini subida a Secret Manager (v2); debería funcionar en prod ahora.

Sesión 2026-06-18: **compartir documentos** (#12) cableado front+back (enlace + código
6 dígitos + **cédula**, 48h, PDF con pdf-lib, email Resend); **gating de planes** fijado
(Free mínimo, feature `booking` nueva); panel de **suscripción** corregido (plan
permanente sin "termina el null", botón Mejorar mi plan → `/doctor/upgrade`, plan actual
resaltado en upgrade); **IA de texto reactivada** (improve_block/summarize_report/
patient_history) — el BFF `/api/doctor/ai` ya proxea a `/api/ai/text`.

Pendiente: cron de recordatorios (envío real WhatsApp/email). Portal del paciente diferido.
Deploy GCP funciona (Auth0 Etapa 2 vivo). 🚨 **Gemini:** la key personal funciona (QA local
2026-06-19), pero Vertex AI (sin entrenamiento con PII) es el objetivo Etapa 2 del usuario.

Etapa 1 (actual): construir todo en local — `AppAuthGuard` (modo dev, headers `x-dev-user-*`),
Postgres/Redis/MinIO Docker, clave de cifrado fija en `.env`. Sin GCP/Cloudflare.
Etapa 2 (preparado): producción — `AUTH_MODE=auth0` → `Auth0Guard` con `jose` (JWKS, RS256,
header `x-auth0-token`); GCP (Cloud Run/SQL/GCS), Cloudflare. El backend ya está listo.

Decisión de arranque (2026-06-01): monorepo **in-place** en el repo actual
(conserva historial git + remote `jesussolanob/medsaas-venezuela`); gestor **pnpm**.

## Stack de origen (pre-migración) — detectado en auditoría Fase 0

> Histórico: de aquí venimos. Lo de Supabase ya **no aplica** (eliminado).

| Capa          | Tecnología (origen)                                                      |
| ------------- | ------------------------------------------------------------------------ |
| Frontend      | Next.js **16.2.3** (App Router), React **19.2.4**, TypeScript 5          |
| UI            | Tailwind CSS **v4**, shadcn 4, radix-ui, lucide-react, recharts          |
| Auth          | ~~Supabase Auth (`@supabase/ssr`)~~ → dev-stub / Auth0                   |
| BD            | ~~PostgreSQL vía Supabase (RLS), queries directas~~ → NestJS + Sequelize |
| Storage       | ~~Supabase Storage~~ → MinIO (local) / GCS (prod)                        |
| IA            | **Google Gemini** (texto + transcripción) — pendiente de re-cableo       |
| Email         | **Resend**                                                               |
| Integraciones | Google OAuth (Calendar sync)                                             |
| Testing       | Jest (unit) · Playwright (E2E)                                           |
| Deploy        | ~~Vercel + Supabase Cloud~~ → GCP (Cloud Run/SQL/GCS)                    |

## Stack actual / objetivo (post-migración)

Next.js 16 (apps/frontend) · NestJS + Sequelize (apps/backend) · PostgreSQL 16 +
Redis 7 + MinIO (Docker local → Cloud SQL/Memorystore/GCS) · Auth0 BFF
(env-gated, dev-stub por defecto en local) · Resend (plantillas en BD) · Sentry ·
NX monorepo · pnpm · GitHub Actions CI/CD.

## Entornos

| Entorno               | Frontend                                                 | Backend                                               | BD                                                       |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Local                 | localhost:3000                                           | localhost:3001                                        | Docker Postgres :5432 (+ Redis :6379, MinIO :9000/:9001) |
| **Producción (VIVA)** | **`https://deltasalud.app`** (Cloudflare 🟠 → Cloud Run) | Cloud Run (IAM-only; login por `auth.deltasalud.app`) | Cloud SQL `db-g1-small`                                  |

> Prod EN VIVO desde 2026-07-18 (ADR-023): dominio `deltasalud.app` por Cloudflare (proxied, SSL strict, WAF edge),
> Auth0 custom domain `auth.deltasalud.app`. La rama **`main`** dispara el deploy. Pendiente: `api.deltasalud.app`,
> `ingress=internal` + VPC, Load Balancer + Cloud Armor.

BD local: `postgres://delta:delta_dev_password@localhost:5432/deltamedical`

## Contactos / cuentas

- Super Admin (Auth0, en uso): **lucas@deltasalud.app**
- Super Admin (legacy Supabase): jesussolano4@gmail.com
- Doctor de prueba (legacy): ing.jesussolanob@gmail.com
- GitHub: jesussolanob · Repo: github.com/jesussolanob/medsaas-venezuela
- Rama de trabajo actual: `feature/migracion-backend` (local, sin push)

## Idioma

- Código y comentarios técnicos: **inglés**
- UI y mensajes al usuario: **español (Venezuela)**, locale `es-VE`
