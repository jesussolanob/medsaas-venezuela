# Video 3 — Cómo registrar tu primera consulta

> Guion verificado contra el código de **producción** (`main`) el 2026-09-13.

**Duración estimada:** 6 a 7 minutos
**Dónde grabar:** producción (`deltasalud.app`) → **Consultorio › Consultas**
**Qué hace falta:** un paciente de prueba y **al menos un servicio creado**

---

## Antes de grabar

1. **Tiene que existir un servicio.** Sin eso el modal dice _"No tienes planes
   configurados"_ y ofrece ir a configurarlos. Si querés mostrar ese mensaje,
   mostralo a propósito; si no, dejá el servicio listo.
2. **Usá Pago Móvil o Transferencia, no Efectivo.** Hay un defecto vivo en
   producción: Configuración guarda el efectivo con una clave distinta de la que
   busca la pantalla de cobro, y el método **desaparece del selector**.
3. **Para un servicio de varias sesiones (paquete), grabá aparte.** El
   comportamiento de paquetes cambió y todavía no está promovido: lo que veas hoy
   no es lo que va a haber en unas semanas. Para este video usá un **servicio
   simple**.

---

## Guion

### Escena 1 — Las dos formas de que nazca una consulta (0:00 – 0:45)

**Narración:**

> En Delta Salud una consulta puede nacer de dos maneras.
>
> La primera es **sola**: cuando un paciente reserva por tu enlace público, o
> cuando vos cargás una cita en la agenda, la consulta se crea automáticamente y
> te queda esperando. No hay que hacer nada.
>
> La segunda es **a mano**, desde el botón **Nueva consulta**, y es la que vamos
> a ver: sirve cuando el paciente llegó sin cita, o cuando estás cargando algo
> que ya atendiste.

---

### Escena 2 — Crear la consulta (0:45 – 2:30)

**En pantalla:** Consultas → botón **Nueva consulta** → se abre el modal.

**Los campos, en orden:**

| Campo                             | Obligatorio | Qué decir                                         |
| --------------------------------- | ----------- | ------------------------------------------------- |
| **Paciente**                      | Sí          | Buscador. Escribí el nombre o la cédula.          |
| **Fecha y hora**                  | —           | Podés poner una fecha pasada.                     |
| **Motivo de consulta**            | No          | _"Ej: Revisión general, dolor de cabeza…"_        |
| **Plan de consulta**              | Sí          | El servicio que le vas a cobrar.                  |
| **Método de pago**                | Sí          | Solo aparecen los que activaste en Configuración. |
| **Referencia / Nro. comprobante** | No          | _"Ej: #12345, últimos 4 dígitos…"_                |
| **Adjuntar comprobante**          | No          | La foto de la transferencia.                      |
| **Comentarios / Notas**           | No          |                                                   |

**Narración sobre el buscador de paciente:**

> Buscás al paciente por nombre o por cédula. Y la búsqueda **no distingue
> acentos**: si lo cargaste como "Pérez" y escribís "Perez", igual lo encuentra.

**Narración sobre la fecha — este es el punto fuerte:**

> Fijate en la fecha: **podés poner una fecha pasada**. Si se te fue la luz, o
> simplemente atendiste y cargaste después, ponés el día real en que atendiste y
> la consulta **queda registrada como atendida directamente**. No tenés que
> volver después a marcarla.

**Narración sobre el plan y el método de pago:**

> El **plan de consulta** es el servicio que le cobrás. Y en **método de pago**
> solo vas a ver los que activaste en Configuración — si te falta uno, se agrega
> ahí.

**Mostrar:** guardar, y que la consulta aparece en el listado.

---

### Escena 3 — Abrir la consulta y llenarla (2:30 – 4:30)

**En pantalla:** clic en la consulta → se abre el panel de edición **dentro de la
misma lista**.

**Narración:**

