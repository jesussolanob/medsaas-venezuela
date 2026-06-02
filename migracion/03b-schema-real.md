# 03b — Schema Real DDL (Spec Autoritativo para Migración Inicial Sequelize)

> Generado cruzando: `sql_migration_v24_missing_tables.sql`, `sql_migration_v25_fase2.sql`,
> `00b_PASO1_5_ENUMS_Y_RESTO.sql`, `fixes_remediation.sql`, `01_PASO2_CORRECCIONES_SQL.sql`,
> `sql_seed_ehr.sql`, `queries/archive/020_patients_consultations_schema.sql`,
> `queries/archive/022_packages_schema.sql`, `supabase/migrations/20260419_doctor_templates.sql`,
> `supabase/migrations/20260429_subscription_system_phase1.sql`,
> `libs/shared-types/src/*.schema.ts`, `libs/shared-types/src/enums.ts`,
> `memory-bank/01-architecture.md`, `memory-bank/02-components.md`, y código fuente
> de `apps/frontend` (API routes + pages). Fecha de generación: 2026-06-02.

---

## Extensiones requeridas

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid(), crypt()
```

Ambas ya presentes en el Docker de desarrollo (`docker/init.sql`).

---

## Enums / Custom Types

Todos en el schema `public`. Orden de creación importante (ninguno depende de otro).

### 1. `user_role`

| Valor         | Notas                                |
| ------------- | ------------------------------------ |
| `super_admin` | Administrador SaaS                   |
| `doctor`      | Médico con plan activo               |
| `assistant`   | Asistente (SQL v24; no en CLAUDE.md) |
| `patient`     | Paciente con cuenta                  |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 17.
**Decisión:** incluir `assistant` (está en el tipo SQL real). `admin` aparece en
`fixes_remediation.sql` (política RLS) y en el Zod `UserRoleSchema` — ver DISCREPANCIAS D-01.

---

### 2. `subscription_plan`

| Valor          | Notas                                                        |
| -------------- | ------------------------------------------------------------ |
| `trial`        | Beta privada gratuita                                        |
| `basic`        | $10 USD/mes                                                  |
| `professional` | $30 USD/mes                                                  |
| `enterprise`   | Legacy — migrar a `clinic` (CR-007)                          |
| `clinic`       | $100 USD/mes (añadido en `01_PASO2_CORRECCIONES_SQL.sql` §1) |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 21 + §1 de `01_PASO2`.
**Decisión:** incluir `enterprise` en el tipo (es un valor real en BD hasta que corra CR-007);
la migración inicial debe incluirlo para no romper datos existentes. Ver D-02.

---

### 3. `subscription_status`

| Valor       | Notas                |
| ----------- | -------------------- |
| `active`    | Suscripción vigente  |
| `suspended` | Suspendida por admin |
| `cancelled` | Cancelada            |
| `trial`     | En período trial     |
| `past_due`  | Vencida sin pagar    |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 24.
`fixes_remediation.sql` añade `trialing` en un CHECK de texto libre (no en el enum).
**Decisión:** el tipo enum tiene exactamente los 5 valores del v24. `trialing` solo aparece
en CHECK de texto, no en el tipo; la migración inicial usa los 5 del enum. Ver D-03.

---

### 4. `appointment_status`

| Valor       | Notas                          |
| ----------- | ------------------------------ |
| `scheduled` | Recién agendada                |
| `confirmed` | Confirmada por doctor          |
| `completed` | Paciente atendido              |
| `cancelled` | Cancelada                      |
| `no_show`   | No asistió                     |
| `pending`   | Legacy / booking en proceso    |
| `accepted`  | Legacy / sinónimo de confirmed |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 29–33. Zod `AppointmentStatusSchema`
incluye los 7. CLAUDE.md canónico usa 5 (`pending`/`accepted` son legacy).
**Decisión:** la migración crea el enum con los 7 valores reales del SQL v24 para mantener
compatibilidad con datos históricos. Ver D-04.

---

### 5. `reminder_channel`

| Valor      |
| ---------- |
| `whatsapp` |
| `email`    |
| `both`     |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 34.

---

### 6. `reminder_offset`

| Valor |
| ----- |
| `7d`  |
| `24h` |
| `3h`  |
| `1h`  |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 38.

---

### 7. `lead_source`

| Valor       |
| ----------- |
| `whatsapp`  |
| `instagram` |
| `facebook`  |
| `website`   |
| `referral`  |
| `manual`    |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 43.
**Nota:** El frontend usa además `web`, `llamada`, `referido` como `LeadChannel` (tipo TS)
— distintos del enum `lead_source` de BD. Ver D-05.

---

### 8. `lead_status`

| Valor      |
| ---------- |
| `hot`      |
| `cold`     |
| `client`   |
| `archived` |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 47.
**Nota:** El frontend usa `stage` con valores `new|contacted|qualified|appointment|converted|lost`
(tipo TS `LeadStage`), que NO coinciden con el enum `lead_status`. Ver D-06.

---

### 9. `payment_method`

| Valor           |
| --------------- |
| `pago_movil`    |
| `transferencia` |
| `efectivo`      |
| `zelle`         |
| `otro`          |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 50.
**Decisión:** en `appointments.payment_method` el tipo es `text` libre (no este enum).
Este enum se aplica solo a `subscription_payments.method` si se usa enum. Ver D-07.

---

### 10. `payment_status`

| Valor      |
| ---------- |
| `pending`  |
| `verified` |
| `rejected` |

**Fuente:** `sql_migration_v24_missing_tables.sql` línea 54.
**Alcance:** `subscription_payments.status`. Para `consultations.payment_status` el tipo es
`text` con valores `pending|approved`. Ver D-08.

---

## Tablas (en orden de dependencias FK)

### T-01 · `profiles`

Tabla base del sistema. `id` = mismo UUID que `auth.users.id` de Supabase Auth.
En Sequelize local (Etapa 1 sin Auth0), el UUID lo genera la aplicación.

| Columna                   | Tipo Postgres | Nullable | Default                | Notas                                                  |
| ------------------------- | ------------- | -------- | ---------------------- | ------------------------------------------------------ | ------ | ------- |
| `id`                      | `uuid`        | NO       | —                      | PK; espeja `auth.users.id`                             |
| `full_name`               | `text`        | NO       | —                      |                                                        |
| `email`                   | `text`        | NO       | —                      |                                                        |
| `role`                    | `user_role`   | NO       | `'patient'::user_role` | NOT NULL post `01_PASO2` §6                            |
| `specialty`               | `text`        | YES      | NULL                   |                                                        |
| `professional_title`      | `text`        | YES      | NULL                   | Ej. `'Dr.'`                                            |
| `clinic_id`               | `uuid`        | YES      | NULL                   | FK a clínica (tabla fuera del scope de 18)             |
| `clinic_role`             | `text`        | YES      | NULL                   |                                                        |
| `payment_methods`         | `text[]`      | YES      | NULL                   | Array de keys de método                                |
| `payment_details`         | `jsonb`       | YES      | NULL                   | Datos por método (cuenta, email Zelle, etc.)           |
| `avatar_url`              | `text`        | YES      | NULL                   |                                                        |
| `allows_online`           | `boolean`     | YES      | NULL                   |                                                        |
| `office_address`          | `text`        | YES      | NULL                   |                                                        |
| `city`                    | `text`        | YES      | NULL                   |                                                        |
| `state`                   | `text`        | YES      | NULL                   |                                                        |
| `cedula`                  | `text`        | YES      | NULL                   | Cédula del médico (no PHI encriptado en este contexto) |
| `phone`                   | `text`        | YES      | NULL                   | Teléfono del médico                                    |
| `sex`                     | `text`        | YES      | NULL                   | Sexo del médico (`male                                 | female | other`) |
| `is_active`               | `boolean`     | YES      | `true`                 |                                                        |
| `plan`                    | `text`        | YES      | NULL                   | Snapshot plan activo (redundante con subscriptions)    |
| `subscription_status`     | `text`        | YES      | NULL                   | Snapshot status (redundante con subscriptions)         |
| `subscription_expires_at` | `timestamptz` | YES      | NULL                   | Snapshot expiración                                    |
| `created_at`              | `timestamptz` | YES      | `now()`                |                                                        |
| `updated_at`              | `timestamptz` | YES      | `now()`                |                                                        |

**Primary Key:** `id`
**Índices:**

- `idx_profiles_role ON profiles(role)`
- `idx_profiles_email ON profiles(email)` (UNIQUE — un email por usuario)

**Notas:**

- Columnas `plan`, `subscription_status`, `subscription_expires_at` son snapshots
  de conveniencia escritos por `register/actions.ts` y son redundantes con la tabla
  `subscriptions`. La migración debe incluirlas porque el frontend las lee directamente. Ver D-09.
- `role` fue NULL en datos históricos; `01_PASO2` §6 lo setea NOT NULL con default `'patient'`.

---

### T-02 · `plan_configs`

| Columna       | Tipo Postgres   | Nullable | Default             | Notas                   |
| ------------- | --------------- | -------- | ------------------- | ----------------------- | ----- | ------------ | ------- |
| `id`          | `uuid`          | NO       | `gen_random_uuid()` | PK                      |
| `plan_key`    | `text`          | NO       | —                   | UNIQUE; valores: `trial | basic | professional | clinic` |
| `name`        | `text`          | NO       | —                   | Nombre legible          |
| `price`       | `numeric(12,2)` | YES      | `0`                 | Precio en USD           |
| `currency`    | `text`          | YES      | `'USD'`             |                         |
| `trial_days`  | `int`           | YES      | `0`                 |                         |
| `description` | `text`          | YES      | NULL                |                         |
| `is_active`   | `boolean`       | YES      | `true`              |                         |
| `sort_order`  | `int`           | YES      | `0`                 | Orden en UI             |
| `created_at`  | `timestamptz`   | YES      | `now()`             |                         |
| `updated_at`  | `timestamptz`   | YES      | `now()`             |                         |

**Primary Key:** `id`
**Unique:** `plan_key`
**Fuente:** `sql_migration_v24_missing_tables.sql` §2.

---

### T-03 · `plan_features`

| Columna         | Tipo Postgres | Nullable | Default             | Notas                                                            |
| --------------- | ------------- | -------- | ------------------- | ---------------------------------------------------------------- |
| `id`            | `uuid`        | NO       | `gen_random_uuid()` | PK                                                               |
| `plan`          | `text`        | NO       | —                   | FK lógica a `plan_configs.plan_key` (texto, no FK formal en v24) |
| `feature_key`   | `text`        | NO       | —                   | Ej. `dashboard`, `agenda`, `crm`, etc.                           |
| `feature_label` | `text`        | NO       | —                   | Nombre legible del feature                                       |
| `enabled`       | `boolean`     | YES      | `true`              |                                                                  |
| `created_at`    | `timestamptz` | YES      | `now()`             |                                                                  |
| `updated_at`    | `timestamptz` | YES      | `now()`             |                                                                  |

**Primary Key:** `id`
**Unique:** `(plan, feature_key)` — constraint `plan_features_plan_feature_key_key`
**Fuente:** `sql_migration_v24_missing_tables.sql` §3.
**Nota:** el seed `012_seed_plans.sql` confirma columna `feature_label`. En `fixes_remediation.sql`
§H se modeló sin `id` y `feature_label` — usar la estructura del v24 (con ambas columnas). Ver D-10.

---

### T-04 · `subscriptions`

| Columna                | Tipo Postgres         | Nullable | Default                        | Notas                                         |
| ---------------------- | --------------------- | -------- | ------------------------------ | --------------------------------------------- |
| `id`                   | `uuid`                | NO       | `uuid_generate_v4()`           | PK                                            |
| `doctor_id`            | `uuid`                | NO       | —                              | FK → `profiles(id)` ON DELETE CASCADE; UNIQUE |
| `plan`                 | `subscription_plan`   | NO       | `'trial'::subscription_plan`   | Enum                                          |
| `status`               | `subscription_status` | NO       | `'trial'::subscription_status` | Enum                                          |
| `price_usd`            | `numeric(12,2)`       | NO       | `0`                            | Precisión monetaria                           |
| `billing_cycle`        | `text`                | YES      | `'monthly'`                    |                                               |
| `current_period_start` | `timestamptz`         | NO       | `now()`                        |                                               |
| `current_period_end`   | `timestamptz`         | NO       | `now() + interval '30 days'`   |                                               |
| `trial_ends_at`        | `timestamptz`         | YES      | `now() + interval '14 days'`   |                                               |
| `cancelled_at`         | `timestamptz`         | YES      | NULL                           |                                               |
| `notes`                | `text`                | YES      | NULL                           |                                               |
| `created_at`           | `timestamptz`         | YES      | `now()`                        |                                               |
| `updated_at`           | `timestamptz`         | YES      | `now()`                        |                                               |

**Primary Key:** `id`
**Foreign Keys:** `doctor_id → profiles(id) ON DELETE CASCADE`
**Unique:** `doctor_id` — una suscripción por doctor
**Fuente:** `sql_migration_v24_missing_tables.sql` §5. Confirmado por Zod `SubscriptionSchema`.
**Nota post-review:** `price_usd` cambió de `numeric` a `numeric(12,2)` para garantizar precisión monetaria.

---

### T-05 · `patients`

Contiene datos PHI que se encriptan con AES-256-GCM en el backend. Las columnas
`*_search_hash` son hashes HMAC-SHA256 usados para búsqueda sin descifrar.

| Columna                   | Tipo Postgres | Nullable | Default             | Notas                                                                                                                                                                        |
| ------------------------- | ------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| `id`                      | `uuid`        | NO       | `gen_random_uuid()` | PK                                                                                                                                                                           |
| `doctor_id`               | `uuid`        | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE                                                                                                                                        |
| `auth_user_id`            | `uuid`        | YES      | NULL                | FK → `profiles(id)` — perfil del paciente si tiene cuenta                                                                                                                    |
| `full_name`               | `text`        | NO       | —                   | **PHI — ciphertext AES-256-GCM**                                                                                                                                             |
| `full_name_search_hash`   | `varchar(64)` | YES      | NULL                | HMAC-SHA256 hex del nombre normalizado. Columna interna backend; no es parte del contrato Zod de `@delta/shared-types`.                                                      |
| `cedula`                  | `text`        | YES      | NULL                | **PHI — ciphertext AES-256-GCM**                                                                                                                                             |
| `cedula_search_hash`      | `varchar(64)` | YES      | NULL                | HMAC-SHA256 hex de la cédula. Columna interna backend; no es parte del contrato Zod de `@delta/shared-types`.                                                                |
| `phone`                   | `text`        | YES      | NULL                | **PHI — ciphertext AES-256-GCM**                                                                                                                                             |
| `email`                   | `text`        | YES      | NULL                | **PHI — ciphertext AES-256-GCM**. Se almacena como ciphertext con nonce aleatorio — no indexar directamente.                                                                 |
| `email_search_hash`       | `varchar(64)` | YES      | NULL                | HMAC-SHA256 hex del email. Requerido porque el ciphertext AES-256-GCM tiene nonce aleatorio. Columna interna backend; no es parte del contrato Zod de `@delta/shared-types`. |
| `source`                  | `text`        | YES      | NULL                | Ej. `manual`, `booking`, `invitation`                                                                                                                                        |
| `birth_date`              | `date`        | YES      | NULL                |                                                                                                                                                                              |
| `age`                     | `int`         | YES      | NULL                | Legacy — preferir `birth_date`                                                                                                                                               |
| `sex`                     | `text`        | YES      | NULL                | `male                                                                                                                                                                        | female | other` |
| `blood_type`              | `text`        | YES      | NULL                |                                                                                                                                                                              |
| `allergies`               | `text`        | YES      | NULL                |                                                                                                                                                                              |
| `chronic_conditions`      | `text`        | YES      | NULL                |                                                                                                                                                                              |
| `address`                 | `text`        | YES      | NULL                |                                                                                                                                                                              |
| `city`                    | `text`        | YES      | NULL                |                                                                                                                                                                              |
| `emergency_contact_name`  | `text`        | YES      | NULL                |                                                                                                                                                                              |
| `emergency_contact_phone` | `text`        | YES      | NULL                |                                                                                                                                                                              |
| `notes`                   | `text`        | YES      | NULL                |                                                                                                                                                                              |
| `created_at`              | `timestamptz` | YES      | `now()`             |                                                                                                                                                                              |
| `updated_at`              | `timestamptz` | YES      | `now()`             |                                                                                                                                                                              |

**Primary Key:** `id`
**Foreign Keys:**

- `doctor_id → profiles(id) ON DELETE CASCADE`
- `auth_user_id → profiles(id)` (sin ON DELETE, NULLable)

**Unique (index parcial sobre hash determinístico):**

```sql
-- CORRECCIÓN post-review: se reemplazó el índice sobre LOWER(TRIM(email)) porque
-- email contiene ciphertext AES-256-GCM con nonce aleatorio — ese índice nunca
-- detectaría duplicados. El hash determinístico sí lo detecta.
CREATE UNIQUE INDEX patients_doctor_email_uq
  ON patients(doctor_id, email_search_hash)
  WHERE email_search_hash IS NOT NULL;
