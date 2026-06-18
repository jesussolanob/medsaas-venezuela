# 07b — Mega Guion de Pruebas (QA) · Parte B (resto + regresión + cierre)

> Continuación de [`07-qa-test-script.md`](./07-qa-test-script.md) (encabezado, harness de
> BD y módulos core). Aquí: EHR, prescripciones, finanzas, booking, paquetes,
> suscripción/billing, compartir documentos, recordatorios, mensajes, CRM/leads,
> invitaciones, Google Calendar, MPPS, admin, portal paciente, IA, casos de regresión y
> checklist de cierre. Mismas convenciones (envelope `{success,data}`, camelCase,
> `doctorId=user.sub`, harness BD de la Parte A, NUNCA imprimir PII).

## C) Guion por módulo (resto)

### 8. EHR (ehr_records)

Página: `/doctor/ehr`. BFF/backend: `/api/ehr`, `/api/ehr/:id`, `/api/ehr/patient/:patientId`.
Tabla `ehr_records` (diagnosis/treatment_plan CIFRADOS; FK doctor/patient/consultation).

| Caso   | Precondición        | Pasos front                                                 | Esperado UI               | Verificación BD                                                                                                                                | RBAC                     | Edge                     |
| ------ | ------------------- | ----------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------ |
| EHR-01 | Paciente del doctor | `/doctor/ehr` → crear registro (diagnóstico/plan) → Guardar | Toast "Historia guardada" | `SELECT length(diagnosis), length(treatment_plan) FROM ehr_records WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → cifrados (len alto). | ParseUUIDPipe; ownership | patientId inválido → 400 |
| EHR-02 | Registro existe     | Editar                                                      | Toast OK                  | Misma fila, columnas actualizadas; no duplica.                                                                                                 | ownership                | —                        |
| EHR-03 | Doctor B            | GET `/api/ehr/patient/:patientId` de A                      | 404                       | Sin fuga.                                                                                                                                      | Anti-IDOR                | —                        |

### 9. Prescripciones / Recetas (prescriptions)

BFF/backend: `/api/prescriptions`, `/:id`, `/patient/:patientId`. Tabla `prescriptions`
(medication/dosage CIFRADOS — col es `medication`, NO `medication_name`).

| Caso  | Precondición        | Pasos front                                            | Esperado UI                | Verificación BD                                                                                                                | RBAC                                 | Edge                   |
| ----- | ------------------- | ------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ---------------------- |
| RX-01 | Paciente del doctor | Emitir receta (medicamento+dosis+frecuencia) → Guardar | Toast "Receta emitida"     | `SELECT length(medication), length(dosage) FROM prescriptions WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → cifrados. | create valida ownership del paciente | medication vacío → 400 |
| RX-02 | Receta existe       | Ver receta del paciente                                | Datos descifrados al dueño | medication sigue cifrado en BD.                                                                                                | ownership                            | —                      |
| RX-03 | Doctor B            | GET receta de paciente de A                            | 404                        | Sin fuga.                                                                                                                      | Anti-IDOR                            | —                      |

### 10. Finanzas (financial_transactions + income_concepts + payments)

Páginas: `/doctor/finances`, `/doctor/cobros`, `/doctor/billing`. BFF:
`/api/doctor/finances` (summary), `/finances/income`, `/finances/expense`,
`/finances/transactions`, `/finances/income-concepts`, `/finances/transactions/[id]`.
Tablas: `financial_transactions` (type income/expense CHECK, amount DECIMAL(12,2),
currency, related_consultation_id, concept_id, transaction_date), `income_concepts`
(doctor-scoped), `payments`+`payment_items` (fuente de verdad financiera),
`consultation_payments` (secundario).

