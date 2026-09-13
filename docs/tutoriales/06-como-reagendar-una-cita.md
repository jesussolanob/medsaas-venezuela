# Video 6 — Cómo reagendar una cita

> Guion verificado contra el código de **producción** (`main`) el 2026-09-13.
> `RescheduleModal.tsx` y `AppointmentDetailModal.tsx` son **idénticos** en
> producción y en desarrollo: lo que se graba es exactamente lo que el
> especialista tiene hoy.

**Duración estimada:** 2 a 3 minutos
**Dónde grabar:** producción (`deltasalud.app`)
**Qué hace falta:** una cita futura con un paciente de prueba

---

## Antes de grabar — dos advertencias

1. **El error de "no se puede reagendar" ya está en español — falta promoverlo.**
   Si intentás reagendar una cita ya **atendida** o **cancelada**, producción
   todavía responde **en inglés**: _"Cannot reschedule an appointment in
   status…"_.
   La versión en español ya está escrita y probada en `develop`
   (commit `5afd3ed0`): _"Esta cita ya quedó atendida, y una cita cerrada no se
   puede mover de fecha. Si el paciente vuelve, agendale una cita nueva."_
   **Grabá este video DESPUÉS de promover el lote** y vas a poder mostrar el
   aviso correcto. Si hay que grabar antes, no muestres ese caso.
2. **Reagendar mueve también el evento de Google Calendar**, si el especialista
   tiene Google conectado. Si vas a mencionarlo, confirmá antes que la cuenta de
   grabación lo tenga conectado, o no lo menciones.

---

## Guion

### Escena 1 — Por qué se reagenda (0:00 – 0:20)

**Narración:**

> Un paciente te avisa que no puede venir el día que tenía. En vez de cancelar la
> cita y crear una nueva —que te haría perder el pago y el historial— la
> **reagendás**: la misma cita se mueve a otra fecha, con todo lo que ya tenía.

---

### Escena 2 — Los dos lugares desde donde se reagenda (0:20 – 0:50)

Se puede reagendar desde **tres** pantallas. Mostrá las dos principales:

| Desde dónde   | Cómo llegar                                                                   |
| ------------- | ----------------------------------------------------------------------------- |
| **Agenda**    | Clic en la cita → se abre **"Detalles de cita"** → botón **"Reagendar cita"** |
| **Consultas** | Abrís la consulta → en la barra de acciones, botón **"Reagendar"**            |
| _(Dashboard)_ | _También está en la cita destacada del inicio — opcional mostrarlo_           |

**Narración:**

> Podés reagendar desde dos lugares. Desde la **Agenda**, haciendo clic en la
> cita y después en **Reagendar cita**. O desde **Consultas**, si ya estabas
> trabajando en la consulta de ese paciente, con el botón **Reagendar**.
>
> Las dos abren la misma ventana, así que usá la que te quede más cómoda.

**Mostrar:** el camino desde la Agenda, que es el más natural.

---

### Escena 3 — Elegir la nueva fecha (0:50 – 2:00)

**En pantalla:** la ventana **"Reagendar cita"**.

Arriba te recuerda con quién y cuándo:

- **Paciente:** {nombre}
- **Cita actual:** {fecha y hora}

**Narración:**

> Arriba te recuerda de qué cita se trata: el paciente y la fecha que tiene
> ahora. Abajo elegís la nueva.

**Los tres controles, en orden:**

1. **Navegador de semanas** — las flechas a los costados mueven una semana
   adelante o atrás.
2. **Los días** — se muestran en fila; tocás el que querés.
3. **Los horarios** — aparecen recién cuando elegís un día.

**Narración sobre los horarios (es la parte importante):**

> Los horarios que ves acá **no son todas las horas del día**: son los que salen
> de tu horario de atención, con la duración de consulta que configuraste para
> ese consultorio.
>
> Y si un horario ya está tomado por otra cita, **aparece deshabilitado**: no
> te deja elegirlo. Así no podés encimar dos pacientes por error.

**Mostrar en cámara:**

- Un día con horarios disponibles.
- **Un horario ocupado**, que se ve apagado y no responde al clic. Vale la pena
  detenerse ahí un segundo.
- Un día sin horario configurado, donde dice
  **"No hay horarios configurados para este día"**. Explicá que eso significa que
  ese día no atendés según tu configuración, y que se cambia desde Consultorios.

**Al elegir día y hora**, abajo aparece el resumen: **"Nueva cita: {fecha y hora}"**.
El botón **Confirmar** recién se habilita cuando elegiste las dos cosas.

---

### Escena 4 — Confirmar (2:00 – 2:30)

**Clic en "Confirmar"** → aviso verde **"Cita reagendada correctamente"**.

**Narración:**

> Confirmás y listo. La cita se movió.
>
> Lo importante: **es la misma cita**. Conserva el paciente, el servicio, el
> monto y el pago si ya lo habías cobrado. No se crea nada nuevo y no se pierde
> nada.

**Mostrar:** volvé a la Agenda y señalá que la cita ya no está en el día viejo y
sí aparece en el nuevo.

---

### Escena 5 — El caso de la cita ya pagada (2:30 – 3:00)

Este es el punto que más dudas genera. Mostralo con una cita **con pago aprobado**.

**Narración:**

> ¿Y si el paciente ya te pagó?
>
> Se reagenda igual, y **el pago viaja con la cita**. No se le cobra de nuevo ni
> hay que devolverle nada.
>
> De hecho, vas a notar que en una cita ya pagada **el botón de cancelar no
> aparece**. En su lugar dice **"Pago aprobado — reagenda para modificar la
> fecha"**. Es a propósito: cancelar una cita cobrada dejaría la plata sin
> respaldo. Si el paciente no puede venir, se reagenda.

**Mostrar:** el cartel ámbar **"Pago aprobado — reagenda para modificar la fecha"**
en el panel de la consulta.

---

### Cierre

> Resumiendo: reagendar mueve la cita completa, con su pago y su historial. Los
> horarios que se te ofrecen salen de tu propia configuración y los ocupados no
> se pueden elegir. Y si la cita ya estaba pagada, reagendar es justamente el
> camino correcto.

---

## Respaldo técnico

| Afirmación del video                                       | Dónde está                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Tres entradas al reagendado                                | `ConsultationsClient.tsx`, `agenda/page.tsx`, `doctor/page.tsx`       |
| Los horarios salen del horario del consultorio             | `RescheduleModal.generateTimeSlots()`                                 |
| Un horario ocupado no se puede elegir                      | `isSlotBlocked` / `lib/slot-availability` — ADR-035                   |
| Una cita pagada no ofrece cancelar                         | `ConsultationsClient.tsx` — condición `payment_status !== 'approved'` |
| Mensaje "Pago aprobado — reagenda para modificar la fecha" | mismo archivo, rama del `else`                                        |
| Reagendar mueve el evento de Google Calendar               | `UpdateCalendarEventUseCase`, best-effort                             |

## Lo que NO hay que decir

- ❌ "Podés reagendar cualquier cita" — una cita **atendida** o **cancelada** no
  se puede mover. Hasta que se promueva el lote, ese aviso sale en inglés.
- ❌ "Se le avisa solo al paciente por WhatsApp" — el recordatorio automático por
  WhatsApp no está implementado.