```

**Índices:**

- `idx_patients_doctor ON patients(doctor_id)`
- `idx_patients_auth_user ON patients(auth_user_id)` (para lookup portal paciente)
- `idx_patients_cedula_hash ON patients(cedula_search_hash)` (búsqueda encriptada)
- `idx_patients_name_hash ON patients(full_name_search_hash)`
- `idx_patients_email_hash ON patients(email_search_hash)` (búsqueda encriptada por email)

**Notas PHI:**

- `full_name`, `cedula`, `phone`, `email` se almacenan como ciphertext base64 de AES-256-GCM.
- Los hash de búsqueda (`*_search_hash`) se calculan en el backend antes de guardar y se usan para `WHERE cedula_search_hash = ?`.
- `email_search_hash`, `cedula_search_hash`, `full_name_search_hash` son columnas internas calculadas por el backend; NO forman parte del contrato Zod de `@delta/shared-types`.
- En listas, los campos PHI se retornan enmascarados; `/reveal` los descifra y registra en `access_audit_log`.

**Fuentes:** `sql_seed_ehr.sql` (INSERT con columnas reales), `apps/frontend/app/api/book/route.ts` (INSERT payload), Zod `PatientSchema`.
**Nota:** el seed usa columna `id_number` como alias de `cedula`. La columna real es `cedula`. Ver D-11.

---

### T-06 · `appointments`

| Columna               | Tipo Postgres        | Nullable | Default             | Notas                                                                  |
| --------------------- | -------------------- | -------- | ------------------- | ---------------------------------------------------------------------- | ------------- | ----- | ------- | ------ | --- |
| `id`                  | `uuid`               | NO       | `gen_random_uuid()` | PK                                                                     |
| `doctor_id`           | `uuid`               | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE                                  |
| `patient_id`          | `uuid`               | YES      | NULL                | FK → `patients(id)` ON DELETE SET NULL                                 |
| `auth_user_id`        | `uuid`               | YES      | NULL                | FK → `profiles(id)` — sesión Supabase Auth del paciente                |
| `consultation_id`     | `uuid`               | YES      | NULL                | FK → `consultations(id)` ON DELETE SET NULL                            |
| `patient_name`        | `text`               | YES      | NULL                | Desnormalizado al booking                                              |
| `patient_phone`       | `text`               | YES      | NULL                | Desnormalizado al booking                                              |
| `patient_email`       | `text`               | YES      | NULL                | Desnormalizado al booking                                              |
| `patient_cedula`      | `text`               | YES      | NULL                | Desnormalizado al booking                                              |
| `scheduled_at`        | `timestamptz`        | NO       | —                   | Fecha y hora de la cita                                                |
| `status`              | `appointment_status` | NO       | `'scheduled'`       | Enum de 7 valores                                                      |
| `appointment_mode`    | `text`               | YES      | `'presencial'`      | `presencial                                                            | online`       |
| `source`              | `text`               | YES      | NULL                | Ej. `booking`, `manual`, `invitation`                                  |
| `plan_name`           | `text`               | YES      | NULL                | Nombre del plan/servicio elegido                                       |
| `plan_price`          | `numeric(12,2)`      | YES      | NULL                | Precio al momento del booking (USD)                                    |
| `payment_method`      | `text`               | YES      | NULL                | Texto libre: `pago_movil                                               | transferencia | zelle | package | direct | …`  |
| `payment_reference`   | `text`               | YES      | NULL                | Número de referencia (añadido en `032_appointments_payment_ref.sql`)   |
| `payment_receipt_url` | `text`               | YES      | NULL                | URL del comprobante                                                    |
| `insurance_name`      | `text`               | YES      | NULL                |                                                                        |
| `bcv_rate`            | `numeric(10,4)`      | YES      | NULL                | Tasa BCV al momento del booking (4 decimales para precisión cambiaria) |
| `amount_bs`           | `numeric(12,2)`      | YES      | NULL                | Monto calculado en bolívares                                           |
| `package_id`          | `uuid`               | YES      | NULL                | FK → `patient_packages(id)` ON DELETE SET NULL                         |
| `session_number`      | `int`                | YES      | NULL                | Número de sesión dentro del paquete                                    |
| `chief_complaint`     | `text`               | YES      | NULL                | Motivo de consulta (capturado al agendar)                              |
| `appointment_code`    | `text`               | YES      | NULL                | Código legible (generado en app)                                       |
| `created_at`          | `timestamptz`        | YES      | `now()`             |                                                                        |
| `updated_at`          | `timestamptz`        | YES      | `now()`             |                                                                        |

**Primary Key:** `id`
**Foreign Keys:**

- `doctor_id → profiles(id) ON DELETE CASCADE`
- `patient_id → patients(id) ON DELETE SET NULL`
- `auth_user_id → profiles(id)` (nullable, sin ON DELETE)
- `consultation_id → consultations(id) ON DELETE SET NULL`
- `package_id → patient_packages(id) ON DELETE SET NULL`

**Unique (index parcial):**

```sql
CREATE UNIQUE INDEX appointments_doctor_slot_uq
  ON appointments(doctor_id, scheduled_at)
  WHERE status::text IN ('scheduled','confirmed','pending','accepted');
