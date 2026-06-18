# Delta Medical CRM

> SaaS médico **multi-tenant** para especialistas en Venezuela. CRM clínico
> omnicanal: agenda, pacientes, consultas, historia clínica (EHR), recetas,
> finanzas, paquetes prepagados, portal del paciente y booking público.

El **módulo del doctor** incluye: onboarding obligatorio post-SSO (cédula V/E/P +
especialidad), planes parametrizables desde admin (catálogo vendible **Delta Free /
Base / Plus**, precios por período, gating doble por rol ∩ plan con upsell, Free
permanente + downgrade perezoso, pagos manuales con aprobación super_admin), registro
y verificación de credenciales (MPPS automático vía SACS, colegiado manual),
consultorios con modalidad (presencial/online) e integración opt-in con Google
Calendar/Meet (fallback `.ics`/Jitsi), agenda con bloqueos de disponibilidad y
horizonte de reserva, servicios y citas por consultorio, QR del link público de
booking (gateado por plan — Free no tiene reservas online), compartir documentos de
consulta con el paciente (enlace público + código 6 dígitos + cédula, 48h),
telemetría por sesión e **IA de texto** (mejorar redacción, resumir informe, resumen
de historial — recién reactivada con Gemini, gating por plan).

Monorepo **NX** + **pnpm**. Documentación viva en [`memory-bank/`](./memory-bank)
(empezar por `00-project-overview.md`). Convenciones para Claude Code en
[`CLAUDE.md`](./CLAUDE.md).

## Arquitectura

```
apps/frontend   Next.js 16 (App Router, React 19) — UI + BFF (route handlers)
apps/backend    NestJS DDD (4 capas) — lógica de negocio, cifrado PHI
libs/shared-types   Zod schemas + tipos compartidos
libs/shared-utils   utilidades puras (safeStringify, parseErrorLocation, …)
libs/shared-crypto  AES-256-GCM + HMAC (datos de pacientes)
```

- **DDD backend:** `presentation → application → domain ← infrastructure`.
- **BFF:** el frontend NUNCA importa el backend ni toca la BD; se comunica vía
  HTTP (route handlers → NestJS).
- **Sequelize:** cada módulo tiene su modelo propio; las FKs, constraints e
  índices viven **solo en migraciones** (`.cjs`); las relaciones se resuelven en
  los use-cases.
- **Sin Supabase.** Eliminado por completo (auth, BD, storage propios).

## Stack

| Capa           | Tecnología                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------ |
| Frontend       | Next.js 16.2.3, React 19, TypeScript 5, Tailwind v4, shadcn/radix, recharts                |
| Backend        | NestJS, Sequelize, PostgreSQL 16, Redis 7                                                  |
| Auth           | Dev-stub (local) · **Auth0** BFF (prod) — conmutado por `AUTH_MODE`                        |
| Storage        | **MinIO** (local) · **GCS** (prod) — conmutado por `STORAGE_DRIVER`                        |
| Email          | **Resend** (plantillas en BD) · Noop driver para local                                     |
| Observabilidad | **Sentry** (gated por env) + `GlobalExceptionFilter`                                       |
| IA             | Google Gemini (transcripción + texto: mejorar/resumir/historial — texto recién reactivado) |
| Tooling        | NX, pnpm, Jest, Playwright, ESLint, Prettier, Husky + commitlint                           |

## Etapas

- **Etapa 1 (actual):** todo local. `DevAuthGuard` (headers `x-dev-user-*`),
  Postgres/Redis/MinIO en Docker, clave de cifrado fija en `.env`. Sin Auth0/GCP.
- **Etapa 2 (después):** producción en GCP (Cloud Run + Cloud SQL + GCS) con
  Auth0 BFF y Cloudflare. Planes en `migracion/`.

## Arranque local

> pnpm es user-local. Si el shell no lo encuentra:
> `export PATH="/opt/homebrew/bin:$HOME/.local/share/pnpm/bin:$PATH"`

```bash
# 1. Dependencias
pnpm install

# 2. Infra local (Postgres :5432, Redis :6379, MinIO :9000/:9001)
docker compose -f docker/docker-compose.yml up -d

# 3. Variables de entorno
cp apps/backend/.env.example apps/backend/.env   # editar valores
#   apps/frontend/.env se configura aparte (Auth0/Sentry opcionales)

# 4. Migraciones de BD
pnpm nx migrate backend

# 5. Levantar (en dos terminales)
pnpm nx serve backend     # http://localhost:3001
pnpm nx serve frontend    # http://localhost:3000
```

Conexión BD local: `postgres://delta:delta_dev_password@localhost:5432/deltamedical`

## Comandos NX

```bash
pnpm nx show projects                 # lista de proyectos
pnpm nx build  backend|frontend       # build de producción
pnpm nx serve  backend|frontend       # dev server
pnpm nx test   backend                # unit tests (Jest)
pnpm nx lint   backend|frontend       # ESLint (max-warnings 0)
pnpm nx migrate backend               # correr migraciones Sequelize
pnpm nx graph                         # grafo de dependencias
```

## Reglas críticas

- **Sin `any`** (error de ESLint). Sin queries directas a BD desde el frontend.
- **PHI:** cifrado AES-256-GCM solo en el backend; nunca loguear datos de
  pacientes (cédula, diagnóstico, tratamiento, teléfono, email). Listas
  enmascaradas; `/reveal` audita en `access_audit_log`.
- **Anti-IDOR:** verificar ownership del doctor antes de devolver datos de un
  paciente. Endpoints admin con `@Roles('super_admin')`.
- **Errores:** dominio propio (extiende `DomainError`), nunca `throw new Error('str')`.
  Sin `console.error` (reinicia instancias en Cloud Run) → reportar a Sentry +
  `logger.warn` con nomenclatura `[archivo][metodo] mensaje {json}`.
- **Idioma:** código y comentarios en inglés; UI y mensajes al usuario en
  español de Venezuela (`es-VE`).

## Git Flow

Ramas: `main` · `develop` · `feature/*` · `release/*` · `hotfix/*`.
Nunca commit directo a `main`/`develop`. Mensajes:
`<tipo>(<scope>): <desc>` — `feat|fix|chore|docs|refactor|test|perf|ci`
(validado por Husky + commitlint).
