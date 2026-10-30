# Plan de retención de especialistas

> Pedido del dueño (2026-10-29). Decisiones tomadas el 2026-10-30 (sección A) — **vinculantes**.
> Rama de trabajo: `feature/retencion` (desde `develop`). Una fase = un lote QA → prod.

## Contexto: qué existe y se reutiliza

| Pieza                                                       | Dónde                                                                                          | Uso en este plan                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Plantillas de correo editables + `email_send_log`           | `email_templates` (seed por migración), `MailerService.sendTemplate`, `/admin/email-templates` | Plantillas nuevas (fase 1 y 4)                                                                      |
| Cron diario de inactividad (**ENABLED en prod**, 09:00 UTC) | `POST /api/cron/doctor-inactivity` → `DispatchDoctorInactivityNoticesUseCase`                  | Se le suma la invitación a reunión (fase 4)                                                         |
| Extensión manual de suscripción                             | `POST /api/admin/subscriptions/extend` → `ExtendDoctorSubscriptionUseCase`                     | Mes de gracia (fase 4). ⚠️ Hoy pasa la prueba a `active`: hay que conservar `trialing`/`free_trial` |
| Actividad                                                   | `profiles.last_sign_in_at` (se toca en cada login), `telemetry_sessions`                       | Condiciones del modal y medición                                                                    |
| Contactar (admin)                                           | `ContactarModal` en `/admin/subscriptions`                                                     | Seguimiento de solicitudes (fase 1)                                                                 |
| `app_settings` (clave/valor) + allow-list                   | `F/app/api/admin/app-settings/route.ts`                                                        | Link de agenda y contacto de soporte                                                                |
| Modal de bienvenida                                         | `WelcomeModal` + `profiles.welcome_dismissed_at`                                               | Prioridad entre modales                                                                             |

Huecos que este plan cierra: no hay registro genérico de "aviso visto", no hay novedades,
los números de soporte están fijos y **no coinciden** (`584221033582` en `UpgradeClient.tsx:104`
vs `584145209751` en `help/page.tsx:148`), y la extensión rompe el estado de prueba.

## A. Decisiones del dueño (2026-10-30)

1. **Agenda de la reunión — DENTRO de Delta** (decisión 2026-10-30, reemplaza la de Google
   Calendar externo): el especialista ve en el modal **sus propios horarios disponibles de
   consulta** (los mismos que ven sus pacientes al reservar), elige uno y **lo bloquea para
   nosotros**. La reunión queda agendada **automáticamente** en su agenda de Delta y en los
   calendarios/correos del equipo de admins (Google Meet). Nunca sale de Delta. Ver E.
2. **Mes de gracia:** lo otorga el equipo **después de la reunión**, con un botón en admin.
   Nunca automático. Si el especialista ya tiene **plan pago**, se le regalan **30 días** sobre
   su plan a cambio del feedback de la reunión.
3. **Destinatarios del correo:** especialistas en prueba a los que les quedan **7 días**, y los
   que tienen la prueba **vencida hace ≤ 30 días**. Una sola vez por especialista.
4. **"Contáctame ya":** se guarda una **solicitud**, llega un **correo a todos los super_admin**
   y aparece en **Admin → Solicitudes de contacto** con estado y seguimiento. Promesa: menos de
   1 hora; opción "Llámame ya" para contacto inmediato. Número único de soporte +58 422 103 3582.
5. Orden de fases: base + Contáctame → Novedades → Modal de reunión → Correo + mes de gracia.
6. **Propósito de la reunión (2026-10-30):** conocer al especialista, su experiencia con Delta
   y qué le falta a Delta para quedarse. No es una demo de ventas. El mes de gracia es el
   agradecimiento por su tiempo.
7. **El correo no lleva a la agenda: invita a iniciar sesión.** Su botón lleva a Delta y, al
   entrar, el especialista ve el **modal de agendar** (el de la fase 3). La agenda se abre desde
   el modal.
8. **Máximo un correo de cron por especialista por día**, contando todos los avisos automáticos
   (inactividad de 10 y 15 días e invitación a reunión).