| Caso   | Precondición       | Pasos front                                             | Esperado UI                  | Verificación BD                                                                                                                                      | RBAC              | Edge                 |
| ------ | ------------------ | ------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------- |
| FIN-01 | Doctor             | `/doctor/finances` → Registrar ingreso (monto+concepto) | Toast "Ingreso registrado"   | `SELECT type, amount, concept_id FROM financial_transactions WHERE doctor_id=:d ORDER BY transaction_date DESC LIMIT 1` → `type='income'`, amount>0. | doctorId=user.sub | amount ≤0 → 400      |
| FIN-02 | Doctor             | Registrar gasto                                         | Toast "Gasto registrado"     | Fila `type='expense'`. Summary `net` refleja (puede ser negativo).                                                                                   | doctorId=user.sub | —                    |
| FIN-03 | Doctor             | Crear concepto de ingreso editable                      | Aparece en el selector       | `SELECT * FROM income_concepts WHERE doctor_id=:d ORDER BY 1 DESC LIMIT 1` → fila nueva; UNA sola.                                                   | doctorId=user.sub | duplicado → manejar  |
| FIN-04 | Transacción existe | Eliminar transacción                                    | Sale de la lista             | Fila borrada; summary recalcula; no quedan items huérfanos.                                                                                          | ownership         | cross-doctor → 404   |
| FIN-05 | Doctor             | `/doctor/finances?month=YYYY-MM` (summary)              | Tarjetas ingresos/gastos/net | Summary = consultas aprobadas + transacciones del mes.                                                                                               | ownership         | month inválido → 400 |
| FIN-06 | Cita con pago      | `/doctor/cobros` → aprobar pago                         | Badge "Aprobado"             | `payments.status='approved'` y `consultations.payment_status='approved'` sincronizados (transacción).                                                | ownership         | —                    |
| FIN-07 | Pago aprobado      | Agregar line-item al pago                               | Total recalculado            | `payment_items` nueva fila; `payments.total` y `appointments.plan_price` recalculados.                                                               | ownership         | —                    |
| FIN-08 | Doctor B           | GET `/api/finances/transactions` de A                   | Solo ve las suyas            | Ninguna fila de A.                                                                                                                                   | Anti-IDOR         | —                    |

### 11. Booking público (sin auth) ⚠️ regresión "planes inventados"

Páginas: `/book/[doctorId]`. BFF: `/api/book`. Backend: `/api/booking/:doctorId/info`,
`/plans`, `/slots?date=`, `/packages?email=`, `POST /api/booking`. Tablas:
`appointments`, `patients` (find-or-create cifrado), `patient_packages`, `payments`.

| Caso    | Precondición                             | Pasos front                         | Esperado UI                                     | Verificación BD                                                                                                                            | RBAC / seguridad                  | Edge                         |
| ------- | ---------------------------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------- |
| BOOK-01 | Doctor activo CON planes show_in_booking | Abrir `/book/[doctorId]`            | Lista de planes reales del doctor               | `GET /api/booking/:doctorId/plans` = filas `pricing_plans` con `show_in_booking=true`. **REGRESIÓN**: NUNCA mostrar planes inventados.     | público                           | —                            |
| BOOK-02 | Doctor SIN planes en booking             | Abrir `/book/[doctorId]`            | Estado vacío / sin planes (NO planes ficticios) | `plans` = `[]`. La UI no debe fabricar planes.                                                                                             | público                           | —                            |
| BOOK-03 | Doctor activo con horario                | Elegir fecha → ver slots            | Slots disponibles del día                       | `slots` derivados de offices ACTIVOS + horario + bloqueos + horizonte. Ocupados marcados `available:false`.                                | público                           | día sin atención → sin slots |
| BOOK-04 | Slot libre                               | Completar datos + reservar          | Confirmación "Cita reservada"                   | `appointments` nueva fila (status scheduled); `patients` find-or-create (PII cifrada); `payments` fila pending; respuesta SIN `patientId`. | público; no fuga PII en respuesta | datos inválidos → 400        |
| BOOK-05 | Paciente con paquete (por email)         | Reservar usando saldo de paquete    | "Sesión consumida"                              | `patient_packages.used_sessions` +1 (optimistic lock, sin doble consumo); `appointments.package_id` seteado.                               | público                           | sin saldo → error            |
| BOOK-06 | doctorId inexistente/inactivo            | Abrir `/book/[malId]`               | 404 (anti-enumeración)                          | No revela existencia.                                                                                                                      | anti-enumeración                  | —                            |
| BOOK-07 | Slot recién tomado                       | Dos reservas simultáneas mismo slot | La 2ª falla "Horario ocupado"                   | Solo 1 cita; índice/transacción atómica evita doble booking.                                                                               | —                                 | —                            |