> Hacés clic en la consulta y se abre acá mismo, sin cambiar de pantalla.
>
> Lo que ves son **tus bloques**: los que elegiste al registrarte y que podés
> cambiar cuando quieras desde Configuración. Cada especialista arma su consulta
> como la usa.

**Mostrar:** escribir en un par de bloques.

**El detalle que hay que señalar — arriba a la derecha:**

> Mirá arriba: dice **"Auto-guardado activo"**, y mientras escribís pasa a
> **Guardando…** y después a **Guardado**. No tenés que apretar nada: lo que
> escribís se guarda solo.
>
> Igual está el botón de guardar si querés forzarlo.

**Mostrar el editor con formato:**

> El texto acepta **negrita, cursiva y viñetas**. El paciente ve ese formato tal
> cual cuando le compartís el documento.

---

### Escena 4 — La grabación con IA (4:30 – 5:15)

**En pantalla:** el bloque **Grabar la consulta**.

⚠️ **Grabá esta escena con una cuenta que tenga el plan correspondiente.** Si el
plan no la incluye, en vez del grabador aparece un recuadro bloqueado que dice
_"Disponible en un plan superior"_ con un botón **Ver planes**. Las dos versiones
son válidas para el video, pero tenés que saber cuál estás mostrando.

**Narración (si tenés la función):**

> Si tu plan lo incluye, podés **grabar la consulta** y que la IA la transcriba y
> te llene los bloques sola. Vos hablás normalmente con el paciente y después
> revisás y corregís lo que haga falta.
>
> Es un asistente, no un reemplazo: lo que quede escrito es tu responsabilidad,
> así que siempre revisalo.

---

### Escena 5 — El pago y cerrar la consulta (5:15 – 6:30)

**En pantalla:** el panel derecho, **Configuración de la consulta**.

Ahí ves **Plan**, **Monto** y **Método**, y el estado del pago.

**Narración:**

> A la derecha está la parte de la plata: qué servicio es, cuánto y cómo te
> pagaron. Si el paciente ya pagó, marcás el pago como aprobado y esa consulta
> pasa a contar como ingreso en Finanzas.
>
> Y si todavía no pagó, queda en **Por cobrar** — lo vemos en el video de
> finanzas.

**Y para cerrar la consulta:** el botón **Atendida**.

> Cuando terminaste, marcás **Atendida**. Eso es lo que cierra el círculo: la cita
> queda resuelta y la consulta cuenta como ingreso si está pagada.

**Mostrar** también el botón **Cargos adicionales**, si vas a cobrar algo extra.

---

### Cierre (6:30 – 7:00)

> Resumiendo: la consulta se crea sola cuando hay una cita, o a mano con **Nueva
> consulta**. Se llena con tus propios bloques y **se guarda sola mientras
> escribís**. Cuando terminás, la marcás como atendida y registrás el pago.
>
> En los próximos videos vemos qué hacer con esa consulta: generar el récipe y el
> informe para el paciente.

---

## Respaldo técnico

| Afirmación                                | Dónde está                                   |
| ----------------------------------------- | -------------------------------------------- |
| Toda cita con paciente genera su consulta | ADR-021                                      |
| Fecha pasada → nace atendida              | ADR-032 (y su corrección del 18/08)          |
| El editor vive inline en la lista         | ADR-017 — `consultations/[id]` fue eliminada |
| Autoguardado de bloques                   | `ConsultationsClient.tsx`, `blocks_snapshot` |
| Búsqueda sin acentos                      | `hashForSearch` normaliza NFD                |
| La IA está gateada por plan               | `planFeatures.ai_transcription`              |

## Lo que NO hay que decir

- ❌ "Tenés que apretar guardar" — se guarda solo.
- ❌ "La IA completa la consulta por vos" — transcribe y sugiere; el especialista
  revisa y firma.
- ❌ No demuestres **Efectivo** hasta el cobro (defecto vivo en producción).