```

**Índices:**

- `idx_appointments_doctor_id ON appointments(doctor_id)`
- `idx_appointments_scheduled_at ON appointments(scheduled_at)`
- `idx_appointments_patient_id ON appointments(patient_id)`
- `idx_appointments_status ON appointments(status)`
- `idx_appointments_auth_user_id ON appointments(auth_user_id)` (FK index)
- `idx_appointments_package_id ON appointments(package_id)` (FK index)
- `idx_appointments_consultation_id ON appointments(consultation_id)` (FK index, añadido post ALTER TABLE)

**Fuentes:** `fixes_remediation.sql` §G (INSERT columns), `apps/frontend/app/api/book/route.ts`,
Zod `AppointmentSchema`.
**Nota post-review:** `plan_price` y `amount_bs` cambiaron a `numeric(12,2)`; `bcv_rate` a `numeric(10,4)`. Índices FK para `auth_user_id`, `package_id` y `consultation_id` añadidos.

---

### T-07 · `consultations`

| Columna             | Tipo Postgres   | Nullable | Default             | Notas                                          |
| ------------------- | --------------- | -------- | ------------------- | ---------------------------------------------- | ----------------- |
| `id`                | `uuid`          | NO       | `gen_random_uuid()` | PK                                             |
| `doctor_id`         | `uuid`          | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE          |
| `patient_id`        | `uuid`          | NO       | —                   | FK → `patients(id)` ON DELETE CASCADE          |
| `appointment_id`    | `uuid`          | YES      | NULL                | FK → `appointments(id)` ON DELETE SET NULL     |
| `consultation_code` | `text`          | NO       | —                   | Código único legible (ej. `CON-20260101-3001`) |
| `consultation_date` | `timestamptz`   | NO       | —                   | Fecha/hora de la consulta                      |
| `chief_complaint`   | `text`          | YES      | NULL                | **PHI — ciphertext AES-256-GCM**               |
| `diagnosis`         | `text`          | YES      | NULL                | **PHI — ciphertext AES-256-GCM**               |
| `treatment`         | `text`          | YES      | NULL                | **PHI — ciphertext AES-256-GCM**               |
| `notes`             | `text`          | YES      | NULL                |                                                |
| `payment_status`    | `text`          | YES      | `'pending'`         | `pending                                       | approved` (CHECK) |
| `payment_method`    | `text`          | YES      | NULL                | Texto libre                                    |
| `amount`            | `numeric(12,2)` | YES      | NULL                | Monto en USD                                   |
| `blocks_snapshot`   | `jsonb`         | YES      | NULL                | Snapshot bloques consulta (v25)                |
| `created_at`        | `timestamptz`   | YES      | `now()`             |                                                |
| `updated_at`        | `timestamptz`   | YES      | `now()`             |                                                |

**Primary Key:** `id`
**Foreign Keys:**

- `doctor_id → profiles(id) ON DELETE CASCADE`
- `patient_id → patients(id) ON DELETE CASCADE`
- `appointment_id → appointments(id) ON DELETE SET NULL`

**Check:** `payment_status IN ('pending','approved')`
**Unique:** `consultation_code` — constraint `consultations_consultation_code_key`
**Índices:**

- `idx_consultations_doctor_date ON consultations(doctor_id, consultation_date DESC)` (raw SQL — Sequelize addIndex no soporta DESC por columna)
- `idx_consultations_patient ON consultations(patient_id)`
- `idx_consultations_appointment ON consultations(appointment_id)`

**Fuentes:** `sql_seed_ehr.sql` (INSERT columns), Zod `ConsultationSchema`, `sql_migration_v25_fase2.sql` §2 (`blocks_snapshot`).
**Nota PHI:** `chief_complaint`, `diagnosis`, `treatment` son PHI. Ver D-12 sobre `blocks_snapshot`.
**Nota post-review:** `amount` cambió a `numeric(12,2)`. Se añadió constraint UNIQUE en `consultation_code`. Los índices con DESC se implementan via raw SQL.

---

### T-08 · `ehr_records`

| Columna           | Tipo Postgres | Nullable | Default             | Notas                                       |
| ----------------- | ------------- | -------- | ------------------- | ------------------------------------------- |
| `id`              | `uuid`        | NO       | `gen_random_uuid()` | PK                                          |
| `doctor_id`       | `uuid`        | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE       |
| `patient_id`      | `uuid`        | NO       | —                   | FK → `patients(id)` ON DELETE CASCADE       |
| `consultation_id` | `uuid`        | YES      | NULL                | FK → `consultations(id)` ON DELETE SET NULL |
| `diagnosis`       | `text`        | YES      | NULL                | **PHI — ciphertext AES-256-GCM**            |
| `treatment_plan`  | `text`        | YES      | NULL                | **PHI — ciphertext AES-256-GCM**            |
| `created_at`      | `timestamptz` | YES      | `now()`             |                                             |
| `updated_at`      | `timestamptz` | YES      | `now()`             |                                             |

**Primary Key:** `id`
**Foreign Keys:**

- `doctor_id → profiles(id) ON DELETE CASCADE`
- `patient_id → patients(id) ON DELETE CASCADE`
- `consultation_id → consultations(id) ON DELETE SET NULL`

**Índices:**

- `idx_ehr_doctor ON ehr_records(doctor_id)`
- `idx_ehr_patient ON ehr_records(patient_id)`
- `idx_ehr_consultation ON ehr_records(consultation_id)`

**Fuentes:** Zod `EhrRecordSchema`, `01_PASO2_CORRECCIONES_SQL.sql` §7b (lógica FK).

---

### T-09 · `prescriptions`

| Columna           | Tipo Postgres | Nullable | Default             | Notas                                                         |
| ----------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------- |
| `id`              | `uuid`        | NO       | `gen_random_uuid()` | PK                                                            |
| `doctor_id`       | `uuid`        | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE                         |
| `patient_id`      | `uuid`        | YES      | NULL                | FK → `patients(id)` ON DELETE CASCADE                         |
| `consultation_id` | `uuid`        | YES      | NULL                | FK → `consultations(id)` ON DELETE CASCADE                    |
| `medication`      | `text`        | NO       | —                   | **PHI — ciphertext AES-256-GCM** (columna real: `medication`) |
| `dosage`          | `text`        | YES      | NULL                | **PHI — ciphertext AES-256-GCM**                              |
| `frequency`       | `text`        | YES      | NULL                |                                                               |
| `duration`        | `text`        | YES      | NULL                |                                                               |
| `notes`           | `text`        | YES      | NULL                |                                                               |
| `created_at`      | `timestamptz` | YES      | `now()`             |                                                               |
| `updated_at`      | `timestamptz` | YES      | `now()`             | Añadido post-review para consistencia con otras tablas PHI    |

**Primary Key:** `id`
**Foreign Keys:**

- `doctor_id → profiles(id) ON DELETE CASCADE`
- `patient_id → patients(id) ON DELETE CASCADE`
- `consultation_id → consultations(id) ON DELETE CASCADE`

**Índices:**

- `idx_prescriptions_doctor ON prescriptions(doctor_id)`
- `idx_prescriptions_consultation ON prescriptions(consultation_id)`
- `idx_prescriptions_patient ON prescriptions(patient_id)`

**Fuentes:** `sql_seed_ehr.sql` (CREATE TABLE definitivo), Zod `PrescriptionSchema`.
**CRÍTICO:** la columna es `medication`, NO `medication_name`. Ver D-13.
**Nota post-review:** se añadió `updated_at` para consistencia con las otras tablas PHI (`consultations`, `ehr_records`, `patients`).

---

### T-10 · `patient_packages`

| Columna                | Tipo Postgres   | Nullable | Default             | Notas                                         |
| ---------------------- | --------------- | -------- | ------------------- | --------------------------------------------- | ------------------ |
| `id`                   | `uuid`          | NO       | `gen_random_uuid()` | PK                                            |
| `doctor_id`            | `uuid`          | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE         |
| `patient_id`           | `uuid`          | YES      | NULL                | FK → `patients(id)` ON DELETE SET NULL        |
| `auth_user_id`         | `uuid`          | YES      | NULL                | FK → `profiles(id)` — sesión del paciente     |
| `package_template_id`  | `uuid`          | YES      | NULL                | FK → `package_templates(id)` (añadido en v25) |
| `plan_name`            | `text`          | NO       | —                   | Nombre del paquete al comprar (snapshot)      |
| `specialty`            | `text`          | YES      | NULL                | Especialidad (añadido en v25)                 |
| `total_sessions`       | `int`           | NO       | —                   | Sesiones totales del paquete                  |
| `used_sessions`        | `int`           | NO       | `0`                 | Sesiones consumidas                           |
| `status`               | `text`          | NO       | `'active'`          | `active                                       | completed` (CHECK) |
| `purchased_amount_usd` | `numeric(12,2)` | YES      | NULL                | Precio pagado (añadido en v25)                |
| `notified_one_left`    | `boolean`       | YES      | `false`             | Flag: ya se notificó que queda 1 sesión       |
| `created_at`           | `timestamptz`   | YES      | `now()`             |                                               |
| `updated_at`           | `timestamptz`   | YES      | `now()`             | Añadido en v25                                |

**Primary Key:** `id`
**Foreign Keys:**

- `doctor_id → profiles(id) ON DELETE CASCADE`
- `patient_id → patients(id) ON DELETE SET NULL`
- `auth_user_id → profiles(id)` (nullable)
- `package_template_id → package_templates(id)` (nullable, sin ON DELETE)

**Check:** `status IN ('active','completed')`
**Índices:**

- `idx_patient_packages_doctor ON patient_packages(doctor_id)`
- `idx_patient_packages_patient ON patient_packages(patient_id)`
- `idx_patient_packages_auth_user ON patient_packages(auth_user_id)`

**Fuentes:** `sql_migration_v25_fase2.sql` §1 (`ALTER TABLE` añadiendo columnas), `apps/frontend/app/api/doctor/patient-packages/route.ts` (columnas SELECT), `apps/frontend/app/api/book/route.ts` (columnas SELECT/UPDATE).
**Nota:** columnas originales (pre-v25) no están en un CREATE TABLE explícito en los archivos auditados — se infieren de los INSERT/SELECT y de los ALTER TABLE de v25. Ver D-14.

---

### T-11 · `pricing_plans`

Planes/tarifas del doctor (distintos de `plan_configs` que son los planes SaaS).

| Columna            | Tipo Postgres   | Nullable | Default             | Notas                                                               |
| ------------------ | --------------- | -------- | ------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| `id`               | `uuid`          | NO       | `gen_random_uuid()` | PK                                                                  |
| `doctor_id`        | `uuid`          | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE                               |
| `name`             | `text`          | NO       | —                   | Nombre del plan/servicio                                            |
| `price_usd`        | `numeric(12,2)` | NO       | —                   | Precio en USD                                                       |
| `duration_minutes` | `int`           | YES      | `30`                | Duración de la consulta                                             |
| `sessions_count`   | `int`           | YES      | `1`                 | Sesiones del plan                                                   |
| `description`      | `text`          | YES      | `''`                | Descripción (añadida en `20260418_doctor_offices_and_services.sql`) |
| `type`             | `text`          | YES      | `'plan'`            | `plan                                                               | service` (añadido en misma migración) |
| `show_in_booking`  | `boolean`       | YES      | `true`              | Visible en booking público (añadido en misma migración)             |
| `is_active`        | `boolean`       | YES      | `true`              |                                                                     |
| `created_at`       | `timestamptz`   | YES      | `now()`             |                                                                     |
| `updated_at`       | `timestamptz`   | YES      | `now()`             |                                                                     |

**Primary Key:** `id`
**Foreign Keys:** `doctor_id → profiles(id) ON DELETE CASCADE`
**Índices:**

- `idx_pricing_plans_doctor ON pricing_plans(doctor_id)`
- `idx_pricing_plans_booking ON pricing_plans(doctor_id, show_in_booking) WHERE show_in_booking = true`

**Fuentes:** `apps/frontend/app/doctor/services/page.tsx` (payload completo), `supabase/migrations/20260418_doctor_offices_and_services.sql` (ALTER TABLE añadiendo columnas extra), `apps/frontend/CLAUDE.md` (definición).
**Nota:** no hay CREATE TABLE explícito en los SQL auditados; la tabla se creó directamente en Supabase. Las columnas se infieren del código frontend. Ver D-15.

---

### T-12 · `leads`

| Columna         | Tipo Postgres | Nullable | Default             | Notas                                                   |
| --------------- | ------------- | -------- | ------------------- | ------------------------------------------------------- | --------- | --------- | ----------- | --------- | ---------- |
| `id`            | `uuid`        | NO       | `gen_random_uuid()` | PK                                                      |
| `doctor_id`     | `uuid`        | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE                   |
| `name`          | `text`        | NO       | —                   | Nombre del lead                                         |
| `phone`         | `text`        | YES      | NULL                |                                                         |
| `channel`       | `text`        | YES      | NULL                | Canal de captación (texto libre: `whatsapp              | instagram | facebook  | web         | llamada   | referido`) |
| `stage`         | `text`        | YES      | `'new'`             | Estado en el funnel: `new                               | contacted | qualified | appointment | converted | lost`      |
| `message`       | `text`        | YES      | NULL                | Mensaje inicial del lead                                |
| `source`        | `lead_source` | YES      | NULL                | Enum de source (puede ser NULL si canal es texto libre) |
| `status`        | `lead_status` | YES      | NULL                | Enum `hot                                               | cold      | client    | archived`   |
| `last_activity` | `timestamptz` | YES      | NULL                | Última actividad                                        |
| `created_at`    | `timestamptz` | YES      | `now()`             |                                                         |
| `updated_at`    | `timestamptz` | YES      | `now()`             |                                                         |

**Primary Key:** `id`
**Foreign Keys:** `doctor_id → profiles(id) ON DELETE CASCADE`
**Índices:**

- `idx_leads_doctor ON leads(doctor_id)` (mencionado en `fixes_remediation.sql` como índice canónico)

**Fuentes:** `apps/frontend/app/doctor/crm/page.tsx` (interfaz `Lead` + INSERT payload), `sql_migration_v24_missing_tables.sql` (definición de enums `lead_source`, `lead_status`).
**DISCREPANCIA:** ver D-05 y D-06 sobre diferencia entre enum BD y tipos TS del frontend.

---

### T-13 · `patient_messages`

| Columna      | Tipo Postgres | Nullable | Default             | Notas                                 |
| ------------ | ------------- | -------- | ------------------- | ------------------------------------- | ------------------ |
| `id`         | `uuid`        | NO       | `gen_random_uuid()` | PK                                    |
| `patient_id` | `uuid`        | NO       | —                   | FK → `patients(id)` ON DELETE CASCADE |
| `doctor_id`  | `uuid`        | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE |
| `body`       | `text`        | NO       | —                   | Cuerpo del mensaje                    |
| `direction`  | `text`        | NO       | —                   | `patient_to_doctor                    | doctor_to_patient` |
| `read_at`    | `timestamptz` | YES      | NULL                | NULL si no leído                      |
| `created_at` | `timestamptz` | YES      | `now()`             |                                       |

**Primary Key:** `id`
**Foreign Keys:**

- `patient_id → patients(id) ON DELETE CASCADE`
- `doctor_id → profiles(id) ON DELETE CASCADE`

**Check:** `direction IN ('patient_to_doctor','doctor_to_patient')`
**Índices:**

- `idx_patient_messages_patient ON patient_messages(patient_id)`
- `idx_patient_messages_doctor ON patient_messages(doctor_id)`
- `idx_pm_patient` (mencionado en `003_fix_policies_indexes_cleanup.sql` como duplicado de lo anterior)

**Fuentes:** `apps/frontend/app/doctor/messages/page.tsx` (SELECT + INSERT columns), `fixes_remediation.sql` §A2 y §4.

---

### T-14 · `reminders_settings`

| Columna                 | Tipo Postgres      | Nullable | Default                                 | Notas                                         |
| ----------------------- | ------------------ | -------- | --------------------------------------- | --------------------------------------------- |
| `id`                    | `uuid`             | NO       | `uuid_generate_v4()`                    | PK                                            |
| `doctor_id`             | `uuid`             | NO       | —                                       | FK → `profiles(id)` ON DELETE CASCADE; UNIQUE |
| `enabled`               | `boolean`          | YES      | `true`                                  |                                               |
| `channel`               | `reminder_channel` | YES      | `'both'`                                | Enum                                          |
| `reminder_7d_enabled`   | `boolean`          | YES      | `true`                                  |                                               |
| `reminder_24h_enabled`  | `boolean`          | YES      | `true`                                  |                                               |
| `reminder_3h_enabled`   | `boolean`          | YES      | `true`                                  |                                               |
| `reminder_1h_enabled`   | `boolean`          | YES      | `false`                                 |                                               |
| `template_7d_whatsapp`  | `text`             | YES      | `'Hola {patient_name}, te recordamos…'` |                                               |
| `template_24h_whatsapp` | `text`             | YES      | `'Hola {patient_name}, mañana tienes…'` |                                               |
| `template_3h_whatsapp`  | `text`             | YES      | `'Hola {patient_name}, en 3 horas…'`    |                                               |
| `quiet_hours_start`     | `time`             | YES      | `'21:00:00'`                            |                                               |
| `quiet_hours_end`       | `time`             | YES      | `'08:00:00'`                            |                                               |
| `created_at`            | `timestamptz`      | YES      | `now()`                                 |                                               |
| `updated_at`            | `timestamptz`      | YES      | `now()`                                 |                                               |

**Primary Key:** `id`
**Foreign Keys:** `doctor_id → profiles(id) ON DELETE CASCADE`
**Unique:** `doctor_id` — una config por doctor
**Fuente:** `sql_migration_v24_missing_tables.sql` §7.

---

### T-15 · `reminders_queue`

| Columna           | Tipo Postgres      | Nullable | Default              | Notas                                                   |
| ----------------- | ------------------ | -------- | -------------------- | ------------------------------------------------------- | ----- | ------ | ------- | ---------- |
| `id`              | `uuid`             | NO       | `uuid_generate_v4()` | PK                                                      |
| `appointment_id`  | `uuid`             | NO       | —                    | FK → `appointments(id)` ON DELETE CASCADE               |
| `doctor_id`       | `uuid`             | NO       | —                    | FK → `profiles(id)`                                     |
| `patient_id`      | `uuid`             | YES      | NULL                 | FK → `profiles(id)` (perfil Supabase Auth del paciente) |
| `offset_type`     | `reminder_offset`  | NO       | —                    | Enum: `7d                                               | 24h   | 3h     | 1h`     |
| `scheduled_for`   | `timestamptz`      | NO       | —                    | Cuándo debe enviarse                                    |
| `channel`         | `reminder_channel` | NO       | —                    | Enum: `whatsapp                                         | email | both`  |
| `message_body`    | `text`             | YES      | NULL                 | Mensaje ya interpolado                                  |
| `status`          | `text`             | YES      | `'pending'`          | `pending                                                | sent  | failed | skipped | cancelled` |
| `attempts`        | `int`              | YES      | `0`                  |                                                         |
| `last_attempt_at` | `timestamptz`      | YES      | NULL                 |                                                         |
| `sent_at`         | `timestamptz`      | YES      | NULL                 |                                                         |
| `error_message`   | `text`             | YES      | NULL                 |                                                         |
| `created_at`      | `timestamptz`      | YES      | `now()`              |                                                         |

**Primary Key:** `id`
**Foreign Keys:**

- `appointment_id → appointments(id) ON DELETE CASCADE`
- `doctor_id → profiles(id)` (sin ON DELETE)
- `patient_id → profiles(id)` (nullable, sin ON DELETE)

**Check:** `status IN ('pending','sent','failed','skipped','cancelled')`
**Índices:**

- `idx_reminders_queue_appointment ON reminders_queue(appointment_id)`
- `idx_reminders_queue_doctor ON reminders_queue(doctor_id)` (FK index)
- `idx_reminders_queue_patient ON reminders_queue(patient_id)` (FK index)
- `idx_reminders_queue_worker ON reminders_queue(scheduled_for, status) WHERE status = 'pending'`

**Fuente:** `sql_migration_v24_missing_tables.sql` §8.
**Nota:** el `patient_id` en esta tabla referencia `profiles(id)` (no `patients.id`) para poder
enviar via Supabase Auth. Ver D-16.
**Nota post-review:** índices FK para `doctor_id` y `patient_id` añadidos.

---

### T-16 · `doctor_invitations`

La tabla existe en Supabase (mencionada en `queries/archive/010_final_validation.sql`,
`016_dead_table_analysis.sql`). No tiene CREATE TABLE explícito en los SQL del repo.
Las columnas se infieren de su propósito (link de booking único por doctor)
y el comentario en `apps/frontend/app/api/admin/reset-database/route.ts` ("eliminadas en reingeniería 2026-04-22").

| Columna      | Tipo Postgres | Nullable | Default             | Notas                                 |
| ------------ | ------------- | -------- | ------------------- | ------------------------------------- |
| `id`         | `uuid`        | NO       | `gen_random_uuid()` | PK                                    |
| `doctor_id`  | `uuid`        | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE |
| `token`      | `text`        | NO       | —                   | Token único del link (UNIQUE)         |
| `is_active`  | `boolean`     | YES      | `true`              |                                       |
| `max_uses`   | `int`         | YES      | NULL                | NULL = usos ilimitados                |
| `uses_count` | `int`         | YES      | `0`                 |                                       |
| `expires_at` | `timestamptz` | YES      | NULL                | NULL = no expira                      |
| `created_at` | `timestamptz` | YES      | `now()`             |                                       |

**Primary Key:** `id`
**Foreign Keys:** `doctor_id → profiles(id) ON DELETE CASCADE`
**Unique:** `token`
**Índices:**

- `idx_doctor_invitations_doctor ON doctor_invitations(doctor_id)` (FK index)

**Fuente:** inferido de contexto (CLAUDE.md feature `invitations`, `/book/[doctorId]` pattern). Ver D-17.
**Nota post-review:** índice FK en `doctor_id` añadido.

---

### T-17 · `access_audit_log` (TABLA NUEVA)

Auditoría de accesos a datos PHI sensibles vía endpoint `/reveal`. Diseñada según
CLAUDE.md: "masking por defecto en listas; `/reveal` registra en `access_audit_log`".

| Columna          | Tipo Postgres | Nullable | Default             | Notas                                     |
| ---------------- | ------------- | -------- | ------------------- | ----------------------------------------- | ------ | ----- | ----- | --------- | -------------- | ----------- |
| `id`             | `uuid`        | NO       | `gen_random_uuid()` | PK                                        |
| `actor_id`       | `uuid`        | NO       | —                   | FK → `profiles(id)` — quién accedió       |
| `actor_role`     | `user_role`   | NO       | —                   | Rol del actor en el momento del acceso    |
| `patient_id`     | `uuid`        | NO       | —                   | FK → `patients(id)` — de qué paciente     |
| `field_revealed` | `text`        | NO       | —                   | Qué campo: `full_name                     | cedula | phone | email | diagnosis | treatment_plan | medication` |
| `ip_address`     | `inet`        | YES      | NULL                | IP del cliente (desde header del request) |
| `user_agent`     | `text`        | YES      | NULL                | User-Agent del cliente                    |
| `reason`         | `text`        | YES      | NULL                | Motivo declarado (si aplica)              |
| `created_at`     | `timestamptz` | NO       | `now()`             | Timestamp inmutable del acceso            |

**Primary Key:** `id`
**Foreign Keys:**

- `actor_id → profiles(id)` (sin ON DELETE — no borrar audit si se borra el actor)
- `patient_id → patients(id)` (sin ON DELETE — no borrar audit si se borra el paciente)

**Check:** `field_revealed IN ('full_name','cedula','phone','email','diagnosis','treatment_plan','medication','dosage','chief_complaint','treatment')`
**Índices:**

- `idx_aal_actor ON access_audit_log(actor_id, created_at DESC)` (raw SQL — Sequelize addIndex no soporta DESC por columna)
- `idx_aal_patient ON access_audit_log(patient_id, created_at DESC)` (raw SQL)
- `idx_aal_created ON access_audit_log(created_at)` (via addIndex)

**Notas de diseño:**

- La tabla es APPEND-ONLY (solo INSERT, sin UPDATE ni DELETE).
- `created_at` es NOT NULL para garantizar integridad del audit trail.
- `ip_address` usa tipo `inet` (nativo Postgres) para soportar IPv4 e IPv6.
- En Sequelize, usar `DataTypes.INET` o `DataTypes.TEXT` si el driver no soporta `inet`.

---

### T-18 · `active_sessions` (TABLA NUEVA)

Registro de la sesión activa por usuario (un dispositivo a la vez). Soporte para
invalidar sesiones anteriores y detectar uso concurrente.

| Columna         | Tipo Postgres | Nullable | Default             | Notas                                                    |
| --------------- | ------------- | -------- | ------------------- | -------------------------------------------------------- |
| `id`            | `uuid`        | NO       | `gen_random_uuid()` | PK                                                       |
| `user_id`       | `uuid`        | NO       | —                   | FK → `profiles(id)` ON DELETE CASCADE; UNIQUE            |
| `session_token` | `text`        | NO       | —                   | Token opaco de sesión (UNIQUE)                           |
| `device_info`   | `text`        | YES      | NULL                | User-Agent / descripción del dispositivo                 |
| `ip_address`    | `inet`        | YES      | NULL                | IP del cliente                                           |
| `last_seen`     | `timestamptz` | NO       | `now()`             | Actualizar en cada request autenticado                   |
| `created_at`    | `timestamptz` | NO       | `now()`             | Creación de la sesión                                    |
| `expires_at`    | `timestamptz` | YES      | NULL                | NULL = sin expiración explícita (usa TTL de Auth0/token) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → profiles(id) ON DELETE CASCADE`
**Unique:** `user_id` (un dispositivo activo), `session_token`
**Índices:**