## B. Base común (va en la fase 1)

### B.1 Configuración del equipo (`app_settings`, editable en Admin)

Claves nuevas, agregadas a la allow-list y a una sección "Contacto y retención" de
`/admin/settings`:

- `support_whatsapp_number` — solo dígitos con código de país. **Valor: `584221033582`
  (+58 422 103 3582), el único número de soporte de Delta** (decisión 2026-10-30).
- `meeting_prompt_enabled`, `meeting_prompt_min_days`, `meeting_prompt_snooze_days`,
  `meeting_prompt_max_shows` — fase 3.

Endpoint para el panel del doctor: `GET /api/doctor/support-info` → `{ whatsapp, meetingUrl,
callNowAvailable }`.
**Unificación del número** (todas las apariciones pasan a leer de acá; no debe quedar otro):
`app/help/page.tsx:148,154` (hoy `+58 414 520 9751`, **incorrecto**),
`app/doctor/upgrade/UpgradeClient.tsx:104` y `app/doctor/onboarding/page.tsx:19` (hoy fijos con
el número correcto). **El botón "Hablar con ventas" de la landing también usa este número**
(decisión 2026-10-30: el mismo número en todos lados): `sales_whatsapp_number` deja de ser una
clave aparte y la landing lee `support_whatsapp_number` (se conserva `sales_whatsapp_message`).
Verificar el valor cargado en staging y prod al desplegar.

Los avisos al equipo **no** usan una dirección configurada: van a los mismos destinatarios que el
correo "Nuevo doctor pendiente de verificación" — todos los perfiles `super_admin`
(`repo.findAllSuperAdmins()` en `complete-registration.use-case.ts:250`).

### B.2 Registro de avisos por especialista — tabla `doctor_prompts`

```
id UUID PK, doctor_id UUID FK profiles, prompt_key TEXT,
shown_count INT DEFAULT 0, first_shown_at, last_shown_at,
acted_at, snoozed_until, dismissed_at, metadata JSONB,
created_at, updated_at, UNIQUE (doctor_id, prompt_key)
```

`prompt_key`: `meeting_modal`, `email:meeting_invite`, `release:<id>`. Fechas siempre las pone el
servidor (`now()`), nunca el front. Endpoints doctor: `POST /api/doctor/prompts/:key/shown|acted|
snooze|dismiss`.

### B.3 Un modal por visita

En `/doctor` (Inicio) se decide un solo modal, en este orden: onboarding pendiente → tour de
bienvenida → novedades no vistas → invitación a reunión. Si uno se muestra, los demás esperan a
la próxima visita.

## C. Fase 1 — "Contáctame ya" (decisiones 2026-10-30)

- **Botón** visible para **todos** los especialistas (cualquier plan), en la barra superior del
  panel junto a Ayuda y dentro de `/help`. **Llamativo sin romper la línea gráfica**: botón teal
  sólido de Delta (`g-bg`) con ícono de teléfono y un pulso sutil (respeta
  `prefers-reduced-motion`); en móvil, ícono con etiqueta corta.
- **Modal**:
  - Opción destacada **"Llámame ya"** (contacto inmediato por llamada).
  - O elegir canal: WhatsApp / llamada / correo.
  - Mensaje opcional (≤ 500).
  - Compromiso: **"Te contactaremos en menos de 1 hora"**; con "Llámame ya": **"Te llamamos en
    los próximos 15 minutos"**.
  - **Horario de atención: lunes a sábado, 8:00 a. m. a 6:00 p. m. (hora de Caracas).** Fuera
    de ese horario **se oculta "Llámame ya"** y el compromiso pasa a "Te contactamos al iniciar
    nuestro horario de atención (lunes a sábado, 8:00 a. m.)". El horario lo evalúa el
    **backend** en hora de Caracas (`GET /api/doctor/support-info` devuelve `callNowAvailable`),
    nunca el reloj del navegador; y el backend rechaza `call_now` fuera de horario. Horario
    guardado en `app_settings` (`support_hours`), editable en Admin.
  - Enlace secundario "Escribir por WhatsApp ahora" → +58 422 103 3582.
