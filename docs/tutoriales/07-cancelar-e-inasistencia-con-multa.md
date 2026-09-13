# Video 7 — Cancelar una cita y registrar inasistencia (con multa)

> Guion verificado contra el código de **producción** (`main`) el 2026-09-13.
> `NoShowModal.tsx` es **idéntico** en producción y en desarrollo, incluido el
> arreglo del cobro inflado. Se puede grabar contra producción sin reservas.

**Duración estimada:** 4 a 5 minutos
**Dónde grabar:** producción (`deltasalud.app`)
**Qué hace falta:** **dos** consultas de prueba — una **impaga** y una **pagada**

---

## Antes de grabar — prepará los dos casos

El video no se entiende con un solo ejemplo, porque la plata se comporta distinto
según si el paciente ya pagó. Dejá listas:

- **Consulta A — impaga**, con un monto cargado (ej. $30).
- **Consulta B — pagada**, con el pago aprobado (ej. $40).

Si podés, usá montos distintos y fáciles de seguir en cámara. Después de grabar,
**revisá Cobros** para mostrar el efecto real — es lo que le da autoridad al video.

---

## Guion

### Parte 1 — Cancelar una cita

#### Escena 1 — Cuándo se cancela (0:00 – 0:30)

**Narración:**

> Cancelar es para cuando la cita **no va a ocurrir y no se reemplaza por otra**.
> Si el paciente se va a reagendar, no canceles: usá Reagendar, que conserva
> todo. Y si el paciente simplemente no vino, tampoco canceles: eso se registra
> como **inasistencia**, que es lo que vemos en la segunda parte.

#### Escena 2 — Cómo se cancela (0:30 – 1:00)

**En pantalla:** consulta abierta → barra de acciones → botón **"Cancelar cita"**.

**Mostrar:** el aviso **"Cita cancelada"** y que el estado pasa a **Cancelada**.

**Narración:**

> Abrís la consulta, y en la barra de acciones está **Cancelar cita**. Confirmás
> y la cita queda marcada como **Cancelada**.

#### Escena 3 — Cuándo NO te deja cancelar (1:00 – 1:30)

**Mostrar la consulta B (pagada):** el botón de cancelar **no está**. En su lugar
aparece el cartel ámbar **"Pago aprobado — reagenda para modificar la fecha"**.

**Narración:**

> Fijate en esta otra consulta, que ya está pagada: **el botón de cancelar no
> aparece**. En su lugar te dice _"Pago aprobado — reagenda para modificar la
> fecha"_.
>
> Es a propósito. Cancelar una cita que ya cobraste dejaría esa plata sin
> ninguna cita que la respalde, y tus finanzas dejarían de cuadrar. Si el
> paciente no puede venir, la reagendás y el pago viaja con ella.

**También mostrá**, si tenés una cita ya cerrada, el cartel
**"Cita atendida — no admite más cambios"**.

> Y una cita que ya está atendida o cancelada no admite más cambios: te lo avisa
> en pantalla en vez de dejarte apretar un botón que solo iba a dar error.

---

### Parte 2 — El paciente no asistió

#### Escena 4 — Abrir el registro de inasistencia (1:30 – 2:00)

**En pantalla:** consulta A (impaga) → botón **"No asistió"**.

Se abre la ventana **"El paciente no asistió"** con el nombre del paciente.

**Narración:**

> Cuando el paciente directamente no vino, usás **No asistió**. Y acá Delta Salud
> no solo marca la falta: te resuelve las tres cosas que definen el caso en un
> solo paso. Si cobrás multa, cuánto, y si el paciente se reagenda.

#### Escena 5 — Qué pasa con la plata, ANTES de confirmar (2:00 – 2:45)

Lo primero que aparece es un recuadro que te dice qué va a pasar con el dinero.

**Con la consulta impaga (recuadro gris):**

> _"Esta consulta está **impaga ($30)**. Si el paciente no reagenda, el costo
> pasa a $0 y sale de **Por cobrar**."_

**Narración:**

> Antes de confirmar nada, te dice qué va a pasar con la plata. Esta consulta
> está impaga: si el paciente no reagenda, el costo se va a cero y **sale de Por
> cobrar**. Tiene sentido: no diste la consulta, no hay nada que cobrar.

**Ahora mostrá la consulta B (pagada) — recuadro verde:**

> _"Esta consulta ya está **pagada ($40)**. El monto cobrado se mantiene: por el
> portal no hay devolución."_

**Narración:**

> En una consulta ya pagada, el mensaje es otro: **el monto cobrado se mantiene**.
> El paciente faltó, así que el cobro queda. Si vos decidís devolverle la plata,
> lo hacés por fuera y corregís el monto a mano.

#### Escena 6 — La multa (2:45 – 3:45)

**En pantalla:** casilla **"Cobrar multa por inasistencia"**.

**Narración:**

> Si tenés política de multa por inasistencia, tildás **Cobrar multa por
> inasistencia** y escribís el monto. Arranca en cero y es **siempre opcional**:
> si no la tildás, no se cobra nada.
>
> El monto que pongas **se suma al costo de la consulta**.