- `active_sessions_session_token_key` — índice implícito creado por el constraint UNIQUE en `session_token` (lookup por token). No se crea un índice adicional `idx_active_sessions_token` — sería redundante.
- `idx_active_sessions_last_seen ON active_sessions(last_seen)` (limpieza de sesiones viejas)

**Notas de diseño:**

- El constraint UNIQUE en `user_id` implementa la política de "un dispositivo activo".
  Al autenticar, se hace UPSERT ON CONFLICT `user_id` DO UPDATE para reemplazar la sesión anterior.
- `session_token` es el token JWT de Supabase Auth o un token interno para Etapa 1 (DevAuthGuard).
- En Etapa 2 (Auth0), `session_token` almacena el `sid` de la sesión Auth0.

---

## DISCREPANCIAS Y DECISIONES

### D-01 · `user_role` enum: `admin` vs `assistant`

**Conflicto:**

- SQL v24 define `user_role` con 4 valores: `super_admin|doctor|assistant|patient`.
- `CLAUDE.md` y `fixes_remediation.sql` políticas RLS usan `'admin'` como valor válido.
- Zod `UserRoleSchema` incluye ambos: `super_admin|admin|doctor|assistant|patient`.

**Decisión:** crear el enum con los 4 valores del SQL v24 (`super_admin|doctor|assistant|patient`).
`admin` se trata como alias de `super_admin` en el código (el admin real usa `super_admin`).
Las políticas RLS que filtraban por `'admin'` deben cambiarse a `'super_admin'` en el backend NestJS.
En la migración Sequelize, el enum tendrá los 4 valores del SQL real.