### 12. Paquetes de paciente (patient_packages)

BFF/backend: `/api/doctor/patient-packages`, `/api/packages`, `/patient/:patientId`,
`POST /api/packages`. Tabla `patient_packages` (total_sessions, used_sessions, status
active/completed CHECK, purchased_amount_usd).

| Caso   | Precondición                  | Pasos front                               | Esperado UI            | Verificación BD                                                                                                                                                  | RBAC      | Edge                         |
| ------ | ----------------------------- | ----------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------- |
| PKG-01 | Paciente del doctor           | Crear paquete prepagado (N sesiones)      | Toast "Paquete creado" | `SELECT total_sessions, used_sessions, status FROM patient_packages WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → `used_sessions=0`, `status='active'`. | ownership | total ≤0 → 400               |
| PKG-02 | Paquete con 1 sesión restante | Consumir última sesión (vía booking/cita) | "Paquete completado"   | `used_sessions=total_sessions`, `status='completed'`; sin sobre-consumo.                                                                                         | —         | sin saldo → error            |
| PKG-03 | Doctor B                      | GET paquetes de paciente de A             | 404                    | Sin fuga.                                                                                                                                                        | Anti-IDOR | ParseUUIDPipe inválido → 400 |

### 13. Suscripción / Planes paramétricos (plan_configs + plan_features + plan_prices)

Páginas doctor: `/doctor/upgrade`, `/doctor/subscription` (estado). Admin:
`/admin/plans`, `/admin/plan-features`. BFF: `/api/doctor/subscription`,
`/api/doctor/features`, `/api/plans?role=doctor`, `/api/admin/plans*`. Tablas:
`plan_configs`, `plan_features`, `plan_prices`, `subscriptions`, `subscription_changes_log`.

| Caso   | Precondición              | Pasos front                                                 | Esperado UI                                                        | Verificación BD                                                                                      | RBAC                     | Edge       |
| ------ | ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------ | ---------- |
| SUB-01 | Doctor con plan           | `/doctor/subscription`                                      | Banner según `bannerLevel` (suspended/critical≤3d/warning≤7d/none) | `subscriptions.status`/`current_period_end` consistentes con el banner.                              | ownership                | —          |
| SUB-02 | Doctor                    | `/doctor/upgrade` muestra planes públicos                   | Planes/precios activos, sin flags internos                         | `/api/plans?role=doctor` = `plan_configs` activos + `plan_prices` activos. NO expone flags internos. | público                  | —          |
| SUB-03 | super_admin               | `/admin/plans` → toggle `is_active` de un plan              | Switch persiste                                                    | `plan_configs.is_active` cambió; `/api/plans` público refleja.                                       | super_admin (RolesGuard) | doctor→403 |
| SUB-04 | super_admin               | `/admin/plan-features` → toggle feature (ej `ai_assistant`) | Switch persiste                                                    | `plan_features` upsert (plan,feature_key,enabled); Redis `features:{plan}` invalidado.               | super_admin              | —          |
| SUB-05 | super_admin               | `/admin/plans/:planKey/prices` → set precios por período    | Toast OK                                                           | `plan_prices` filas monthly/quarterly/semiannual/annual (transaccional).                             | super_admin              | —          |
| SUB-06 | Doctor plan Plus → expira | Login tras expirar                                          | Acceso degradado a Free, datos intactos                            | `/api/doctor/features` v2: downgrade perezoso; Free permanente no pierde datos.                      | —                        | —          |

### 14. Billing / pagos de suscripción + facturas (admin)

Páginas: `/admin/subscriptions`, `/admin/aprobaciones`/`/admin/approvals`,
`/doctor/billing`. BFF/backend: `/api/admin/subscription-payments` (+approve/reject),
`/api/admin/invoices` (+`/:id/paid`), `/api/doctor/billing`. Tablas: `subscription_payments`,
`subscriptions`, `subscription_changes_log`, `invoices`, `billing_documents`.

| Caso    | Precondición                  | Pasos front                                | Esperado UI              | Verificación BD                                                                                                                                                                                    | RBAC              | Edge                 |
| ------- | ----------------------------- | ------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------- |
| BILL-01 | Pago de suscripción `pending` | `/admin/aprobaciones` → Aprobar            | Toast "Pago aprobado"    | TRANSACCIONAL: `subscription_payments.status='approved'` + `subscriptions.current_period_end` extendido (max(now,exp)+duration) + `profiles` snapshot active + fila en `subscription_changes_log`. | super_admin       | ya resuelto → 422    |
| BILL-02 | Pago `pending`                | Rechazar (motivo)                          | Toast "Pago rechazado"   | `status='rejected'`; fila en `subscription_changes_log`.                                                                                                                                           | super_admin       | id inexistente → 404 |
| BILL-03 | super_admin                   | `/admin` → crear factura para doctor       | Toast con número FAC-... | `invoices` fila, número `FAC-YYYYMMDD-XXXX`.                                                                                                                                                       | super_admin       | —                    |
| BILL-04 | Factura existe                | Marcar pagada                              | Badge "Pagada"           | `invoices` marcada paid (idempotente).                                                                                                                                                             | super_admin       | id inexistente → 404 |
| BILL-05 | Doctor                        | `/doctor/billing` → crear documento fiscal | Toast con número         | `billing_documents` fila, número `<TYPE>-YYYYMMDD-XXXX`; respuesta NO incluye `patient_id` (anti-PII).                                                                                             | doctorId=user.sub | —                    |
| BILL-06 | Doctor B                      | GET `/api/doctor/billing` de A             | Solo los suyos           | Ninguna fila de A.                                                                                                                                                                                 | Anti-IDOR         | —                    |

### 15. Compartir documentos (#12) ⚠️ regresión param + localhost

Páginas: `/documents/[token]` (público). BFF: `/api/consultations/[id]/share`,
`/api/documents/[token]/verify-code`, `/download`, `/request-code`. Tablas:
`shared_document_links` (token, sections JSONB, status active/revoked),
`document_access_codes` (code 6 dígitos, failed_attempts, used_at, expires_at).

| Caso   | Precondición                 | Pasos front                                                 | Esperado UI                                  | Verificación BD                                                                                                                                                                             | RBAC / seguridad                          | Edge                           |
| ------ | ---------------------------- | ----------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| DOC-01 | Consulta del doctor          | Detalle consulta → "Compartir" → elegir secciones → Generar | Muestra URL + código 6 dígitos               | `shared_document_links` fila nueva (token 48 bytes, sections jsonb, status active); `document_access_codes` 1 código. Email fire-and-forget.                                                | doctor; ≥1 sección true                   | 0 secciones → 400              |
| DOC-02 | Enlace generado              | Inspeccionar la URL devuelta                                | URL apunta al dominio prod, **NO localhost** | **REGRESIÓN**: `APP_BASE_URL`/`FRONTEND_URL` deben estar seteados en prod; fallback es `http://localhost:3000`. Validar que la URL = `https://delta-frontend-...run.app/documents/<token>`. | —                                         | env faltante → localhost (BUG) |
| DOC-03 | Paciente con enlace + código | `/documents/[token]` → ingresar código → Verificar          | Acceso concedido; muestra secciones          | `document_access_codes.used_at` seteado; devuelve `sessionToken` (HMAC, 15min).                                                                                                             | pública; todos los errores → 422 genérico | código erróneo → 422           |
| DOC-04 | Sesión verificada            | Pulsar "Descargar PDF"                                      | **Descarga un PDF** (no error)               | **REGRESIÓN**: el front llama `?sessionToken=...` (NO `?session=...`). `Content-Type: application/pdf`, `Cache-Control: no-store`.                                                          | valida HMAC sin DB                        | sessionToken faltante → 400    |
| DOC-05 | Código incorrecto x5         | Ingresar 5 códigos malos                                    | Bloqueado tras 5 intentos                    | `document_access_codes.failed_attempts >= 5`; verificación bloqueada.                                                                                                                       | anti-bruteforce                           | —                              |
| DOC-06 | Enlace existe                | Pedir nuevo código (`request-code`)                         | "Código reenviado"                           | Nuevo `document_access_codes` (invalida el anterior); email reenviado.                                                                                                                      | pública                                   | —                              |
| DOC-07 | Token inexistente            | Abrir `/documents/<random>`                                 | 404 genérico                                 | Sin fuga (anti-enumeración). NUNCA loguear code/token/PHI.                                                                                                                                  | anti-enumeración                          | —                              |

