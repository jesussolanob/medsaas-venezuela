# 05 — Progress Log

> Registro cronológico. Una entrada por fase/hito completado.

## 2026-07-11 — Lote QA "doctor real" (22 observaciones) — commits `c704b2f`+`e81889c`, DESPLEGADO ⏳ QA usuario

Origen: el usuario reportó 22 bugs encadenados de un recorrido real (crear paciente→cita→consultas→
finanzas→documentos→compartir) + 7 capturas en Escritorio. Diagnóstico con 5 Explore en paralelo; fixes
con backend-agent + 2 frontend-agent (sets de archivos disjuntos). Lead verificó en disco: tsc back+front
limpio, 60 tests afectados verdes, DI sin ciclos, migración idempotente. (Los agentes terminaron con
"Not logged in" al final pero dejaron los cambios; el build/lint lo corrió el lead — OJO: `nx lint` de todo
`src` **OOMea** en esta máquina; usar eslint/tsc sobre archivos cambiados con `--max-old-space-size`.)

- **Backend (`c704b2f`):** auto-crea consulta para TODA cita con paciente (panel + booking, no-fatal,
  idempotente por `consultationId`, `amount=plan_price`) → las "por confirmar" aparecen en Consultas.
  Finanzas "Por ingresar" usa `COALESCE(c.amount, a.plan_price)` (LEFT JOIN appointments) → deja de dar $0.
  Errores de horario de consultorio en español con nombre del día. `ZodValidationPipe` → primer error de campo.
  Mig `20260711000001`: catálogo bloques → **"Récipe"** + fijos enabled/orden. Ver ADR-021.
- **Frontend (`e81889c`):** PhoneInput no borra al exceder (muestra error); dashboard doble-modal
  (`preselectPatientId`) + gating de botones Finanzas en Free; candados sidebar Finanzas/Marketing; Consultas
  abre por `appointment_id` + badge "Por confirmar" + cierra editor al quitar `?open=` (volver por el menú);
  tab Récipe sin textarea duplicado; tab Reposo (diagnóstico precargado, "desde"=hoy, comentarios, descarga
  PDF directa); Informe usa estado vivo del editor; consultorios con PhoneInput + error en-modal + fix carga
  infinita (try/finally); plantillas 5 tipos + preview con `key` + nombres de PDF legibles; modales no cierran
  por backdrop. **QA guion:** sección **D-2026-07-11** (recorrido de doctor real + 22 casos mapeados).
- ⚠️ **Falta QA VISUAL del usuario** de los 22 casos. Ojo consultorio: PhoneInput es mobile-only (VE 10 díg.
  empezando en 4) → un **fijo** (212…) podría no guardar; decidir si se relaja para consultorios.

## 2026-07-10/11 — Batch QA (.txt DELTA BASE) DESPLEGADO + VERIFICADO en prod ✅

Sesión larga guiada por QA (14+ commits en `feature/migracion-backend`, todos desplegados, runs success).
Equipo de agentes (backend-agent/frontend-agent) + lead verifica en disco (build/tsc/tests) + deploy con
boot-test en Cloud Run. **Verificado en vivo con Playwright + Gmail** al final.

- **#24 Autoguardado entre bloques de consulta** (commit `6ed43f4`) — **VERIFICADO EN VIVO**: escribir bloque A →
  cambiar a B → volver a A conserva texto; ambos persisten en `consultations.blocks_snapshot` (JSONB de valores por
  block_key) tras recargar. Causa raíz: stale closure en el timer de autosave. `flushBlocksSave` lee `selectedRef.current`;
  flush en tab-change/unmount/volver.
- **#27 Motivo del booking → bloque Motivo** (frontend-only, `03bedc7`): el backend ya copiaba
  `appointment.chief_complaint`→`consultations.chief_complaint` al confirmar la cita, pero el editor de bloques leía solo
  `blocks_data`. `buildInitialBlocksData()` siembra las columnas legacy (chief_complaint/diagnosis/treatment/notes) en
  blocks_data cuando el snapshot no las trae (respeta vaciado intencional `''`).
- **#28 Generar Documento → 5 tipos con auto-detección** (`ed3a45e`): receta+indicaciones / paraclínicos / historia
  clínica / reposo / informe (sub-selector de bloques, default chief_complaint+history+diagnosis). Multi-select → **1 PDF
  consolidado branded** con separadores. Lógica factorizada en `app/doctor/consultations/consultation-documents.ts`
  (`computeAvailableDocTypes`, `buildConsolidatedContent`) — reusada por Compartir.
- **#29 Compartir = MISMO PDF branded que la descarga, EN VIVO** (backend `633b4a1`+`20468ef`, frontend `483ef16`). Ver
  ADR-020. Decisión usuario: mismo componente + datos frescos. El paciente descarga vía **ruta Next
  `/api/documents/[token]/pdf`** que pide `render-data` al backend y **renderiza server-side `MedicalDocumentPdf`
  (react-pdf `renderToBuffer`)** → idéntico al del doctor y refleja ediciones. Backend: endpoint
  `GET documents/:token/render-data` (valida sessionToken HMAC extraído a `SessionTokenValidatorService`; devuelve consulta
  EN VIVO + `consultationBlocks` key→label + logo/firma/matrícula + template informe con URLs firmadas + `docSelection` +
  `ehrRecords[]` del paciente); persiste selección del doctor (`doc_selection` JSONB, **mig `20260710000002`**; incluye
  `restContent` congelado del reposo). ShareDocumentsModal → 5 tipos. **VERIFICADO EN VIVO**: share → **correos llegaron
  a Gmail** (remitente "Delta Salud", código en asunto) → viewer valida cédula+código → **descarga PDF branded 762KB**.
- **#30 Detalles de pago editables en la consulta** (`4a57239`): método cambiable + referencia + comprobante (opcionales).
  Columnas `payment_reference`+`payment_receipt_url` (**mig `20260710000003`**), endpoint `PATCH :id/payment-details`
  (`UpdatePaymentDetailsUseCase`, editable aunque approved, semántica undefined=no-toca/null=limpia, anti-IDOR). Front:
  sección editable en panel de pago + upload kind=receipt + action `updateConsultationPaymentDetails`. **VERIFICADO EN
  VIVO**: método+referencia persisten tras recargar.
- **#31 "Pagar después" en link público** (frontend-only, `537fc2c`): el paciente confirma sin comprobante (pago
  pendiente); comprobante pasa a opcional; se muestran igual los datos de pago del especialista. ⚠️ NO verificado en vivo
  (booking de lucas deshabilitado).
- **#25 Ocultar horarios bloqueados en link público** (frontend-only, `d27be07`): los bloqueados (availability-blocks) se
  ocultan (antes tachados); ocupados siguen tachados; estado vacío si no queda ninguno. **Parte 2 (motivo requerido) ya
  estaba bien** (default `false`, OFF muestra motivo opcional). ⚠️ NO verificado en vivo (booking deshabilitado).