- **Tabla `contact_requests`**: `id, doctor_id, channel (call_now|whatsapp|call|email),
message, status (pending|contacted|resolved), handled_by, handled_at, notes, created_at,
updated_at`. Anti-spam: máximo 1 solicitud `pending` por especialista (la segunda actualiza la
  existente) y rate-limit 3/día.
- **Aviso al equipo**: plantilla nueva `support_contact_request` a **todos los `super_admin`**
  (mismo mecanismo que `doctor_pending_verification`). Con "Llámame ya" el asunto lleva
  **URGENTE**. Contenido: nombre, plan, especialidad, teléfono, canal, mensaje y link a la
  solicitud. Sin datos de pacientes. **Sin aviso por WhatsApp** por ahora.
- **Admin → Solicitudes de contacto** (`super_admin`): lista con filtros de estado y fecha,
  botón Contactar (reutiliza `ContactarModal`), cambiar estado y notas. Contador de pendientes en
  la campana del admin.
- **Criterio de aceptación**: el especialista envía, todos los super_admin reciben el correo, la
  solicitud aparece en admin, pasa a contactado/resuelto; un segundo envío no duplica; no queda
  ningún número de soporte distinto de +58 422 103 3582 en el código.

## D. Fase 2 — Novedades de versión

Decisiones 2026-10-30: publica **cualquier administrador** (`super_admin` y `admin`); cada
novedad lleva **solo fecha y título** (sin número de versión); **todas** salen en el modal; van
**solo a especialistas** (no a vendedores ni pacientes).

- **Tabla `release_notes`**: `id, title (≤ 80), body (texto plano, ≤ 1500), image_url NULL,
audience_plans TEXT[] NULL (null = todos los planes), published_at NULL (borrador),
created_by, created_at, updated_at`.
- **Admin → Novedades** (`@Roles('super_admin','admin')`): crear, editar, borrar borradores,
  publicar y despublicar; vista previa idéntica al modal. Imagen subida a GCS con el mismo flujo
  de logos.
- **Visto**: columna `profiles.release_notes_seen_at`. El especialista ve las novedades con
  `published_at > max(release_notes_seen_at, profiles.created_at)` y de su plan. "Entendido" →
  `POST /api/doctor/release-notes/seen` (el servidor pone `now()`); cerrar sin "Entendido" =
  vuelve a salir en la próxima visita.
- **Modal**: carrusel (la más nueva primero, máximo 5). Muestra fecha y título; el texto con
  saltos de línea y listas `- ` se renderiza como texto, **nunca** HTML.
- **Historial**: Ayuda → Novedades (todas las publicadas para su plan).
- La primera novedad publicada anuncia "Contáctame ya" y plantillas/documentos.

## E. Fase 3 — Modal "Queremos conocerte" + agendamiento dentro de Delta

Decisiones 2026-10-30: texto del modal aprobado; "Ahora no" lo pospone **1 día**; se muestra a
**todos** los especialistas al menos una vez (prueba y planes pagos); **no** se muestra a quien
ya agendó; el agendamiento ocurre **dentro de Delta**.

- **Texto**: "{nombre}, queremos conocerte. Estamos construyendo Delta junto a especialistas
  como tú. Nos encantaría escuchar tu experiencia: qué te sirve, qué no, y qué te falta. Son 30
  minutos por videollamada, y como agradecimiento te regalamos un mes más de Delta."
- **Quién lo ve**: (a) quien recibió el correo de invitación (fase 4) y no agendó, o (b) todo
  especialista con al menos `meeting_prompt_min_days` (3) desde el registro. Nunca a quien tiene
  una reunión agendada o hecha, ni a quien eligió "No me interesa". Máximo
  `meeting_prompt_max_shows` (3) veces. Evalúa el **backend**: `GET /api/doctor/prompts/meeting`.