### 16. Recordatorios (reminders)

Doctor: `/doctor/reminders` (settings + envío manual wa.me/mailto). Admin:
`/admin/reminders` (monitor). BFF/backend: `/api/doctor/reminders/settings`, `/queue`,
`/api/admin/reminders/queue`. Tablas: `reminders_settings` (UNIQUE doctor_id),
`reminders_queue` (status pending/sent/failed/skipped/cancelled).

| Caso   | Precondición | Pasos front                                       | Esperado UI            | Verificación BD                                                                               | RBAC                             | Edge |
| ------ | ------------ | ------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- | ---- |
| REM-01 | Doctor       | `/doctor/reminders` → settings (7d/24h) → Guardar | Toast OK               | `reminders_settings` upsert (1 fila por doctor; UNIQUE).                                      | doctorId=user.sub                | —    |
| REM-02 | super_admin  | `/admin/reminders` monitor                        | Cola con `doctor_name` | `/api/admin/reminders/queue` enriquece con doctor_name; **NUNCA** descifra patient.full_name. | super_admin; NO PII de pacientes | —    |

### 17. Mensajes (patient_messages)

Doctor: `/doctor/messages`. Paciente: `/patient/messages`. BFF/backend:
`/api/patient/messages` (GET/POST direction patient_to_doctor). Tabla `patient_messages`
(direction CHECK patient_to_doctor/doctor_to_patient).