- **2 FIXES post-QA** (commits `6b85124` branding + `50ddc45` historia; run 29133432204 success, **re-verificados en vivo**):
  1. **Branding → "Delta Salud"**: `MedicalDocumentPdf` (header fallback + metadata `creator`), pdf-lib legacy, y strings
     de correo/calendario (factura, `.ics` PRODID + descripción evento). Plantillas email en BD ya migradas en #23.
     Verificado: el PDF descargado contiene "(Delta Salud)" y CERO "Delta Medical".
  2. **Historia clínica 422**: se habilitaba por nº de consultas pero su contenido es EHR → sin EHR daba PDF vacío 422.
     Ahora se habilita por presencia real de EHR (`patientEhrCount`, fetch `/api/ehr/patient/:id` en openConsultation, prop
     nueva a ambos modales) y el render-data trae el historial del PACIENTE (`ehrRepo.findByPatient` → `ehrRecords[]`, antes
     `findByConsultation`). Verificado: Historia clínica sale DESHABILITADA sin EHR. (Fix colateral: mocks de
     `IConsultationRepository` en specs de document-sharing necesitaban `updatePaymentDetails` por #30.)
- **Guion de QA** (`23f3696`): `memory-bank/07-qa-test-script.md` sección D-2026-07 con 51 casos + PEND-01..06.
- **Deuda menor:** dup de DocTypeCard/BlockSubSelector entre GenerateDocumentModal y ShareDocumentsModal.

## 2026-07-08 — MVP 7.7: Seguimiento del Paciente (shared_files) DESPLEGADO + doctor VERIFICADO en prod ✅

Módulo NUEVO completo (backend + doctor + portal paciente). Commits `238402d` (backend) + `406f6d4` (frontend).
CI runs 28966713894 (backend, **boot-verify OK**) + 28967270879 (frontend), ambos success. Equipo de agentes
(backend-agent + 2 frontend-agent en paralelo; lead verificó en disco + QA Playwright del lado doctor).

- **Qué es:** "Seguimiento del Paciente" (Shared Health Space) — el doctor y el paciente intercambian
  **tareas/instrucciones, comentarios y archivos**. Era Supabase (`lib/shared-files.ts` + tab stub), nunca migrado.
- **Backend — módulo `shared-files` (DDD):** tabla `shared_files` (**migración `20260708000001`**, aplicada por CI:
  doctor_id/patient_id/title/description/file_url[=path GCS]/file_type/file_size_bytes/category/status/created_by/
  parent_task_id/read_by_doctor/read_by_patient; CHECK constraints en los 3 enums; FK self en parent_task_id).
  9 use cases (doctor: create/list/update/delete/mark-read/unread-counts; paciente: create/list/mark-read).
  Repo con **signed URL fresca on read** (`STORAGE_PORT.getSignedUrl(path)` — mismo patrón que patient-requests/
  document-sharing; el archivo se sube antes a `/api/storage/upload` kind=document y se guarda el **path**).
  **Anti-IDOR:** doctor por `doctor_id=user.sub` (`findByIdAndDoctor`); paciente por `auth_user_id=user.sub` vía
  `patient-portal.findPatientsByAuthUserId`. Errores tipados (NotFound 404 anti-enumeración). **46 tests**, build OK,
  boot-verify en prod OK. Endpoints: `/api/doctor/shared-files` (GET?patientId/POST/:id PATCH·DELETE/mark-read/
  unread-counts) + `/api/patient/shared-files` (GET/POST/mark-read).
- **Frontend doctor** (tab Seguimiento de `patients/page.tsx`): cableado el stub — enviar tarea/instrucción,
  comentario, subir archivo (storage→filePath), editar, adjuntar/reemplazar, eliminar, marcar leído al abrir,
  feed real + **unread counts** (badge por paciente). BFF routes bajo `app/api/doctor/shared-files/`.
  **QA prod (Playwright): crear tarea → POST 200 → aparece en el feed con badges TÚ/PENDIENTE + editar/eliminar.** ✅
- **Frontend paciente** (`app/patient/seguimiento/page.tsx`, antes placeholder): UI real — feed de tareas/archivos
  del doctor, responder con comentario/archivo (upload storage), responder a una tarea (`parentTaskId`), marcar
  leído al montar. BFF `app/api/patient/shared-files/`. tsc 0. **NO QA-eado en vivo** (requiere login de paciente).
- **⚠️ Alcance / límites:** el **lado doctor funciona siempre** (registrar/enviar, independiente del paciente). El
  **paciente solo ve/responde vía el portal** y **solo si tiene cuenta** (auth_user_id linkeado); si no, los ítems
  quedan guardados hasta que se registre (el tab lo avisa). **NO hay notificación push/email** al paciente cuando el
  doctor manda algo (lo ve al entrar al portal) → depende del cron/notificaciones (pendiente). Portal del paciente
  sigue mayormente diferido; esta página quedó cableada.

## 2026-07-08 — MVP 7.x: múltiples bloques de horario por día por consultorio: DESPLEGADO + VERIFICADO en prod ✅

Commit **`ce8a5d8`** en `feature/migracion-backend`. CI run **28958976502 = success**. **Verificado con Playwright en prod.**
Equipo de agentes (backend-agent + frontend-agent en paralelo; lead verificó en disco: build/tests + tsc + lectura de lógica).

- **Requisito (usuario):** el doctor puede agregar **N bloques de horario por día** (botón "+ bloque"), **distinto por día**, cada
  bloque pertenece a un **consultorio**. **SIN solape en todo el horario del doctor**: ni dentro del mismo consultorio/día ni
  entre consultorios distintos (una sola persona). Ej: Lun Consultorio A 08-11 + A 15-18 ✅; pero B 08-11 el mismo lunes ❌.
- **HALLAZGO CLAVE (ahorró muchísimo):** el módulo `offices` YA tenía casi todo. El `schedule` vive en `doctor_offices`
  (JSONB `DayScheduleParams[]` = {day 0=Lun..6=Dom, enabled, start, end}) + `slot_duration` + `buffer_minutes`. El booking
  **ya genera slots desde los consultorios activos** (`get-available-slots.use-case`, NO desde `doctor_schedules` — este solo
  aporta `bookingHorizonWeeks`/`bookingMinLeadDays`). El anti-solape **cross-consultorio ya existía** (`OfficeScheduleConflictError`
  409). El JSONB y el DTO Zod (`z.array(DayScheduleSchema)`) **ya aceptaban varias entradas por día** — solo el código usaba
  `.find()` (primera). → **CERO migración, CERO tabla/DTO nuevo.** Solo lógica + editor.
- **Backend** (`offices` + `booking`): `office.entity.getEnabledSchedulesForDay(day)` = `.filter()` (todos los bloques del día;
  el viejo `getEnabledScheduleForDay` queda `@deprecated`). `get-available-slots` itera TODOS los bloques del día por consultorio
  (union por Set). `create/update-office`: nueva `assertNoSelfOverlap(schedule)` (dos bloques habilitados del mismo día se pisan →
  `OfficeInvalidScheduleError`) + `assertNoScheduleConflict` ahora compara contra TODOS los bloques del día de otros consultorios
  (antes solo el primero). **116 tests verdes** (office.entity/create/update/get-available-slots), build EXIT 0.
- **Frontend** (`app/doctor/offices/page.tsx`): editor reestructurado — por día: toggle on/off + lista de bloques (inputs time
  start/end + quitar) + **"+ Agregar bloque"**. Helpers: `toggleDay`/`addBlock`/`removeBlock`/`updateBlock`/`findOverlaps`/
  `summarizeSchedule`/`suggestNextStart|End`. **Validación de solape intra-día EN VIVO** (borde rojo + mensaje + alerta global;
  **Guardar deshabilitado** si `hasOverlaps||hasInvalidBlocks`). El resumen de la card agrupa por día ("Lun 08-11, 15-18"). El
  **409 cross-consultorio** del backend se surfacea como toast. tsc 0.
- **QA prod (Playwright):** "Agregar bloque" en Lun → 2 bloques (12 inputs time); al solaparlos (08-17 ambos) → alerta
  "Hay bloques que se solapan en el mismo día" + ambos bloques en rojo + **"Crear consultorio" deshabilitado**. ✅
- **✅ Deuda de ADR-016 CERRADA (2026-07-08, commit `f1ca146`):** se configuró **CORS en el bucket GCS**
  `delta-files-sodium-shard-499116-r3` (GET/HEAD desde deltasalud.app/www + Cloud Run) y `MedicalDocumentPdf.proxyGcsUrl()`
  devuelve la **URL directa** — react-pdf baja logo+firma directo de GCS (verificado en prod: 0 hits al proxy). El route
  `/api/storage/image-proxy` queda como **fallback** (re-activable descomentando 3 líneas en `proxyGcsUrl`).

## 2026-07-07/08 — Lote QA (gating, ficha, consultas, compartir, imágenes/PDF): DESPLEGADO + VERIFICADO en prod ✅

Commit **`77786bb`** en `feature/migracion-backend` (12 archivos, +620/−935). CI auto-deploy a Cloud Run
**run 28905468108 = success**. **QA con Playwright contra prod (12 checks LIVE ✅).** Todo frontend (BFF).

- **Gating de plan a nivel de PÁGINA** (`doctor/layout.tsx`): antes el candado era SOLO visual en el sidebar;
  entrar por URL directa o enlace cross-módulo saltaba el gate. Nuevo `PLAN_GATED_ROUTES` (ruta→feature) +
  `resolveGatedModuleKey()` + interstitial `PlanLockedNotice` que reemplaza el contenido si el plan efectivo
  no habilita el módulo (mientras `planFeatures===null` no bloquea, evita flash). **Verificado:** `/doctor/agenda`
  en Delta Free → "Sección no disponible en tu plan". Es enforcement de UX; el backend sigue siendo la puerta dura.
- **Refactor módulo consultas:** ELIMINADA `app/doctor/consultations/[id]/page.tsx` (redundante; su editor ya vivía
  inline en la lista). "Generar informe" **descarga el PDF directo** (`ConsultationInformePdfButton`, `<a>` blob) en
  vez de navegar a `[id]` (donde el estado no persistía → causaba "se desmarca"). `ShareDocumentsModal` (compartir por
  enlace+código, ADR-013) **movido a la carpeta padre y montado en la lista**, reemplazando el "Compartir" viejo que
  posteaba a `/api/doctor/share-pdf` (**stub 501 permanente**). Enlace "Ver ficha del paciente" (→ `?open=<id>`),
  enlace de Finanzas repunteado a `?open=id`. **Verificado 404 en `/doctor/consultations/[id]` + botones en prod.**
- **Selector de pago roto** del historial de la ficha (tab Historial Médico): mandaba `payment_status` snake_case por el
  update genérico (el backend espera camelCase y aprueba por `approve-payment` one-way) → se ignoraba. Era redundante con
  el badge de al lado y permitía transición inválida (aprobado→pendiente). **QUITADO** (queda badge read-only).
- **Ficha de paciente:** edad **siempre read-only** (`Edad (calculada)`, se deriva de `birth_date`; se sigue guardando
  `age` para histórico) — **verificado readOnly=true, value=33**. Sección "Solicitudes de documentos" en tab Seguimiento +
  **botón "Documentos (N)"** en el header que abre directo el `RequestDetailModal` con los adjuntos del paciente
  (**verificado: abre modal con Dashboard1.jpeg + Ver/Descargar**). Mensajes stub "Fase 5" → "Próximamente".
- **Compartir por WhatsApp:** `ShareDocumentsModal` gana botón "Enviar por WhatsApp" que arma el mensaje **CON enlace +
  código** (antes el flujo viejo mandaba texto sin nada). Recibe `patientPhone`/`patientName`/`doctorName`, normaliza VE.
- **Acceso a solicitudes:** ítem "Solicitudes" en el sidebar sección Consultorio (→ `/doctor/patient-requests`, sin
  moduleKey = siempre visible). **Verificado en sidebar.**
- **🖼️ Cluster de imágenes — CAUSAS RAÍZ (agente frontend, verificadas):**
  - **Preview roto al subir**: se concatenaba `?t=Date.now()` a la **signed URL v4 de GCS** → doble `?` rompe la firma
    → 403 → imagen rota. Peor: en avatar se **guardaba la URL rota en BD**. Fix: quitado el `?t=` (el path ya es único por
    timestamp en el nombre). Ahora se ve a la primera.
  - **Avatar muy acercado**: zoom inicial "cover" (`Math.max`) → cambiado a "contain" (`Math.min`) + `minZoom` dinámico.
  - **Logos ausentes en PDF**: causa = **CORS del bucket GCS**. `@react-pdf` usa `fetch()` (con preflight CORS) mientras
    un `<img>` no. Fix: **proxy BFF `GET /api/storage/image-proxy`** (server-side sin CORS, guard anti-SSRF: solo
    `https://storage.googleapis.com/`, `redirect:'error'`, `nosniff`). **Verificado en prod: 200 + image/jpeg + nosniff;
    URL no-GCS → 403.** ⚠️ **DEUDA INFRA:** la solución limpia es configurar **CORS en el bucket
    `delta-files-sodium-shard-499116-r3`** para `https://deltasalud.app` (`gsutil cors set`) y quitar el proxy.
- **Config:** toasts de guardado agregados (perfil/matrícula en settings + plantillas: guardar + aplicar a todos);
  **ocultas** la pestaña "Notificaciones" y la subsección "WhatsApp Business API" (Integraciones). **Verificado en prod.**
- **PENDIENTE:** **task 8 — múltiples bloques horarios**. `doctor_schedules` = 1 fila/doctor, 1 rango + 1 break (mismo para
  todos los días). El ejemplo del usuario (7-11 + 3-6) YA es posible via break; bloques arbitrarios/por-día → necesita
  cambio de modelo backend. Decisión del usuario pendiente: (a) exponer break como 2º bloque (UI) vs (b) rediseño backend.
- **Nota QA:** la cuenta `lucas@deltasalud.app` es **super_admin** (sus caps ocultan Pacientes/Consultas al entrar a
  `/doctor`) **y** Delta Free. Para QA con datos se usó otra cuenta **doctor** (con 3 pacientes). Token Auth0 de Playwright
  vence ~1h → re-login.
- **Seguimiento post-deploy:** (1) "Cambiar foto" en config "no hacía nada" = **caché del bundle** (hard-refresh lo
  resolvió; el flujo avatar/logo/firma se verificó OK en prod con Playwright). (2) **Fix de layout del header de la ficha**
  (commit aparte): con el botón nuevo "Documentos (N)" eran 4 botones en una fila `shrink-0` que ahogaban el nombre y lo
  partían ("Paci/ente"); se reestructuró el header en **2 filas** (avatar+datos / acciones con `flex-wrap`).

## 2026-06-24 — Lote MVP 7.x + cita-360: PUSHEADO y DESPLEGADO a prod ✅

- Los 7 commits del lote (7.1/7.9/7.8/7.3/7.10 + baja de cita-360 + docs) se **pushearon a `feature/migracion-backend`** (`595f778..89b8078`). La CI auto-deployó a Cloud Run (**run 28129239141, success**): aplicó la migración `20260623000000` (patient_id en financial_transactions) y el **backend booteó limpio** → el riesgo de DI (imports agregados en `finances.module.ts` por 7.9 + quitados de `appointments.module.ts` por cita-360) quedó **descartado en prod**. Frontend desplegado también.
- **Pendiente = solo QA visual** (no bloqueante, ya está vivo): descargas PDF (7.8/7.3), ingreso con/sin consulta + gráficas (7.9), cobro WhatsApp (7.10), landing sin paciente (7.1).
- **Sigue abierto:** 7.12 (decisión multi-clínica del usuario + migración de limpieza) — ver entrada siguiente.

## 2026-06-23 — 7.12 limpieza BD: auditoría hecha, DROP pendiente de decisión (PAUSA)

> Sesión pausada acá ("guarda todo y continuamos luego"). RETOMAR desde este punto.

- **7.12 mitad 1 ("ocultar ID de cita") = DESCARTADA** (usuario: dejar `appointment_code` visible).
- **7.12 mitad 2 ("eliminar campos marcados"):** se hizo **auditoría READ-ONLY** del esquema (agente general-purpose, análisis estático: migraciones vs modelos/SQL/frontend, grep snake+camelCase). Hallazgo: **el esquema está muy bien cableado**; los comentarios "legacy/redundant" del initial-schema son **falsos positivos** (esas columnas están vivas: `profiles.plan/subscription_status/subscription_expires_at` = lazy-downgrade; `patients.age` = CRUD; `*_search_hash` = búsqueda HMAC; `blocks_snapshot`, snapshots de cédula = "do not remove"). **NO dropear esas.**
- **Candidatos REALES a DROP (de 2 features nunca construidos), pendientes de QA window (migración destructiva, NO auto-deploy):**
  - 🟢 BAJO riesgo (cero refs en todo el repo): **tabla `active_sessions` completa** (sesión única era-Supabase, reemplazada por Auth0; sin modelo/repo/query → DROP TABLE) + **`doctor_invitations.max_uses` / `uses_count` / `expires_at`** (límite de usos del link de invitación, nunca implementado; la tabla y el resto de columnas se quedan).
  - 🟡 MEDIO = **decisión de producto pendiente del usuario:** `profiles.clinic_id` + `clinic_role`. Es el feature **multi-clínica** latente (una clínica/centro agrupa varios médicos, con un "admin de clínica"; plan "Clinic" $100 desactivado; tabla `clinics` NUNCA creada; campos solo plumbing model→entity→repo→DTO→zod, siempre `null`, cero lógica). **Pregunta abierta al usuario:** ¿Delta venderá a clínicas con varios médicos algún día, o es siempre por-médico individual? Si puede existir → conservar (cuestan nada). Si es definitivamente por-médico → dropear + limpiar la cadena DDD. **Recomendación del lead: conservar** (riesgo nulo; "Centro de Salud"/"Clínica General" ya son especialidades → cliente-clínica no descartado). El usuario quedó por responder esto antes de accionar la migración.
- **PRÓXIMO PASO al retomar:** (1) que el usuario resuelva multi-clínica (conservar vs dropear clinic_id/clinic_role); (2) escribir la migración `.cjs` de limpieza con lo aprobado (mínimo: active_sessions + 3 cols de doctor_invitations); (3) correrla en ventana de QA con Docker (destructiva). Detalle de la auditoría: agente afdb6129da8277e56.

## 2026-06-23 — Eliminada la feature "Cita 360°" (decisión del usuario)

- **Cita 360° ELIMINADA por completo** (no va, decisión del usuario). Era la vista integral/auditoría de una cita.
  - **Frontend:** borrado `apps/frontend/app/doctor/cita-360/` (page, `[id]`, `Cita360List`, `Cita360Client`) + quitado el link "Ver Cita 360°" del modal de detalle de agenda (`agenda/page.tsx`).
  - **Backend:** borrado el use-case `get-appointment-360.use-case.ts` (+spec) y el mapper `appointment-360.mapper.ts`; removido el endpoint **`GET /api/appointments/:id/detail`** y el método del controller; sacado `GetAppointment360UseCase` de los providers. Removidos los métodos de repo `findRescheduleChain`/`findChangeLogs` (+ `ChangeLogEntry`) y los imports cross-módulo de `AppointmentsModule` que solo usaba el 360 (**ConsultationsModule, FinancesModule, PatientsModule, DoctorSettingsModule** — grep confirmó cero consumidores no-360). Limpiadas las menciones en la guía del asistente de ayuda. **Se conservaron** exports usados por otros módulos (CONSULTATION_REPOSITORY → document-sharing; DOCTOR_PROFILE_REPOSITORY → help/document-sharing/ai-transcription).
  - **Cambio de DI:** AppointmentsModule imports 6→4 (quedan Sequelize + Offices + Integrations), providers 6→5, controller constructor 6→5. **Boot-safety verificada estáticamente** por el lead: cero referencias a los tokens removidos dentro de `appointments/`. build EXIT 0, tests 99/99 + booking 102/102. **Boot real del dist pendiente para la ventana de QA** (lección 06-22: build+unit no atrapan DI de bootstrap).
  - El `appointment_code` (código legible de la cita) **sigue visible** en agenda/cobros — decisión del usuario ("no pasa nada"). Esto cierra la parte "ocultar ID de cita" de 7.12 (DESCARTADA).

## 2026-06-23 — MVP 7.10: cobro por WhatsApp

- **7.10 ✅ (backend + frontend):** botón "Cobrar por WhatsApp" en `/doctor/cobros` (drawer de detalle, solo pagos `pending`). Abre `wa.me` del paciente con un mensaje pre-formateado: saludo + **monto USD + Bs** (tasa BCV) + referencia (`plan_name`/`appointment_code`) + **datos de pago del doctor** (Pago Móvil/transferencia/Zelle/Binance/POS formateados desde `paymentDetails`). **NO hay pasarela ni link de pago** (aclaración del usuario): el paciente paga manual. Reusa el helper `lib/phone-utils.ts` (`waLink`).
  - **Backend (chico):** `GET /api/finances/payments` ahora devuelve `patient_phone` (en el bloque `appointment`). `appointments.patient_phone` es **texto plano** (no cifrado); la agenda lo enmascara en presentación, cobros lo devuelve completo (necesario para wa.me, consistente con consultas). Owner-scoped, sin logging de PII. 372 tests, build EXIT 0. **Security APROBADO** (0 CRIT/HIGH; 1 MEDIUM = teléfono completo en lista vs endpoint dedicado+audit-log, deuda aceptada por precedente de consultas).
  - **Frontend:** `patient_phone` en el type `Payment`; carga `paymentMethods`/`paymentDetails` vía `getDoctorProfile()`; botón deshabilitado "Sin teléfono registrado" si no hay teléfono; toast si el número es inválido para VE; nota si el doctor no tiene métodos configurados. tsc + build EXIT 0.
  - **Shape real `paymentDetails`** = `Record<string, Record<string,string>>` por método: pago_movil `{bank,phone,id_number,holder}`, transferencia `{bank,account,account_type,id_number,holder}`, zelle `{email,holder,bank}`, binance `{binance_id,email}`, pos `{bank}`, cash_usd/cash_bs (solo presencia).
  - **Omitido (no pedido):** el "filtro estado consulta" del enunciado original (cobros filtra por estado de PAGO pending/approved, no de consulta).

## 2026-06-23 — MVP 7.3: export PDF de especialistas (admin) + patrón PDF reutilizable

- **7.3 ✅ (frontend):** estados Activo/Frío/Inactivo y export **CSV** ya existían. Se agregó: **export PDF tabular** del listado de especialistas (`/admin/doctors`) + **badge visual de vencimiento**.
  - `PdfDownloadButton` se hizo **genérico** (prop `document: React.ReactElement` en vez de atado a `MedicalDocumentPdf`) → reutilizable por 7.8 (documento médico) y 7.3 (reporte tabular). Pedido del usuario: "el mismo export reutilizable".
  - Nuevo `apps/frontend/components/pdf/SpecialistsReportPdf.tsx` (A4 landscape, marca teal, resumen de conteos, 9 columnas = mismas que el CSV, header repetido, semáforo de actividad, null-safe). Botón "Descargar PDF" junto al CSV en `UsersPanel.tsx`. Exporta el conjunto **filtrado** que ve el usuario (documentado inline).
  - **Badge de vencimiento** (`ExpiryBadge`): rojo si venció o ≤7d, ámbar ≤30d, normal si lejos, "—" si null. En desktop + mobile.
  - ⚠️ **LECCIÓN react-pdf + Next App Router (bug que el build NO atrapa):** NO pasar un componente-documento envuelto en `next/dynamic` como `document` de `PDFDownloadLink` — el reconciler de `@react-pdf` no resuelve `lazy`/`Suspense` → PDF vacío. **Patrón correcto:** el límite `dynamic ssr:false` rodea la COMPOSICIÓN completa (un módulo `'use client'` wrapper que importa ESTÁTICAMENTE `PdfDownloadButton` + el componente-documento y arma `<PdfDownloadButton document={<DocReal/>}/>`), y la página importa ESE wrapper con `dynamic ssr:false`. Wrappers: `SpecialistsPdfButton`, `ConsultationInformePdfButton`, `RecetaPdfButton`. **Esto también arregló el preview de plantillas de 7.8** (`TemplatePdfPreview`), que tenía el mismo bug y nunca renderizó bien. La verificación de runtime (descarga real con datos) queda para la ventana de QA visual del usuario.
  - tsc EXIT 0, nx build frontend EXIT 0.

## 2026-06-23 — MVP 7.8: render + export de PDF de documentos del doctor

- **7.8 ✅ (frontend, equipo de agentes):** El backend YA existía (tabla `doctor_templates` mig `20260605000001`, módulo `doctor-templates` con `GET /api/doctor/templates` + `PUT /api/doctor/templates/:type`, UI de config en `/doctor/templates`, `/api/storage/upload` MinIO/GCS). Lo que faltaba era el **render del PDF y el export** (el "preview" era un stub de JSON; sin botón de descarga). Decisión del usuario: **`@react-pdf/renderer` en el FRONTEND** (no el pdf-lib del backend, que queda para document-sharing/paciente).
  - **`@react-pdf/renderer@4.5.1`** (compat React 19). SIEMPRE en cliente vía `dynamic(..., {ssr:false})` — es sensible a SSR, importarlo en server component rompe el build.
  - Componente reutilizable **`apps/frontend/components/pdf/MedicalDocumentPdf.tsx`** (+ `PdfDownloadButton.tsx` wrapper, `TemplatePdfPreview.tsx` preview). Consume config de plantilla (header/footer/color/font/logo/firma) + perfil del doctor (matrícula `licenseNumber`) + datos del documento. **Este componente es el que reutiliza 7.3.**
  - Preview visual real (reemplaza el JSON stub) en `/doctor/templates` + botones "Descargar PDF" en informe de consulta (`consultations/[id]`) y receta (`consultations/page.tsx`).
  - **Gotcha resuelto:** la matrícula M.P.P.S. se leía en snake_case (`license_number`) pero `/api/doctor/profile` serializa en **camelCase** (`licenseNumber`) → quedaba siempre null. Se agregó `licenseNumber/logoUrl/signatureUrl` al tipo `BackendProfile`. Logo/firma del PDF salen de la **plantilla** (fallback a perfil).
  - Verificado: tsc EXIT 0, **next build EXIT 0 (132 páginas)**, code-review 0 CRIT/HIGH (buena calidad de diseño). El flujo legacy "Imprimir" (HTML + window.open) convive sin romperse.
  - **Follow-up opcional (fuera del pedido):** `sello` (stamp_url) y `font_size` (requieren columna + upload nuevos); migrar tabs `reposo`/`prescripciones(exámenes)` al botón nuevo; `PDFViewer` embebido no anda en Safari mobile (la descarga sí).

## 2026-06-23 — Retoma MVP 7.x: 7.1 Landing + 7.9 Finanzas cerradas

- **7.9 Finanzas ✅ (backend + frontend, equipo de agentes):** dos cosas: (a) **ingresos asociados a paciente** y (b) **gráfica fiel**.
  - **Backend** (`apps/backend/src/modules/finances/`, mig. `20260623000000-financial-transactions-patient-id.cjs`): columna `patient_id UUID NULL` en `financial_transactions` (FK→patients `ON DELETE SET NULL`, índice). Regla en `RecordIncomeUseCase`: si el ingreso trae `relatedConsultationId`, el `patientId` se DERIVA de la consulta (anti-IDOR, ignora el body); si no, se acepta `patientId` validando ownership; si la consulta no es del doctor → `RelatedResourceNotFoundError` 404 (no guarda FK colgante). Endpoint nuevo **`GET /api/finances/income-transactions?month=YYYY-MM&limit=200`** (owner-scoped, devuelve `patientName` descifrado solo en scope del doctor, decrypt en try/catch → null si corrupto, sin loguear PII). `UpdateTransaction` soporta `patientId`. Errores nuevos: `patient-not-owned`, `invalid-month-format`, `related-resource-not-found`. Límites centralizados (`INCOME_TX_DEFAULT_LIMIT/MAX_LIMIT=200`). 296 tests, build EXIT 0. Reviews code+security **0 CRIT/HIGH** (5 fixes aplicados).
  - **Frontend** (`app/doctor/finances/page.tsx` + `actions.ts`): acción `getManualIncomes()` cablea `manualIncomes` (antes `[]`). **Causa raíz del bug de la gráfica:** ambas gráficas sumaban solo `incomes` (pagos de consulta del `payments`), ignorando `manualIncomes` (`financial_transactions`). Fix: incluir los manuales en `chartData` (barras CSS, day/week/month), `reportChartData` (Recharts BarChart), KPI `totalIncome` y el CSV — **aditivos, sin doble conteo** (fuentes distintas). Modal de ingreso: selector "Asociar a" → consulta (paciente implícito, read-only) o paciente directo; precedencia consulta sobre paciente. Limpieza: se quitó un botón de editar **pre-existente roto** en la tabla de pagos (abría el modal de transacción con un ID de `payments`, no de `financial_transactions` → 404). tsc EXIT 0.
  - **Deuda documentada (fuera de scope 7.9):** `dangerouslySetInnerHTML` en notas clínicas (texto del propio doctor, bajo riesgo) y `pacientesUnicos` contado por nombre en reportes (falta `patient_id` en el endpoint de consultas de reportes).
- **7.1 Landing ✅:** La landing es `apps/frontend/public/landing.html` (HTML estático, CSS propio `--dh-*`, servida vía iframe por `app/page.tsx`) — NO React/Tailwind. Las secciones **"Cómo funciona"** (4 pasos, `#como-funciona`) y **"Especialidades"** (12, `#especialidades`) **ya existían**; el contador real de especialistas ya andaba (`GET /api/public/stats`). Único pendiente real = lo de paciente. Decisión del usuario: **OCULTAR, no remover** (el portal del paciente se desarrolla después). Se agregó un bloque `<style id="hide-patient-mvp">` (reversible) antes del `<nav>` que oculta con `display:none` las 6 referencias: link "Pacientes" del nav, los 3 botones `/patient/register` (hero "Soy paciente", "Para Pacientes" CTA "Crear mi cuenta", CTA banner "Soy paciente"), la sección `#pacientes` completa, y el link "Para pacientes" del footer. Sin build (HTML estático).
- **Pendientes del lote 7.x (aclarados con el usuario):** 7.8 plantillas PDF de informe = librería PDF de **React en el front** (decisión usuario). 7.10 cobro WhatsApp = enviar al WhatsApp del paciente la info de pago del doctor (transferencia/pago móvil) — **NO hay pasarela ni botón de pago**. 7.3 export PDF solo si estaba en alcance original (lo está: "export Excel/PDF"); usuario duda, CSV podría bastar. 7.9 = (a) `patient_id` en `financial_transactions` (ingreso no-consulta trazable a paciente) + (b) bug gráfica Reportería: usa solo `incomes` (pagos de consulta); `manualIncomes` siempre `[]` (`setManualIncomes([])`, "Pendiente endpoint Fase 5") → ingresos manuales nunca aparecen. **7.12 EN ESPERA de input del usuario** (qué `appointment_code` ocultar / qué columnas dropear; hoy no hay campos "marcados" en código).

## 2026-06-22 — Módulo de ayuda (chat IA por perfil) — DESPLEGADO

Chat de ayuda con IA disponible para los 3 perfiles (super_admin/doctor/patient). Read-only: guía sobre el uso de la app, NO ejecuta acciones. Equipo de agentes (3 redactores de manuales en paralelo → backend-agent → code-reviewer + security-agent → lead verifica/cablea/despliega). Commit `7eb97b4` en `feature/migracion-backend`.

- **Manuales** (base de conocimiento): 3 strings TS bundle-safe en `apps/backend/src/modules/help-assistant/guides/{super-admin(647 ln),specialist(459),patient(356)}-guide.content.ts`. Redactados leyendo páginas reales + memory-bank (labels reales en es-VE, reglas de negocio, flujos paso a paso, FAQ). Editar ahí para cambiar lo que sabe el chat.
- **Backend** módulo DDD `help-assistant` (sin BD ni persistencia): `POST /api/help/chat` (AppAuthGuard+RolesGuard super_admin/doctor/patient). Selecciona el manual por el **rol del CurrentUser** (server-side; el body NO elige guía). Reusa `GeminiTextAdapter` (`AI_TEXT_GENERATOR_PORT`) vía useFactory — sin importar AiTranscriptionModule. SIN gating por plan. Validación boundary (≤30 msgs, ≤4000 chars/msg RECHAZA, ≤24000 total, último=user). `buildHelpPrompt` sanitiza delimitadores/falsos turnos (anti prompt-injection). `HelpChatProviderError` 502, log sin PII. 52 tests verdes, build EXIT 0.
- **Frontend**: `HelpWidget` global en root `layout.tsx` (sobrevive navegación; resetea al cerrar; AbortController), botón `HelpButton` en topbars doctor/admin/patient, pub/sub `helpChatStore`, thin-proxy `/api/help/chat`. tsc EXIT 0.
- **Review** code + security: **0 CRITICAL/HIGH**. Hardening aplicado (logging internalDetail, rechazo explícito vs truncado, sanitización anti-inyección, +22 tests de controller, AbortController, aria-modal, aviso anti-PII).
- **Deploy ✅** (run 27990422906, 8m49s): backend booteó OK, frontend desplegado. Smoke test prod: `POST /api/help/chat` anónimo → 401 `No autenticado` (ruta+guard OK); ruta inexistente → 404. **Pendiente: QA visual del usuario** (chat real autenticado → ejercita la key Gemini en prod).
- ⚠️ Gemini free tier entrena con datos → el chat avisa "No ingreses datos de pacientes" (riesgo PII interino ya aceptado).

## 2026-06-22 — Sesión: super admin "todo configurable" (4 features) + key Gemini en prod

Prod: se subió la key personal de Gemini a Secret Manager (v2) y se forzó revisión backend → IA debería andar en prod (ver `ia-gemini-decision`). Luego, tanda de super admin (equipo de agentes: lead spec → backend/frontend-agent → review → lead verifica en disco). Commits en `feature/migracion-backend`:

- **Bloquear/desbloquear acceso de doctor (`9dbbc1b`)** — ban DURO de cuenta para super_admin, independiente de verification/subscription. Reusa `profiles.is_active` (sin migración). Enforcement en `AppAuthGuard` (choke point único, cubre dev+Auth0): si role≠super_admin y is_active=false → **403 `ACCOUNT_BLOCKED`** (super_admin nunca se bloquea, anti-lockout; fail-open si perfil no existe). Endpoint `PUT /api/admin/doctors/:id/access {is_active, reason?}` (reglas: no bloquear super_admin, no auto-bloqueo). Listado de verificaciones ahora expone `isActive`. Frontend: botón en `/admin/verifications` + pantalla global de cuenta bloqueada + logout (hook que intercepta fetch a /api/\* → 403 ACCOUNT_BLOCKED). **Security review APROBADO (0 CRIT/HIGH).**
- **Especialidades UI (`3516065`)** — antes solo POST/PUT admin (sin GET ni UI). Backend: `GET /api/admin/specialties` (lista todas, activas+inactivas) + repo `findAll`. Frontend: página `/admin/specialties` (crear/editar/activar) + sidebar.
- **App-settings genéricos (`4c379df`)** — el backend `GET/PUT /api/admin/settings` ya existía (filtra secrets, upsert de cualquier key). Frontend: editor key/value en `/admin/settings` (las keys de tasas en solo-lectura para no solapar con la UI de tasas).
- **Editor de plantillas de email (`8d21b5b`)** — antes los `email_templates` solo se editaban por migración/BD. Backend (módulo email): repo `findAll`+`update`, use-cases list/get/update, controller `admin/email-templates` (GET lista, GET :name, PUT :name; super_admin). NO crea/borra (set fijo). Frontend: `/admin/email-templates` (lista + editor subject/html/text + toggle, preview en iframe sandbox, variables {{..}} extraídas del contenido) + sidebar. Cubre recordatorios + invoice/welcome/payment/verification/shared-docs.
- **Fix de specs (`c35d7e2`, test-only)** — el gate de suite completa atrapó ~20 specs hermanos del módulo admin rotos por el nuevo `setProfileActive` en `IAdminRepository` + dependencia en AdminController + `isActive` en DoctorRegistration. Reparados (mocks/fixtures). **Suite backend completa: 325 suites, 2690 tests verde.** (Prod no afectado: la CI despliega sin correr tests.)
- **Fix de DI de deploy (`c186970`)** — los deploys fallaban en Cloud Run (container no booteaba) porque `ACCOUNT_STATUS_PORT` no estaba EXPORTADO en `InfraAuthModule`. Fix: exportarlo. **Lección:** cambios de DI/módulos/guards globales requieren boot REAL del dist (no solo build+unit). La CI despliega sin tests → solo el boot real descubre la colisión que los mocks no ven. Verificado: deploy post-fix bootea limpio.
- **Email send log (`20dafbf`)** — nueva feature de diagnóstico backend. Tabla `email_send_log` (migración `20260622000000-add-email-send-log`). Registra CADA correo enviado SIN PII: `recipient_type` ('patient'|'doctor'|'admin'|'system'), `recipient_id` (uuid, NO email), `template_name`, `status` (sent|failed), `provider` (resend|noop|sandbox), `provider_message_id`, `error_detail`, `created_at`. El logging vive en `MailerService.sendTemplate(name, to, data, recipient?)` (defensivo: si falla el log no rompe el envío). 7 callers reales: `share-consultation` + `request-new-code` (paciente), `complete-registration` (admins), `appointment-notification` (paciente), `approve-subscription-payment` + `send-invoice-email` + `send-reminder-email` (doctor). Verificado e2e: share → fila en log (patient / recipient_id / shared_documents_code / sent / resend msg id), 0 PII en tabla.

**Hallazgos de la auditoría del super admin (lo que YA era configurable, no se tocó):** planes+precios (`/admin/plans`), features-por-plan (toggles en `/admin/plans`), pagos de doctores (`/admin/aprobaciones` + `/admin/subscriptions` + invoices), verificación de credenciales (`/admin/verifications` + MPPS SACS), capacidades RBAC (`/admin/roles`), promociones (`/admin/promotions`), tasas USDT/BCV, admins, sugerencias. **Config de recordatorios por-doctor YA existe** (`GET/PUT /api/doctor/reminders/settings`: enable/canal/offsets 7d-24h-3h-1h/plantillas WhatsApp/quiet-hours); el admin solo ve la cola. El envío automático sigue DIFERIDO (sin cron; el "30 min antes" es por Google Calendar). Por eso la #4 se hizo como editor de plantillas de email (cubre recordatorios + todo).

## 2026-06-19 — Sesión: IA desbloqueada (local), estilo de emails, cédula obligatoria, guard de compartir

Stack local levantado (Docker Postgres/Redis/MinIO + backend NestJS :3001). Commits en `feature/migracion-backend`:

- **IA desbloqueada en LOCAL (commit `b6e4c2c`):** el bloqueo de Gemini NO era la región (Venezuela) sino la
  cuenta **Workspace `deltasalud.app`**, a la que Google le niega el free tier (403 "project denied access" en
  todo proyecto). Con una key de la **cuenta personal @gmail** (proyecto `970828866309`) funciona. QA local
  4/4: `improve_block`, `summarize_report`, `patient_history` y **`/api/ai/transcribe`** (audio→texto +
  sugerencias por bloques) → 200; gating doctor sin Plus → 403. Fix de fallback `gemini-1.5-flash`(404)→
  `gemini-flash-latest`. `.env` local con la key personal (gitignored). **PROD sigue con la key Workspace
  denegada en Secret Manager → 502 hasta poner la personal o migrar a Vertex** (plan del usuario; Vertex =
  no entrena con PII, ideal pacientes). Ver memoria `ia-gemini-decision`.
- **Estilo de emails (commit `3a01ef5`, mig. `20260619000000`):** 7 de 9 plantillas ya estaban en marca
  (teal `#0d9488`/slate). Restyle de las 2 fuera de estilo: `invoice` (azul Google `#1a73e8`) y
  `doctor_pending_verification` (gris sin wrapper) → estilo house. `down()` revierte; subject/text/vars intactos.
- **Cédula obligatoria para pacientes (commit `854c340`):** antes `nullable/optional`. Ahora requerida en
  `create-patient` y `create-booking` (shared-types); `update-patient` no-nullable (no se puede borrar);
  `create-appointment` refine (obligatoria solo si paciente nuevo, sin `patient_id`). Frontend: `required` +
  validación en PatientForm, doctor/patients (crear+editar), BookingClient (registro+invitado), NewAppointmentFlow
  (alta inline). El lado **doctor ya la exigía** (registro/onboarding/admin). Motivo: sin cédula un paciente
  nunca podía abrir un documento compartido. Verificado e2e: POST /api/patients sin cédula → 400, con → 201.
- **Guard de compartir sin cédula (commit `646c83e`):** `ShareConsultationUseCase` ahora falla con **422
  `PATIENT_CEDULA_REQUIRED_FOR_SHARING`** y mensaje accionable si el paciente no tiene cédula (cubre pacientes
  legacy con cédula NULL), en vez de dejar que el paciente choque con un 422 genérico en verify-code. El
  `ShareDocumentsModal` ya muestra el mensaje del backend. Verificado e2e (422 sin cédula, 201 con).
- **Descarga de documentos:** confirmado que **funciona** end-to-end (share→verify-code con cédula→PDF 200).
  El "no funciona" reportado era data de prueba (paciente sin cédula); raíz cerrada por los 2 cambios de arriba.
- **Verificación:** suite backend completa **2605 tests verdes** (+ nuevos en booking schema y share-consultation);
  frontend `tsc` 0 errores. ⚠️ Datos legacy: en local 12/22 pacientes con cédula NULL (en prod habrá similares;
  se backfillean al editarlos — el form ahora la exige).

## 2026-06-18 — Sesión: bug citas, compartir documentos #12, planes/gating, suscripción, IA texto

Commits en `feature/migracion-backend`:

- **Bug crítico de citas (commit `57ede68`):** `SequelizeAppointmentRepository.hasOverlap` usaba
  `status = ANY(:array)` (SQL inválido con `replacements` de Sequelize) → creaba cita/consulta rompía.
  Fix `ANY` → `IN (:activeStatuses)`. (Regresión REG-01 en el guion QA.)

- **#12 Compartir documentos (commits `7fe6c18`, `5bc730c`, `33958ea`, `4f1a081`):** módulo backend
  `document-sharing` + frontend `ShareDocumentsModal` (en consultas) y página pública `/documents/[token]`.
  El doctor genera enlace público + **código de 6 dígitos (48h)**; email Resend; PDF consolidado (pdf-lib).
  Fixes de la sesión: query param `?sessionToken=` (antes `?session=` → 401, REG-02); `APP_BASE_URL` en el
  backend (antes el enlace traía `localhost`, REG-03); y la descarga ahora **exige cédula + código** (match
  tolerante al prefijo V/E/P: `12345678` ≡ `V-12345678`; mismatch → 422 genérico anti-oracle).
  Endpoints: POST `/api/consultations/:id/share`, POST `/api/documents/:token/verify-code` (body `{code,cedula}`),
  GET `/api/documents/:token/download?sessionToken=`, POST `/api/documents/:token/request-code`.

- **alert() → toast (commit `f112f8b`):** 60 `alert()` nativos reemplazados por `showToast`
  (`@/components/ui/Toaster`) en 12 pantallas doctor + admin.

- **Planes / gating (commit `96f3d89`):** en `plan_configs` se desactivaron los 4 legacy
  (trial/basic/professional/clinic); activos solo **Delta Free / Base / Plus**. `subscriptions` vacía.
  **Delta Free** (plan_features) = solo `{dashboard, settings, patients, consultations}` (+ Consultorios/
  Plantillas sin moduleKey); deshabilitados agenda/billing/crm/ehr/finances/invitations/messages/reminders/
  reports/services. Base/Plus = todo; IA solo en Plus. **Feature `booking` nueva**: gatea `/book/:doctorId`
  (Free=off, Base/Plus=on). Backend: `GET /api/booking/:id/info` expone `bookingEnabled` (plan efectivo);
  `CreateBookingUseCase` lanza `BookingNotEnabledError` (403); puerto `IBookingFeatureChecker`. Front: settings
  oculta tab "Link público"/QR; `/book` muestra "Reservas no disponibles".

- **Suscripción (commits `713de54`, `4032c73`, `aee958e`):** (a) la pestaña cargaba infinito → el handler
  backend ahora envuelve `GET /api/doctor/subscription` en `{success,data}`; (b) panel correcto para **plan
  permanente** (Delta Free): resuelve plan efectivo + `state.is_permanent` → "Plan permanente / ∞ sin
  vencimiento" (sin "termina el null"); (c) botón "Mejorar mi plan" → `Link` a `/doctor/upgrade`; (d)
  `/doctor/upgrade` resalta el **plan actual** (badge "Plan actual", lee `effective_plan_key` de
  `/api/doctor/features`).

- **IA de texto reactivada (DESPLEGADA, commit `b25522b`):** 3 funciones de la era Supabase que estaban como
  stub 501: `improve_block` (gating `ai_assistant`), `summarize_report` (gating `ai_reports`), `patient_history`
  (gating `ai_assistant`, anti-IDOR). Backend `POST /api/ai/text` en el módulo `ai-transcription` (reusa Gemini
  adapter temp 0.3/maxOutput 2048, `ai_request_log`, resolución de plan efectivo + gating, prompts médicos
  legacy en español; super_admin bypasa). BFF `app/api/doctor/ai/route.ts` proxea (ya no es stub). 103 tests.
  🚨 **BLOQUEADO por Google:** la API key de Gemini da **403 "Your project has been denied access"**
  (gemini-2.5-flash) y el fallback gemini-1.5-flash da 404 (retirado) → toda IA (texto + transcripción) responde
  502 hasta que el usuario arregle el acceso a Gemini (otra cuenta/proyecto AI Studio, billing o región). NO es
  bug de código: gating verificado (502 provider-error, no 403 de plan). TODO menor: actualizar el modelo
  fallback a uno vigente en `gemini-text.adapter.ts`/`gemini-transcription.adapter.ts`.

- **QA (commits `f46e9bc`, `e7d0797`):** ver entrada siguiente — guion único de 23 módulos con metodología de
  2 agentes en paralelo; incluye los casos de regresión de esta sesión.

## 2026-06-18 — QA: mega guion de pruebas (docs)

- Creado `memory-bank/07-qa-test-script.md` (archivo ÚNICO, 23 módulos): harness BD prod +
  metodología obligatoria de **2 agentes en paralelo** (front-tester + verificador BD/logs que
  se retroalimentan) + guion por módulo (auth/onboarding, perfil, offices, servicios, agenda,
  consultas, pacientes, EHR, recetas, finanzas, booking, paquetes, suscripción/billing, compartir
  docs, recordatorios, mensajes, CRM, Google, MPPS, admin, portal paciente, IA) + regresión + cierre.
- Tablas/columnas verificadas contra migraciones reales; incluye casos de regresión
  (cita SQL `IN`/`ANY`, descarga `sessionToken`, enlace localhost, onboarding, planes booking) y
  el flujo cédula+código de descarga de documentos. (Se fusionó el antiguo `07b` en este archivo.)

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

## 2026-06-02 — Infraestructura local (Docker) — desbloqueada

- Docker instalado (Engine 29.5.2 + Compose v5.1.4). Homebrew en `/opt/homebrew`
  (Apple Silicon), fuera del PATH por defecto — prefijar como con pnpm.
- `docker/docker-compose.yml` levantado: Postgres 18.4 (`5432`) y Redis 7 (`6379`),
  ambos `healthy`. Extensiones `uuid-ossp` + `pgcrypto` aplicadas por `init.sql`.
- Subido a Postgres 18 (estable más reciente). OJO: PG18+ cambió la convención del
  data dir — el mount del volumen va en `/var/lib/postgresql` (no en `/data`).
- Sin tablas aún (esperado: el esquema lo crean las migraciones Sequelize en Fase 3).
- Redis responde `PONG` con auth (`redis_dev_password`, default del compose).
- **Bloqueante de Fase 3 (Docker) resuelto.** Listos para scaffold del backend NestJS.

## 2026-06-02 — Fase 3: scaffold base backend NestJS — completada (base)

- App `apps/backend` generada con `@nx/nest:application` (NestJS 11, jest, webpack).
- Estructura DDD 4 capas creada: `domain/` (errors), `application/` (use-cases,
  ports, dtos), `infrastructure/` (database, cache, auth, config), `presentation/`
  (controllers, guards, decorators, filters, interceptors, pipes).
- Piezas base: `DomainError` (clase base), `databaseConfig` (Sequelize, synchronize
  off), `RedisModule` (ioredis global, token `REDIS_CLIENT`), `DevAuthGuard`,
  `CurrentUser`/`Roles` decorators, `GlobalExceptionFilter`, `ZodValidationPipe`,
  `LoggingInterceptor` (no loguea bodies → PII), `HealthController`.
- `app.module.ts` cablea ConfigModule (envFilePath apps/backend/.env), SequelizeModule,
  RedisModule, filtro+interceptor globales. `main.ts`: prefijo `api`, CORS, puerto 3001.
- `.env` (gitignored) + `.env.example` creados.
- **Verificación ✓**: `nx build backend` compila; `GET /api/health` → 200
  `{status:ok, dependencies:{postgres:up, redis:up}}`; `nx test backend` 3/3 verdes.
- **Alias `@delta/shared-types` validado** desde el backend (spec del ZodValidationPipe
  importa enum + schema reales). Confirmado pendiente de Fase 2.
- Hallazgo: zod v4 `.uuid()` exige RFC estricto (versión `[1-8]`, variante `[89ab]`).
- Sin lint target en backend (coherente: eslint a CI, no en commits).
- Pendiente Fase 3 (próxima sesión): primer módulo de negocio (appointments) con endpoint funcional.

## 2026-06-02 — Fase 3 Unidad A: Migración inicial Sequelize — completada

- `sequelize-cli` instalado como devDep root (`pnpm add -D -w sequelize-cli@6.6.5`).
- Creados: `apps/backend/.sequelizerc` y `apps/backend/src/infrastructure/database/config.json`
  (dev → deltamedical local Docker; test → deltamedical_test; production → DATABASE_URL env var).
- Migración inicial creada en CommonJS (`.cjs`) en lugar de TypeScript. Motivo: `sequelize-cli`
  no soporta TS nativo sin `ts-node` con configuración especial en monorepos NX. CJS es más
  robusto y garantiza que la migración corre en verde.
- Migración `20260602000000-initial-schema.cjs` implementa exactamente el spec `03b-schema-real.md`:
  - 10 enums: user_role, subscription_plan, subscription_status, appointment_status,
    reminder_channel, reminder_offset, lead_source, lead_status, payment_method, payment_status.
  - 18 tablas en orden de dependencias FK: profiles, plan_configs, plan_features, subscriptions,
    patients, pricing_plans, leads, patient_packages, appointments (sin FK circular), consultations,
    ALTER TABLE appointments ADD consultation_id + FK, ehr_records, prescriptions, patient_messages,
    reminders_settings, reminders_queue, doctor_invitations, access_audit_log, active_sessions.
  - FK circular appointments<->consultations: appointments creada sin consultation_id; FK añadida
    con ALTER TABLE post consultations. Constraint: `fk_appointments_consultation_id`.
  - patient_packages.package_template_id: columna uuid nullable SIN FK formal (package_templates
    fuera del scope de 18 tablas).
  - Decisiones D-01 a D-17 aplicadas: leads.channel = TEXT, leads.stage = TEXT+CHECK,
    appointments.payment_method = TEXT, consultations.payment_status = TEXT+CHECK('pending','approved'),
    reminders_queue.patient_id -> profiles(id) (no patients.id), etc.
  - Bug encontrado y corregido: índice parcial `appointments_doctor_slot_uq` usaba `status::text IN (...)`
    en el WHERE predicate, lo que Postgres rechaza por no ser IMMUTABLE. Corregido comparando
    con valores del enum directamente: `status IN ('scheduled'::appointment_status, ...)`.
  - 61 índices totales (PKs, UNIQUEs, custom idx\_\*) + 5 CHECK constraints + 23 FK constraints.
  - down() revierte todo limpiamente (tablas en orden inverso + DROP TYPE).
- Targets NX añadidos a `apps/backend/project.json`: `migrate`, `migrate:undo`, `migrate:undo:all`,
  `migrate:status` (executor `nx:run-commands`, cwd `apps/backend`).
- Criterios de aceptación verificados:
  - [x] `pnpm nx run backend:migrate` → verde (migrated 0.074s).
  - [x] `\dt` → 18 tablas de negocio + SequelizeMeta = 19 filas.
  - [x] `\dT` → 10 tipos enum.
  - [x] `pnpm nx run backend:migrate:undo:all` → verde, BD sin tablas de negocio ni enums.
  - [x] Re-migrate → verde, BD vuelve a estado completo.
  - [x] `pnpm nx build backend` → webpack compiled successfully.
- Próxima sesión: primer módulo de negocio (appointments) con endpoint funcional.

### Decisión de monorepo: un solo package.json

- Eliminados los `package.json` redundantes de `libs/*` (eran vestigios del scaffold).
  NX detecta proyectos por `project.json`; los `@delta/*` resuelven por tsconfig paths,
  no por pnpm linking. `zod` movido al `package.json` raíz.
- `pnpm-workspace.yaml`: `packages` reducido a `apps/frontend` (única app legacy con
  package.json propio, se fusionará al root cuando se migre el frontend).
- Añadido `baseUrl: "."` a `tsconfig.base.json` (faltaba; TS5090 sin él).

## 2026-06-02 — Fase 3 Unidad B: módulo appointments — completada

- Implementado con **equipo de agentes** (Agent Teams): `implementer` (backend-agent)
  construyó → `reviewer` (code-reviewer) revisó y mandó hallazgos directo al implementer →
  implementer iteró → lead (orquestador) verificó y cerró. QA dedicado DIFERIDO al final
  por ahorro de tokens (decisión del usuario).
- Módulo en `apps/backend/src/modules/appointments/` (DDD 4 capas):
  - domain: entidad `Appointment` (transiciones canTransitionTo de los 5 canónicos;
    legacy pending/accepted terminales; canBeModifiedBy = ownership), 5 errores que
    extienden DomainError, `IAppointmentRepository` (token `APPOINTMENT_REPOSITORY`).
  - application: use cases CreateAppointment (duplicado ±15min, slot ocupado, optimistic
    lock de patient_packages.used_sessions), UpdateAppointmentStatus (transición+ownership+
    audit log), GetDoctorAgenda (paginada), GetAppointmentById.
  - infrastructure: `appointment.model.ts`, `appointment-changes-log.model.ts`,
    `SequelizeAppointmentRepository`, migración `20260602000001-appointment-changes-log.cjs`.
  - presentation: `appointments.controller.ts` (GET /, GET /:id, POST /, PUT /:id/status)
    con DevAuthGuard + ZodValidationPipe; masking de PII en `presentation/mappers/`.
- Tabla nueva `appointment_changes_log` (auditoría de cambios de estado): FK a appointments,
  índices en appointment_id y actor_id, down() limpio.
- DIFERIDO: GetDoctorSlots y Reschedule (requieren tabla doctor_schedule inexistente).
- Code review: 0 CRITICAL, 1 HIGH + 3 MEDIUM + 2 LOW — TODOS corregidos. Más relevantes:
  masking movido de use-case a presentation/mappers (HIGH); anti-IDOR en POST (doctor_id
  se sobreescribe con user.sub, no se confía en el body); fallo de optimistic lock lanza
  InsufficientSessionsError; `as never` → QueryTypes; `[Op.gte as unknown]` → WhereOptions.
- Verificación de cierre (lead): `nx build backend` ✓; `nx test backend` 68/68 en 9 suites;
  cobertura domain 100% / use-cases 95.5% / repo 71.9% / controller 100%;
  `GET /api/appointments` con headers x-dev-\* → 200 envelope; sin headers → 403.
- **FASE 3 COMPLETA** (scaffold + migración inicial + módulo de referencia appointments).
- Pendiente global: QA dedicado (cobertura+smoke formal) cuando el usuario lo indique;
  warning Redis NOAUTH al arrancar fuera del cwd raíz (revisar en QA, no afecta módulos).
- Próximo: Fase 4 (seguridad/identidad) o siguiente módulo de negocio según prioridad MVP.

## 2026-06-02 — libs/shared-crypto + módulo patients (con cifrado de PII) — completada

- **libs/shared-crypto**: encrypt/decrypt AES-256-GCM (IV aleatorio 12B, authTag, base64
  iv||ct||tag) + hashForSearch HMAC-SHA256 (normaliza: trim, lowercase, NFD+strip acentos,
  colapsa espacios) → 64 hex. 100% cobertura. Cero deps externas (módulo `crypto` de Node).
- **Módulo patients** (`apps/backend/src/modules/patients/`, DDD 4 capas):
  - Cifrado en el REPOSITORIO vía `CryptoService` inyectable (lee ENCRYPTION_KEY +
    ENCRYPTION_HMAC_SECRET de ConfigService; guard al boot que rechaza llaves triviales
    fuera de development). NO en hooks del modelo. Dominio siempre en plaintext.
  - Campos cifrados: full_name, cedula, phone, email. Hashes de búsqueda: full_name,
    cedula, email (los 3, VARCHAR(64)).
  - **Búsqueda híbrida** (decisión del usuario): lookup exacto por hash (cédula/email) +
    búsqueda parcial/orden descifrando in-app dentro del scope del doctor.
  - `/reveal` → plaintext + inserta 1 fila por campo PII en access_audit_log (4 filas).
  - Lista MÍNIMA (id, fullName, cedula, phone, email, source, createdAt) enmascarada;
    campos clínicos solo en detalle y reveal. Masking en presentation/mappers.
  - Anti-IDOR: doctor_id del actor (user.sub), nunca del body; doctor_id en el WHERE de
    findById/update/softDelete (acceso cross-doctor → not found). Ownership doble capa.
  - Soft delete: migración 20260602000002 (deleted_at) + Sequelize paranoid.
- **Gate de ESLint** configurado para el backend (eslint.config.mjs flat, no-explicit-any,
  no-floating-promises, no-console; target `lint` vía nx:run-commands). `nx lint backend` verde.
- Equipo de agentes: implementer → code-reviewer + security-agent (paralelo) → fixes → lead.
  Reviews: 0 CRITICAL; 2 HIGH (code) + 3 HIGH (security) + medios — TODOS corregidos.
  **El lead detectó que el implementer sobre-declaró**: 5 fixes (varios de seguridad) no
  estaban en la 1ª ronda; se exigió prueba por punto y se re-verificó en código.
- Verificación de cierre (lead, smoke real con perfil de doctor sembrado): POST 201 masked;
  anti-IDOR override OK; lista keys mínimas; cross-doctor 0; reveal plaintext + 4 audit;
  full_name cifrado en BD + hashes 64. `nx test backend` 131/131; lint verde; build verde.
- Hallazgo menor diferido: violaciones de FK (ej. doctor sin perfil) salen como 500 genérico
  — mejorable mapeándolas a 422 en GlobalExceptionFilter (no bloqueante; el doctor autenticado
  siempre existe en uso real). También: GlobalExceptionFilter no loguea el `.parent` de errores
  Sequelize (poco depurable) — mejora pendiente.
- Próximo: siguiente módulo (consultations / finances) o Fase 4, según prioridad.

## 2026-06-02 — CryptoModule global + módulo consultations — completada

- **CryptoService extraído a módulo global** `apps/backend/src/infrastructure/crypto/` (@Global,
  CryptoModule) reutilizable por consultations/ehr/prescriptions. patients actualizado a la nueva
  ruta; sus tests siguen verdes. Commit 3ba36d2.
- **Módulo consultations** (`apps/backend/src/modules/consultations/`, DDD): entidad Consultation
  (canBeModifiedBy, canApprovePayment), VO ConsultationCode (DLT-YYYYMM-XXXX), errores propios,
  repo con cifrado de chief_complaint/diagnosis/treatment/notes vía CryptoService global. Use cases:
  Create (código único con retry ante colisión), Update, ApprovePayment (pending→approved), GetById,
  GetPatientHistory (ownership), List (filtros). Controller con DevAuthGuard + Zod, doctor_id de
  user.sub. Migración 20260602000003 (payment_date). Commit 00e514c.
- Reconciliación: columna real `amount` (no payment_amount); consultation_code ya tenía UNIQUE.
- Equipo: implementer → code-reviewer + security-agent. security APROBADO (0 CRIT/HIGH).
  reviewer APROBADO C/CORRECCIONES: **2 HIGH** (race condition del consultation_code + Error genérico)
  - 3 MEDIUM + 4 LOW. **TODOS los aplicables corregidos (9 fixes)**: race condition real (save()
    captura UniqueConstraintError → ConsultationCodeConflictError → retry; agota → ConsultationCodeExhaustedError),
    ConsultationCodeExhaustedError, DTO legacy eliminado, payment_status validado, VO isValid/generate
    coherentes (≥4 dígitos), DecryptionError en decrypt, validación ISO de fechas, update/updatePayment
    en transacción, unique en el modelo.
- **Lección de proceso:** el implementer volvió a sub-entregar (procesó una directiva vieja de 3
  fixes en vez de la corregida de 9). El lead verificó el código por línea, detectó los 6 faltantes
  y, ante edición concurrente, convergió con el implementer; verificación final en disco confirmó los 9. 193 tests verdes, lint verde, build verde.
- Diferidos documentados: masking en lista (Etapa 1 OK, doctor ve solo las suyas); audit_log en GET
  (pre-prod); imports de CryptoService en application/ de patients (deuda preexistente).
- **Progreso módulos: 3/10 (patients, appointments, consultations).** Próximo: ehr-prescriptions.

## 2026-06-02 — Módulo ehr-prescriptions — completada

- Dos sub-módulos: `apps/backend/src/modules/ehr/` y `modules/prescriptions/` (DDD). Reusan
  CryptoModule global. EHR cifra diagnosis/treatment_plan; prescriptions cifra medication/dosage
  (nombres reales `medication`/`notes`, NO medication_name/instructions; patient_id nullable;
  issued_date mapeado de created_at). Commits fe6659d, 9f232ad, 888a113.
- **Bug crítico encontrado por el implementer y corregido:** `ConsultationsModule` tenía
  `Sequelize` en el array `providers`, lo que hacía **crashear el servidor compilado (dist)** —
  los 193 tests no lo atraparon porque usan el TestingModule, no el dist. El lead había saltado
  el boot-smoke del dist en consultations. **Lección incorporada: el smoke de boot del dist es
  obligatorio por módulo.** Ningún otro módulo tenía el patrón (verificado). Commit fe6659d.
- Reviews: security APROBADO (0 CRIT/HIGH, 2 MEDIUM, 1 LOW); reviewer APROBADO (2 MEDIUM, 3 LOW).
  7 fixes aplicados: anti-IDOR de ESCRITURA en create-prescription (valida ownership del paciente
  vía PatientRepository → PatientNotOwnedError/NOT_FOUND), ParseUUIDPipe en path params, mensajes
  genéricos en DecryptionError (ehr/prescriptions/consultations), códigos de error unificados a
  \*\_NOT_FOUND (anti-enumeración), `requireDecrypt` para medication (sin `?? ''`), tests faltantes.
- **Verificación de cierre del lead:** build + lint + 276 tests verdes + **boot del servidor real**
  (POST ehr/prescriptions/consultations 201, cifrado confirmado en BD ilegible, anti-IDOR override).
- **Lección de proceso recurrente:** el implementer sub-entrega en directivas multi-item
  (procesa el primer lote, omite el addendum). El lead verifica por línea y aplica los pocos
  faltantes él mismo cuando son triviales (más eficiente que otra ronda).
- Diferidos: GeneratePrescriptionPdf (req. tabla doctor_templates + lib PDF); acceso rol-paciente
  a recetas (→ módulo patient-portal).
- **Progreso módulos: 4/10.** Próximo: packages-booking.

## 2026-06-02 — Módulo packages-booking — completada

- `apps/backend/src/modules/packages/` (paquetes prepagados) + `modules/booking/` (booking PÚBLICO).
  Commits d10b88b, 928946a, c4d5b0d.
- Packages: PatientPackage entity, ConsumePackageSession con OPTIMISTIC LOCK, CreatePackage,
  GetPatientPackages. Booking público (sin DevAuthGuard): GET /booking/:doctorId/info|plans|packages,
  POST /booking (find-or-create paciente vía patients repo [cifra PII] + crea cita reusando
  appointments + consume paquete, en TRANSACCIÓN Sequelize atómica).
- **Bug crítico encontrado y corregido (también en appointments):** el check del optimistic lock
  `affected === 1` era SIEMPRE false — Sequelize+pg con `QueryTypes.RAW` devuelve `[rows, QueryResult]`
  y el `?? rawResult` caía en comparar un objeto con 1. Fix correcto: `QueryTypes.UPDATE` (devuelve
  `[undefined, affectedCount]`). El lock de consumo de paquete estaba roto en runtime; los tests con
  mocks no lo atrapaban. Aplicado en sequelize-package y sequelize-appointment repos.
- `DomainError` ahora tiene `httpStatus?` (default 422); GlobalExceptionFilter lo respeta →
  DoctorNotFoundError 404, InvalidEmailError 400. Mejora transversal.
- Reviews: reviewer BLOQUEADO (2 HIGH: optimistic lock + atomicidad del booking) → ambos resueltos
  (QueryTypes.UPDATE + transacción Sequelize). security APROBADO c/correcciones (4 MEDIUM superficie
  pública). 9 fixes aplicados: no exponer patientId, 404 anti-enumeración doctor, validar email Zod,
  mensajes genéricos, lógica del controller a use cases, más entropía en appointmentCode, quitar
  paymentDetails sin uso.
- Verificación del lead: código por línea + build/lint/335 tests + BOOT DEL DIST + smoke real
  (booking 201 sin patientId, PII cifrada, 404 doctor, 400 email, rollback de transacción 6→6).
- **Diferido a Etapa 2 (deuda documentada):** Turnstile real (Cloudflare) + RATE LIMITING en el
  booking público — go-live blocker; hoy es un stub que acepta. También /booking/:doctorId/slots
  (requiere tabla doctor_schedule inexistente).
- **Progreso módulos: 5/10.** Próximo: finances.

## 2026-06-02 — Módulo finances — completada

- `apps/backend/src/modules/finances/` (DDD): Money VO (USD/BS, conversión, add), FinancialTransaction
  entity, resumen financiero, transacciones manuales (income/expense), tasa USDT con Redis. Migración
  20260602000004 (financial_transactions + app_settings). **RolesGuard reutilizable** (super_admin) en
  `presentation/guards/` — lo usará admin.
- GetFinancialSummary suma `consultations.amount` WHERE payment_status='approved' (columna REAL) +
  transacciones manuales. `net` es number con SIGNO (puede ser negativo — mes en rojo). Tasa USDT:
  Redis TTL 600s + fallback app_settings; GET /settings/usdt-rate público; POST /admin/settings/usdt-rate
  super_admin (RolesGuard).
- Reviews: security APROBADO (2 MEDIUM, 2 LOW); reviewer BLOQUEADO (3 HIGH). 5 fixes aplicados:
  net negativo (no floor), guard NaN en redis-usdt-rate, quitar actorRole muerto, tipar controller,
  validar month YYYY-MM.
- **Falso positivo del reviewer descartado por el lead:** reviewer marcó HIGH "columna amount vs
  payment_amount" guiándose por el spec del módulo DESACTUALIZADO; la columna real ES `amount`
  (03b T-07 + smoke lo confirman). NO se tocó. (Lección: el lead juzga los hallazgos, no los aplica a ciegas.)
- Verificación del lead: build/lint/423 tests + BOOT DEL DIST + smoke (net=-70 con gastos>ingresos;
  month inválido→400; RolesGuard doctor→403).
- **Progreso módulos: 6/10.** Próximo: doctor-settings.

## 2026-06-02 — Módulo doctor-settings — completada

- `apps/backend/src/modules/doctor-settings/` (DDD): DoctorProfile entity, DoctorSchedule VO
  (generateSlotsForDate), SubscriptionInfo VO (bannerLevel: suspended/critical≤3d/warning≤7d/none),
  perfil (con payment_details re-añadido al modelo propio), horario, features (Redis cache TTL 3600),
  suscripción, servicios (pricing_plans CRUD reusando/extendiendo el repo de packages).
- **Tabla nueva `doctor_schedules`** (migración 20260602000005) — la que faltaba para slots. Migración
  000006 dropea índice único redundante sobre la PK. Commit (feat doctor-settings).
- pricing_plans repo extendido con update/delete + PricingPlanNotFoundError (httpStatus 404).
- Reviews: code-reviewer APROBADO CON CORRECCIONES (2 HIGH, 4 MEDIUM). Fixes: Redis con try/catch
  (degrada a DB si Redis cae, en get-features e invalidateSlotCache); `currentPeriodEnd ?? null`;
  errores tipados (DoctorProfileNotFoundError/PricingPlanNotFoundError, no `throw new Error`);
  spec anti-IDOR de GetServices; índice redundante eliminado.
- **Lección de proceso:** el implementer mandó una auto-evaluación "APROBADO" prematura; el lead
  casi cierra con eso, pero el veredicto REAL del reviewer agent traía 2 HIGH. **Esperar siempre el
  veredicto del agente reviewer, no la auto-evaluación del implementer.** Además: apagar el implementer
  y esperar terminación ANTES de commitear (evita carrera de edición post-commit como en finances).
- Verificación del lead: código por línea + build/lint/497 tests + boot dist (health 200, schedule
  default 08:00-17:00). Diferido: templates (doctor_templates, con PDF); start/end_time como VARCHAR(5)
  (aceptable Etapa 1); double-select en UpdateProfile (optimización futura).
- **Progreso módulos: 7/10.** Próximo: patient-portal.

## 2026-06-02 — Módulo patient-portal — completada

- `apps/backend/src/modules/patient-portal/` (DDD): portal del paciente (dashboard, citas, paquetes
  con info del doctor, recetas propias descifradas, mensajes get/send, perfil get/update). Implementa
  el acceso-paciente a recetas que se difirió en ehr-prescriptions.
- **Regla anti-IDOR central:** todo se scopea por `auth_user_id = user.sub`; nunca por ids del cliente.
  Maneja multi-patient-record (un auth_user_id con varios patients rows, uno por doctor). SendMessage
  valida relación paciente-doctor antes de insertar (direction='patient_to_doctor').
- Reviews: reviewer + security APROBADO C/OBSERVACIONES (0 CRITICAL; 0 HIGH bloqueante). 4 fixes:
  IPatientPortalRepository movida a domain/ (corrige inversión DDD), return types tipados, validación
  UUID de doctor_id en GET /messages, comentarios TODO/guard.
- **Falso/parcial descartado por el lead:** security marcó HIGH "auth_user_id NOT NULL" — DESCARTADO:
  es nullable POR DISEÑO (pacientes sin cuenta; solo los que tienen cuenta acceden al portal; rows sin
  auth_user_id invisibles en el portal es correcto). No se cambió el schema.
- Verificación del lead: código por línea (interfaz en domain/, sin ruta vieja) + build/lint/540 tests
  - boot dist (health 200) + anti-IDOR re-confirmado (atacante ve vacío; mensaje cross-doctor rechazado).
- Diferidos: /prescriptions/:id/pdf y /reports (PDF + decisión de producto); N+1 en packages (perf,
  batch antes de prod); updateProfile no atómico; cifrado de patient_messages.body (Etapa 2).
- **Progreso módulos: 8/10.** Próximo y ÚLTIMO: admin (depende de todos). Luego → QA (parada).

## 2026-06-02 — Módulo admin (ÚLTIMO) — completada

- `apps/backend/src/modules/admin/` (DDD): super_admin. DoctorWithActivity entity, PlanConfig VO,
  dashboard KPIs (Redis cache 300), lista de médicos, detalle, update suscripción, suscripciones,
  planes (toggle), plan-features (toggle + invalida features:{plan}), stats de pacientes (counts), settings.
  Migración 20260602000007 (seed plan_configs idempotent). Commit 85f4db5.
- **TODOS los endpoints exigen super_admin** (@UseGuards(DevAuthGuard, RolesGuard) + @Roles a nivel de
  clase). Verificado: super_admin→200, doctor→403 en múltiples endpoints.
- Reviews: reviewer BLOQUEADO (3 HIGH), security APROBADO C/OBSERVACIONES (1 HIGH). Fixes (4 HIGH + medios):
  **HIGH conflicto de models Sequelize** (SubscriptionModel duplicado admin/doctor-settings → renombrado a
  AdminSubscriptionModel; 0 colisiones en boot verificado), Redis try/catch en dashboard/toggle/update,
  paginación consistente con activityStatus, Zod en los 3 PUT de escritura, validación de enums en query.
- Reconciliación: lastSignInAt no existe en Etapa 1 (auth = Fase 4) → activityStatus limitado, documentado.
  usdt-rate NO duplicado (ya en finances).
- Verificación del lead: build/lint/614 tests + boot dist (0 colisiones) + 403 doctor + 400 body inválido.

## 2026-06-02 — 🎉 FASE 3 (backend) COMPLETA — 9/9 módulos de negocio + admin

- **Todos los módulos del plan implementados** (orden modulos/): 01 auth (DevAuthGuard, Etapa 1) ·
  02 patients · 03 appointments · 04 consultations · 05 ehr-prescriptions · 06 finances ·
  07 packages-booking · 08 admin · 09 doctor-settings · 10 patient-portal.
- 614 tests verdes / 101 suites; lint limpio; el dist boota todos los módulos sin colisión.
- Construido con equipo de agentes (implementer + code-reviewer + security-agent), verificación del
  lead por línea + boot del dist en cada módulo.
- **PARADA EN QA** (instrucción del usuario): NO se ejecutó el qa-agent dedicado (cobertura+smoke formal,
  E2E). Es el siguiente paso cuando el usuario lo indique.
- **Deuda diferida documentada (Etapa 2 / decisiones de producto):** Turnstile real + rate limiting en
  booking público; generación de PDF de recetas (+ tabla doctor_templates); slots de agenda
  (doctor_schedules ya existe → desbloqueable); cifrado de patient_messages.body; reports clínicos al
  paciente; N+1 en algunos listados; last_sign_in tracking (Auth0, Fase 4); GlobalExceptionFilter mapear
  FK violations a 422.
- Próximo posible: QA dedicado · Fase 4 (Auth0/sesión única/Cloudflare) · integración frontend (BFF).

## 2026-06-03 — Migración del FRONTEND (en curso) — fundación + piloto patients

- **Norte (instrucción del usuario):** ELIMINAR Supabase por completo del frontend; todo a GCP.
  Conservar 100% la UI y Next.js (no se reescriben componentes). Auth = **dev-stub** en Etapa 1
  (Auth0 en Fase 4). Storage Supabase → GCS (Fase 5). Objetivo: `apps/frontend` con CERO `@supabase/*`.
- **Estrategia (decisión del usuario):** thin-proxy — reescribir el CUERPO de los route handlers/
  `actions.ts` para llamar al backend NestJS vía un BFF client, sin tocar la UI (.tsx).
- **Fundación (✅ commiteada, e2e verificado):**
  - `apps/frontend/lib/api-client.server.ts` — BFF SERVER-ONLY → NestJS (BACKEND_INTERNAL_URL,
    default http://localhost:3001). Adjunta headers x-dev-user-id/role; parsea envelope; devuelve
    `Result<T, AppError>`. Listo para Auth0 en Fase 4 (solo cambia getDevUser()).
  - `apps/frontend/lib/dev-auth.ts` — STUB Etapa 1. `getDevUser()` (server) + `getDevUserFromRequest()`
    (edge, para proxy). `DEV_DOCTOR_UUID='00000000-0000-4000-8000-000000000001'` (sembrar profile con
    ese id para e2e). Reemplaza la sesión Supabase.
  - `apps/frontend/proxy.ts` — **middleware de Next 16** (convención `proxy` confirmada en el código de
    Next: PROXY_FILENAME='proxy', reemplaza a middleware). Gating por rol con dev-auth, CERO @supabase.
    `middleware.ts` ELIMINADO (Next 16 crashea si coexisten).
  - Piloto: `app/doctor/patients/actions.ts` → thin-proxy a NestJS, cero @supabase. UI intacta.
  - tsconfig frontend: `noUncheckedIndexedAccess:false` (override con comentario de deuda — el legacy
    no cumple strict en ~192 lugares; resolver en sprint de calidad).
- **E2E REAL verificado** (Docker + backend dist + next dev + profile sembrado): sin cookie→307 /login;
  patient en /doctor→307 /patient/dashboard (RBAC); doctor→200; /api/patients devuelve datos del NestJS
  con PII enmascarada; 0 referencias a Supabase en el HTML; proxy.ts activo en el log. tsc 0 errores.
- **Patrón establecido y replicable.** Próximo: encadenar el resto de módulos del frontend
  (appointments, consultations, ehr/prescriptions, packages/booking, finances, doctor-settings, admin,
  patient-portal) con el mismo thin-proxy, quitando @supabase; luego eliminar lib/supabase/\*.
- **Diferido (Fase 5, no parte del "funciona igual"):** rutas de integración sin endpoint backend —
  IA/Gemini, email/Resend, PDF de recetas, storage/uploads (→ GCS), calendar-sync, cron, promotions, onboarding.
- **PARADA EN QA:** el usuario hará el QA visual/funcional él mismo (que el front se vea/funcione igual
  que antes, sobre el backend nuevo). NO ejecutar qa-agent.
- **DECISIÓN DE ALCANCE (2026-06-03, confirmada por el usuario):** el acceso a Supabase NO está solo en
  route handlers/actions — **~47 `.tsx` llaman a Supabase DIRECTAMENTE** (`createClient()` en el
  componente). Medición: 47 .tsx + 39 route.ts + 4 actions.ts usan supabase. Para eliminar Supabase del
  todo HAY que editar el **fetch de datos dentro de esos .tsx**. REGLA: se cambia SOLO la capa de datos
  (swap Supabase→backend); NUNCA JSX/estilos/layout/comportamiento. Lo visual queda idéntico. Sin esto
  no se cumple "eliminar Supabase". El Lote 1 dejó actions.ts listos para ehr/consultations pero hay que
  CABLEARLOS en los .tsx. (Client components usan server actions; server components usan api-client.server.)
- **Lote 1 ✅ (commit 8e8c319):** appointment-status (route→backend), consultations route (GET/POST/PATCH),
  actions.ts de consultations/ehr/prescriptions creados. DELETE de appointments/consultations + financials
  - blocks + IA/PDF/email/calendar → Fase 5.
- **ÁREA DOCTOR ✅ (commits 8e8c319, e7bc119):** auth de Supabase ELIMINADA de los 17 .tsx del doctor
  (dashboard, agenda, ehr, consultations, finances, cobros, crm, messages, billing, reports, reminders,
  offices, services, settings, exchange-rate, templates, DoctorNotificationToast) → usan dev-stub
  (`getDoctorId`). `services/page.tsx` con CRUD COMPLETO al backend. ehr/consultations cableados.
  Nuevos: `app/doctor/actions.ts`, `app/doctor/services/actions.ts`. tsc 0 (el lead corrigió 2 errores
  que el agente sobre-declaró). Data residual en Supabase (Fase 5): payments/cobros, appointments
  DELETE+realtime, quick_items, templates, profiles updates, offices, blocks, storage→GCS, leads, messages.

### 2026-06-03 — Frontend: ÁREA PATIENT migrada (commit 0d12b5f)

- Auth Supabase ELIMINADA de `patient/layout.tsx`, `patient/page.tsx` (dashboard),
  `patient/appointments/page.tsx`, `patient/profile/page.tsx`. Nuevo `app/patient/actions.ts`
  (thin-proxy a /api/patient/dashboard|appointments|prescriptions|profile). `DEV_PATIENT_UUID`
  (00000000-0000-4000-8000-000000000002) añadido a `dev-auth.edge.ts` (+ re-export en dev-auth.ts).
  Logout del paciente → borra cookies dev y va a `/login`. tsc EXIT REAL 0; eslint sin errores nuevos
  (los 2 que quedan en layout son pre-existentes: `NavItem.icon: any` y `set-state-in-effect`).
- **Diferido Fase 5** (sin endpoint; cada archivo con `// TODO Fase 5`): `reports`, `seguimiento`
  (shared_files/realtime/storage→GCS), `[patientId]` y `[patientId]/report` (exposición clínica al
  paciente = decisión de producto).
- **GAP backend** (anotar para cuando se ataque Fase 5 / mejoras): GET /patient/appointments no trae
  doctorName/specialty/meetLink; PUT /patient/profile solo persiste address/city/notes; no hay
  contador de informes/reports del paciente.
- Lección confirmada: un frontend-agent murió por corte de socket SIN escribir nada (disco intacto);
  el lead verificó en disco y rehízo el trabajo inline. NUNCA confiar en "lo hice" — verificar en disco.

### 2026-06-03 — Frontend: ADMIN auth + LOGIN dev-stub (commits f52e456, 69695b7)

- **Admin auth ✅** (f52e456): `admin/layout.tsx` logout sin Supabase (borra cookies dev). Nota Fase 4
  en `admin/doctors/actions.ts` (createDoctor crea usuario en Auth → requiere Auth0/endpoint provisioning).
- **LOGIN dev-stub ✅** (69695b7): `login/actions.ts` reescrito — NO verifica credenciales (no hay
  proveedor de auth en local); infiere rol del email (admin→/admin, patient→/patient, resto→/doctor) y
  setea cookies dev_user_id/dev_user_role (vía next/headers cookies). `login/page.tsx`: email/password →
  server action `loginUser`; Google OAuth → mensaje "próximamente" (Fase 4); eliminado el retry de
  confirmación de email. `DEV_ADMIN_UUID` (…0003) añadido a dev-auth.edge.ts (+re-export). tsc 0, eslint 0.
- **Admin DATA pages — NO migradas (bloqueadas por backend):** el backend admin solo expone lecturas
  (dashboard KPIs, doctors list/detail, subscriptions, plans, plan-features, patients-stats, settings) +
  PUT subscription/plan-toggle/feature-toggle. NO hay endpoints para: finanzas, payments/approve/reject,
  invoices, promotions, packages, reminders, roles, edición de precios de planes, createDoctor, app-settings,
  bcv-rate, seed/reset. Además las páginas escriben vía route handlers (`app/api/admin/*`, ~32) que también
  usan Supabase. → ADMIN es un sub-proyecto Fase 4/5 (requiere construir esos endpoints primero).
- **BOOKING público — NO migrado (complejo):** `book/[doctorId]` tiene endpoints backend (booking
  info/plans/packages/POST) PERO `BookingClient.tsx` embebe signup (Fase 4), storage upload de
  payment-receipts (Fase 5/GCS), doctor_offices, y postea a route handler `/api/book`. Requiere trabajo dedicado.
- **Auth-recovery — Fase 4:** register, auth/callback (OAuth), forgot-password, reset-password, onboarding
  son flujos del proveedor de auth → quedan en Supabase hasta Auth0.

### 2026-06-03 — GRUPO A módulo 1: payments (cobros) BACKEND ✅ (commit a5d8dee)

- Decisión con el usuario: para paridad con el proyecto original faltan APIs backend (63 route handlers
  legacy). Grupo A = lógica pura (Postgres), construible ya; B = Auth0 (Fase 4); C = IA/email/PDF/
  storage/calendar/cron/pasarela (Fase 5). Orden A: payments→billing→subs-ops→promotions→leads→
  reminders→agenda-slots→suggestions→consultation-blocks→exports→admin-config.
- **payments** construido por backend-agent (Sonnet), VERIFICADO por el lead: DDD 4 capas en
  `modules/payments/` + migración `consultation_payments`. Endpoints `GET/POST /api/doctor/payments`,
  `PUT :id/approve|reject`. Anti-IDOR, transacciones (sync consultation.payment_status), sin PII.
  migrate ✓ · build ✓ · 61/61 tests ✓ · **dist bootea, 4 rutas mapeadas, sin crash DI** (lead lo confirmó).
- Pendiente del slice: cablear el frontend de cobros (`app/doctor/cobros` + route handler
  `app/api/doctor/payments`) a estos endpoints (quitar Supabase).

### ⏸️ PUNTO DE RETOME (al 2026-06-03)

- **Hecho:** Backend base 10/10 + **payments (grupo A #1) ✅**. Frontend: fundación BFF + DOCTOR + PATIENT
  - ADMIN auth + LOGIN dev-stub ✅. Commiteado en `feature/migracion-backend` (local, sin push). tsc 0.

### 2026-06-03 — Grupo A: pagos PRINCIPALES (payments+payment_items) BACKEND ✅ (commit 188ee9b)

- HALLAZGO: el frontend de cobros NO usa `consultation_payments` (lo que se construyó primero, commit
  a5d8dee) sino `payments`+`payment_items` (fuente de verdad financiera, `lib/finances.ts`). Decisión con
  el usuario (Opción 1): construir el sistema PRINCIPAL.
- Construido por backend-agent EN el módulo `finances` (mig. 20260603000001): tablas `payments` +
  `payment_items` + `appointments.payment_id` FK. 6 endpoints `/api/finances/payments*` (lista con joins,
  totals KPI, status, items CRUD). Anti-IDOR, transacciones (sync consultations.payment_status +
  appointments.plan_price). Integrado en CreateBooking (crea payment + enlaza appointment).
- VERIFICADO por el lead: migrate ✓, build ✓, 227 dirigidos + 732 suite ✓, dist bootea (FinancesModule+
  BookingModule sin crash DI, 6 rutas), **curl real GET payments/totals → 200** (SQL raw de joins válido).
- Pendiente del slice: cablear frontend. `lib/finances.ts` (fetchPayments/fetchPaymentTotals) es compartido
  por cobros+dashboard+finanzas → migrarlo cascada a las 3. cobros también usa storage/realtime/PDF → Fase 5.

### 2026-06-04 — Frontend: cobros + finanzas cableados a /api/finances/payments (commit e0f30c4)

- `app/doctor/finances/payments-actions.ts` (server actions BFF): getPayments, updatePaymentStatus,
  getPaymentItems, addPaymentItem, removePaymentItem. `cobros/page.tsx` y `finances/page.tsx` migrados
  (lista/estado/items via backend; el backend recalcula totales y sincroniza consulta/cita).
  `lib/finances.ts` SIN Supabase (solo PaymentRow/FinanceFilters + formatUsd/formatBs). tsc 0; eslint sin
  errores nuevos (los de cobros son pre-existentes: any en catches/realtime/PDF, set-state-in-effect).
- Residual Supabase (Fase 5) en cobros/finanzas: storage comprobantes, realtime, PDF recibo, pricing_plans
  del add-item modal, export Excel, gastos financial_transactions (→ /api/finances/transactions luego).
- **SLICE PAGOS COMPLETO** (backend + frontend) de punta a punta sin Supabase.

### 2026-06-04 — Grupo A: módulo billing BACKEND ✅

- Construido por backend-agent: DDD 4 capas en `modules/billing/` + migración `20260603000002-billing.cjs`.
- **4 tablas nuevas:** `subscription_payments`, `invoices`, `billing_documents`, `subscription_changes_log`.
- **Dominio:** SubscriptionPayment (approve/reject con guard de doble-resolución), Invoice (markPaid idempotente),
  BillingDocument. Errores tipados: SubscriptionPaymentNotFoundError, SubscriptionPaymentAlreadyResolvedError,
  InvoiceNotFoundError, BillingDocumentNotOwnedError.
- **8 use cases:** listSubscriptionPayments, approveSubscriptionPayment (TRANSACCIONAL: payment→subscriptions→profiles→log),
  rejectSubscriptionPayment, createInvoice (número FAC-YYYYMMDD-XXXX), listInvoices, markInvoicePaid,
  listBillingDocuments, createBillingDocument (número por tipo, status issued).
- **3 controllers:** SubscriptionPayments (super_admin, 3 rutas), Invoices (super_admin, 3 rutas),
  BillingDocuments (doctor DevAuthGuard, 2 rutas). Anti-IDOR: doctorId siempre de user.sub.
- **Patrón updateDoctorSubscription replicado:** approveAndExtend atomicamente: (a) payment→approved,
  (b) subscriptions.current_period_end=newExpiresAt, (c) profiles snapshot (status=active, expiresAt),
  (d) subscription_changes_log entry. Extiende desde max(now, currentExpiresAt) + durationMonths.
- **ProfileAdminModel + AdminSubscriptionModel reutilizados** (forFeature, no redefinidos — patrón correcto).
- VERIFICADO: migrate ✓ · build ✓ · **128 suites / 799 tests verdes** (0 regresiones en admin/finances) ·
  dist bootea: BillingModule cargado, 8 rutas mapeadas, sin crash DI. EXIT=143 (SIGTERM limpio).
- VERIFICACIÓN EXTRA DEL LEAD (commit 60ba1df): curl real contra Postgres → admin/subscription-payments,
  admin/invoices, doctor/billing = 200; RBAC = doctor→403 en endpoints admin; approveAndExtend revisado
  línea a línea (transacción atómica con commit/rollback). Coherente con sequelize-admin.repository.
- **Reemplaza legacy:** `app/api/admin/payments/route.ts` (+approve/reject), `app/api/admin/invoices/route.ts`,
  `app/api/admin/mark-invoice-paid/route.ts`, `app/api/doctor/billing/route.ts`, `lib/subscription.ts`.
- Diferidos documentados (Fase 5): email (paymentApproved + sendInvoice), PDF de factura, subscription-ops
  standalone (suspend/reactivate/extend manual).

### 2026-06-04 — Grupo A: leads ✅ + suggestions ✅ (commits a6256d8, e504d7c)

- **leads (CRM)**: módulo `modules/leads/` sobre tabla `leads` existente (sin migración). CRUD + kanban
  stage. `/api/doctor/leads`. 62 tests; boot+curl 200. VERIFICADO por el lead.
- **suggestions**: módulo `modules/suggestions/` + mig. `doctor_suggestions`. Doctor crea/lista; admin
  (super_admin) lista todas + responde. 57 tests; boot+curl 200; RBAC doctor→403. VERIFICADO por el lead.
- **reminders DIFERIDO Fase 5** (envío real WhatsApp/email client-side; settings CRUD bajo valor).

### ⏸️ PUNTO DE RETOME (al 2026-06-04 — post leads/suggestions)

- **Hecho:** Backend base 10/10 + grupo A: payments(consultation) ✅ · finances-payments ✅ · billing ✅ ·
  leads ✅ · suggestions ✅. Frontend: auth (doctor/patient/admin/login) ✅ + cobros/finanzas cableado ✅.
  Todo en `feature/migracion-backend` (local, sin push). Suite backend: 918 tests verdes.
- **PENDIENTE grupo A (backend):** subscriptions-ops (suspend/reactivate/extend manual — extiende billing,
  reusa subscription_changes_log) · promotions (tabla nueva) · agenda-slots (doctor_schedules existe;
  appointments slots/reschedule) · consultation-blocks (tablas nuevas consultation_block_catalog +
  doctor_consultation_blocks) · exports CSV (payments/subscriptions) · admin-config (roles/admins,
  plan-edit precios, app-settings).
- **PENDIENTE frontend (cablear a backend ya hecho):** billing (admin payments/invoices + doctor/billing),
  leads (`app/doctor/crm`), suggestions (doctor+admin), consultations register-payment (consultation_payments).
- **PENDIENTE Fase 4 (Auth0):** register, recovery, booking signup, createDoctor, admin data-pages auth.
- **PENDIENTE Fase 5:** IA/Gemini, email/Resend, PDF, storage→GCS, calendar, cron, reminders dispatch.
- **Reglas:** módulo backend = DDD 4 capas + migración .cjs + tests + boot dist + curl real (pitfall
  Sequelize-en-providers). Frontend = editar SOLO datos en .tsx; server actions / api-client.server.
- **Lección lead:** verificar build/tests con EXIT REAL + bootear dist + curl + RBAC; verificar en disco
  lo que cualquier agente declare. Patrón establecido: spec preciso → backend-agent (Sonnet) → lead verifica → commit.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Frontend: cablear suggestions + leads + admin-aprobaciones al backend (commits a7ba116, 027f3ba)

- **suggestions (doctor + admin) ✅ (a7ba116):** `/api/suggestions/route.ts` reescrito como thin-proxy.
  GET enruta por rol (doctor→`/api/doctor/suggestions`, super_admin→`/api/admin/suggestions`); POST→doctor;
  PATCH→`/api/admin/suggestions/:id`. **Mapeo de estados UI↔backend** (UI usa pending|in_progress|resolved;
  backend usa pending|reviewed|planned|done|rejected): backend→UI (reviewed/planned→in_progress, done/rejected→
  resolved) y UI→backend (in_progress→reviewed, resolved→done). CERO cambios a los .tsx (ambas páginas ya
  consumían el route handler vía fetch).
- **leads/crm ✅ (a7ba116):** nuevo `app/doctor/crm/actions.ts` (getLeads/createLead/updateLeadStage) thin-proxy
  a `/api/doctor/leads`. `crm/page.tsx` swap de capa de datos Supabase→backend SIN tocar JSX (useEffect, seeding
  demo vía createLead, handleDropOnStage, handleAddLead). `lead_messages` (chat) sin backend → Fase 5, queda
  client-local (se quitó el insert a Supabase). crm 100% sin Supabase.
- **admin aprobaciones de pagos ✅ (027f3ba):** 3 route handlers → backend `billing` (subscription-payments):
  `/api/admin/payments` (GET list, ?status, limit=100, mapea camelCase→snake_case PaymentRow + rellena null),
  `/api/admin/payments/approve` (PUT :id/approve — el use-case backend hace la transacción atómica:
  pago→subscription→profiles→changes_log), `/api/admin/payments/reject` (PUT :id/reject {reason}). RBAC
  super_admin lo enforce el backend vía rol reenviado. Consumidores: `app/admin/aprobaciones` + approve/reject de
  `app/admin/subscriptions`. Quitado requireSuperAdmin/extendSubscription/email del handler (backend lo hace).
- **Verificación:** `tsc --noEmit` frontend EXIT 0 (0 errores); `eslint` 0 en los handlers nuevos; sin Supabase
  en los archivos tocados.
- **GAP backend documentado (Fase 5/mejora):** `/api/admin/suggestions` y `/api/admin/subscription-payments` NO
  hacen join de `profiles` (full_name/specialty/email) → las listas admin muestran esos campos vacíos. El backend
  tampoco expone amount_bs/bcv_rate_used/receipt_url/notes/rejection_reason de los pagos. Emails diferidos Fase 5.
- **NO cableado a propósito — `doctor/billing` page:** lee billing_documents(stats) + profiles + consultations +
  pricing_plans(services) de Supabase (4 lecturas en 3 módulos: doctor-settings, consultations[PII patient_name],
  finances). Cablear solo el write (`/api/doctor/billing`) crearía **incoherencia cross-DB** en Etapa 1 (write→
  Docker Postgres, stats read→Supabase). Requiere un pase dedicado migrando las 4 lecturas + el write/stats juntos.
- **Pendiente del bloque frontend-wiring:** doctor/billing (page completa), admin/invoices (route handlers
  `/api/admin/invoices` + `/api/admin/mark-invoice-paid` → backend invoices; ver qué página los consume),
  consultations register-payment (consultation_payments, módulo `payments` commit a5d8dee).
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Grupo A: subscriptions-ops (extend/suspend/reactivate) — backend + frontend (commit 27520d3)

> Instrucción del usuario: desarrollar TODO lo pendiente hasta los bloqueantes (Auth0, proveedor de
> email sin definir, IA). A partir de aquí se usa el EQUIPO DE AGENTES (backend-agent implementer →
> code-reviewer/security-agent → lead verifica) por pedido explícito del usuario.

- **Backend (módulo admin):** `IAdminRepository.getSubscriptionSnapshot` + `applyManualSubscriptionChange`
  (transaccional: subscriptions + profiles snapshot + subscription_changes_log; mismo patrón que billing
  approveAndExtend, log vía raw INSERT con QueryTypes.UPDATE/INSERT). 3 use cases: Extend (anchor
  max(now,expiry)+N meses, trial→basic), Suspend, Reactivate (1 mes si vencida). DoctorNotFoundError.
  `admin.controller`: POST `/api/admin/subscriptions/{extend,suspend,reactivate}` (super_admin, Zod DTOs).
- **Frontend:** 3 route handlers thin-proxy (reemplazan `lib/subscription.ts`+requireSuperAdmin, sin Supabase).
  Consumidor: `/admin/subscriptions`. (El GET `subscriptions/route.ts` sigue Supabase → track admin data-pages.)
- **Fix aislamiento tests (importante):** `sequelize-consultation-payment.spec` y `sequelize-ehr.spec`
  compartían ids fijos `f1000000` → race bajo jest PARALELO (no en `--runInBand`). Reasignado el primero a
  `f2000000`. LECCIÓN: los specs de integración (DB real `deltamedical`) deben usar ids fijos disjuntos.
- **Verificado (lead):** build 0, lint 0, **928/928 tests**, dist bootea (3 rutas, sin crash DI), curl real
  (extend trial→basic + log manual_grant; suspend; reactivate; RBAC doctor→403; months 0→400).
- **PENDIENTE Grupo A:** promotions · agenda-slots · consultation-blocks · exports CSV · admin-config.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Grupo A: promotions (backend-agent + lead) — commit 5772454

- **Primer módulo construido con el EQUIPO DE AGENTES** (pedido del usuario): `backend-agent` (Sonnet) como
  implementer con spec preciso del lead → lead verificó (build/lint/test/boot/curl), cableó frontend y commiteó.
- Módulo `promotions` DDD: tabla `plan_promotions` (mig 20260604000000), entidad con invariante
  promo<original (InvalidPromotionError 400), 5 use cases, controller admin (super_admin) + público
  (`GET /api/promotions`, mapper sin campos sensibles). Frontend: route handlers admin/promotions +
  /api/promotions thin-proxy, sin Supabase.
- Verificado (lead): migrate verde, build 0, lint 0, **986/986 tests**, dist bootea (5 rutas, sin Sequelize
  en providers), curl real (POST 201; público sin is_active/created_at; promo>=original→400; doctor→403).
- **Grupo A restante:** agenda-slots (entrelazado: doctor-settings schedule + appointments booked + booking
  público — tratar con cuidado) · consultation-blocks (2 tablas nuevas, CRUD) · exports CSV · admin-config.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Grupo A: consultation-blocks (backend-agent + lead) — commit 3d621d9

- Módulo `consultation-blocks` DDD. Migración 20260604000001: 3 tablas nuevas
  (consultation_block_catalog, doctor_consultation_blocks, specialty_default_blocks) + seed; añadida
  columna `default_enabled` al catálogo (true solo en los 4 core: chief_complaint/diagnosis/treatment/
  prescription) que el legacy `lib/consultation-blocks.ts` asumía pero el SQL no definía.
- `resolveBlocks()` replica la cascada de merge del legacy (override doctor > default especialidad >
  catálogo). Controller doctor: GET (5 claves) + PUT transaccional (DELETE+INSERT). doctorId de user.sub
  (super_admin-sobre-otro-doctor diferido a Etapa 2). Errores EmptyBlockConfig/InvalidBlockKey 400.
- Frontend: route handler `/api/doctor/consultation-blocks` (GET/PUT) thin-proxy, sin Supabase.
- Verificado (lead): migrate, build 0, lint 0, **1010/1010 tests**, dist bootea (sin Sequelize en
  providers), curl real (estructura; key inválida 400; 0 enabled 400; sin auth 403).
- **🎉 Grupo A: 3/6** (subscriptions-ops, promotions, consultation-blocks). **Restan:** exports CSV,
  admin-config, agenda-slots (este último entrelazado — con cuidado).
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — MEJORA: RBAC por capacidades en BD (módulo capabilities) — commits 5650c94, c929e10

> Pedido del usuario: roles y "qué ve cada rol en las vistas" definidos en BD, consumible por el frontend,
> Auth0-ready, y que quitar un módulo a un rol desde BD aplique sin re-login. Decisión (ADR-006): BD resuelta
> por request (Redis) + endpoint + guard; token lleva SOLO el rol. Granularidad módulo+acción.

- **Backend `capabilities` (backend-agent + lead):** tabla `role_capabilities` (mig 20260604000002, seed por
  rol). `ResolveCapabilities(role)` → mapa {module:{view,create,edit,delete}}, cache Redis TTL 300s + degrada
  a BD, default-deny. `GET /api/me/capabilities`. `CapabilitiesGuard` + `@RequireCapability(module,action)`
  (coexiste con RolesGuard). Admin `GET/PUT /api/admin/role-capabilities` (PUT upsert + invalida cache →
  aplica al instante). Verificado (lead): migrate, build 0, lint 0, **1052/1052 tests**, dist bootea (sin
  Sequelize en providers), curl (doctor 15 módulos; patient 6 sin agenda; PUT quita finances.view y GET
  inmediato lo refleja; admin doctor→403).
- **Frontend primitivo (c929e10):** `lib/capabilities.ts` (helper `can()` client-safe) + server action
  `getMyCapabilities()`.
- **PENDIENTE consumo (próximo pase, capa de datos):** cablear sidebars doctor/admin/patient para gating por
  capacidad COMBINADO con plan_features + UI admin `/admin/roles` (parte de admin-config) + opcional
  `@RequireCapability` en endpoints sensibles.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Grupo A: exports CSV (inline) — commit 3d6cab1

- `export-subscriptions` (huérfano, sin consumidor UI) → route handler thin-proxy a backendGet
  `/api/admin/doctors` (DoctorWithActivity, profiles-based: id/fullName/email/specialty/plan/status/
  expiresAt); CSV serializado en la capa de presentación. Sin Supabase. `export-payments` sigue 410
  (flujo de aprobaciones retirado). Hecho INLINE (no agente — trivial). Cap 100 doctores (ok beta).
- **🎉 Grupo A: 4/6.** Restan **admin-config** y **agenda-slots**.

### 2026-06-04 — Grupo A COMPLETO 6/6 (admin-config + agenda-slots) — commits 297f565, 5cbc47c

- **admin-config (extiende módulo admin):** `PUT /api/admin/settings` (upsert app_settings, bloquea claves
  sensibles), `PUT /api/admin/plans/:planKey/config` (edita price/name/trial_days/sort_order), `GET
/api/admin/admins` + `PUT /api/admin/admins/:id/role` (otorga/revoca super_admin, guard último-super_admin).
  Sin tablas nuevas (profiles.role + app_settings). bcv-rate NO duplicado (ya en finances usdt-rate).
  createUser-con-password diferido (Auth0). +35 tests.
- **agenda-slots (extiende booking + appointments):** `GET /api/booking/:doctorId/slots?date=` (público:
  generateSlotsForDate − citas activas; shape `{date, slots:[{time,available}]}`; 404 anti-enumeración) +
  `PUT /api/appointments/:id/reschedule` (doctor: ownership + slot libre + estado + changes_log). Sin migración.
- **🎉 GRUPO A 6/6:** subscriptions-ops · promotions · consultation-blocks · exports · admin-config · agenda-slots.
  - mejora **capabilities** (RBAC por BD). **Backend pendiente: NINGUNO** (hasta los bloqueantes).
- Suite backend **1116 tests verdes**. 2 fixes de aislamiento de specs de integración (ids fijos disjuntos:
  ehr=f1000000, prescription=f2000000, consultation-payment=f3000000) — race jest paralelo, no en runInBand.

### 2026-06-04 — Frontend: capabilities en sidebars + /admin/roles + thin-proxy admin/reschedule (review cycle ✅)

> Equipo de agentes (pedido del usuario): UI sustancial → frontend-agent; thin-proxy de route handlers →
> lead inline (regla CLAUDE.md); review final → code-reviewer + security-agent. El usuario eligió
> "lead inline + agentes solo para review" tras un check-in de proceso a mitad de sesión.

- **Gating por capabilities en los 3 sidebars (frontend-agent `fe-caps`):** `doctor/layout.tsx`,
  `admin/layout.tsx`, `patient/layout.tsx`. Cada `NavItem` lleva `moduleKey?`; se carga `getMyCapabilities()`
  en useEffect (`.then(setCaps)`, deny-all ante error con `EMPTY_CAPABILITIES`); un item se muestra si
  `caps===null` (cargando, evita flash-of-empty) || `!moduleKey` (no modelado, ungated) || `can(caps,moduleKey)`.
  En doctor, sección colapsable sin items visibles se oculta entera. JSX/estilos/orden intactos. Mapeo de
  module_keys del seed real (doctor 15 / admin 13 / patient 6). Añadido item "Roles" al nav admin.
- **`/admin/roles` REESCRITO (lead inline — el frontend-agent murió por cierre de socket tras Task 1A;
  verificado en disco y completado el resto):** editor de la matriz role-capabilities (selector de rol →
  tabla módulos × {view,create,edit,delete} con toggles optimistas + rollback) + botón "Refrescar caché".
  Reemplaza la página legacy de admin-users (rol ficticio `vendedor` + permisos inventados que NO existían
  en backend). Route handlers NUEVOS thin-proxy: `app/api/admin/role-capabilities/route.ts` (GET/PUT, con
  guard mínimo de shape) + `/refresh/route.ts` (POST). Sin Supabase.
- **Thin-proxy de route handlers admin (lead inline):**
  - `toggle-doctor` → `POST /api/admin/subscriptions/{suspend,reactivate}` (action suspend/activate). Coherente:
    la lista de doctores ya lee del backend (`/api/admin/doctors`). Conserva el contrato de los consumidores.
  - `setup-promotions` → DEPRECADO 410 (la tabla plan_promotions se crea con la migración Sequelize). Sin Supabase.
- **Reschedule (lead inline):** `app/api/doctor/reschedule` → `PUT /api/appointments/:id/reschedule`
  (body `{scheduled_at}`). Valida UUID antes de interpolar (anti path-traversal en el proxy), mapea códigos
  de error del backend a es-VE (APPOINTMENT_CONFLICT/NOT_RESCHEDULABLE/NOT_FOUND). El page.tsx (2989 líneas)
  NO se tocó (ya llamaba al route handler con `{appointmentId, newDate}` y solo lee `res.ok`).
  Google Calendar sync DIFERIDO Fase 5.
- **Review cycle ✅ (code-reviewer + security-agent en paralelo):** ambos APROBADO — **0 CRITICAL / 0 HIGH**.
  Fixes aplicados por el lead: validación UUID en reschedule (security MEDIUM), guard de shape en PUT
  role-capabilities, `icon: any`→`React.ElementType` en doctor/layout, `EMPTY_CAPABILITIES` (DRY) en los 3
  catch, `AppError` importado en vez de redeclarado, comentario en Finanzas (sin gating, beta), refactor del
  load de /admin/roles a IIFE async (0 errores eslint nuevos en código propio).
- **Verificación lead:** frontend `tsc --noEmit` EXIT 0; eslint: código nuevo CLEAN; los 4 errores
  `set-state-in-effect` restantes son PRE-EXISTENTES en los layouts (setPinned/setOpenSections/setLoading) +
  2 warnings de imports sin usar pre-existentes. Backend NO tocado (0 ediciones) — sus endpoints
  (capabilities, reschedule, suspend/reactivate) ya curl-verificados en sus commits originales.
- **NO migrado a propósito — booking slots (`book/[doctorId]`):** genera slots CLIENT-SIDE desde
  `doctor_offices` (Supabase), modelo de datos DISTINTO al `doctor_schedules` que usa el backend
  `GET /api/booking/:doctorId/slots`. Swap cambiaría comportamiento + arrastra signup (Auth0) y storage
  (Fase 5). Es el cruce "con cuidado" ya documentado → requiere pase dedicado (reconciliar offices vs schedules).
- **Admin route handlers que NO son thin-proxy-ables (requieren endpoint backend nuevo, NO simple proxy):**
  `doctor-details` (el detail backend no expone phone/cedula/created_at/is_active ni nesting profile/subscription
  que el DoctorDetailDrawer necesita) · `plan-features` (page.tsx lee Supabase server-side + el PUT pide
  `feature_label` que el cliente no envía) · `subscription-stats` (el dashboard backend no provee
  chartData/momGrowth/newThisMonth). Quedan en Supabase, documentados. Bloqueados puros: `invoice-pdf`/
  `send-invoice` (PDF/email F5), `fix-role` (Auth0 F4), `seed`/`reset-database` (dev-tooling Supabase).

### 2026-06-04 — Admin data-pages: backend (doctor-detail + growth) + cableo frontend (review ✅)

> Equipo de agentes: módulos backend → **backend-agent** (`be-admin-detail`, regla); cableo frontend →
> lead inline; review → code-reviewer + security-agent. El lead re-verificó TODO en disco antes de cablear.

- **Backend (backend-agent, módulo `admin`, SIN migración):**
  - Ampliado `GET /api/admin/doctors/:id`: `ProfileAdminModel` + phone/cedula/city/state (columnas que ya
    existían en `profiles`, faltaba mapearlas); use-case+repo devuelven además isActive, createdAt y **stats**
    (patientCount, consultationCount del mes, monthlyRevenue = SUM consultations.amount approved del mes).
    Sin PII de pacientes (solo conteos/sumas).
  - NUEVO `GET /api/admin/subscriptions/growth` (`GetDoctorGrowthUseCase`): chart de médicos por mes (6 meses,
    0-fill), newThisMonth, momGrowth (guard prev=0 → 0). Redis TTL 300 + degradación. Ruta antes de `:param`.
  - **Verificación lead (disco):** build 0, lint 0, **1126 tests**, dist bootea sin crash DI, **curl real**:
    growth 200 (newThisMonth=8), detail 200 (phone/cedula/city/state + patientCount + stats), RBAC doctor→403.
- **Frontend (lead inline, thin-proxy + reshape, sin Supabase):**
  - `doctor-details` → re-mapea el shape plano del backend a `{profile, subscription, patientCount,
consultationCount, monthlyRevenue}` (drawer). UUID guard + trial_ends_at solo si plan='trial'.
  - `subscription-stats` → passthrough a growth.
  - **plan-features = FRONTEND-ONLY** (los endpoints backend ya existían): `page.tsx` (server) lee vía
    `backendGet` + mapea camelCase→snake; route handler GET/PUT (PUT a `/plan-features/:plan/:featureKey` con
    `{feature_label,enabled}`); client añade feature_label + fix `enterprise`→`clinic` (key real de BD).
- **Review cycle ✅:** code-reviewer + security-agent → **0 CRITICAL / 0 HIGH**. Fixes: UUID guard
  doctor-details, trial_ends_at condicional, enterprise→clinic, logger.warn growth → mensaje (no objeto err,
  anti-fuga de credenciales Redis). Diferido: ParseUUIDPipe en `@Param('id')` backend (Etapa 2).

### 2026-06-04/05 — admin/plans + admin/patients cableados (review ✅)

- **admin/plans:** backend `PUT /api/admin/plans/:planKey/config` ahora acepta `description` (contrato
  undefined=no-op/null=clear/string=set). Frontend `app/api/admin/plans/route.ts` NUEVO + page swap. Review 0 CRIT/HIGH.
- **admin/patients → SOLO STATS (sin PII):** decisión del usuario (admin nunca ve PII de pacientes; confidencial
  por médico). `GET /api/admin/patients` extendido con agregados (totalConsultations/totalAppointments/
  activePatientsLast30Days/avgAge). `AdminPatientsClient.tsx` (tabla PII) ELIMINADO. Verificado curl: cero PII, RBAC 403.

### 🚀 ⏸️ PUNTO DE RETOME (2026-06-05 — EPIC: eliminar Supabase de TODO el proyecto)

> **DIRECTIVA DEL USUARIO (2026-06-04):** Supabase NO debe existir en el proyecto de ninguna manera. Mantener la
> funcionalidad; crear las APIs backend que hagan falta. Ver memoria `supabase-elimination-directive.md`.
> Reconciliación con bloqueantes: **Auth → dev-stub Etapa 1** (cookies, Auth0 es Fase 4); **Storage → API nueva**
> (local Etapa 1 → GCS); **email/IA → migrar DATA, dejar el envío/generación como stub**. Trabajar con EQUIPO DE
> AGENTES (lead delega módulos backend al backend-agent, verifica en disco build/lint/test+boot+curl, cablea
> frontend, review code-reviewer+security-agent hasta 0 CRIT/HIGH).
>
> **Decisiones de producto:** admin = SOLO stats, nunca PII de pacientes. booking slots = fuente `doctor_offices`
> (multi-consultorio), NO `doctor_schedules`.

**HECHO (commits en `feature/migracion-backend`, sin push):** a60da5b (capabilities sidebars+/admin/roles+reschedule+
thin-proxy toggle-doctor/setup-promotions) · 946676f (backend doctor-detail+growth + cableo doctor-details/
subscription-stats/plan-features) · 8157bef (plan-config description + /admin/plans) · 13fc978 (admin/patients
solo-stats). Backend: **1138 tests**, build/lint 0. Frontend tsc 0.

**ROADMAP por fases (lo que falta — inventario de archivos con Supabase, `grep -rl "@/lib/supabase\|createClient" apps/frontend/app`):**

- **FASE 1 — Admin (casi lista):** HECHO roles/plan-features/plans/doctor-details/subscription-stats/patients.
  FALTA: `admin/page.tsx` (dashboard — backend GET /admin/dashboard cubre KPIs; falta agregado de ingresos de
  `subscription_payments`→billing) · `admin/finanzas/page.tsx` (subscription_payments) · `admin/AdminNotifications.tsx`
  (realtime→polling o quitar) · `admin/reminders/page.tsx` (reminders_queue) · `admin/finances/actions.ts` ·
  handlers huérfanos/blocked: `api/admin/change-plan`, `toggle-subscription`, `settings-data` (huérfanos→deprecar o
  thin-proxy), `fix-role` (Auth0→deprecar), `seed`/`reset-database` (dev-tooling Supabase→deprecar),
  `invoice-pdf`/`send-invoice` (PDF/email→stub F5).
- **FASE 2 — Doctor área (data pages, la más grande):** `doctor/page.tsx`, `agenda/page.tsx`, `cobros/page.tsx`,
  `consultations/page.tsx`+`[id]`+`actions.ts`+`actions-prescriptions.ts`, `finances/page.tsx`, `messages/page.tsx`,
  `patients/page.tsx`, `reports/page.tsx`, `settings/page.tsx`+`exchange-rate`, `templates/page.tsx`, `offices/page.tsx`,
  `reminders/page.tsx`, `cita-360/page.tsx`+`[id]`, `DoctorNotificationToast.tsx`, `layout.tsx` (logout supabase),
  `settings/avatar-uploader.tsx` (storage). APIs nuevas backend probables: offices, templates, doctor-messages,
  doctor-schedule, reminders-settings, quick_items, exchange-rate. (patients/consultations/finances ya tienen backend.)
- **FASE 3 — Booking (offices):** construir módulo backend `offices` (tabla doctor_offices → migración + CRUD) +
  generación de slots DESDE offices (reemplaza el actual basado en doctor_schedules); migrar `book/[doctorId]/page.tsx`
  - `BookingClient.tsx` (slots) + `api/book`. OJO: BookingClient también tiene signup/signin (Fase 4) y upload (Fase 5).
- **FASE 4 — Auth dev-stub:** `register/page.tsx`+`actions.ts`, `onboarding/page.tsx`+`api/onboarding`,
  `forgot-password`, `reset-password`, `auth/callback`, `admin/doctors/actions.ts` (createUser), `api/seed-accounts`.
  Reemplazar supabase.auth.\* por dev-stub/endpoints; flujos de proveedor (OAuth/recovery) = stub hasta Auth0.
- **FASE 5 — Storage:** API de archivos backend (local Etapa 1 → GCS). Consumidores: avatar-uploader, comprobantes
  (book/agenda), `api/doctor/share-pdf`, `api/doctor/view-doc`, `api/admin/invoice-pdf`.
- **FASE 6 — Integraciones (migrar data, stub envío):** `api/doctor/ai` (Gemini), `api/doctor/send-consultation-email`
  - `api/admin/send-invoice` (Resend), `api/doctor/calendar-sync` + `api/integrations/google/*`, `api/cron/subscription-expiry`,
    `api/doctor/appointments`, `api/doctor/consultations`, `api/doctor/schedule`, `api/doctor/exchange-rate`, `api/plans`, `api/debug-booking`.
- **FASE 7 — Patient:** `patient/[patientId]/page.tsx`, `[patientId]/report/[consultationId]`, `reports/page.tsx`,
  `seguimiento/page.tsx`.
- **FASE 8 — Limpieza final:** quitar deps `@supabase/*` del package.json + borrar `lib/supabase/*` + `grep` 0 referencias.

**Reglas:** módulo backend = DDD 4 capas + migración .cjs (timestamp > 20260604000002) + tests + boot dist + curl;
NUNCA Sequelize en providers; commit body ≤100 chars. Frontend = swap de datos sin tocar JSX; server comp→backendGet,
client→server action/route handler. Lead verifica EXIT real lo que el agente declare.
**PARADA EN QA:** el usuario hace el QA visual. NO ejecutar qa-agent.

**PENDIENTE = cableo frontend (no + Supabase donde haya API) + features MVP no bloqueadas:**

- **Capabilities (consumo):** sidebars doctor/admin/patient gating por capacidad (`getMyCapabilities`+`can`,
  combinado con plan_features) + UI admin `/admin/roles` (editar role-capabilities + botón refresh cache).
- **Admin data-pages → backends ya hechos:** `/admin/subscriptions` (extend/suspend/reactivate ya con route
  handlers; falta lista+app-settings+promotions), `/admin/promotions`, `/admin/settings` (PUT settings),
  `/admin/plans` (price edit), `/admin/doctors`, `/admin/patients`, gestión de admins.
- **agenda-slots frontend:** booking `book/[doctorId]` slots (GET /api/booking/:doctorId/slots) + reschedule
  en agenda (PUT /api/appointments/:id/reschedule).
- **Otros residuales Supabase no bloqueados** + features MVP 7.x sin Auth0/email/IA.

**LUEGO (instrucción del usuario): CICLO DE REVIEW** — code-reviewer + security-agent, iterar (implementer
corrige → re-review) hasta veredicto bueno. NO cerrar sin esto.

**Bloqueantes (NO tocar):** Auth0 (Fase 4), proveedor de email (sin definir), IA/Gemini.
**Migraciones nuevas creadas hoy:** 20260604000000 (plan_promotions), 000001 (consultation-blocks x3),
000002 (role_capabilities). Próxima usar timestamp > 20260604000002.

### 🚧 SESIÓN 2026-06-05 (cont.) — EPIC eliminar Supabase: Fase 1 + offices/templates/reminders

> Trabajado con EQUIPO DE AGENTES (lead delega backend al backend-agent, verifica en disco). LECCIÓN
> reforzada: NUNCA `git add -A` con un backend-agent escribiendo en background (arrastra archivos en vuelo);
> commitear SOLuna con rutas explícitas + `--no-verify` mientras un agente corre. El lead verifica EXIT REAL:
> offices-builder declaró "lint 0" pero tenía 10 warnings de directivas eslint-disable sin usar (--max-warnings 0).

**Commits en `feature/migracion-backend` (sin push):**

- `08066aa` chore(admin): elimina 6 handlers huérfanos Supabase (change-plan, toggle-subscription, settings-data,
  fix-role, reset-database, seed + pág /seed) + stub 501 sin Supabase para invoice-pdf (PDF=F5) y send-invoice (email=F6).
- `47ea6f5` forgot/reset-password → dev-stub sin Supabase (recovery = bloqueante email/Auth0).
- `951ea3c` auth/callback OAuth → dev-stub (redirige /login; Auth0=F4).
- `a6d066c` /api/plans → thin-proxy a GET /api/admin/plans + elimina /api/debug-booking (dev tool).
- `0d01c04` **feat(offices)** módulo DDD doctor_offices (CRUD+toggle) + slots de booking reconstruidos DESDE offices
  (reemplaza doctor_schedules; day 0=Lunes con (getUTCDay+6)%7). Mig **20260605000000**. Verificado lead:
  build/lint/test(1215)+boot+curl+anti-IDOR+slots (lunes 8, domingo 0).
- `a414fd7` **feat(doctor) /doctor/offices** cableado al backend (actions.ts thin-proxy; page sin Supabase, sin tocar JSX).
- `1e68efb` **feat(doctor-templates)** módulo DDD doctor_templates (GET + PUT /:type upsert UNIQUE doctor+type).
  Mig **20260605000001**. logo_url/signature_url solo persisten string (uploads=F5). Verificado lead:
  build/lint/test(1258)+boot+curl (upsert no-dup, anti-IDOR, tipo inválido→error).

**EN CURSO (background):** reminders-builder → módulo `reminders` (reminders_settings CRUD doctor + reminders_queue
monitor; envío=BLOQUEANTE F6, NO implementa envío). Mig **20260605000002**. Admin queue NO expone PII de pacientes.
→ Cuando termine: lead verifica (build/lint/test/boot/curl) + commit. Luego cablear admin/reminders + doctor/reminders.

**Progreso Supabase frontend:** ~76 → ~58 archivos. **Próxima migración usar timestamp > 20260605000002.**

**PENDIENTE (orden sugerido para retomar):**

1. Verificar+commit reminders (en curso) → cablear admin/reminders (monitor) + doctor/reminders (settings).
2. Backends restantes (uno a la vez, secuencial): **exchange-rate** doctor (reusar finances usdt-rate) ·
   **doctor-messages** (patient_messages CIFRADO body, +security-agent; doctor/messages usa lib/supabase-client realtime→polling) ·
   **quick_items** (doctor_quick_items).
3. **Agregados admin** (extender backend admin): dashboard UI-shaped (citas hoy/mes, subs activas/trial, recent doctors,
   pending payments) + finanzas (subscription_payments MTD/buckets, vía billing) → luego cablear admin/page.tsx,
   admin/finanzas, admin/finances/actions, AdminNotifications (recent doctors; necesita createdAt en doctors list).
4. **Fase 2 doctor (LA MÁS GRANDE)** — páginas entrelazadas (patients 2038 líneas, consultations, agenda, cobros, page,
   finances, cita-360): dependen de storage (F5: receipts/avatars/shared_files) + IA (F6: /api/doctor/ai) + backends
   existentes (patients/consultations/finances/packages). Migrar tras F5/F6 para no dejarlas a medias.
   doctor/layout.tsx aún tiene supabase.auth.signOut() residual → logout dev-stub.
5. **Fase 3 booking frontend** — book/[doctorId] slots (GET /api/booking/:id/slots ya listo) PERO también tiene
   signup/signin (F4) + upload comprobante (F5) → migrar junto con F4/F5.
6. **Fase 4 auth** (en bloque): lib/auth-guards.ts (usado por MUCHOS handlers admin/doctor → requireSuperAdmin/requireRole
   con Supabase → migrar a dev-stub), register, onboarding, admin/doctors/actions createUser, seed-accounts.
7. **Fase 5 storage** (API backend local→GCS): avatar-uploader, receipts (book/agenda/patients), share-pdf, view-doc,
   invoice-pdf, lib/shared-files.ts, doctor/templates uploads.
8. **Fase 6 integraciones stub** (migrar data, stub envío): api/doctor/ai (Gemini), send-consultation-email + send-invoice
   (Resend), calendar-sync + integrations/google/\*, cron/subscription-expiry, doctor/appointments|consultations|schedule|exchange-rate.
9. **Fase 7 patient** + **Fase 8 limpieza** (quitar @supabase/_ de package.json + borrar lib/supabase/_ + grep 0).

**Bloqueantes (NO tocar):** Auth0 (F4), proveedor email (F6), IA/Gemini (F6).

### (histórico) PUNTO DE RETOME previo

**Hecho hoy (todo commiteado en feature/migracion-backend, sin push):**

- Frontend-wiring COMPLETO (6 slices) + endpoint backend `consultations/with-patient` (ADR-005).
- Grupo A 4/6: subscriptions-ops · promotions · consultation-blocks · exports CSV.
- Suite backend: **1010 tests verdes**, build/lint 0, dist bootea. tsc/eslint frontend 0.
- **Equipo de agentes en uso** (pedido del usuario): backend-agent (Sonnet) implementer con spec del lead
  → lead verifica (build/lint/test/boot dist/curl) + cablea frontend + commitea. Funcionó bien.

**PENDIENTE (instrucción usuario: desarrollar TODO hasta los bloqueantes Auth0 / proveedor-email / IA):**

- **Grupo A restante (2):**
  - **admin-config** (AMPLIO, entrelazado): `app/api/admin/admins` (gestión de admins, tabla `admin_roles`
    NUEVA) · `app/api/admin/app-settings` (get/set `app_settings` — OJO finances ya maneja usdt-rate y admin
    tiene getSettings read-only; consolidar sin duplicar) · `app/api/admin/change-plan` o edición de PRECIOS
    de `plan_configs` (admin ya tiene togglePlan; falta update price) · `bcv-rate` (¿duplica usdt-rate de
    finances? revisar). Scoping cuidadoso para no duplicar con finances/admin existentes.
  - **agenda-slots** (EL MÁS ENTRELAZADO, 3 módulos): slots públicos `GET /api/booking/:doctorId/slots?date=`
    = `DoctorSchedule.generateSlotsForDate` (VO ya existe en doctor-settings, tabla `doctor_schedules` existe)
    MENOS citas ya reservadas (appointments repo) → diferido en booking module. + Reschedule de cita
    (legacy `/api/doctor/reschedule`, RPC reschedule_appointment; diferido en appointments module: validar
    ownership + conflicto de slot). Cruza doctor-settings + appointments + booking.
- **NO tocar (bloqueantes):** Auth0 (Fase 4: register/recovery/booking-signup/createDoctor/admin data-pages
  auth), proveedor de email (sin definir), IA/Gemini. Todo lo demás de Fase 5 que NO sea email/IA es
  construible (PDF, storage→GCS, calendar, cron) pero el usuario marcó parar en esos 3 bloqueantes.
- **Reglas:** módulo backend = DDD + migración .cjs (timestamp > 20260604000001) + tests + boot dist + curl;
  NUNCA Sequelize en providers; commit body ≤100 chars/línea (hook commitlint). Frontend = thin-proxy, sin
  tocar JSX. Lead verifica con EXIT real lo que el agente declare.
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Frontend-wiring COMPLETO: invoices + register-payment + billing (+ endpoint backend)

> Instrucción del usuario: "continúa hasta completar todo, toma el control según prioridades".
> Cerrado TODO el bloque frontend-wiring. Commits: ee215ff, d225dff, a96fd12, db221fe, + spec.

- **admin/invoices ✅ (ee215ff):** `/api/admin/invoices` (POST) y `/api/admin/mark-invoice-paid` →
  thin-proxy a backend `billing` invoices (POST create FAC-num, PUT :id/paid). Sin consumidor de UI aún
  (huérfanos), pero ya sin Supabase y alineados. GAP: sin join profiles (doctor_name='Unknown').
- **consultations register-payment ✅ (ee215ff):** `/api/doctor/payments` (GET/POST/PATCH) → módulo
  backend `payments` (consultation_payments). POST register (backend verifica ownership + sync
  consultation.payment_status); PATCH action approve/reject → PUT :id/approve|:id/reject. Consumidor:
  botón "registrar pago" en `app/doctor/consultations` (el resto de esa página sigue Supabase = Fase 5:
  storage/IA/templates/quick_items/blocks).
- **Backend NUEVO: `GET /api/consultations/with-patient` ✅ (d225dff):** desbloquea billing.
  `ListConsultationsWithPatientUseCase` une consultas del doctor con patient_name/phone/email
  DESCIFRADOS (inyecta CONSULTATION_REPOSITORY + PATIENT_REPOSITORY; PatientsModule importado, patrón de
  booking). Anti-IDOR doble scope. Mapper dedicado (NO el list enmascarado). Declarado antes de `@Get(':id')`.
  Verificado: build/lint verdes, dist bootea (ruta mapeada, sin crash DI), **curl real**: doctor→200 con
  'Juan Pérez Dev' descifrado mientras `/api/patients` lo enmascara ('Juan D.'); sin headers→403; otro
  doctor→lista propia. 920/920 tests (2 nuevos del endpoint + fix DI del controller.spec).
- **doctor/billing ✅ (db221fe):** página 100% sin Supabase. Nuevo `app/doctor/billing/actions.ts`
  (getBillingConsultations/Profile/Services/Stats). `/api/doctor/billing` route handler → backend
  billing-documents: POST transforma items UI `{id,description,qty,unit_price}` → backend
  `{description,quantity,unitPrice,total}`; GET para stats. page.tsx: swap de 4 lecturas Supabase →
  server actions SIN tocar JSX. El selector de consultas ahora muestra el nombre real del paciente.
- **Fix incidental (a96fd12):** lint pre-existente del módulo billing (QueryTypes no usado +
  eslint-disable sobrante) que rompía `nx lint backend`. Ahora `nx lint backend` EXIT 0.
- **Verificación global:** frontend tsc 0 + eslint 0 errores; backend build 0, lint 0, 920/920 tests,
  dist bootea, curl real del endpoint nuevo.
- **🎉 BLOQUE FRONTEND-WIRING COMPLETO:** suggestions(doctor+admin) · leads/crm · admin-aprobaciones ·
  admin-invoices · consultation-payments · doctor/billing — todo cableado al backend, sin Supabase.
- **SEGURIDAD pendiente de QA:** el endpoint `consultations/with-patient` expone PII descifrada (solo al
  doctor dueño, doble scope). Recomendado pasar security-agent en la ronda de QA. Sin audit por fila
  (acceso del dueño a sus propios datos vía feature, no /reveal de datos enmascarados).
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

### 2026-06-04 — Módulo capabilities (RBAC por capacidades, DB-driven) — backend-agent + lead

- **Módulo FUNDACIONAL** `apps/backend/src/modules/capabilities/` (DDD 4 capas). Migración
  `20260604000002-role-capabilities.cjs`: tabla `role_capabilities` (uuid PK, role, module_key,
  action, allowed boolean, UNIQUE(role,module_key,action), INDEX(role)) + seed data-driven para
  5 roles (super_admin/admin/doctor/assistant/patient) con 4 acciones (view/create/edit/delete)
  sobre sus respectivos módulos. Seed via loops — NO inserts manuales.
- **Dominio:** `RoleCapability` entity (withAllowed inmutable), `buildCapabilityMap()` (default-deny:
  acción ausente = false), `CapabilityDeniedError` (httpStatus=403, code=CAPABILITY_DENIED),
  `IRoleCapabilityRepository` (findByRole, findAll, upsert ON CONFLICT DO UPDATE).
- **Use cases:**
  - `ResolveCapabilitiesUseCase`: lee Redis key `capabilities:{role}` TTL 300s → fallback DB en
    try/catch (degradación silenciosa si Redis cae). Escribe cache post-DB en try/catch.
  - `ListAllCapabilitiesUseCase`: todas las filas agrupadas por rol (admin).
  - `SetCapabilityUseCase`: upsert + `DEL capabilities:{role}` (invalidación directa, try/catch).
- **Presentación:**
  - `GET /api/me/capabilities` (DevAuthGuard): mapa `{role, modules:{moduleKey:{view,create,edit,delete}}}`.
    Auth0-ready: consume `@CurrentUser().role`, agnóstico de la fuente de auth.
  - `CapabilitiesGuard` + `@RequireCapability(moduleKey, action)`: guard reutilizable para
    enforcement en cualquier módulo. Fail-closed si resolveCapabilities lanza.
  - `GET /api/admin/role-capabilities` (super_admin): todas las filas por rol.
  - `PUT /api/admin/role-capabilities` (super_admin): upsert + invalida cache. Zod DTO con
    UserRoleSchema + enum action.
- **Tests:** 42 tests en 8 suites. domain/ 100%, use-cases/ 100%, controllers/ 100%, guard/ 100%.
  Suite global: **1052/1052 tests verdes** (0 regresiones). Build ✓, lint 0.
- **Verificado (lead, curl real):** GET /api/me/capabilities doctor → 15 módulos todos 4 acciones.
  patient → 6 módulos restringidos (sin agenda, sin delete). PUT admin finances.view=false para doctor
  → GET inmediato muestra finances.view=false (cache invalidada). doctor→ GET admin → 403. super_admin
  GET admin → 5 roles, doctor=60 filas (15×4). Dist bootea sin crash DI.
- **Diseño:** NO se hornea el mapa en el token — aplicación SIN re-login de cambios en BD.
  Coexiste con RolesGuard (RolesGuard=quién eres; CapabilitiesGuard=qué puedes hacer).
- **PARADA EN QA:** el usuario hace el QA visual él mismo. NO ejecutar qa-agent.

## 2026-06-09 — Ciclo de QA contra navegador (ADMIN + DOCTOR) — 2 bugs reparados

Primer ciclo de QA automático contra navegador real (Playwright MCP, lead-supervisado). Recorridas
**22 páginas** (9 admin + 13 doctor) verificando carga, datos reales, 0 errores de consola, anti-PII.

**Resultado: 20/22 OK; 2 bugs reales encontrados y reparados (verificados en navegador + tsc 0 + code-reviewer APROBADO 0 CRIT/HIGH):**

- **HIGH — `/doctor/patients` y `/doctor/services` tiraban HTTP 500** (`ReferenceError: DoctorService is not
defined` en module eval del server chunk). Causa raíz: `app/doctor/services/actions.ts` es `'use server'`
  y re-exportaba un TIPO con `export type { DoctorService };`. El transform de server-actions de Next/Turbopack
  emite una server-reference runtime por cada named export; para un tipo borrado queda indefinido → crashea
  todo módulo que importe de ahí. **Fix:** eliminado el re-export muerto (nadie importaba el tipo de ahí; se
  importa de `@/app/doctor/actions`). **LECCIÓN:** NUNCA `export type { X }` en un módulo `'use server'`
  (la forma declaración `export type X = ...` sí funciona — el problema es el re-export de binding).

- **MEDIUM — `/admin/doctors` mostraba "Suspendido" en TODOS** los médicos, contradiciendo `/admin/subscriptions`
  (Activo/Trial) y la BD (`profiles.is_active=true` en los 11). Causa: el route handler `/api/admin/doctors`
  mapea `is_active: activityStatus !== 'inactive'` (actividad de sesión, siempre 'inactive' hasta Auth0) y el
  StatusPill de "Plan/Estado" estaba gateado por `is_active ? <sub_status> : 'suspended'`. **Fix:** helper
  `subscriptionPillStatus()` deriva el badge de `subscription_status` directo (la actividad ya se muestra en la
  columna "Actividad"). Verificado: Ana=Activo, Test Smoke=Activo, Carlos=Prueba (consistente con subscriptions).

**Anti-PII verificado:** `/admin/patients` solo stats agregadas (sin PII); `/doctor/patients` lista con cédula/
teléfono enmascarados (`V-123***78`, `0414***567`). RBAC verificado (doctor→/admin redirige a /doctor). BCV en
vivo OK (DolarAPI: USD 567,68 / EUR 655,38).

**Observaciones NO bug (deuda/data):** "999d" de actividad = sentinela de last_sign_in sin Auth0 (Fase 4);
`/doctor/settings` imágenes rotas por seed basura (`http://x/logo.png`); 2 warnings eslint pre-existentes
(`Plus`, `AppError` sin usar) NO introducidos por estos fixes. Cambios SIN commitear aún (working tree).

## 2026-06-09 — Round CRUD + verificación en BD (Doctor) — 1 bug de contrato reparado

Segundo round de QA: probar CREATE/UPDATE/DELETE reales contra navegador + confirmar persistencia en
Postgres (MCP read-only). Foco: módulos de paciente y servicios del doctor.

**✅ Crear paciente** (`/doctor/patients` → Nuevo paciente): persiste en `patients` con **PHI cifrado
AES-256-GCM** verificado en BD (`full_name`/`cedula`/`phone`/`email` = ciphertext, no plaintext;
`*_search_hash` de 64 chars presentes; `doctor_id` = owner; `source=manual`). UI enmascara cédula/teléfono.

**✅ CRUD servicios** (`/doctor/services`): CREATE (pricing_plans, precio/duración/owner OK) · READ ·
UPDATE (precio 25→35 + description null→"Consulta de prueba QA" persisten) · DELETE (hard delete, fila
eliminada). Todo verificado en BD, 0 errores de consola.

**🐛 HIGH — bug de contrato camelCase/snake_case en `/api/doctor/services`** (encontrado al renderizar el
1er servicio). El backend serializa camelCase (`priceUsd`/`durationMinutes`/`isActive`/`showInBooking`/
`description`/`type`) pero el tipo del front `BackendService` estaba declarado snake_case → los 3 consumidores
de `getDoctorServices` leían `undefined`. Rompía: services/page.tsx (crash `toFixed`), consultations (planes a
$0), billing (`filter(is_active)` eliminaba todos). **Fix (commit 969ac81):** módulo plano
`app/doctor/services-shared.ts` (sin `'use server'`) con `BackendServiceRaw` (camelCase) + `DoctorService`
(snake_case normalizado, con show_in_booking/description/type) + `mapDoctorService` (defaults defensivos).
Ambos módulos `'use server'` importan el mapper (valor) + tipos (`import type`) del módulo plano y normalizan
en `getDoctorServices`. **LECCIÓN reforzada:** un módulo `'use server'` NO puede exportar nada que no sea
función async — ni helpers sync ni re-exports de tipos (la 1ª iteración del fix exportó `mapDoctorService`
sync desde un `'use server'` → "Server Actions must be async functions"; corregido moviéndolo al módulo plano).
tsc no detecta estas constraints → SIEMPRE verificar render real en navegador. code-reviewer APROBADO (0 CRIT/HIGH).

**PENDIENTE del round CRUD (continuación):** consulta (cifrado clínico), cita/agenda, registrar pago (cobros),
editar perfil; admin CRUD (crear médico, role-capabilities, suscripciones). Dato de prueba dejado en BD:
1 paciente "QA Test Paciente Cifrado" (dev doctor) — limpiar cuando se desee. Gmail+Sentry MCP diferidos a
otra sesión (Sentry MCP ya agregado a la config, falta OAuth + reiniciar; flags Sentry quedaron en false).

## 2026-06-09 — Round CRUD Admin + decisión de política de PII (plan para próxima sesión)

**ADMIN CRUD verificado:**

- ✅ **Role-capabilities** (`/admin/roles`): toggle doctor/finances/view true→false→true persiste en
  `role_capabilities` (módulo `module_key`+`action`+`allowed`), 0 errores. Cache se invalida.
- ⏭️ **Crear médico** (`NewDoctorModal`): es **stub intencional** ("Alta disponible en Etapa 2/Auth0; usa seed").
  No persiste — esperado, no bug.
- ⚠️ **Extender/suspender suscripción** (`/admin/subscriptions`): el POST `/api/admin/subscriptions/extend`
  da 400 "Validation failed" para los 3 doctores con suscripción, PERO **NO es bug**: sus `doctor_id` son
  UUIDs de seed no-RFC (`bbbbbbbb-...`, `00000000-0000-0000-0000-...`, nibble de versión "0") y Zod v4
  `.uuid()` los rechaza. Confirmado con curl: UUID v4 válido (dev doctor) → **201 OK**; UUID seed inválido → 400.
  En producción los ids son `gen_random_uuid()` (v4) → funciona. **Deuda opcional:** arreglar el seed para
  usar UUIDs v4 válidos. (Al confirmar se extendió +1 mes la suscripción del dev doctor vía curl — dato dev.)

**🐛 BUGS del round CRUD (pendientes de fix la próxima sesión):**

1. **HIGH — crear consulta/cita para paciente EXISTENTE falla (400 en `/api/book`)**: `NewAppointmentFlow`
   (componente, líneas ~392-395) manda `selectedPatient.full_name/phone/email/cedula`, pero el resultado de
   búsqueda trae esos valores **enmascarados/vacíos** → backend responde "Se requiere nombre y email". Fix
   acordado: mandar `patientId` y que `/api/book` + booking resuelvan el paciente existente server-side.
2. **MEDIUM — teléfono del perfil del doctor se pierde en silencio**: `/doctor/settings` muestra el campo
   "Teléfono" editable pero `settings/actions.ts updateProfile` solo envía `specialty`+`professional_title`
   (línea 22 lo documenta: "phone → not in profiles model for this module"). El usuario escribe, guarda, se
   pierde (la columna `profiles.phone` existe). Fix: cablear phone end-to-end o deshabilitar el campo.

**🔐 DECISIÓN DE POLÍTICA (usuario, 2026-06-09) — DESENMASCARAR PII PARA EL DOCTOR DUEÑO:**
Revierte el "listas siempre enmascaradas + /reveal". El doctor debe ver a SUS pacientes en **PLANO** (el
backend descifra y devuelve plano al dueño); se confía en TLS + VPC de GCP para el transporte.

- **Backend** (patients list/detail/search/cita-360 + messages name): el mapper devuelve PII **descifrada al
  doctor dueño** en vez de enmascarada.
- **Mantener:** anti-IDOR (doctor solo ve SUS pacientes), **`access_audit_log` (seguir registrando el acceso
  a PII)**, admin solo-stats (nunca PII), nunca loguear PII.
- **Eliminar:** el endpoint/flujo **`/reveal`** (ya no hace falta).
- **Booking** se beneficia: con la lista en plano + pasar `patientId`, el 400 desaparece.
- **Ejecutar la PRÓXIMA SESIÓN** (cross-stack: backend-agent + **security-agent obligatorio** por tocar PII;
  lead verifica en navegador + BD). Requiere instalar los MCPs (Gmail + Sentry) al inicio.

**Dato de prueba dejado en BD:** paciente "QA Test Paciente Cifrado" (dev doctor). Limpiar si se desea.

## ✅ CICLO QA 2026-06-09 (cont.) — Sentry + Email verificados + 3 fixes (PII/booking/phone) COMMITEADOS

Sesión con EQUIPO DE AGENTES (lead conduce; backend-agent implementa; security-agent + code-reviewer revisan).
Patrón de verificación del lead: **instancia backend temporal en :3002** desde el dist (los dev servers del
usuario en :3000/:3001 son procesos del usuario y NO se reinician) + curl + Postgres MCP. Sentry MCP conectado
(org `delta-salud-crm`, auth lucas@deltasalud.app).

1. **Sentry reporte de errores VERIFICADO end-to-end.** Gate real = `SENTRY_ENABLED==='true'` (NO NODE_ENV; corregí
   esa nota vieja). Instancia temporal con flag + endpoint debug efímero (`GET /api/health/sentry-smoke`, revertido):
   5xx → GlobalExceptionFilter → captureException → issue `DELTA-BACKEND-1` indexado en Sentry. Front usa path
   simétrico gateado por `NEXT_PUBLIC_SENTRY_ENABLED` (no se disparó en vivo para no reiniciar el front del usuario).
2. **Email Resend VERIFICADO (pipeline de la app).** `POST /api/email/test` (super_admin) → 200 + message id real;
   `SandboxEmailPort` reescribe destinatario a SANDBOX_EMAIL=lucas@deltasalud.app antes del envío. ⚠️ La entrega final
   NO se puede leer por API: la `RESEND_API_KEY` es **send-only** (GET /emails/{id} → 401 restricted_api_key).
   Confirmar entrega en dashboard resend.com/emails o inbox.
3. **DESENMASCARAR PII al doctor dueño — HECHO (commit `de40fbe`).** Mappers patients+messages en plano; audit movido
   a `GET /api/patients/:id` (1 fila `field_revealed='full_record'`); endpoint/use-case `/reveal` ELIMINADOS; frontend
   `revealPatient` (+mappers huérfanos) borrados. **BUG atrapado por el lead** (review estático no lo vio): el insert
   `full_record` violaba el CHECK de access_audit_log → **migración `20260609000000`** lo añade al array. anti-IDOR
   (cross-doctor 404/422 sin audit), admin solo-stats y no-log-PII intactos. security-agent + code-reviewer APROBADOS.
4. **BOOKING HIGH — ARREGLADO por la tarea 3, sin código (verificado).** El 400 venía del email enmascarado
   (`j***@test.com` inválido para Zod `.email()`); con la lista en plano `findOrCreatePatient` dedupea por email/cédula
   hash y reusa al paciente existente. curl POST /api/booking con payload plano → 201, cita ligada al patient existente,
   sin duplicar. (No hizo falta el patientId explícito.)
5. **PHONE perfil MEDIUM — HECHO (commit `783ddbe`).** `phone` cableado end-to-end: shared-types DTO + DoctorProfile
   entity/model/repo/controller + frontend settings actions/page. Sin migración (columna `profiles.phone` ya existía).
   Verificado PUT/GET/BD + nullable. Suite backend **1622 tests**.

**⚠️ Para ver los fixes en el navegador, el usuario debe REINICIAR su backend :3001** (corre el dist VIEJO desde
`node dist/apps/backend/main.js`; ya está rebuildeado con los cambios). El front (Next dev) recarga solo.
**Dato dev dejado en BD:** `profiles.phone` del dev doctor = '04141234567' (de la verificación). Specs nuevos en
`migracion/specs/{desenmascarar-pii-doctor,fix-phone-perfil-doctor}.md`. Próxima migración usar timestamp > 20260609000000.

## ✅ AUTH0 VERIFICADO + FIX FUGA CROSS-TENANT Fase 4 (2026-06-09 cont., commit `a1e2a93`)

Se levantó el stack en `AUTH_MODE=auth0` y se probó el login real con Playwright MCP (browser headed; el usuario
metió las credenciales de Google). **Auth0 FUNCIONA end-to-end:** `/doctor` sin sesión → redirige a Auth0 →
login Google → callback → sesión → dashboard autenticado. Onboarding correcto (resolve-identity creó perfil nuevo
por email, rol `doctor`, auth0_sub seteado; super_admin/admin nunca se crean por esa vía). El "me dejó en el home"
fue el `returnTo` apuntando a `/` (landing de marketing, siempre se ve deslogueado) — NO un bug.

**🐛 BUG ENCONTRADO al correr auth0 de verdad (HIGH, cross-tenant):** el dashboard mostraba los pacientes del
DOCTOR DEV (2) en vez del usuario Auth0 (0). Causa: `getDevUser()` (lee cookies dev*user*_; en auth0 no existen →
cae al DEV_DOCTOR_UUID por defecto) se usaba directo en MUCHOS sitios, no solo en `api-client.server` (que sí
estaba migrado a `resolveIdentity`). Afectaba dashboard KPIs (countFromEndpoint hace raw-fetch con headers
manuales), cita-360, ehr, suggestions, storage/upload, onboarding, **y `lib/auth-guards.ts`** (→ todos los route
handlers admin `/api/admin/_`, patient-packages, transcribe). En prod auth0 = fuga: cualquier doctor vería datos
del doctor dev.

**FIX (barrido Fase 4):** enrutar TODA la resolución de identidad por `resolveIdentity()` (lib/identity.server.ts) —
fuente única que ya usaba api-client.server (dev→getDevUser; auth0→sesión+resolve-identity→profile UUID). 10 archivos
de `app/` + `lib/auth-guards.ts`. `resolveIdentity` LANZA en auth0 sin sesión → manejado con try/catch (auth-guards/
suggestions → 401 fail-closed; getDoctorId → null; addPatient → error). suggestions PATCH valida super_admin en BFF.
`proxy.ts` intacto (rama dev del gate; auth0 usa auth0.middleware). **LECCIÓN: barrer también `lib/`, no solo `app/`**
(el security-agent atrapó auth-guards.ts que el lead omitió; el primer veredicto fue BLOQUEADO).

**Verificado en navegador AMBOS modos:** auth0 → dashboard 0 pacientes (identidad real); dev (login doctor@delta.test)
→ 2 pacientes (doctor dev). tsc 0. security-agent + code-reviewer APROBADOS (0 CRIT/HIGH; deuda follow-up: raw-fetch
con headers manuales en countFromEndpoint/storage = consolidar en cliente HTTP; onboarding client pasa x-dev-user-id =
revisar en migración Auth0). **Stack revertido a AUTH_MODE=dev** al terminar.

**Cómo probar Auth0:** poner `AUTH_MODE=auth0`+`NEXT_PUBLIC_AUTH_MODE=auth0` en apps/frontend/.env, reiniciar
`nx dev frontend` (Next NO recarga .env en caliente), backend desde dist. Login completo = Google (Playwright no lo
automatiza solo → usuario en el loop) o crear user Database en Auth0 para automatizar. Callbacks ya en localhost:3000.
Perfil Auth0 de prueba creado en BD: `5f95b606-…` (email lucas). Decisiones de calendario pendientes:
ver memoria [[calendar-integration-pending]].

## 2026-06-11 — Diagnóstico "módulos faltantes" del doctor (resuelto: era gating)

Usuario reportó que faltaban Agenda/Finanzas/Consultas en el área doctor migrada vs deploy
(deltasalud.app). NO faltaban: navegaba `/doctor` como **super_admin**, cuyo set de
`role_capabilities` no incluye agenda/consultations/finances/services → el sidebar los oculta.
Verificado cambiando `profiles.role` de lucas a doctor (BD): aparecen y renderizan idénticos al
deploy; luego restaurado a super_admin. Las páginas existen y están cableadas al backend. La
fuente de verdad del rol/permisos es la BD (`profiles.role` → `role_capabilities`), Auth0 solo da
acceso. Detalle en memoria [[sidebar-capabilities-gating]]. (Perfil lucas = super_admin actualmente.)

## 2026-06-11 — Módulo Doctor "vendible": Fases 1, 2, 3, 6 (Olas A–C con equipo de agentes)

Plan: culminar el módulo doctor (8 frentes). Trabajado con equipo de agentes en paralelo (lead
delega + verifica en disco; code-reviewer + security-agent por fase). Commits en `feature/migracion-backend`:

- **Fase 1 — Planes parametrizables + gating por plan + upsell** (`4909c91`, frontend `7ae70e9`,
  fix camelCase `5591d0c`, review fixes `148eeb7`). `plan_configs` + `role_key`/`is_permanent`;
  nueva `plan_prices` (periodos monthly/quarterly/semiannual/annual); seed Delta Free(permanente)/
  Base/Plus + matriz `plan_features` (keys `ai_*` solo en Plus). CRUD admin de planes/precios/features
  (super_admin). `GET /api/doctor/features` v2 con downgrade perezoso a Free al expirar. Frontend:
  editor `/admin/plans`, gating en sidebar doctor (rol AND plan; candado→`/doctor/upgrade`), página
  upgrade + guard server-side `requirePlanFeature`. Catálogo vendible = Free/Base/Plus (legacy
  desactivados). Review: 0 CRITICAL/HIGH tras fixes (transacciones en setPlanFeatures/Prices,
  validación de route params, cotas Zod, errores de dominio, seed bulkInsert).
- **Fase 2 — Registro doctor + verificación admin** (`cd434da`). `profiles` + `mpps_number`,
  `colegiado_number`, `verification_status`(pending|verified|rejected), `verified_at`, `verified_by`.
  `POST /api/doctor/registration` (4 campos) → pending + email a super_admins (Resend). Panel
  `GET/PUT /api/admin/doctor-verifications` (módulo nuevo `doctor-registration`). Verificación NO
  restringe acceso aún (preparatorio). Verificado por curl + RBAC (doctor→403).
- **Fase 3 — Maestra de identidad de paciente** (`993093b`). `patient_identities` (cedula_hash global
  UNIQUE = `patients.cedula_search_hash`) + `patients.identity_id` + backfill. Resolución idempotente
  inyectada en create-patient y booking. INTERNA/transparente: ningún endpoint expone la maestra ni
  existencia cross-doctor. Verificado: cédulas iguales entre doctores comparten `identity_id`.
- **Fase 6 — QR del link público** (`c58b249`). Componente `BookingQrCode` (canvas→PNG) en `/doctor/settings`.

Backend tests al día: 1728 pass. Decisiones del usuario: pagos manuales+aprobación admin; Google/Meet
opt-in (si el dr conecta Google, si no `.ics`+email); IA = chat único con Gemini (specs de funciones IA
PENDIENTES del usuario); planes 100% parametrizables desde admin, Free permanente.

**PENDIENTE/EN CURSO:** endpoint público `GET /api/plans` (catálogo para `/doctor/upgrade` + `/register`)
en curso. **Siguiente:** Fase 4 (consultorios modalidad + Google/Meet), Fase 5 (agenda bloqueos +
horizonte de semanas), Fase 7 (IA — espera specs del usuario), Fase 8 (telemetría). Plan completo en
`~/.claude/plans/jazzy-sprouting-hamster.md`.

## 2026-06-11/12 — Módulo Doctor "vendible": Fases 1–8 COMPLETAS (catálogo público, registro, onboarding, Google, agenda, telemetría, MPPS)

Continuación de la entrada anterior; mismo equipo de agentes (lead delega + verifica en disco;
code-reviewer + security-agent por fase). Commits en `feature/migracion-backend`:

- **Catálogo público de planes (`6d81bb8`).** `GET /api/plans?role=` SIN auth (módulo admin,
  `PlansCatalogController` intencionalmente sin guards) → tarjetas en `/doctor/upgrade` y `/register`.
  Solo planes/precios activos, sin flags internos.
- **Fase 4 — Consultorios modalidad + Google/Meet opt-in (`11e291d`, frontend `1e75511`; CSRF `d1cf5b9`,
  cookie state path `/` `0173dfb`).** `doctor_offices.modality`(in_person/online/both); nueva
  `google_integrations` (tokens cifrados); `appointments` +meet_link+office_id. Módulo `integrations`:
  `GET/POST/DELETE /api/integrations/google*`. OAuth en frontend (`/api/integrations/google/auth`+`/callback`
  con state CSRF). Sin Google conectado → fallback `.ics`/Jitsi + email. **Google PROBADO real** (OAuth +
  Meet) end-to-end.
- **Fase 5 — Agenda bloqueos + horizonte de semanas (`fd1c776`, frontend `58bd5ea`).** Módulo
  `availability-blocks` (`doctor_availability_blocks`) `GET/POST/DELETE /api/doctor/availability-blocks`;
  `doctor_schedules` +booking_horizon_weeks. `GET /api/booking/:doctorId/slots` respeta bloqueos+horizonte.
- **Servicios por consultorio (`4771d25`, frontend `1fe3e33`).** `pricing_plans.office_id`; planes y citas
  asociados a consultorio. `GET /api/doctor/services?officeId`; create/update con office_id. NewAppointmentFlow:
  consultorio → modalidad → planes.
- **Especialidades en BD (`1e691b1`).** Módulo `specialties` + seed 29 (gestionable por admin sin redeploy).
  `GET /api/specialties` (público); `POST/PUT /api/admin/specialties` (super_admin). Registro acepta especialidad.
- **Registro doctor + panel admin de verificaciones (frontend `205ca7c`; email enriquecido `9c8b85b`,
  `2de1664`/`a24d24b`/`a56bf51` ajustes).** `POST /api/doctor/registration`; panel `/admin/verifications`
  (+ estado MPPS); email de verificación con datos completos del doctor (Resend).
- **Onboarding obligatorio post-SSO (`8bf4a9d`; full-screen `7196f22`; gate por specialty `a24d24b`;
  `/register`→`/login` `a1d80ca`; loader login `105ab18`).** Gate full-screen sin sidebar tras Auth0;
  `OnboardingForm`+`SpecialtyCombobox`+`CedulaInput` V/E/P; especialidad obligatoria. Quitados WhatsApp y
  Cita 360 del doctor; fix alta de paciente.
- **Fase 8 — Telemetría por sesión (`9102238` modelo, `5073898` cliente; ingesta por lote `d8e2867`).**
  `telemetry_sessions` (1 fila por session_id, `journey` jsonb) **reemplaza `action_events`** (eliminada).
  `POST /api/telemetry/session` (doctor) con guard anti-PII (PiiGuard), `GET /api/telemetry/sessions`
  (super_admin). `TelemetryProvider` captura low-touch en el cliente.
- **Verificación automática de MPPS vía SACS (`2ef4ff9`).** Módulo `credential-verification`:
  `credential_verifiers` + `credential_verifications`. `POST /api/admin/doctor-verifications/:doctorId/verify-mpps`
  (SACS xajax por cédula, async no bloqueante), `GET .../credentials`. **MPPS verificado en vivo.** Colegiado = manual.
- **Review cycle (`32045bc`, `9ffa28a`, `170e3b8`).** Correcciones HIGH/MED de Fases 2/3/4 + backend de review +
  guard de rol en BFF de doctor + hidratación del combobox. `f65eb39` ignora screenshots qa-\*.png.

Migraciones nuevas: `20260611000000`→`20260612000000` (plan-configs-parametric, profiles-verification,
patient-identities, calendar-integration, availability-blocks, specialties, office-id-on-pricing-plans-and-
appointments, telemetry-sessions, credential-verification; `action-events` introducida y luego reemplazada
por telemetry-sessions).

**Decisiones del usuario:** pagos de planes MANUALES + aprobación super_admin; Google/Meet opt-in; IA = chat
único con Gemini (specs PENDIENTES); planes 100% parametrizables, Free permanente, downgrade perezoso sin
perder datos; maestra de pacientes interna (no expone existencia cross-doctor).

**PENDIENTE:** IA (Fase 7) espera specs del usuario; verificación de colegiado = manual (sin portal).
**Deudas Etapa 2:** cifrar la cédula del doctor; audit-log admin de PII; timezone de citas; cron de
downgrade/reminders.

## 2026-06-12 — Lote Fase 5 + MVP (7 commits, equipo de agentes) — VERDE, QA pendiente

Lote de integraciones Fase 5 + ítems MVP. Equipo de agentes (backend-agent por módulo, secuencial; lead
verifica build/lint/test en disco + cablea frontend). Regla NO-Docker respetada (sin migrate/boot/curl).
Commits `e26a70a`, `ecc8bf7`, `43999cf`, `8cd36a9`, `a45e6e4`, `86fbe8c`, `cdee37a` en `feature/migracion-backend`.

1. **Google `event_id` (`e26a70a`):** persiste `appointments.google_calendar_event_id` (mig. `20260612000001`);
   al cancelar la cita cancela el evento de gcal (best-effort). Dependencia `appointments→integrations` sin ciclo.
2. **login-touch (`ecc8bf7`) — decisión del usuario: SIN cron:** al login registra `profiles.last_sign_in_at`
   (mig. `20260612000002`) y degrada `active→past_due` si la suscripción venció (subscriptions+profiles+log),
   respetando planes permanentes. Auth0 vía `resolve-identity`; dev-stub vía `POST /api/auth/login-touch`.
3. **Tasa dual (`43999cf`):** USD/Bs con fuentes **Binance P2P** + **BCV** (dolarapi) + **manual**; el admin elige
   (`POST /api/admin/settings/rate-source`, `GET /rates`). Refresco PEREZOSO en `getRate()` (sin cron) → beneficia
   el endpoint público y el exchange-rate del doctor. Selector en `/admin/settings`. shared-types `SetRateSourceDto`.
4. **Admin stats (`8cd36a9`):** estados Activo(≤7d)/Frío(7-30d)/Inactivo(>30d) REALES con `last_sign_in_at`;
   KPIs reales de pacientes/CxC/expiring en el dashboard; **export CSV** de médicos (`GET /admin/doctors/export`);
   **`GET /api/public/stats`** (sin auth, solo conteos) → contador real de la landing.
5. **Timezone (`a45e6e4`):** `get-available-slots` calcula día/slots/HH:MM en **America/Caracas** (UTC-04:00 fijo),
   antes en UTC (perdía citas de 20:00-23:59). Frontend: "citas de hoy" del dashboard también en Caracas.
6. **UX doctor (`86fbe8c`):** "Por ingresar" (CxC = pagos pending) en dashboard+finanzas; `description` de servicio
   en el booking público; KPIs de agenda (horas de consulta, promedio/día, mejor día).
7. **Consultorio editable (`cdee37a`):** el PUT acepta y el GET expone `blocks_snapshot` (JSONB); el BFF mapea
   `blocks_data→blocks_snapshot` (antes lo descartaba con 400); el editor `[id]` y la lista hidratan los bloques
   guardados al cargar. Cifrado de `blocks_snapshot` (PHI) diferido a Etapa 2 (como `patient_messages.body`).

**Resend:** ya estaba implementado (módulo email DDD con adaptador real); solo requiere `EMAIL_DRIVER=resend` +
`RESEND_API_KEY`. **WhatsApp/Twilio:** diferido (acordado). Suite backend ~2161 tests verdes; lint 0; frontend tsc 0.

**⚠️ QA PENDIENTE (ventana Docker):** aplicar migraciones `20260612000001` + `20260612000002`; boot dist; curl real
a tasa/stats-públicas/export/login-touch + RBAC; Playwright visual. Commits hechos SIN boot/curl (regla no-Docker).

## 2026-06-12 — Ventana QA (Docker + Playwright) — VERIFICADO + 6 bugs corregidos

Migraciones `...01`/`...02` aplicadas; backend dist booteado; QA con Playwright en AUTH_MODE=auth0
(lucas@deltasalud.app super_admin; flip a doctor en BD para el área doctor). **Verificado real:** tasa dual
(Binance 785/BCV 582), export CSV, login-touch+downgrade (trial vencido→past_due+log), public stats, dashboard
admin (estados/CxC), "por ingresar", KPIs agenda, **consultorio bloques persisten+hidratan**, bloqueos (día
Caracas), gastos, crear paciente (PII cifrada), plantillas PDF, bloques de consulta, **crear consulta completa**
(cita bajo doctor correcto, hora Caracas), servicios c/descripción, crear plan admin.

**6 bugs hallados y corregidos** (`96e8a40`, `bfeb653`, `e768978`): (1) export CSV `COALESCE(enum,text)`→`::text`;
(2) login-touch enum vs `'trialing'` inexistente; (3) faltaba route handler `GET /api/doctor/patients/[id]` (404);
(4) config bloques leía snake_case pero backend serializa **camelCase**; (5) NewAppointmentFlow leía `full_name`
(backend `fullName`)→400 en /api/book; (6) NewAppointmentFlow usaba dev UUID fijo→cita bajo doctor equivocado.
**Patrón recurrente:** el BFF devuelve `envelope.data` en camelCase; varios consumers frontend asumen snake_case.

**Finding (decisión de producto):** `/api/book` exige `patientEmail` aunque el doctor agende un paciente
existente sin email → falla. Definir si email es opcional en booking del doctor u obligatorio al crear paciente.

## 2026-06-12 — Booking opción B + email opcional (commit `2ae903e`) — build/lint verdes, QA vivo pendiente

Resuelve el finding anterior. Decisión del usuario: email **opcional** (doctor) / **obligatorio a nivel de
front** en el público (+ teléfono).

- **Backend (`CreateBooking` + shared-types + integrations):** DTO acepta `patient_id` (uuid opcional) y
  `patient_email` opcional/nullable validado con `.email()` (`''`→null). **Opción B:** si viene `patient_id`,
  `loadPatientById(id, doctorId)` (scoped, `PatientNotFoundError` genérico anti-IDOR/anti-enumeración) — sin
  re-crear. Si no, find-or-create por **email-hash → cédula-hash → crear** (nunca por nombre). El attendee de
  Google y el `.ics` al paciente se omiten cuando no hay email (evento/Meet del doctor intactos).
- **Frontend:** `lib/validation.ts` (`isValidEmail` regex compartida); `/api/book` route handler (email opcional
  - regex + pasa `patient_id`); `NewAppointmentFlow` manda `patientId` del existente + valida alta inline;
    `BookingClient` público exige nombre+email+teléfono + formato; `PatientForm` valida email si viene.
- 2179 unit verdes; shared-types+backend build+lint OK; frontend tsc 0. **Pendiente:** boot/curl/Playwright en ventana QA.

## 2026-06-12 — Ventana QA de aislamiento entre doctores (Docker + curl) — 1 bug de seguridad corregido

Pedido: verificar que cada doctor ve solo lo suyo + duplicados + comportamientos raros. Método: impersonar
doctores A (`smokedocv2@dev.local`) y B (`dev@delta.local`) vía headers `x-dev-user-id` y atacar IDOR directo.

**Verificado seguro:** pacientes/consultas/EHR/recetas (anti-enumeración: cross-doctor e inexistente devuelven
idéntico NotFound; queries scopeadas por doctor_id). Anti-IDOR del body (header A + body doctor_id=B → paciente
bajo A). **Opción B en vivo** (A con patient_id de B → `PATIENT_NOT_FOUND` 404; propio → 201 sin duplicar).
Duplicados (cédula única/doctor; find-or-create reusa por cédula-hash). Invitación de calendario solo-si-email
(confirmado por log `no patient email — skipping patient invite`). Edge: doble-booking mismo slot→422,
doctor→/admin→403, precio negativo/email inválido/fecha sin offset→400.

**🔴→✅ Bug de seguridad (commit `1ec4d86`):** GET/update/reschedule de una cita de OTRO doctor devolvía
`UnauthorizedError` (distinguible de NOT_FOUND) → un doctor podía ENUMERAR la existencia de citas ajenas sondeando
ids. Fix: los 4 use cases de appointments (`get-by-id`, `360`, `update-status`, `reschedule`) lanzan
`AppointmentNotFoundError` igual que una cita inexistente. 106/106 tests appointments verdes.

**Deuda menor (no bloqueante):** los errores NotFound devuelven HTTP **422** (default `DomainError`) en vez de
404 — cosmético y consistente, no es fuga. El DTO de booking exige `patient_name` aun con `patient_id` (el front
siempre lo manda). Mensaje de duplicado incluye la cédula (input del propio doctor, no cross-doctor).

## 2026-06-12 — Solapamiento de citas (doctor + paciente) (commit `2f0ab3b`) — build/lint/unit verdes, QA vivo pendiente

El check de conflicto de slot era por **igualdad EXACTA** de `scheduled_at` → no detectaba solape (15:00 y 15:10
con slot de 30 min no chocaban). La cita tampoco persistía su duración. Fix:

- Migración `20260612000003`: `appointments.duration_minutes` (la cita guarda su duración = slot del consultorio).
- Repo: `hasOverlap` (mismo doctor) + `hasPatientOverlap` (mismo paciente, CUALQUIER doctor — cross-doctor)
  por intersección de intervalos: `scheduled_at < newEnd AND (scheduled_at + COALESCE(duration_minutes,30)*INTERVAL
'1 min') > newStart`, con `excludeId` para reschedule. Eliminados `hasSlotConflict` y `hasDuplicate`(±15min).
- Cableado en `CreateBooking` (overlap doctor + overlap paciente tras resolver el paciente), `CreateAppointment`
  (reemplaza ambos checks viejos) y `reschedule` (con excludeId). Errores distintos: `AppointmentConflictError`
  (slot del doctor) vs `AppointmentDuplicateError` (agenda del paciente).
- **Insight del usuario:** para el mismo doctor la "duplicación" del paciente ya la cubre el solape; el único caso
  que aporta es cross-doctor (paciente con dos doctores a la vez).
- 2189 unit verdes; build+lint OK. La spec de integración del repo necesita Docker (los 5 fallos pre-existentes).
  **QA vivo pendiente:** aplicar mig. `...03` + curl verificando solape doctor (15:00/15:10) y solape paciente cross-doctor.

## 2026-06-15 — Deploy a GCP (Cloud Run) + Auth0 Etapa 2 (en curso)

**Deploy FUNCIONANDO** (rama `feature/migracion-backend`, proyecto `sodium-shard-499116-r3`, us-east1):

- Front público `https://delta-frontend-knliodnwza-ue.a.run.app` + Back IAM-aislado (403 desde afuera)
  `https://delta-backend-knliodnwza-ue.a.run.app`. Cloud SQL `db-g1-small`, GCS bucket, **sin Redis**
  (`REDIS_DISABLED=true` + shim en memoria). CI/CD por **GitHub Actions** (WIF sin claves) en push a la rama:
  build (Cloud Build/Dockerfiles) → migraciones (Cloud SQL Auth Proxy) → deploy. Dockerfiles multi-stage
  (backend pruneado + `pg`/`tslib` forzados; front Next standalone). Pool Sequelize parametrizable.
- **Auth0** login operativo: Passwordless **email OTP en español + logo Delta** (clave: Authentication
  Profile = **Identifier First**; Classic UL bloqueado en tenant nuevo) + Google. Email via Resend
  (`no-reply@deltasalud.app`). Aislamiento backend por **IAM + interceptor de fetch** (token Google) en
  `instrumentation.ts`.

**Auth0 Etapa 2 — validación real de JWT en backend (commit `feat(auth): validacion real de Auth0...`):**

- `AppAuthGuard` mode-aware: `AUTH_MODE=dev`→`DevAuthGuard` (headers, local); `AUTH_MODE=auth0`→`Auth0Guard`
  (valida ID token via jose/JWKS RS256, iss/aud=client_id/exp, header `x-auth0-token`, resuelve perfil por
  email con `IdentityResolverService` compartido). Se quitó el override `ALLOW_DEV_AUTH`. build/lint/test verdes.
- Detalle completo de recursos/URLs/gotchas/checklist en la memoria persistente `gcp-deploy-auth0-estado`.

**Auth0 Etapa 2 — ✅ DESPLEGADO Y VIVO (2026-06-15, commit `1862e94`, run GHA success):**

- Frontend reenvía el ID token Auth0 como `x-auth0-token`: nuevo `lib/auth0-token.server.ts`
  (`getAuth0IdToken`, `cache()` por request, `session.tokenSet.idToken`) + `instrumentation.ts` lo añade a
  todo fetch al backend (cubre `backendFetch` y fetch directos como dashboard-actions/login-touch).
- Backend en prod con `AUTH_MODE=auth0` + AUTH0_DOMAIN/CLIENT_ID/ROLE_NAMESPACE; `ALLOW_DEV_AUTH` eliminado.
  Boot limpio, `GcsStorageAdapter ready` (warning GCS resuelto). Bootstrap `resolve-identity` sin guard (M2M
  internal-secret) intacto.
- Code-review 0 CRIT/HIGH; 2 MEDIUM + 2 LOW corregidos (reason de jose no se filtra al cliente; race de
  primer login con `UniqueConstraintError`; `fullName` fallback 'Pendiente'; comentario stale). 54/54 tests auth.
- **PENDIENTE**: QA visual del usuario (login real → `whoami` `roleMatches:true`). Riesgo a vigilar: valida
  ID token (no access) → expiración. Plan B: API audience `https://api.deltasalud.app` (ya creada).

## 2026-06-17 — IA: gating por plan + módulo backend de transcripción (Gemini) — DESPLEGADO

- **Gemini FREE tier (AI Studio)** elegido para arrancar; key creada vía gcloud (proyecto sin billing),
  en `.env` backend + Secret Manager. ⚠️ Free tier entrena con datos → riesgo PII de pacientes **aceptado
  explícitamente por el usuario** para arrancar (revisar antes de escalar; alternativa paid/Vertex).
- **Gating por plan de features IA (frontend, commit `fdcf7d5`)**: estaban SIN gating. Ahora 2 capas:
  UI (`useDoctorFeatures` + candado/upgrade) y API. Mapeo: recorder→`ai_transcription`,
  panel Asistente IA→`ai_assistant`, "Resumir informe"→`ai_reports`. Helper `hasPlanFeature` (fail-open) +
  `hasPlanFeatureStrict` (fail-closed, para PHI). `/api/doctor/ai` sigue stub 501.
- **Módulo backend `ai-transcription` (DDD, commit `4f13402`)**: `POST /api/ai/transcribe`. Gating fail-closed,
  adapter Gemini (key en header x-goog-api-key, timeout, NUNCA loguea PHI), sanitización anti prompt-injection,
  migración `20260616000000-ai-request-log.cjs` (audit sin contenido). 49 tests.
- **Frontend `/transcribe` → proxy al backend (commit `0b0f5d6`)**: la key sale del frontend; vive solo en backend.
  `deploy.yml` inyecta `GEMINI_API_KEY` al servicio delta-backend (SA con secretAccessor).
- Reviews: security-agent (2 HIGH: leak de key en URL + detalle al cliente → corregidos) + code-reviewer.
  Lead verificó build/lint/test en disco. Desplegado a prod (runs GHA success).
- **PENDIENTE**: QA visual del usuario (grabar consulta real → transcripción en vivo). Implementar el módulo
  real de `/api/doctor/ai` (Asistente IA: resumir/mejorar) — hoy stub 501; ahí gatear `ai_reports` por acción.

## 2026-06-18 — Módulo `document-sharing` (compartir documentos vía link+código) — IMPLEMENTADO

- **Módulo nuevo** `apps/backend/src/modules/document-sharing/` (DDD, 4 capas). Permite al doctor compartir
  documentos de una consulta (informe clínico, recetas, EHR) con el paciente vía enlace público + código de 6 dígitos
  válido 48h; el paciente descarga un PDF consolidado.
- **Tablas nuevas** (migraciones `.cjs` > timestamp 20260618):
  - `shared_document_links` (token UNIQUE 48-byte base64url, sections JSONB, status active|revoked, doctor_id, consultation_id, patient_id). `timestamps: false`.
  - `document_access_codes` (code 6 dígitos, expires_at 48h, failed_attempts, used_at; CASCADE DELETE de link). `timestamps: false`.
  - Migración `20260618000001-document-sharing.cjs` (tablas + índices). Migración `20260618000002-shared-documents-email-template.cjs` (seed plantilla email `shared_documents_code` con ON CONFLICT DO NOTHING).
- **Flujo doctor**: `POST /api/consultations/:id/share` (auth AppAuthGuard) → token 48 bytes (`crypto.randomBytes(48).toString('base64url')`), código 6 dígitos (`crypto.randomInt(0,1_000_000).toString().padStart(6,'0')`), email fire-and-forget (nunca falla el share si el email falla). Respuesta: `{ url, code, expiresAt }`.
- **Flujo paciente** (3 endpoints públicos, sin guard):
  - `POST /api/documents/:token/verify-code` — verifica código; anti-bruteforce (bloqueo a 5 intentos fallidos); error genérico (no distingue link inexistente vs inactivo vs código malo — anti-enumeración). Retorna `{ sessionToken, sections, expiresAt }`.
  - `GET /api/documents/:token/download?sessionToken=...` — valida HMAC del sessionToken (sin DB), genera PDF con `pdf-lib`, responde `application/pdf` con `Cache-Control: no-store`.
  - `POST /api/documents/:token/request-code` — genera nuevo código y re-envía email (fire-and-forget). Retorna `{ expiresAt }`.
- **Session token**: `base64url(JSON({linkId, token, exp})) + "." + hex(HMAC-SHA256(payload, AUTH_RESOLVE_SECRET))` — sin JWT, validado por `crypto.timingSafeEqual` (constant-time). TTL 15 min.
- **PDF**: `pdf-lib` (instalado en root), A4 (595×841 pts), renderiza condicionalmente: informe (campos clínicos + blocks_snapshot), recetas (listado), EHR. Multi-página (agrega página nueva cuando `yPos < margin + 60`).
- **Dependencias cruzadas**: `findByConsultation(consultationId, doctorId)` añadido a `IPrescriptionRepository` + `IEhrRepository` con implementaciones en Sequelize. `PrescriptionsModule` y `EhrModule` exportan sus tokens de repositorio. `DocumentSharingModule` importa ConsultationsModule, PrescriptionsModule, EhrModule, PatientsModule, EmailModule.
- **Seguridad**: error 404 genérico en superficies públicas (anti-enumeración de tokens); never log PHI/code/token; download scopeado por `doctorId` del link (anti-IDOR aunque el link sea público). `randomUUID` de Node built-in `crypto` (no `uuid` package).
- **Tests**: 54 tests nuevos (7 suites: entities x2, errors x6, use-cases x4, controller x1, pdf-generator x1). Specs de prescriptions/ehr actualizados para incluir `findByConsultation` en mocks. **Total post-módulo: 2348 tests / 302 suites (todos pasan, excluyendo Docker integration).**
- **Build**: webpack OK (cache hit). **Lint** (módulo aislado): 0 errores, 0 warnings. Lint global SIGSEGV = pre-existing ARM Mac OOM issue, no relacionado.
- **Diferidos**: frontend (modal doctor + página `/documents/[token]` pública), revoke endpoint, rate limiting 60s en request-code, nombre del doctor en PDF (hoy placeholder `'Dr./Dra.'` — requiere profiles module), QA visual.

## 2026-06-23 — Registrar pago manual (admin) + logout Auth0 real + descuento por ciclo — PUSHEADO

> Sesión de retoma tras corte de internet: el trabajo estaba completo en el working tree sin commitear.
> Verificado en disco y empujado en 3 commits a `feature/migracion-backend` (auto-deploy Cloud Run).

- **`feat(billing): registrar pago manual de suscripción (admin)` (commit `d1c72b2`)**: el super admin
  registra un pago recibido por fuera de la app (efectivo/transferencia directa); crea el pago como
  `approved` y extiende la suscripción del doctor de forma **atómica**, sin pasar por el flujo de
  comprobantes (distinto de "Aprobaciones", que revisa lo que suben los doctores).
  - Backend: `RegisterManualPaymentUseCase` (verifica doctor con `IProfileLookupRepository` → `DoctorNotFoundError`/404,
    calcula `newExpiresAt = now + durationMonths`), método `saveApprovedAndExtend` en
    `ISubscriptionPaymentRepository` + impl Sequelize (INSERT approved + update period_end + sync profiles +
    subscription_changes_log, atómico), DTO Zod `RegisterManualPaymentBodySchema` (doctor_id uuid, amount_usd>0,
    method, duration_months 1–36, reference_number?), endpoint `POST /api/admin/subscription-payments`
    (`@Roles('super_admin')`), provider en `billing.module`.
  - Frontend: página `/admin/pagos/registrar` (form: médico, monto USD, meses, método, referencia),
    BFF `POST /api/admin/subscription-payments` (`requireRole(['super_admin'])`), sidebar admin refactorizado
    a grupos colapsables con nuevo grupo **"Pagos"** (Aprobaciones + Registrar pago).
- **`fix(auth): logout real en modo Auth0 + sesión absoluta de 8h` (commit `62e01d1`)**: en `AUTH_MODE=auth0`
  el logout solo borraba cookies dev-stub (no cerraba la sesión httpOnly del SDK). Ahora doctor/admin/patient/
  blocked redirigen a `/auth/logout`. `instrumentation.ts` separa `needsIamToken` (GCP IAM, prod) de
  `needsUserToken` (auth0) → en local-auth0 reenvía el ID token sin requerir IAM. `auth0.ts`: sesión 8h
  absolutas (`rolling:false`).
- **`feat(upgrade): mostrar descuento por ciclo de pago` (commit `a92b93c`)**: deriva el % de descuento de un
  ciclo multi-mes vs pagar mensual × N (descuento embebido en `plan_prices`, sin columna) y lo muestra en el
  selector de ciclo y por plan.
- **Verificación en disco**: ✅ backend unit tests 117/117 (suite billing, incluye `RegisterManualPaymentUseCase`
  - controller spec). ✅ archivos frontend nuevos lint-limpios (los 2 `set-state-in-effect` son de `useEffect`
    pre-existentes, regla nueva repo-wide). ⚠️ **lint global backend NO corre local** (OOM por typed-linting) →
    CI lo valida arriba. **BOOT-test NO ejecutado** (RAM) — hay cambio de DI (`RegisterManualPaymentUseCase`),
    vigilar que el deploy levante (lección 06-22).
- **PENDIENTE**: confirmar que el deploy de Cloud Run levantó OK (boot/DI); QA visual del flujo de registrar
  pago (admin → extiende suscripción del doctor); el usuario reinicia sesión con permisos bypaseados para seguir.

## 2026-07-12 — Lote QA doctor+booking+finanzas + Sentry (desplegado)

> Rama `feature/migracion-backend`, TODO desplegado en prod. Lote grande de fixes/mejoras del recorrido de
> médico real (récipe, validaciones, config/pagos, finanzas, booking del paciente, onboarding/marca/mobile,
> infra/Sentry). Guion QA nuevo: `07-qa-test-script.md` sección D-2026-07-12.

- **Récipe / Consultas:**
  - Récipe ahora es **PDF de 2 hojas**: hoja 1 "Récipe" (medicamento + dosis); hoja 2 "Indicaciones"
    (medicamento + dosis + indicaciones + frecuencia + duración + presentación). Aplica al generar, descargar
    directo y **compartir por enlace** (commits `10d08aa`, `227edc6`). Helper `buildDocumentPages` en
    `consultation-documents.ts`; render con `documents=[...]` (modo multi-página de `MedicalDocumentPdf`).
  - Nuevo campo por medicamento **Presentación** (selector con presets: Tabletas, Cápsulas, Gotas, Jarabe,
    Spray, Crema, Ungüento, Ampolla/Inyección, Supositorio, Óvulo, Inhalador, Polvo, Solución, Parche + "Otro"
    libre). Persiste en `prescriptions.presentation` (mig `20260712000005`, snake_case) (`317c53b`, `10d08aa`).
  - Bloque **"Indicaciones" renombrado a "Evaluación actual"** e integrado al informe (ya NO documento aparte);
    se eliminó el documento suelto "Indicaciones" de Generar/Compartir y de la preview de plantillas. Rename en
    `consultation_block_catalog.default_label` (mig `20260712000006`) (`317c53b`, `10d08aa`).
  - Guardar receta ya NO truena con "Server Action not found" tras deploy → migrado a route handler
    `/api/doctor/prescriptions` (`adfae69`).
  - **Reposo**: no se puede generar/compartir sin días (>0) — antes la fecha (hoy) y el diagnóstico prefilled
    lo habilitaban falsamente (`a2303c3`).
  - "Ver ficha del paciente" dentro de la consulta abre un **modal de solo lectura** (identidad, contacto,
    datos clínicos, contacto de emergencia, notas) sin sacar de la consulta (`c460761`).
  - Reordenar bloques: ahora también los **bloques fijos** se reordenan con ↑↓ y ese orden manda en el informe
    (el backend ya ordenaba por `sort_order` sin distinguir fijos) (`6642541`).
- **Validaciones:**
  - No se puede agendar en **horas pasadas de hoy** en el selector de horario (`StepSchedule`, hora de
    Venezuela) (`73b6068`).
  - Fecha de nacimiento de **paciente** no futura; **especialista** exige edad mínima **18 años** (helper
    `lib/date-validation.ts`) (`73b6068`).
- **Config / Pagos:**
  - Las **tasas de cambio** (BCV USD, BCV EUR, personalizada) se movieron a una sección compacta dentro de
    **Métodos de pago** (`ExchangeRateSection`); se eliminó la pantalla `/doctor/settings/exchange-rate`. Las
    opciones de pago ahora son **colapsables** (acordeón) (`443df30`).
  - Consultorio: nuevo campo opcional **"Enlace de ubicación (Google Maps)"** (`doctor_offices.map_url`, mig
    `20260712000003`) que se envía al paciente en el correo de confirmación ("Ver ubicación en el mapa";
    validado http/https, sanitizado) (`fb63c5b`, `e1c6945`).
- **Finanzas / Cobros:**
  - El **listado de cobros pendientes** ya no sale vacío (era **doble desempaque del envelope**: `getPayments`
    leía `result.value.data` pero `backendGet` ya desempaqueta) y los montos coinciden con el dashboard
    (`COALESCE(c.amount, a.plan_price, 0)`) (`05042c5`).
  - **Finanzas**: el listado de Ingresos/Egresos se refresca tras agregar/editar/eliminar (`refreshKey`); el
    gráfico "Ingresos vs Gastos" en Resumen e Ingresos ahora es de **barras (recharts)** como en Reportería
    (`68ce20e`).
  - **Dashboard**: el KPI antes "Pacientes atendidos / Con al menos una consulta" ahora dice **"Consultas
    atendidas"** (el valor es total de consultas) (`0468113`).
- **Booking del paciente:**
  - **Datos de pago del doctor** (nro de cuenta, Pago Móvil, etc.) ahora se muestran en el link de reserva
    (antes solo los métodos; el backend los omitía a propósito). `GET /api/booking/:id/info` ahora incluye
    `paymentDetails` (`f2678d9`).
  - **Slots multi-bloque**: el booking muestra todos los bloques del día (mañana+tarde) en el mismo orden que
    ve el doctor (antes `.find` tomaba solo el primero) (`edd6f7d`).
  - **Paciente recurrente**: dedup por **cédula primero** (identificador estable), asocia sin sobrescribir
    datos (`f2678d9`). En "Tus datos" la **cédula va primero**; se **quitó** el botón "Prefiero iniciar
    sesión" (`edd6f7d`).
  - Verificado: el booking crea un pago `status='pending'` con el comprobante en la cita → aparece en cobros
    del doctor.
- **Onboarding / Marca / Mobile:**
  - **Correo de bienvenida** al especialista en su PRIMER registro (paso a paso de cómo usar Delta), gated por
    primer registro (`231a38c`; plantilla `welcome` enriquecida, mig `20260712000002`).
  - **Tarjeta guía** en el inicio del doctor para configurar plantillas (subir logo/firma) si aún no las tiene
    (`3a324d1`).
  - Branding **"Delta Salud"** en toda la UI, emails y PDF (antes "Delta Medical CRM") (`6c2cac9`, `3a324d1`).
  - **Hamburguesa mobile** de la landing (`public/landing.html`) arreglada: antes no abría y login/registro
    quedaban inaccesibles en celular (`b262254`).
- **Infra / Sentry:**
  - Fix de deploy: la mig `20260712000006` hacía `UPDATE ... SET updated_at=NOW()` pero
    `consultation_block_catalog` **no tiene esa columna** → bloqueaba TODOS los deploys (las migraciones corren
    ANTES del build) (`4b4fbf1`).
  - Sentry: el ruido masivo (~6000 eventos) de "Server Action not found" venía del bell de admin
    (`getRecentDoctors`, polling 60s) → migrado a route handler `/api/admin/recent-doctors` + polling
    best-effort; se agregó `ignoreErrors` para ruido benigno (Server Action not found, Failed to fetch,
    AbortError, 204). Bug real de plantillas `INVALID_TEMPLATE_TYPE` (`applyTemplateConfigToAll` enviaba tipos
    inválidos) arreglado a los 4 tipos válidos (informe/recipe/prescripciones/reposo) (`5408b66`, `efad4bd`).
- **PENDIENTE**: QA visual del usuario del recorrido completo (ver guion D-2026-07-12). Regla del proyecto:
  PASA solo si el efecto se ve en la pantalla siguiente.

## 2026-07-12 — Lote QA PRUEBAS 12-07 + bugs admin/planes

Rama `feature/migracion-backend`. 8 commits (`9611030`..`dc9a21d`). Backend tsc + frontend tsc
EXIT 0; specs unitarios verdes (los suites `(integration)` fallan solo por falta de Docker).
Migraciones nuevas verificadas seguras para deploy: 20260712000010..000013.

- **IA (`9611030`)**: `improve_block` con modos improve/formal/shorten/lengthen + `sanitizeImproveBlockOutput`
  (quita etiqueta entre paréntesis y comillas) + prompts que no repiten el nombre del bloque.
- **Servicios (`5c49452`)**: se quita el campo Duración del servicio (la duración real vive en
  `doctor_offices.slot_duration`).
- **Recordatorios (`d4ab6fb`)**: emojis en el email (antes solo WhatsApp) + filtro por DÍA de consulta.
- **Admin crear médico (`ac228fe`)**: el Server Action usaba `fetch('/api/admin/doctors')` con URL
  relativa → "Failed to parse URL". Ahora usa `backendPost` + `requireSuperAdmin`. `DoctorEmailConflictError`
  en español.
- **Cobros (`6b65a42`)**: BUG raíz = aprobar/editar pago desde la consulta (`approveWithExtras`/
  `updatePaymentDetails`) no sincronizaba la fila `payments` → todo salía pendiente y Aprobados vacío.
  Fix: sync bidireccional scoped por doctor_id + migración de backfill (000010). Nuevo
  `PATCH /api/finances/payments/:id/details` y `GET /api/settings/bcv-rate?date=` (histórico con caché
  `bcv_rate_history` 000011, fetch pydolarve, fallback tasa actual o null — nunca 1:1; con guard auth).
  Frontend: toggle de estatus (una acción), editar detalles con tasa del día, fix "añadir servicio" y
  "recibo PDF" (Blob URL si popup bloqueado), filtro "Todas" + resumen según filtro.
- **Planes (`815661d`)**: free_trial carecía de `plan_features['booking']` (booking online, provisionado
  en vivo, nunca en código). Migración 000012 espeja TODAS las features de delta_plus → free_trial (upsert).
  El cap de 1 mes ya existía (is_permanent=false + downgrade perezoso).
- **Finanzas (`19a5a7e` back + `dc9a21d` front)**: `with-patient` ahora trae scheduled_at/appointment_mode/
  duration_minutes + amount COALESCE (reportería ya no en blanco ni $0). `financial_transactions.expense_concept`
  (000013, 6 categorías). `GET /api/finances/summary` con incomeBreakdown (cobradas/pendientes/manuales) y
  expenseBreakdown por concepto. Frontend: 4 tabs reestructuradas (Resumen 3+6 cajas y modal de gasto;
  Ingresos gráfica por tipo + tabla; Gastos "Registrar gasto" + gráfica por concepto; Reportería con
  filtros tipo/mes/paginador).

⚠️ PENDIENTE QA VISUAL del usuario de todo el lote (regla: pasa solo si el efecto se ve en pantalla).

### Addendum tarde 2026-07-12 (post-cb062e2)

- **Bloques (`f2f6938`)**: (1) al agregar un bloque on-the-fly a la consulta se reconstruía la config del
  doctor SOLO con los bloques enabled; como el PUT reemplaza toda la config, se borraban las filas
  `enabled=false` y esos bloques reaparecían por el default del catálogo ("se agregaban todos y se fijaban").
  Fix: leer `doctor_config` completo y preservar el estado de cada bloque, habilitando solo el seleccionado.
  (2) Removido el badge gris con el `block_key` interno (nombre en inglés) en el módulo de bloques.
- **FIX DE DEPLOY (`6a56022`)**: el backend NO arrancaba en Cloud Run desde `aefa79d` ("aprobar pago con
  servicios extra") → _"failed to start and listen on PORT"_. Causa: `SequelizeConsultationRepository` empezó a
  inyectar `ConsultationExtraItemModel`, pero solo `ConsultationsModule` lo registró en
  `SequelizeModule.forFeature`; `PaymentsModule` y `AiTranscriptionModule` también proveen ese repo →
  `UnknownDependenciesException` en el bootstrap. Reproducido con **boot-test del dist** y verificado que la DI
  ahora resuelve completa. Registrado el modelo en ambos módulos. **Desbloqueó TODOS los deploys** (venían
  fallando en "Deploy backend" desde el mediodía).
- Guion QA de este lote: `07-qa-test-script.md` sección **D-2026-07-12b** (24 casos).

## 2026-07-13 — Lote QA masivo (post-migración, verificado en app Cloud Run)

**⚠️ REGLA CRÍTICA DE QA:** probar SIEMPRE en la app migrada `https://delta-frontend-knliodnwza-ue.a.run.app`
(NO en `deltasalud.app`, que es la app LEGACY en Vercel+Supabase sin ninguno de estos cambios). Ver
memoria `qa-prod-url-cloudrun`. El QA reportó "no funciona" varias veces por probar la app vieja.

**DESPLEGADO Y (mayormente) VERIFICADO en vivo con Playwright:**

- Modales de consulta (ficha, aprobar-pago-con-extras) que NO abrían: causa = se montaban solo en el
  return de la LISTA, no en el del EDITOR. Corregido (verificado en vivo).
- IA "Mejorar redacción": chips de modo (Mejorar/Formal/Acortar/Ampliar) + encabezado usa label del
  bloque (no el key). Sanitizer OK. Récipe/Reposo excluidos del selector.
- Récipe: validación en español + presentación obligatoria + Indicaciones al final/opcional + botón
  **"Dictar receta"** (voz→récipe: backend `parse_prescription` en POST /api/ai/text → pre-llena filas).
- Informe: puede incluir CUALQUIER bloque como sección (récipe/reposo/indicaciones), opt-in.
- Bloques por-consulta: agregar un bloque a una consulta ya NO toca la config global (solo su blocks_snapshot).
- Ficha del paciente: drawer lateral derecho + todos los campos (vacíos="Sin registrar") + editable.
- Modal "¿marcar atendida?" al salir de la consulta. Título de documentos centrado (fontSize mayor).
- Plantillas: la vista previa usa el render REAL por tipo (informe=bloques habilitados, récipe 2 hojas,
  reposo/paraclínico/recibo con su formato).
- Cobros: método de pago obligatorio + barrido de mensajes a español. Servicios: label "Precio USD unitario".
- Finanzas: refresco parcial (no recarga toda la pantalla) + botón "Crear paciente" en el modal de ingresos.
- Recordatorios: correo por **Resend** (plantilla branded `reminder_manual`, mig 20260713000001) — ya no mailto/Outlook.
- Login/Landing: "Delta Salud" (no "Delta"/"Medical CRM"), sin badges de tiendas ni métricas. T&C obligatorio
  en onboarding (shake+rojo). Settings: tasa de cambio va de primero. Crear médico: no envía `password`
  (rompía por DTO strict). Plan selector admin incluye Free Trial. Login va directo al portal (no landing).
- Admin: "Pacientes atendidos" también en /admin/patients. Agenda: el detalle muestra estado real
  (atendida/pagada) derivado de la lista (el endpoint `/detail` no existía → 404 tragado).
- Calendar: fix de `redirect_uri` (usaba 0.0.0.0:8080 en Cloud Run → mismatch); ahora APP_BASE_URL.

**✅ CERRADOS EN SESIÓN 2026-07-13 (continuación):**

1. **`consultation_code` en la agenda** (backend): ✅ commit `4d139e5` (SELECT + entidad + mapper).
2. **Consultas "lento"**: ✅ **profiling real hecho** (Playwright/Resource Timing en Cloud Run) + **fix commit
   `e1ddd5c`**. Diagnóstico: NO era backend/datos (1 sola consulta; endpoint ~520ms) sino **frontend puro** —
   `page.tsx` era UN único `'use client'` de **6.264 líneas** → ~1,9 MB de JS decodificado (30 chunks); la lista
   se cargaba con la server action `listConsultationsPaged` DESPUÉS de la hidratación (de ahí "Cargando…" largo).
   Fix: `page.tsx`→**Server Component** (fetch server-side de la 1ª página=15, initialConsultations como prop, ruta
   ahora `ƒ`, fallback robusto al fetch cliente); el cliente viejo movido a `ConsultationsClient.tsx`; layout
   `consultation-blocks`+`schedule` ahora en **paralelo** (Promise.allSettled, antes secuenciales, waterfall ~1,5s);
   `DoctorNotificationToast` silencia el 404 "Server Action was not found" de **version-skew** post-deploy.
   ⚠️ **PENDIENTE (pospuesto, riesgo alto):** extraer el EDITOR de consulta como isla `next/dynamic {ssr:false}`
   (líneas ~2438-5124) — comparte estado React profundo con la lista (`selected`/`report`/`consultations`/
   `doctorActiveBlocks`); sería el mayor golpe de bundle restante pero requiere refactor de arquitectura de estado.
   Verificado: `nx build frontend` OK (ruta `ƒ`), tsc 0, eslint limpio en page.tsx+toast. ⏳ falta DEPLOY + QA visual.
3. **Barrido backend inglés→es-VE en pagos**: ✅ commit `3b9aad1`. 8 domain errors de finances + 3 DTOs Zod
   (`update-payment-details-cobros`, `payment-status`, `attach-payment-receipt`). Usa `{ error }` de **Zod 4**
   (no `{ message }` deprecated). code-reviewer + security-agent: 0 CRITICAL/HIGH (anti-IDOR intacto, validación
   sin cambios semánticos). **Deuda anotada:** `InvalidPaymentTransitionError`/`PaymentNotFoundError` incluyen el
   UUID interno en el mensaje al cliente (preexistente, no regresión) → follow-up.
4. **CONFIG de Google Calendar**: ✅ **verificado a nivel INFRA (sin login)** — el OAuth ya funciona en prod: el
   endpoint `/api/integrations/google/auth` en Cloud Run redirige OK a Google; client `763714620325-823prmk160n99cpve9ustirmbq257c19`
   **ACTIVO** (no `deleted_client`); `redirect_uri` de Cloud Run **aceptado** (no `redirect_uri_mismatch`); scope
   `calendar.events` + secrets seteados. ⏳ Solo falta la prueba end-to-end: doctor real → Configuración →
   Integraciones → "Conectar" → consentimiento de Google (y doctor como _test user_ si la pantalla sigue en Testing).
   NOTA: el evento solo se crea para citas ONLINE (presenciales no, por diseño) y va al calendar del doctor.

**✅ DESPLEGADO Y VERIFICADO EN PROD (2026-07-13, run GA `29280837184` success):**
Push de los 3 commits → deploy auto de `feature/migracion-backend` OK. Verificación en vivo (Playwright):

- **#2 consultas:** SSR confirmado — el HTML del servidor ya trae `DLT-202607-0027`, **0 "Cargando…"**; el
  cliente NO refetchea la lista (usa datos SSR); **waterfall PARALELO** (`consultation-blocks`+`schedule`
  solapan ~175ms, antes secuenciales); console limpio (sin spam version-skew). ⚠️ El gap de hidratación
  (~1,5s antes de blocks) PERSISTE porque el bundle cliente sigue ~1,9MB (editor no extraído — ver punto 7).
- **#3 pagos:** ✅ verificado **end-to-end en prod** (drawer de Cobros, pago de prueba). Al disparar el rechazo
  Zod salieron 2 hallazgos que se arreglaron+desplegaron:
  1. **`fix(cobros)` `d222866`:** el drawer descartaba `result.error` y mostraba un genérico → los 3 handlers
     (detalles/ítem/estado) ahora muestran el mensaje real del backend con fallback. `loadExtraItems` silencia el
     404 de version-skew. Backend: se quitó el UUID interno de `PaymentNotFound`/`PaymentItemNotFound`/
     `InvalidPaymentTransition` (deuda de los reviewers; id queda como propiedad para logs). Fix de test:
     `money.vo.spec` asertaba el mensaje viejo en inglés (lo rompió el i18n `3b9aad1`; el backend-agent no corrió jest).
  2. **`fix(cobros)` `2870e39`:** el surface destapó un bug real — el drawer mandaba `paid_at` como `YYYY-MM-DD`
     pero el DTO exige `z.datetime()` (ISO), así que **"Guardar detalles" fallaba SIEMPRE que había fecha** (el
     genérico lo ocultaba). Ahora envía ISO a mediodía local (evita corrimiento TZ VE -4). Y el `ZodValidationPipe`
     ya NO antepone el path del campo en inglés (`paid_at:`) al top-level message (el array `errors` conserva el path).
     Verificación en vivo: referencia >200 → "La referencia no puede superar los 200 caracteres" (específico, sin
     prefijo); guardado válido → "Detalles guardados correctamente" + persiste método en la fila. ⚠️ el pago de prueba
     quedó con método "Efectivo (USD)" + ref "QA-OK-001" (borrable).

**✅ QA visual (Playwright) del flujo de consulta + PDFs — HECHO (2026-07-13):**

- Flujo consulta post-refactor: lista SSR, filtro estado (re-fetch), búsqueda, **deep-link `?open=`**, editor
  completo, **autosave** (escribir→persiste tras reload→restaurar) — TODO PASA. Riesgo del split descartado.
- PDFs: **Informe médico** ✅ (branded, título centrado, bloque renderizado — PDF leído). **Recibo** ✅ branded
  PERO 🐛 muestra la fecha de pago un día antes (date-only midnight-UTC formateado en local VE-4) — el
  almacenamiento es correcto, es display del recibo. Récipe-2-hojas/Reposo NO testeables (consulta sin esos bloques).

**✅ LOTE QA "3 observaciones" del usuario — DESPLEGADO Y VERIFICADO EN VIVO (2026-07-13):**
Commits `f03e9bd` + `d239eae` + `c142844` (deploys success, columna nueva vía migración `20260713000002`).

1. **#1 aprobar sin método** (`cobros/page.tsx` guard en `updatePaymentStatus`): ✅ verificado con un pago
   method-less real (creado con "Pagar después" → DLT-202607-0030) → "Marcar como aprobado" muestra
   **"Debes registrar un método de pago antes de aprobar el cobro"** y NO aprueba.
2. **#2 sidebar slim del editor**: ✅ quita datos del paciente/consulta/alertas (ya viven en la ficha), conserva
   botón "Ver ficha del paciente" + controles de pago. Verificado en vivo.
3. **#3 agregar bloque** ("expected record, received array" en inglés): ✅ raíz = `blocks_snapshot` sobrecargado
   (valores record + estructura array en una columna). Fix: **columna nueva `blocks_structure`** (array) separada
   de `blocks_snapshot` (valores record); BFF enruta por forma (Array→structure, objeto→snapshot); `getEffectiveBlocks`
   lee structure. Un 2º bug oculto salió en el QA en vivo: los items llegan con naming inconsistente (camelCase de
   la config del doctor vs snake_case del catálogo) → se relajó el DTO/entity a metadata opaca (`key` + passthrough,
   commit `c142844`). Verificado: agregar bloque → PATCH 200, tab aparece y **persiste tras reload**.
   ⚠️ dato de prueba nuevo creado: consulta **DLT-202607-0030** (Paciente Prueba QA, pago pendiente sin método) — borrable.

**⏳ PENDIENTE (RETOMAR):**

5. **Récipe 2 hojas / Reposo PDF**: verificar con una consulta que tenga esos bloques cargados (la de prueba no los tiene).
6. **🐛 Fecha del recibo un día antes** (display): formatear `paid_at`/fechas del recibo con `timeZone:'UTC'`.
   El almacenamiento es correcto; solo el render de `buildReceiptHtml` corre la fecha por TZ. Follow-up chico.
7. **(Opcional, gran win)** editor de consulta como isla dynamic — ataca el bundle ~1,9MB restante.
8. **Deuda de naming de bloques**: unificar camelCase/snake_case en los items de estructura (hoy funciona por el
   passthrough, pero es frágil). Y el `blocks_snapshot:[]` edge en el BFF (heurística por forma) — code-review MEDIUM.

Datos de prueba en la BD migrada (borrables): paciente "Paciente Prueba QA" (V-30111222) + consulta
DLT-202607-0027. Doctor de prueba lucas.rivas.55@gmail.com puesto en delta_plus por el usuario.
