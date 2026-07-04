# 08 — QA Lote DELTA (tester, 2026-07-03)

> Segundo lote de QA del tester sobre plan **delta_base** (marcoviajes11 en prod).
> Estado: `TODO` | `INVESTIGANDO` | `FIX` | `VERIFICADO-LOCAL` | `DEPLOYED`.
> Ojo: algunos pueden estar YA resueltos por el deploy del lote anterior (commits
> 6fa58aa + 29a9cc6) — verificar antes de re-arreglar.

## ESTADO (2026-07-03) — Fases 1 y 2 DESPLEGADAS ✅

Commits en `feature/migracion-backend` (auto-deploy Cloud Run):

- **Fase 1** (6ac951d + 41e6cd9): ~22 bugs. Consulta (nombre real, estado persiste, generar
  informe, compartir email/wa, toasts), Pacientes (fecha -1d, race que borraba datos, Ver planes,
  abrir consulta), Agenda (borrar, copy Cita360, input semanas, slots bloqueados), Cobros
  pendientes (+fix UNION uuid/text), Finanzas (gráfico, timezone, +ingreso), Marketing (emojis),
  Link público (confirmar cita), **uploads arreglados en 3 módulos (causa: file-type ESM→magic bytes)**.
- **Fase 2** (2abba24 + 36d3e80 + 6564ea0): upload público real (guest, cierra 401 prod),
  parentesco (+migración 20260703000001), duplicado paciente 409, dropdown país LatAm (PhoneInput),
  costura filtro de pago agenda, widget "Por confirmar" en Inicio, registrar ingreso/cobros en Inicio,
  crear paciente (parentesco en form, datos no-demográficos opcionales, mensaje duplicado, pop-up
  "crear consulta" que no existía). Same-day auto-confirm VERIFICADO (ya cubierto).

### FASE 3 — EN CURSO

1. **Rediseño "Nueva consulta"** (`NewAppointmentFlow`) — ✅ HECHO (commit `63a3449`, sin pushear aún;
   queda a criterio del usuario desplegar tras QA visual). Monolito de 1363 líneas extraído a
   `useAppointmentFlow` + `steps/` + `appointment-flow.utils`. Nuevo orden paciente → consultorio →
   tipo (motivo opcional) → horario (slots reales del schedule + deshabilita ocupados/bloqueados) →
   pago (solo métodos activos del médico con sus datos + "Pagar después" = paymentMethod null →
   pago pending; wire real del comprobante). Firma de props y payload a `/api/book` sin cambios.
   **Bug pre-existente arreglado:** el submit enviaba `office_id` (snake) pero el BFF `/api/book`
   espera `officeId` (camel) → el consultorio NUNCA se vinculaba a la cita. Fixes de timezone
   (offset -04:00 explícito) y de gating (paquete = pago resuelto). Build verde; lint sin errores
   nuevos (el proyecto ya trae ~147 errores endémicos `react-hooks/set-state-in-effect`).
2. **"Solicitud al paciente" / Seguimiento con archivos** (feature nueva) — ✅ HECHO (commits
   `66b100b` backend + `01f0c1f` frontend; SIN pushear aún). Módulo NestJS DDD `patient-requests`
   (3 tablas, migración `20260703000002`, 7 use-cases, 7 rutas, template email `patient_request_code`,
   114 tests). El doctor crea una solicitud (título+descripción) para un paciente → email con código
   de 6 dígitos → portal público `/patient-requests/[token]` valida cédula+código (2FA oracle-safe) →
   sube adjuntos (storage PRIVADO + signed URLs; NO público) y/o responde → doctor ve respuesta +
   adjuntos. UI doctor en `/doctor/patient-requests` + botón "Solicitar docs" desde ficha del paciente.
   Verificado: build+lint+114 tests + **boot-test del dist** (DI OK, rutas mapeadas) + **migración
   corrida en la BD local** (3 tablas, template seed, CHECK/FK/índices OK). Review code+security
   aplicada (5 HIGH: oracle 404→422, audit log PHI, status 500/502, N+1). ⚠️ El backend dev en :3001
   está STALE (código viejo sin el módulo): reiniciarlo para QA visual local.

### QA LOCAL (Playwright + BD real) — HECHO ✅ (2026-07-03 noche)

Ciclo completo con navegador (dev-stub, doctor `dev@delta.local`) contra BD local:

- **patient-requests end-to-end VERIFICADO**: doctor crea solicitud → lista/toast →
  portal público valida cédula+código (código leído de BD, email stub) → muestra título+descripción
  (fix de metadata OK) → sube PDF (multipart + X-Session-Token) → submit → estado `Respondida` →
  doctor ve respuesta + adjunto con **signed URL** (X-Amz-Expires=3600). Seguridad probada: URL firmada
  200; **sin firma → 403** (privado). Estado en BD: fulfilled, content_type=application/pdf (detected).