| Caso   | Precondición          | Pasos front                          | Esperado UI        | Verificación BD                                                                           | RBAC                   | Edge               |
| ------ | --------------------- | ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------- | ---------------------- | ------------------ |
| MSG-01 | Paciente con relación | `/patient/messages` → enviar mensaje | Mensaje en el hilo | `patient_messages` fila `direction='patient_to_doctor'`; valida relación paciente-doctor. | scope por auth_user_id | sin relación → 403 |
| MSG-02 | Doctor                | Responder al paciente                | Mensaje en el hilo | fila `direction='doctor_to_patient'`.                                                     | ownership              | —                  |

### 18. CRM / Leads (leads)

Página: `/doctor/crm`. BFF: `/api/doctor/...` (leads). Tabla `leads` (name, channel,
stage CHECK new/contacted/qualified/appointment/converted/lost, status hot/cold/client/archived).

| Caso   | Precondición | Pasos front                  | Esperado UI         | Verificación BD                                                                                      | RBAC              | Edge                       |
| ------ | ------------ | ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- | ----------------- | -------------------------- |
| CRM-01 | Doctor       | `/doctor/crm` → Nuevo lead   | Toast "Lead creado" | `SELECT name, stage FROM leads WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → `stage='new'`. | doctorId=user.sub | stage inválido → CHECK 400 |
| CRM-02 | Lead existe  | Mover de etapa (drag/select) | Columna actualizada | `leads.stage` actualizado; `leads_stage_check` permite el valor.                                     | ownership         | —                          |
| CRM-03 | Doctor B     | Ver/editar lead de A         | 404                 | Sin fuga.                                                                                            | Anti-IDOR         | —                          |

### 19. Integración Google Calendar (google_integrations)

BFF: `/api/integrations/google/auth` (inicio OAuth, cookie `state` CSRF),
`/callback`, `/sync`, `/status`, DELETE. Tabla `google_integrations` (tokens cifrados).

| Caso    | Precondición      | Pasos front                          | Esperado UI                         | Verificación BD                                                | RBAC / seguridad  | Edge                   |
| ------- | ----------------- | ------------------------------------ | ----------------------------------- | -------------------------------------------------------------- | ----------------- | ---------------------- |
| GCAL-01 | Doctor sin Google | `/doctor/settings` → Conectar Google | Redirige OAuth → vuelve "Conectado" | `google_integrations` fila con tokens CIFRADOS (no plaintext). | cookie state CSRF | state mismatch → error |
| GCAL-02 | Doctor con Google | Crear cita online                    | Link de Meet en la cita             | `appointments.meet_link`/`google_calendar_event_id` no nulos.  | ownership         | —                      |
| GCAL-03 | Doctor con Google | Desconectar                          | "Desconectado"                      | Fila eliminada/invalidada; nuevas citas → fallback `.ics`.     | ownership         | —                      |

### 20. Verificación de credenciales / MPPS (admin)

Páginas: `/admin/verifications`, `/doctor/registration` flow. BFF/backend:
`/api/doctor/registration`, `/api/admin/doctor-verifications` (+`/:id` PUT,
`/verify-mpps`, `/credentials`). Tablas: `profiles.verification_status`,
`credential_verifications`, `credential_verifiers`.

| Caso    | Precondición   | Pasos front                                      | Esperado UI            | Verificación BD                                                         | RBAC        | Edge                            |
| ------- | -------------- | ------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------- | ----------- | ------------------------------- |
| MPPS-01 | Doctor nuevo   | `/doctor/registration` → enviar MPPS/colegiado   | "Verificación enviada" | `profiles.verification_status='pending'`; email a super_admins.         | doctor      | —                               |
| MPPS-02 | Doctor pending | `/admin/verifications` → Aprobar                 | Badge "Verificado"     | `verification_status='verified'`, `verified_at`/`verified_by` seteados. | super_admin | —                               |
| MPPS-03 | Doctor pending | `/admin/verifications` → "Verificar MPPS" (SACS) | Resultado async        | `credential_verifications` fila con resultado (por cédula, no MPPS).    | super_admin | cert TLS SACS vencido → manejar |

### 21. Panel Admin (dashboard, doctors, stats, settings/tasa)

Páginas: `/admin`, `/admin/doctors`, `/admin/patients`, `/admin/roles`,
`/admin/settings`, `/admin/finanzas`. BFF/backend: `/api/admin/dashboard`,
`/api/admin/doctors*`, `/api/admin/patients`, `/api/admin/settings*`,
`/api/admin/role-capabilities`, `/api/admin/doctors/export`. Tablas: `profiles`,
`subscriptions`, `app_settings` (key/value, ej tasa), `role_capabilities`.

| Caso   | Precondición | Pasos front                                        | Esperado UI                                           | Verificación BD                                                                                   | RBAC                           | Edge       |
| ------ | ------------ | -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| ADM-01 | super_admin  | `/admin` dashboard                                 | KPIs (médicos, citas 30d, pacientes, subs por vencer) | Counts coinciden con BD (sin PII de pacientes). Redis cache 300.                                  | super_admin (RolesGuard clase) | doctor→403 |
| ADM-02 | super_admin  | `/admin/doctors` con filtros activity/subscription | Lista filtrada                                        | filtro inválido → 400.                                                                            | super_admin                    | —          |
| ADM-03 | super_admin  | Editar suscripción de un doctor                    | Toast OK                                              | `subscriptions` actualizada (Zod) + cache invalidada.                                             | super_admin                    | —          |
| ADM-04 | super_admin  | `/admin/settings` → set tasa USD→Bs (manual)       | Toast "Tasa actualizada"                              | `app_settings` key tasa actualizada; Redis invalidado; `/api/settings/usdt-rate` público refleja. | super_admin (POST en finances) | doctor→403 |
| ADM-05 | super_admin  | `/admin/patients` stats                            | Solo counts globales                                  | Sin PII de pacientes en la respuesta.                                                             | super_admin; NUNCA PII         | —          |
| ADM-06 | super_admin  | `/admin/roles` → toggle capability                 | Switch persiste, aplica sin re-login                  | `role_capabilities` upsert ON CONFLICT; Redis `capabilities:{role}` invalidado.                   | super_admin                    | —          |
| ADM-07 | super_admin  | `/admin/doctors/export` (CSV)                      | Descarga CSV                                          | `text/csv` attachment; estado Activo/Frío/Inactivo según `last_sign_in_at`.                       | super_admin                    | —          |

### 22. Portal del paciente (rol patient)

Páginas: `/patient/dashboard`, `/patient/appointments`, `/patient/packages`,
`/patient/prescriptions`, `/patient/messages`, `/patient/profile`. BFF/backend:
`/api/patient/*`. Scope SIEMPRE por `auth_user_id = user.sub`.

| Caso  | Precondición      | Pasos front                        | Esperado UI                 | Verificación BD                                                 | RBAC               | Edge                     |
| ----- | ----------------- | ---------------------------------- | --------------------------- | --------------------------------------------------------------- | ------------------ | ------------------------ |
| PP-01 | Paciente logueado | `/patient/dashboard`               | Próxima cita + paquetes     | Datos scopeados por `auth_user_id`; no ve los de otro paciente. | scope auth_user_id | sin citas → estado vacío |
| PP-02 | Paciente          | `/patient/prescriptions`           | Recetas descifradas propias | medication cifrado en BD; descifra solo al dueño.               | scope auth_user_id | —                        |
| PP-03 | Paciente B        | Forzar id de paciente A en request | 404/403                     | Sin fuga de A.                                                  | Anti-IDOR          | —                        |

### 23. IA — Transcripción / asistente (ai-transcription)

BFF: `/api/doctor/consultations/transcribe` (proxy delgado). Backend: `/api/ai/transcribe`.
Tabla `ai_request_log` (sin PHI). Gating FAIL-CLOSED de `ai_transcription`.

| Caso  | Precondición                          | Pasos front                            | Esperado UI                          | Verificación BD                                                       | RBAC / seguridad                             | Edge |
| ----- | ------------------------------------- | -------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------- | ---- |
| AI-01 | Doctor con feature `ai_transcription` | Grabar audio en consulta → Transcribir | Muestra transcript + sugerencias     | `ai_request_log` fila SIN PHI; respuesta `{transcript, suggestions}`. | gating por plan; GEMINI_API_KEY solo backend | —    |
| AI-02 | Doctor SIN la feature                 | Intentar transcribir                   | Candado / "No disponible en tu plan" | Gating FAIL-CLOSED (super_admin bypassa).                             | gating                                       | —    |

---

## D) Casos de regresión específicos (NO deben repetirse)

> Sección destacada. Correr ENTERA antes de cada release. Referencian bugs reales.

| Reg-id | Bug original                                                                                                                                                                                                                | Caso ligado | Verificación rápida                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REG-01 | Crear cita rompía por SQL `ANY` vs `IN` en `hasOverlap` (syntax error) — ✅ corregido (commit `57ede68`)                                                                                                                    | AGENDA-01   | Crear cita real → 200 y fila en `appointments`. El repo usa `status IN (:activeStatuses)` (correcto). Crear 2 citas consecutivas para ejercitar el overlap.      |
| REG-02 | Descargar documento daba 401 — el **controller del backend** leía `@Query('session')` pero el front envía `?sessionToken=` → llegaba vacío. ✅ corregido (commit `5bc730c`): controller ahora usa `@Query('sessionToken')`. | DOC-04      | `GET /api/documents/[token]/download?sessionToken=...` → 200 `application/pdf`. Verificado en prod (1510 bytes).                                                 |
| REG-03 | Enlace compartido contenía `localhost` — el backend no tenía `APP_BASE_URL` en prod. ✅ corregido (commit `5bc730c`): `deploy.yml` setea `APP_BASE_URL=$FURL` en delta-backend.                                             | DOC-02      | URL devuelta por `/share` empieza con `https://delta-frontend-...run.app/documents/`. Fallback en código sigue siendo `http://localhost:3000` si faltara el env. |
| REG-04 | Onboarding se repetía en cada login                                                                                                                                                                                         | AUTH-03/04  | `profiles.onboarding_completed=true` tras completar; 2º login NO muestra onboarding.                                                                             |
| REG-05 | Booking mostraba planes inventados sin planes del doctor                                                                                                                                                                    | BOOK-01/02  | Doctor sin `pricing_plans` con `show_in_booking=true` → `plans=[]` y UI sin planes ficticios.                                                                    |

### Verificación BD sugerida para REG-01 (sin PII)

```sql
-- cita creada correctamente (no imprimir snapshots de paciente)
SELECT id, scheduled_at, status, duration_minutes, created_at
  FROM appointments
 WHERE doctor_id = :doctorId
 ORDER BY created_at DESC LIMIT 3;
-- huérfanos: que no queden consultas sin cita ni citas sin doctor
SELECT count(*) FROM consultations c
  LEFT JOIN appointments a ON a.id = c.appointment_id
 WHERE c.appointment_id IS NOT NULL AND a.id IS NULL;
```

### Verificación BD sugerida para REG-05

```sql
SELECT count(*) AS planes_booking
  FROM pricing_plans
 WHERE doctor_id = :doctorId AND show_in_booking = true AND is_active = true;
-- si 0 → la respuesta de /booking/:doctorId/plans DEBE ser []
```

---

## E) Checklist de cierre por release

- [ ] `pnpm nx build backend` y `pnpm nx build frontend` verdes.
- [ ] `pnpm nx lint backend` y `lint frontend` verdes (0 errores; recordar `no-floating-promises`, `no-explicit-any`).
- [ ] `pnpm nx test backend` con EXIT 0 (suite ~2000+ tests).
- [ ] Boot del dist: `node dist/apps/backend/main.js` arranca sin throw.
- [ ] Migraciones aplicadas en prod (`SELECT name FROM "SequelizeMeta" ORDER BY name DESC LIMIT 5;`) — última = la del release.
- [ ] curl real de endpoints clave (vía BFF en prod o dist local): `/api/health` ok; crear cita; compartir+descargar documento.
- [ ] RBAC: doctor→403 en endpoints admin; doctor B no ve datos de doctor A (anti-IDOR) en al menos 3 módulos.
- [ ] PII: listas enmascaradas; `/reveal` escribió en `access_audit_log`; ningún log con PII en claro.
- [ ] Env de prod presentes: `APP_BASE_URL`/`FRONTEND_URL` (REG-03), `GEMINI_API_KEY` (Secret Manager), `AUTH_RESOLVE_SECRET`, `DB_PASSWORD`.
- [ ] Sección D (regresión) corrida ENTERA y PASA.
- [ ] QA visual del usuario cubrió cada módulo de la Parte A y B (marcar PASA/FALLA por módulo).
- [ ] Sentry sin nuevos errores tras el deploy (back + front).

---

> Mantener este guion vivo: cuando aparezca un bug de prod, agregar una fila a la
> **Sección D** y un caso al módulo correspondiente para que el qa-agent lo cubra siempre.