**Mostrar con la consulta impaga:** poné multa de $10 y señalá cómo cambia el
texto del recuadro de arriba:

> _"…el costo pasa a **$10** y eso es lo que queda **Por cobrar**."_

**Narración:**

> Mirá cómo cambia el mensaje de arriba en vivo: la consulta impaga pasa de $30 a
> **$10**, que es la multa, y eso es lo que te queda por cobrar. No le cobrás la
> consulta que no diste: le cobrás la multa.

**Ahora con la consulta pagada + multa:** aparece el aviso ámbar.

> _"El costo pasa a **$50** y la consulta vuelve a **Por cobrar** por el total.
> Cuando cobres la diferencia, aprobá el pago de nuevo."_

**Narración:**

> Y acá está el caso que hay que entender bien. Si la consulta **ya estaba
> pagada** y le sumás una multa, el costo sube a $50 y la consulta **vuelve a Por
> cobrar por el total**, no solo por los $10 de diferencia.
>
> ¿Por qué? Porque el sistema no maneja pagos parciales: un pago está pendiente o
> aprobado, no hay medias tintas. Así que cuando el paciente te pase los $10 que
> faltan, volvés a aprobar el pago y queda saldado en $50.

#### Escena 7 — ¿Reagenda o no? (3:45 – 4:30)

**En pantalla:** la pregunta **"¿El paciente va a reagendar?"** con dos botones:
**"No reagenda"** y **"Sí, elegir fecha"**.

**Camino A — "No reagenda":**

**Mostrar:** aviso **"Inasistencia registrada"**. La cita queda en **No asistió**.

**Camino B — "Sí, elegir fecha":**

**Mostrar:** se abre directamente la ventana de **Reagendar cita** — la misma del
video anterior. Elegís fecha y hora, confirmás, y sale
**"Inasistencia registrada y cita reagendada"**.

**Si la consulta estaba pagada**, arriba del calendario aparece:

> _"La consulta ya estaba pagada: el pago viaja con la cita a la nueva fecha, no
> se cobra de nuevo."_

**Narración:**

> Al final te pregunta si el paciente va a reagendar. Si decís que sí, te abre
> directamente el calendario y resolvés todo de una: queda registrada la falta,
> aplicada la multa si correspondía, y la cita nueva agendada.
>
> Y si la consulta ya estaba pagada, te lo aclara: **el pago viaja con la cita**,
> no se cobra de nuevo.

#### Escena 8 — Verificar en Cobros (4:30 – 5:00)

**Mostrar:** entrá a **Cobros** y señalá los montos.

**Narración:**

> Y para cerrar, lo más importante: andá a **Cobros** y vas a ver reflejado
> exactamente lo que acabamos de hacer. La consulta impaga con multa de $10
> aparece por $10 —no por los $30 originales— y la que estaba pagada aparece por
> el total con la multa incluida.
>
> Esa es la idea: lo que registrás en la consulta es lo que te aparece para
> cobrar. Sin planillas aparte.

---

## Resumen visual para poner en pantalla

| Situación             | Si NO reagenda                                       | Si reagenda                    |
| --------------------- | ---------------------------------------------------- | ------------------------------ |
| **Impaga, sin multa** | Costo $0 — sale de Por cobrar                        | Sigue el flujo normal          |
| **Impaga, con multa** | Costo = la multa — queda Por cobrar                  | Costo + multa, sigue pendiente |
| **Pagada, sin multa** | El cobro se mantiene, no se toca nada                | El pago viaja a la fecha nueva |
| **Pagada, con multa** | Costo + multa → **vuelve a Por cobrar por el total** | Igual, y se reagenda           |

---

## Respaldo técnico

| Afirmación del video                           | Dónde está                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| La matriz completa de la plata                 | `NoShowModal.tsx` — ADR-031                                        |
| La multa arranca en $0 y es opcional           | `NoShowModal.tsx:85-87`                                            |
| Pagada + multa vuelve a pendiente por el total | `buildPatch()` — no hay pagos parciales (enum `pending\|approved`) |
| Impaga sin reagenda: costo = multa, o 0        | `buildPatch()`, rama `!willReschedule`                             |
| Una cita pagada no ofrece cancelar             | `ConsultationsClient.tsx`                                          |
| "Cita {estado} — no admite más cambios"        | `ConsultationsClient.tsx` — ADR-075                                |
| Por el portal no hay devolución                | decisión del dueño, 2026-08-16                                     |

## Lo que NO hay que decir

- ❌ "Podés cobrar solo la diferencia de la multa" — **no existen pagos
  parciales**. Vuelve a Por cobrar por el total.
- ❌ "El sistema le devuelve la plata al paciente" — no hay devoluciones por el
  portal. Se corrige el monto a mano.
- ❌ "Cancelá la cita si el paciente no vino" — eso es **inasistencia**, no
  cancelación. Confundirlas rompe las finanzas: un `no_show` pagado cuenta como
  ingreso, una cancelación no.