---

### D-02 · `subscription_plan`: `enterprise` vs `clinic`

**Conflicto:** `enterprise` existe en BD histórica; `clinic` es el valor correcto post CR-007.

**Decisión:** la migración inicial crea el enum con ambos valores:
`trial|basic|professional|enterprise|clinic`. El seed de CR-007 migra `enterprise→clinic`.
Cuando no queden filas con `enterprise`, se puede hacer `ALTER TYPE` para eliminarlo
(fuera del scope de la migración inicial).

---

### D-03 · `subscription_status`: `trialing` no está en el enum

**Conflicto:** `fixes_remediation.sql` §H añade CHECK `status IN ('active','trial','trialing',…)` como texto.
Pero el enum real creado en v24 tiene 5 valores sin `trialing`.

**Decisión:** la migración usa el enum con los 5 valores del v24: `active|suspended|cancelled|trial|past_due`.
`trialing` no se añade al enum (no está en el tipo SQL original). Si el código usa `trialing`,
es un bug — reportar. La columna `subscription_status` en `profiles` (snapshot) es `text`, no enum,
por lo que acepta `trialing` sin problema.

---

### D-04 · `appointment_status`: 7 valores SQL vs 5 canónicos

**Conflicto:** SQL v24 define 7 valores; CLAUDE.md canónico menciona 5 (`pending`/`accepted` como legacy).