- **Nueva consulta VERIFICADO**: nuevo orden (paciente→consultorio→tipo+motivo→horario→pago),
  tipos filtrados por consultorio, **slots reales del schedule** (días sin horario deshabilitados,
  franja 08:00–11:30 del consultorio, no los genéricos), "Pagar después" (paymentMethod null),
  y la cita **queda ligada al consultorio** (office_id) — verificado en BD.

**3 bugs encontrados y arreglados en el QA (commit `137f4b3`), que los unit tests no atrapaban:**

1. `office_id` NULL en la cita: el frontend mandaba `officeId` (fix previo del BFF) pero
   `CreateBookingUseCase` no lo pasaba a `Appointment.create()` → cableado + test de regresión.
2. `access_audit_log` de patient-requests fallaba en silencio: `field_revealed='patient_request_detail'`
   no estaba en el CHECK `access_audit_log_field_check` → migración `20260703000003` extiende el allowlist.
3. (menor) El create-patient por API exige `doctor_id` en el body aunque el backend lo sobreescribe
   del auth — observación, no bloqueante (el form real ya lo maneja).

**Nota de gating:** `/api/book` (endpoint interno y público) exige el feature `booking` del plan. El
`delta_base` LOCAL no lo tenía → 403 "Online booking is not available". En prod marcoviajes11 (delta_base)
sí crea citas, así que es artefacto del seed local (se habilitó temporalmente para el QA y se revirtió).
⚠️ Si en prod el alta interna de citas da 403 para delta_base, habilitar `booking` en ese plan.

### PENDIENTE Fase 3 (deploy + QA)

- **Push/deploy (ÚNICO pendiente)**: 6 commits sin pushear (`63a3449`, `66b100b`, `01f0c1f`, `137f4b3`
  - 2 de docs). Al hacer push, la rama auto-deploya a Cloud Run y corre las migraciones
    `20260703000002` (patient-requests) y `20260703000003` (audit-log allowlist) contra Cloud SQL.
    QA local ya PASÓ; queda la decisión del usuario de desplegar.
- Entorno local: servers apagados, `AUTH_MODE=auth0` restaurado, toggle local de `booking` revertido.
  Para re-QA local: `AUTH_MODE=dev` en ambos .env + reiniciar backend (dist nuevo) y `nx dev frontend`.

### DIFERIDO (no en Fase 3)