- **Botones**: "Agendar reunión" (paso 2 del modal), "Ahora no" (vuelve **al día siguiente**,
  `meeting_prompt_snooze_days` = 1), "No me interesa" (no vuelve).
- **Paso 2 — elegir horario (de SU agenda)**: el modal muestra los próximos días con **los
  horarios libres del propio especialista**, calculados con `GetAvailableSlotsUseCase` (sus
  consultorios, menos citas y bloqueos; mismo cálculo que la reserva pública). La reunión dura
  30 min y empieza al inicio del horario elegido. El backend revalida al confirmar.
- **Al confirmar** (tabla `team_meetings`: `id, doctor_id, starts_at, ends_at,
status (scheduled|done|no_show|cancelled), meeting_url, external_event_id, availability_block_id,
source (email|modal), notes, created_at, updated_at`):
  - se crea un **bloqueo** en su agenda (`availability-blocks`, motivo "Reunión con el equipo
    Delta"): aparece en su agenda y ningún paciente puede reservar esa hora;
  - se crea el evento con **Google Meet** en el calendario del **anfitrión del equipo** (ver
    E.1), invitando al especialista y a todos los `super_admin` → Google envía la invitación y
    el evento aparece en el calendario de cada uno;
  - correo de confirmación de Delta al especialista y a todos los `super_admin` con el link;
  - `doctor_prompts('meeting_modal').acted_at`.
- **Reprogramar / cancelar** (decidido): el especialista puede hacerlo él mismo hasta 2 h antes,
  desde un aviso en su Inicio; se mueve/borra el bloqueo y el evento de Google, y se avisa al
  equipo.
- **Recordatorios** (decidido): correo 24 h antes y 1 h antes, al especialista y al equipo (por el
  cron de 15 min). No cuentan para la regla de "un correo automático por día".
- **Admin → Reuniones**: lista con estado, marcar hecha / no asistió / cancelar, notas del
  feedback, y desde una reunión hecha el botón "Otorgar mes de gracia (reunión)".
- **E.1 Anfitrión de Google Meet** (decidido): **siempre Jesús Solano**. Su cuenta de Delta es
  de Google (`super_admin`); la conecta **una vez** desde Admin como anfitriona (adaptar la
  integración de Google, hoy solo para especialistas, a un `super_admin`). Todos los
  `super_admin` (3) reciben la invitación.
- **E.5 Sin horarios configurados** (decidido, opción b): si el especialista no tiene
  consultorios con horario, el modal le ofrece un horario genérico **lunes a sábado, 8:00 a. m.
  a 6:00 p. m.** (hora de Caracas), en bloques de 30 min. Igual se crea el bloqueo en su agenda.
- **E.6 Choques** (decidido): **se permiten** reuniones a la misma hora de especialistas
  distintos; el anfitrión sigue siendo Jesús y el equipo (3 admins) se organiza para atender.
  No se ocultan horarios por reuniones del equipo.

## F. Fase 4 — Correo de reunión + mes de gracia

- **Plantilla** `retention_meeting_invite` (editable). Tono: "queremos conocerte y escuchar tu
  experiencia; tu opinión define lo que construimos; como agradecimiento, un mes más de prueba".
  Botón **"Iniciar sesión en Delta"**. Variables: `{{doctorName}}`, `{{trialStatus}}` (texto
  "vence en N días" / "venció hace poco"), `{{loginUrl}}` (link de seguimiento, ver abajo).
- **Al iniciar sesión** el especialista con invitación pendiente ve el modal de agendar de la
  fase 3 (con prioridad sobre las condiciones de "poco uso": basta tener la invitación enviada y
  no haber agendado ni descartado).
- **Un correo de cron por día**: antes de enviar cualquier aviso automático se comprueba si ese
  especialista ya recibió otro hoy (`email_send_log` por destinatario y plantilla de ciclo de
  vida). Si coinciden, **va primero la invitación** y el de inactividad espera al día siguiente.
- **Dos correos por especialista** (decisión 2026-10-30), cada uno una sola vez:
  - `email:meeting_invite_pre` — cuando a la prueba le quedan 7 días.
  - `email:meeting_invite_expired` — cuando se le vence la prueba (dentro de los 30 días
    siguientes, por si ese día no se pudo enviar).
  - El segundo **no** se envía si ya agendó desde el modal, si ya tiene el mes de gracia, o si
    ya no está vencido (renovó o se le extendió).
  - **Ninguno** se envía a quien eligió "No me interesa" en el modal: el correo lo invita a un
    modal que ya no le aparecería (decisión del lead 2026-10-30, **pendiente de confirmar con el
    dueño**).
- **Lanzamiento** (decisión 2026-10-30, opción A): el primer día también reciben el correo los
  que **ya** están en la ventana (prueba con ≤ 7 días o vencida hace ≤ 30 días). Antes de activar
  el envío en prod, contar cuántos son y reportarlo al dueño.
- **Texto aprobado** por el dueño (asunto "{nombre}, queremos conocerte"), ver borrador en el
  historial de la conversación del 2026-10-30.
- **Envío**: nuevo paso del cron diario `doctor-inactivity` (sin job nuevo). Candidatos:
  - prueba activa con `current_period_end` entre ahora y +7 días, o
  - `past_due` por vencimiento de prueba con `current_period_end` en los últimos 30 días,
  - y sin `doctor_prompts('email:meeting_invite')`, y sin correo de inactividad ese mismo día.
    Tope por corrida (200) como el de inactividad. Registro en `doctor_prompts` + `email_send_log`.
- **Link de seguimiento**: `GET /r/meeting?t=<token firmado>` → registra el clic en
  `email:meeting_invite` y redirige al **login** (`/doctor?from=meeting_invite`). El token lleva
  doctor_id y expira (HMAC con un secreto de entorno), no expone datos ni inicia sesión solo.
- **Mes de gracia** (después de la reunión): en la ficha admin del especialista, botón
  "Otorgar mes de gracia (reunión)" → `ExtendDoctorSubscriptionUseCase` con `months: 1` y motivo
  fijo. Si la prueba ya venció, el mes cuenta **desde el día en que se otorga** (decisión
  2026-10-30); si sigue vigente, se suma al vencimiento actual. **Arreglo previo**: si el plan es `free_trial` y el estado `trialing`/`past_due` por
  prueba, conservar plan `free_trial` y estado `trialing`; registrar `action='grace_month'` en
  `subscription_changes_log`. Una sola vez por especialista (si ya tiene `grace_month`, el botón
  avisa).
- **Medición** (tarjeta en el dashboard admin): invitaciones enviadas, clics, meses otorgados,
  solicitudes de contacto, y cuántos volvieron a ingresar en los 14 días siguientes.

## G. Reglas para la implementación

- Backend DDD de 4 capas, migraciones `.cjs` (Postgres **no** admite `ADD CONSTRAINT IF NOT
EXISTS`), Zod en `@delta/shared-types`, errores de dominio, `@Roles('super_admin')` en admin.
- Validar cada migración contra la BD de **staging** (clon de prod) dentro de BEGIN…ROLLBACK
  antes de commitear: los tests usan Sequelize simulado.
- Staging manda correo **real**: probar los correos con cuentas propias; antes de activar el
  envío de la fase 4 en staging, revisar quién cumple las condiciones en la BD clonada.
- Actualizar la guía del asistente (`specialist-guide` y `super-admin-guide`) en cada fase.
- QA en navegador antes de cada promoción (verde en tests no es verde en pantalla).

## H. Riesgos

- **Correo masivo en staging**: la BD es un clon de prod → el cron de la fase 4 podría escribirle
  a especialistas reales. Mitigación: la guarda de Scheduler del deploy ya impide crons en
  staging; probar el caso de uso invocándolo para una cuenta propia.
- **Fatiga de avisos**: un solo modal por visita, topes y snooze; el correo, una sola vez.
- **Abuso del mes de gracia**: solo admin, una vez por especialista, con motivo registrado.