**Decisión:** la migración crea el enum con los 7 valores reales del SQL. El backend NestJS
validará con el Zod que incluye los 7; el frontend solo usa los 5 canónicos en nuevas citas.
No se eliminan `pending`/`accepted` del enum para no romper datos históricos.

---

### D-05 · `leads.channel`: enum `lead_source` vs tipo TS `LeadChannel`

**Conflicto:**

- BD tiene enum `lead_source`: `whatsapp|instagram|facebook|website|referral|manual`.
- El frontend usa `LeadChannel`: `whatsapp|instagram|facebook|web|llamada|referido`.

**Decisión:** la columna `channel` en `leads` se define como `text` (no el enum `lead_source`),
para aceptar ambos conjuntos de valores sin romper el frontend existente. El enum `lead_source`
se crea como tipo pero no se aplica como constraint de columna en `leads.channel`.
La columna `source` en `leads` puede usar el enum `lead_source`.

---

### D-06 · `leads.stage`: tipo TS vs enum `lead_status`

**Conflicto:**

- BD tiene enum `lead_status`: `hot|cold|client|archived`.
- El frontend usa `LeadStage`: `new|contacted|qualified|appointment|converted|lost`.

**Decisión:** la columna `stage` en `leads` se define como `text` con CHECK de los valores del frontend
(`new|contacted|qualified|appointment|converted|lost`). El enum `lead_status` se crea pero
se aplica solo a una columna `status` separada (campo opcional para clasificación hot/cold).
Ambas columnas coexisten en la tabla.