- Consultorio: múltiples bloques horarios por día (#8, cambio de schema + migración).
- Deuda: rate-limit propio del endpoint backend public-upload (hoy lo cubre el BFF + ingress interno);
  wa.me solo formatea VE (los demás países no arman link).

### PARA RETOMAR (próxima sesión) — arrancar Fase 3

**Prompt sugerido:** "Seguí con Fase 3 del lote QA delta; lee `memory-bank/08-qa-lote-delta-2026-07.md`
(secciones FASE 3 y PARA RETOMAR)."

**Cómo ejecutar (patrón que funcionó todo el lote):**

1. Lead escribe spec preciso → delega a `backend-agent`/`frontend-agent` (NO Docker durante edición) →
   verifica en disco (build+lint+test) + **boot-test del dist** (los cambios de DI/mapper rompieron el
   boot 3 veces y build/unit NO lo atrapan) + curl real → code-review + security-agent si toca
   PII/auth/portal público → commit por bloques → push (auto-deploy).
2. Empezar por **investigación/diseño** (los 2 agentes que se cancelaron): mapear `NewAppointmentFlow`
   y estudiar el módulo `document-sharing` para modelar `patient-requests`. Luego implementar.
3. Sub-dividir para no chocar archivos y checkpointear por bloque desplegable (no acumular 30 cambios).

**Reutilizables ya creados en este lote (para Fase 3):**

- `POST /api/storage/public-upload` (backend, sin auth, kind=receipt) + BFF
  `app/api/storage/public-upload/route.ts` (con rate-limit por IP) → usar para los adjuntos del portal.
- `components/ui/CountryCodeSelect.tsx` + `components/shared/PhoneInput.tsx`.
- Patrón del portal público con código por correo: módulo `document-sharing` (backend + portal).

**Estado del entorno local (al cerrar 2026-07-03):**

- `apps/frontend/.env` = `AUTH_MODE=auth0` (restaurado; para QA con cookies volver a `dev` y restaurar).
- Backend dev quedó corriendo en `:3001`; Docker (postgres/redis/minio) arriba. Migraciones al día
  (incl. 20260701 backfill-subscriptions y 20260703000001 parentesco).
- Usuarios de prueba LOCAL: FREE `doctor@test.com`, BASE `dev@delta.local` (default), PLUS
  `smokedocv2@dev.local`, ADMIN `admin@smoketest.local`. Impersonar por cookies `dev_user_id`/`dev_user_role`.
- **Prod:** `marcoviajes11@gmail.com` = doctor en `delta_base` (profiles + subscriptions consistentes).
  Cloud SQL `sodium-shard-499116-r3:us-east1:delta-db`, IP pública 34.139.94.60, redes autorizadas en
  `0.0.0.0/0` (⚠️ cerrar a tu IP y rotar el password `delta` tras el QA — quedaron expuestos en chat).

## Clasificación: 🐛 bug · ✨ feature · 🎨 decisión de producto · ♻️ posible ya-arreglado

### MÓDULO INICIO

- [ ] ✨ Listado de consultas por confirmar (widget dashboard)
- [ ] ✨ Botón "registrar pago" → permitir registrar ingreso + consultas pendientes
- [ ] 🐛🎨 Crear paciente: validar duplicado · datos no-demográficos opcionales · nuevo campo "parentesco" del contacto de emergencia
- [ ] 🐛 Al crear paciente, pop-up de crear consulta: botón "crear" no funciona (solo "más tarde")
- [ ] ♻️ Consulta creada por médico / mismo día → debe nacer confirmada (auto-confirm ya implementado; VERIFICAR "mismo día")

### MÓDULO AGENDA

- [ ] 🎨 Prefijo de país editable + dropdown de países
- [ ] 🐛 Bloque de semana: no deja el input en blanco para escribir un número completo
- [ ] ♻️ No permite borrar la consulta (delete ya implementado; VERIFICAR path)
- [ ] 🐛 Detalle de consulta redirige a "Cita 360" (feature eliminada)
- [x] 🎨 Nueva consulta: reorden (paciente → consultorio → consulta asociada al consultorio → horario → método de pago) — commit 63a3449 (logo actual)
- [x] 🎨 Método de pago: botón "pagar después" + mostrar solo métodos activados por el médico con sus datos — 63a3449
- [x] 🐛 No debe mostrar horarios bloqueados — 63a3449 (slots reales del schedule, deshabilita ocupados/bloqueados)
- [ ] 🐛 Filtros (agendadas/confirmadas, pagado/pendiente) no actualizan el calendario

### MÓDULO PACIENTES

- [ ] 🐛 Guarda la fecha de nacimiento -1 día (timezone)
- [ ] 🐛♻️ No guarda dirección / datos médicos / contacto de emergencia (VERIFICAR vs fix de edición del lote previo — puede ser el flujo de CREAR)
- [ ] 🐛 Desde historial de consulta: poder iniciar la consulta o abrir el detalle
- [ ] 🐛 Historial médico: cambiar botón "Generar resumen" → "Ver planes"
- [x] ✨ Seguimiento "pedir algo al paciente" + cargar archivos → feature nueva patient-requests (portal + código por correo) — commits 66b100b + 01f0c1f

### MÓDULO CONSULTA

- [ ] 🐛 Botón "generar informe" dice "Compartir documentos disponible próximamente"
- [ ] 🐛 Compartir: email/WhatsApp dice "el paciente no tiene correo" cuando SÍ tiene
- [ ] 🐛 "Atendida" se desmarca al reingresar a la consulta
- [ ] 🎨 Cada notificación debe confirmarse con un toast
- [ ] 🐛 Muestra "Paciente" en vez del nombre del paciente

### MÓDULO CONSULTORIO

- [ ] 🐛 No se puede registrar más de un bloque de horarios por consultorio
- [ ] 🐛 Se pueden sobreescribir horarios (dos consultorios con el mismo horario)

### MÓDULO FINANZAS

- [ ] ✨ Falta botón "+ agregar ingreso" (como en gasto)
- [ ] 🐛 Gráfico de barras no se visualiza
- [ ] 🐛 Gastos registrados no se visualizan en el resumen

### MÓDULO COBROS

- [ ] 🐛 No trae el detalle de consultas pendientes (si las hay)

### MÓDULO MARKETING

- [ ] 🐛 Los emojis del mensaje no se ven (encoding)

### MÓDULO LINK PÚBLICO

- [ ] 🐛 No permite carga de imágenes
- [ ] 🐛 Confirmar cita no hace nada — Error "Validation failed" (endpoint booking público; distinto al del área doctor ya arreglado)

### MÓDULO CONFIGURACIÓN

- [ ] 🐛 No se pueden cargar imágenes
- [ ] 🎨 Prefijo de país estandarizado + editable

## Decisiones de producto (usuario, 2026-07-03)

- **Alcance: LOTE COMPLETO** — incluye las 2 features grandes: "solicitud al paciente"/seguimiento
  con archivos (portal + código por correo, modelado sobre document-sharing) y el rediseño de
  "Nueva consulta" (reorden paciente→consultorio→consulta→horario→pago + "pagar después" + solo
  métodos de pago activos del médico). Programa multi-sesión.
- **Prefijo de país:** componente compartido = dropdown LatAm (bandera + prefijo) + editable,
  default Venezuela +58. Usar en Agenda, Configuración y Pacientes.
- **Logo "nueva consulta":** usar el logo/branding actual por ahora (no bloquear por asset).

## Notas de ejecución

- Equipo de agentes (backend/frontend) + code-review/security en cambios sensibles. Lead conduce Playwright.
- Uploads de imágenes fallan en 3 módulos (link público, configuración, agenda nueva consulta) → probable causa común (storage/route handler). Investigar juntos.
- "Confirmar cita Validation failed" (público) huele al mismo patrón del DTO que exige campos server-derived en el body.
