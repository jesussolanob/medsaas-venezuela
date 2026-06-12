# 07 — Cómo correr el proyecto en local (Etapa 1, sin Supabase)

> Stack local: Postgres + Redis + MinIO en Docker · backend NestJS :3001 · frontend Next.js :3000.
> Auth = dev-stub por cookies (default local). Auth0 ✅ disponible opcionalmente
> (`AUTH_MODE=auth0`). El proyecto YA NO depende de Supabase.

## Requisitos

- Docker corriendo. `pnpm` en el PATH: `export PATH="/opt/homebrew/bin:$HOME/.local/share/pnpm/bin:$PATH"`.

## Pasos

### 1. Infra (Docker) — Postgres + Redis + MinIO

```bash
docker compose -f docker/docker-compose.yml up -d
docker ps   # deben estar healthy: docker-postgres-1, docker-redis-1, docker-minio-1
```

- Postgres: `postgres://delta:delta_dev_password@localhost:5432/deltamedical`
- MinIO: API `localhost:9000`, consola `localhost:9001` (user `delta` / pass `delta-secret-dev`)

### 2. Migraciones (idempotente)

```bash
pnpm nx run backend:migrate          # aplica las migraciones .cjs pendientes
pnpm nx run backend:migrate:status   # ver up/down
```

> ⚠️ NO usar `pnpm nx migrate backend` — ese es el migrador del propio NX, no la BD.

### 3. Backend (NestJS) :3001

```bash
pnpm nx build backend && node dist/apps/backend/main.js
# o en watch:  pnpm nx serve backend
```

Espera el log `Nest application successfully started`. Smoke:
`curl localhost:3001/api/appointments -H "x-dev-user-id: 00000000-0000-4000-8000-000000000001" -H "x-dev-user-role: doctor"`

### 4. Frontend (Next.js) :3000

```bash
pnpm nx dev frontend        # http://localhost:3000
```

(No necesita `.env`: `BACKEND_INTERNAL_URL` default = `http://localhost:3001`.)

## Acceso / cambiar de rol

> ⚠️ **El `.env` actual de `apps/frontend` tiene `AUTH_MODE=auth0`** (login real). En ese modo NO aplican
> las cookies dev-stub: se entra por Auth0 (cuenta `lucas@deltasalud.app` = super_admin) y el **rol sale de
> `profiles.role` en la BD** (`resolve-identity`, por request, sin re-login). Para QA del **área doctor** con esa
> cuenta: flipear su rol en BD y restaurar al terminar:
>
> ```bash
> docker exec docker-postgres-1 psql -U delta -d deltamedical -c \
>   "UPDATE profiles SET role='doctor', specialty='Medicina General', cedula='V-90000000' WHERE email='lucas@deltasalud.app';"
> # ...QA del área doctor...
> docker exec docker-postgres-1 psql -U delta -d deltamedical -c \
>   "UPDATE profiles SET role='super_admin', specialty=NULL, cedula=NULL WHERE email='lucas@deltasalud.app';"
> ```
>
> Para usar el **dev-stub** (sin Auth0): poner `AUTH_MODE=dev` en `apps/frontend/.env` y reiniciar Next.

### Modo dev-stub (`AUTH_MODE=dev`)

La identidad sale de 2 cookies: `dev_user_id` y `dev_user_role` (`doctor` | `super_admin` | `patient`).

- **Sin cookie → doctor por defecto** (`DEV_DOCTOR_UUID = 00000000-0000-4000-8000-000000000001`, "Dr. Dev Local").
- **Admin:** setear cookie `dev_user_role=super_admin` (UUID admin `...003`). Ir a `/admin`.
- **Impersonar un doctor CON datos de prueba** (para ver vistas pobladas): setear
  `dev_user_id=980025b4-9956-4646-94f8-58401c86773a` + `dev_user_role=doctor` ("Smoke Doctor v2": 6 citas, 8 pacientes).

Setear cookies rápido desde la consola del navegador (en http://localhost:3000):

```js
document.cookie = 'dev_user_id=980025b4-9956-4646-94f8-58401c86773a; path=/';
document.cookie = 'dev_user_role=doctor; path=/';
location.reload();
```

(El `/login` dev-stub también setea estas cookies por rol.)

## Qué se puede probar (admin + doctor)

Admin: dashboard, finanzas, suscripciones, planes, roles, recordatorios, doctores, settings, pacientes (solo stats).
Doctor: agenda, cita-360, consultas, pacientes, finanzas, cobros, settings, plantillas, mensajes, recordatorios, offices, dashboard.

## Estado de integraciones (al 2026-06-12)

- **Auth0** ✅ activo (`AUTH_MODE=auth0`). **Google Calendar/Meet** ✅ activo (crea evento + Meet + recordatorios 30min).
  **Resend** ✅ disponible (encender `EMAIL_DRIVER=resend` + `RESEND_API_KEY`). **MinIO storage** ✅. **Tasa USDT/BCV** ✅ (APIs reales).
- Diferido / stub: **IA/Gemini** (espera specs), **cron de recordatorios** (envío real WhatsApp/email), pasarela de pago,
  registro de doctor por Auth0 provisioning, portal del paciente (perfil/seguimiento = placeholder por decisión de producto).

## Storage (MinIO dev / GCS prod)

`STORAGE_DRIVER=minio` en dev. Uploads (avatar/logo/firma públicos; receipt/document/signature privados con signed-URL)
vía `POST /api/storage/upload`. En prod: `STORAGE_DRIVER=gcs` + vars GCS.