---

### D-07 · `payment_method`: enum vs texto libre en `appointments`

**Conflicto:** existe el enum `payment_method` (`pago_movil|transferencia|efectivo|zelle|otro`)
pero `appointments.payment_method` usa valores como `package`, `direct`, `insurance`, etc.

**Decisión:** `appointments.payment_method` es `text` libre. El enum `payment_method` se crea
como tipo pero no se usa como constraint en `appointments`. Se podría aplicar en
`subscription_payments.method` en el futuro (fuera del scope de las 18 tablas).

---

### D-08 · `payment_status`: enum de 3 valores vs `consultations.payment_status`

**Conflicto:**

- Enum `payment_status`: `pending|verified|rejected` (para `subscription_payments`).
- `consultations.payment_status`: `pending|approved` (según seed, código y Zod).

**Decisión:** `consultations.payment_status` es `text` con CHECK `IN ('pending','approved')`.
El enum `payment_status` se crea como tipo separado para uso eventual en `subscription_payments`.

---

### D-09 · Columnas snapshot en `profiles`

**Conflicto:** el Zod `ProfileSchema` no incluye `plan`, `subscription_status`,
`subscription_expires_at`, `cedula`, `phone`, `sex`, `is_active`. Sin embargo, estas columnas
son escritas explícitamente por `register/actions.ts`.

**Decisión:** las columnas son reales y se incluyen en el spec. No se incluyen en el Zod
compartido porque son redundantes con `subscriptions` — el backend NestJS las mantendrá
sincronizadas pero no las expondrá como campos canónicos de `Profile` en la API.

---

### D-10 · `plan_features`: con o sin `id` y `feature_label`

**Conflicto:**

- `sql_migration_v24_missing_tables.sql` v24 incluye `id uuid PK` y `feature_label text`.
- `fixes_remediation.sql` §H modela `plan_features` sin `id`, solo `(plan, feature_key)` PK.

**Decisión:** usar la estructura del v24 (con `id` y `feature_label`). El seed `012_seed_plans.sql`
confirma que `feature_label` existe y se inserta con datos reales. La versión §H es un
modelado simplificado que contradice el estado real de la BD.

---

### D-11 · `patients.cedula` vs `id_number`

**Conflicto:** `sql_seed_ehr.sql` INSERT usa columna `id_number`; código frontend y Zod usan `cedula`.

**Decisión:** la columna real es `cedula`. `id_number` es un alias usado en el seed que asumía
un nombre de columna distinto (nunca ejecutado contra el schema real, ya que el seed tiene
`ON CONFLICT (id_number) DO NOTHING` que fallaría si la columna no existe). Ver el contexto:
el seed es diagnóstico/demo, no schema autoritativo.

---

### D-12 · `consultations.blocks_snapshot` y PHI en bloques

**Conflicto:** `blocks_snapshot` (jsonb) puede contener texto PHI (diagnosis, notas) en formato
semi-estructurado. No está documentado como PHI en CLAUDE.md.

**Decisión:** `blocks_snapshot` se almacena sin encriptar (es un snapshot de UI, no el campo PHI
estructurado). El backend NestJS debe evitar incluir PHI sensible en el snapshot, o cifrar el
jsonb completo. Marcar en código como "revisar antes de producción".

---

### D-13 · `prescriptions.medication` vs `medication_name`

**Conflicto:**

- `CLAUDE.md` y `memory-bank/01-architecture.md` listan `medication_name` como campo PHI.
- `sql_seed_ehr.sql` (CREATE TABLE real) y Zod `PrescriptionSchema` usan `medication`.
- `introspect_supabase.sql` §7c selecciona `pr.medication_name` (posible error en el script).

**Decisión:** la columna real es `medication`. El script de introspección en §7c tiene un
error tipográfico. `CLAUDE.md` usa `medication_name` como nombre conceptual del campo PHI,
pero el nombre real de la columna en PostgreSQL es `medication`.

---

### D-14 · `patient_packages`: columnas base no documentadas en CREATE TABLE

**Conflicto:** el `CREATE TABLE` de `patient_packages` no aparece en ningún SQL del repo
(fue creado directamente en Supabase Dashboard). Las columnas originales se infieren de:

- `ALTER TABLE patient_packages ADD COLUMN IF NOT EXISTS ...` en v25
- SELECT/INSERT del código frontend
- Lógica de la RPC `book_with_package`

**Columnas inferidas como base (pre-v25):**
`id, doctor_id, patient_id, auth_user_id, plan_name, total_sessions, used_sessions, status, created_at`

Las columnas `package_template_id, specialty, purchased_amount_usd, notified_one_left, updated_at`
fueron añadidas en v25. La migración inicial debe crearlas todas en un solo CREATE TABLE.

---

### D-15 · `pricing_plans`: sin CREATE TABLE en repo

**Situación:** igual que `patient_packages`. La tabla fue creada en Supabase Dashboard.
Las columnas se infieren de `apps/frontend/app/doctor/services/page.tsx` (payload de INSERT)
y de `supabase/migrations/20260418_doctor_offices_and_services.sql` (ADD COLUMN IF NOT EXISTS).

**Columnas originales inferidas:** `id, doctor_id, name, price_usd, duration_minutes, sessions_count, is_active, created_at`
**Añadidas después:** `description`, `type`, `show_in_booking`
La migración crea todas en un solo CREATE TABLE.

---

### D-16 · `reminders_queue.patient_id`: FK a `profiles` vs `patients`

**Conflicto:** `sql_migration_v24_missing_tables.sql` define `patient_id uuid REFERENCES public.profiles(id)` (referencia a `profiles`). El código de lógica usa `patient_id` como identificador del registro en `patients`.

**Decisión:** respetar el SQL v24 original: `patient_id → profiles(id)` (perfil de Supabase Auth
del paciente). Para envío de recordatorios por WhatsApp, el worker resuelve el número desde
`patients` usando `auth_user_id`. La FK a `profiles` permite que la entrega use datos de
autenticación del paciente directamente.

---

### D-17 · `doctor_invitations`: tabla sin DDL documentado

**Situación:** la tabla existe en Supabase (confirmado por `010_final_validation.sql` y
`016_dead_table_analysis.sql`). El código de reset indica "eliminadas en reingeniería 2026-04-22".
No hay CREATE TABLE en ningún SQL del repo.

**Decisión:** diseñar la tabla con las columnas mínimas necesarias para el feature de invitaciones
(link único de booking por doctor). La estructura propuesta en T-16 es una estimación basada
en contexto. Si la tabla fue eliminada en la reingeniería, la migración inicial puede crearla
como tabla nueva con el diseño propuesto.

---

## Orden de creación en la migración inicial

```
1.  Enums/types (todos): user_role, subscription_plan, subscription_status,
    appointment_status, reminder_channel, reminder_offset, lead_source,
    lead_status, payment_method, payment_status

2.  profiles              (sin FK externas en las 18 tablas)
3.  plan_configs          (sin FK)
4.  plan_features         (FK lógica a plan_configs)
5.  subscriptions         (FK → profiles)
6.  patients              (FK → profiles)
7.  pricing_plans         (FK → profiles)
8.  leads                 (FK → profiles)
9.  patient_packages      (FK → profiles, patients — patient_packages.package_template_id
                           referencia package_templates que NO está en las 18 tablas;
                           crear la columna como nullable sin FK formal, o crear
                           package_templates antes como tabla auxiliar)
10. appointments          (FK → profiles, patients, patient_packages, consultations —
                           FK circular con consultations; romper con DEFERRABLE o
                           crear appointments primero sin la FK a consultations,
                           añadir la FK con ALTER TABLE después de crear consultations)
11. consultations         (FK → profiles, patients, appointments)
    -- ALTER TABLE appointments ADD CONSTRAINT fk_appt_consultation
    --   FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL;
12. ehr_records           (FK → profiles, patients, consultations)
13. prescriptions         (FK → profiles, patients, consultations)
14. patient_messages      (FK → patients, profiles)
15. reminders_settings    (FK → profiles)
16. reminders_queue       (FK → appointments, profiles)
17. doctor_invitations    (FK → profiles)
18. access_audit_log      (FK → profiles, patients)
19. active_sessions       (FK → profiles)
```

**Nota sobre FK circular appointments ↔ consultations:**
`appointments.consultation_id → consultations.id` y `consultations.appointment_id → appointments.id`
forman un ciclo. Solución recomendada:

1. Crear `appointments` sin la columna `consultation_id` (o sin la FK constraint).
2. Crear `consultations` con FK → `appointments`.
3. `ALTER TABLE appointments ADD COLUMN consultation_id uuid; ALTER TABLE appointments ADD CONSTRAINT ...`.

---

## Resumen de campos PHI por tabla

| Tabla           | Columnas PHI (ciphertext AES-256-GCM)       | Hash de búsqueda                                                   |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `patients`      | `full_name`, `cedula`, `phone`, `email`     | `full_name_search_hash`, `cedula_search_hash`, `email_search_hash` |
| `ehr_records`   | `diagnosis`, `treatment_plan`               | —                                                                  |
| `consultations` | `chief_complaint`, `diagnosis`, `treatment` | —                                                                  |
| `prescriptions` | `medication`, `dosage`                      | —                                                                  |

**Política de enmascaramiento:** en endpoints de lista, el backend retorna `***` en campos PHI.
El endpoint `/reveal` descifra el campo solicitado y registra en `access_audit_log`.

**Nota sobre columnas `*_search_hash`:** `email_search_hash`, `cedula_search_hash` y
`full_name_search_hash` son columnas internas calculadas y escritas por el backend. NO forman
parte del contrato Zod de `@delta/shared-types` y no se exponen en la API pública.

---

## Correcciones post-review (2026-06-02)

Correcciones aplicadas a la migración inicial `20260602000000-initial-schema.cjs` (en sitio,
BD Docker desechable). No se creó migración de parche.

### A. Bug índice de email cifrado (CRÍTICO)

**Hallazgo:** el índice `patients_doctor_email_uq` indexaba `LOWER(TRIM(email))` pero `email`
almacena ciphertext AES-256-GCM con nonce aleatorio por operación. El índice nunca detectaría
duplicados porque el mismo email en texto plano produce ciphertexts distintos cada vez.

**Corrección:**

- Añadida columna `email_search_hash VARCHAR(64) NULL` a `patients`.
- Reemplazado el índice por: `CREATE UNIQUE INDEX patients_doctor_email_uq ON patients(doctor_id, email_search_hash) WHERE email_search_hash IS NOT NULL;`
- Añadido `idx_patients_email_hash ON patients(email_search_hash)` para búsqueda.

### B. Índices FK faltantes

Toda columna que es FK debe tener un índice para evitar full scans en JOINs y operaciones ON DELETE.

| Índice añadido                     | Tabla                | Columna FK        |
| ---------------------------------- | -------------------- | ----------------- |
| `idx_appointments_consultation_id` | `appointments`       | `consultation_id` |
| `idx_appointments_auth_user_id`    | `appointments`       | `auth_user_id`    |
| `idx_appointments_package_id`      | `appointments`       | `package_id`      |
| `idx_reminders_queue_doctor`       | `reminders_queue`    | `doctor_id`       |
| `idx_reminders_queue_patient`      | `reminders_queue`    | `patient_id`      |
| `idx_doctor_invitations_doctor`    | `doctor_invitations` | `doctor_id`       |

### C. Precisión monetaria

Columnas `numeric` sin escala pueden almacenar valores con decimales arbitrarios, lo que
dificulta auditorías financieras y puede provocar errores de redondeo en reportes.

- `numeric(12,2)` para: `subscriptions.price_usd`, `appointments.plan_price`,
  `appointments.amount_bs`, `consultations.amount`, `patient_packages.purchased_amount_usd`,
  `pricing_plans.price_usd`, `plan_configs.price`.
- `numeric(10,4)` para: `appointments.bcv_rate` (tasa de cambio, requiere 4 decimales).

### D. profiles.email UNIQUE

Añadido `CREATE UNIQUE INDEX idx_profiles_email ON profiles(email)` para garantizar que
un email de usuario no se repita en la tabla `profiles`.

### E. Índices DESC via raw SQL

`Sequelize.addIndex` no soporta dirección DESC por columna individual. Los siguientes índices
se implementan con `queryInterface.sequelize.query()` en SQL raw:

- `idx_consultations_doctor_date ON consultations(doctor_id, consultation_date DESC)`
- `idx_aal_actor ON access_audit_log(actor_id, created_at DESC)`
- `idx_aal_patient ON access_audit_log(patient_id, created_at DESC)`

### F. Índice redundante eliminado

`idx_active_sessions_token` eliminado: el constraint `UNIQUE` en `session_token` crea
automáticamente un índice B-tree implícito (`active_sessions_session_token_key`). Un segundo
índice sobre la misma columna desperdiciaría espacio y añadiría overhead en escrituras.

### G. consultations.consultation_code UNIQUE

Añadida constraint `consultations_consultation_code_key` (UNIQUE) en `consultation_code`.
El spec describe el código como "código único legible" — la constraint hace cumplir esto
a nivel de base de datos.

### H. prescriptions.updated_at

Añadida columna `updated_at TIMESTAMPTZ DEFAULT now()` para consistencia con las demás tablas
PHI (`patients`, `consultations`, `ehr_records`) que sí tienen `updated_at`.

### I. Generador UUID unificado

Todos los defaults de PK ahora usan `gen_random_uuid()` (pgcrypto). Las tablas
`subscriptions` y `reminders_settings` usaban `uuid_generate_v4()` (uuid-ossp).
Ambas extensiones se mantienen en `CREATE EXTENSION IF NOT EXISTS` para compatibilidad.

### J. Comentarios de seguridad (sin cambio de schema)

- Columnas desnormalizadas de `appointments` (`patient_name`, `patient_phone`, `patient_email`,
  `patient_cedula`): comentario explicando que son snapshots en **texto plano** del momento del
  booking, que coinciden con el schema real de Supabase, y que su cifrado se difiere a Fase 4
  (cifrado a nivel de campo). El whitelist de `access_audit_log.field_revealed` se ampliará en
  esa fase.
- `consultations.blocks_snapshot`: comentario de advertencia PHI — puede contener texto libre
  con diagnóstico u otros datos PHI (D-12). Evaluar cifrado del jsonb antes de producción.
