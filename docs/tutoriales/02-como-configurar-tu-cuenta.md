# Video 2 — Cómo configurar tu cuenta

> Guion verificado contra el código de **producción** (`main`) el 2026-09-13.

**Duración estimada:** 5 a 6 minutos
**Dónde grabar:** producción (`deltasalud.app`) → **Configuración**
**Qué hace falta:** una cuenta con el registro ya completo

---

## Nota sobre "Efectivo"

**Ya se puede mostrar.** Hasta el 2026-09-14 este método estaba roto en
producción: Configuración lo guardaba con una clave distinta de la que buscaba la
pantalla de cobro, así que **desaparecía del selector al momento de cobrar**. Se
corrigió y está desplegado.

Si grabás con una cuenta que ya tenía "Efectivo" activado de antes, va a seguir
funcionando: los datos viejos se reinterpretan solos.

---

## Las cinco secciones

En producción, Configuración tiene estas pestañas:

| Pestaña             | Para qué                                                          |
| ------------------- | ----------------------------------------------------------------- |
| **Mi perfil**       | Tus datos, tu foto, tu logo y tu firma                            |
| **Suscripción**     | Tu plan actual y cómo mejorarlo                                   |
| **Link público**    | Tu página de reservas _(solo si tu plan incluye reservas online)_ |
| **Métodos de pago** | Cómo te pagan tus pacientes, y seguros                            |
| **Integraciones**   | Google Calendar y WhatsApp                                        |

> ⚠️ **"Link público" no aparece en el plan Delta Free.** Si grabás con una
> cuenta Free, esa pestaña no existe y el video no va a coincidir. Grabá con una
> cuenta en plan de prueba, Base o Plus.

---

## Guion

### Escena 1 — Dónde está (0:00 – 0:20)

**Narración:**

> Todo lo que configuraste al registrarte, y bastante más, vive en
> **Configuración**. Es donde vas cuando querés cambiar tu firma, agregar una
> cuenta bancaria o conectar tu calendario. Vamos sección por sección.

---

### Escena 2 — Mi perfil (0:20 – 2:00)

**En pantalla:** pestaña **Mi perfil**.

**Arriba, tres cosas visuales:**

| Bloque                   | Qué es                                                       |
| ------------------------ | ------------------------------------------------------------ |
| **Foto de perfil**       | Tu foto. La ve el paciente al reservar.                      |
| **Logo del consultorio** | Va en el encabezado de tus documentos PDF.                   |
| **Firma y matrícula**    | Tu firma y tu número de matrícula, al pie de los documentos. |

**Narración:**

> Arriba tenés las tres cosas que van a aparecer en los documentos que firmás:
> tu foto, el logo de tu consultorio y tu firma.
>
> La firma la podés cargar de dos formas: **Subir imagen**, si ya la tenés
> escaneada, o **Dibujar**, y la hacés ahí mismo con el mouse o con el dedo si
> estás en tableta.

**Mostrar:** el botón **Dibujar** en acción. Es la función que más sorprende.

También está el campo **Matrícula / Licencia** (ejemplo en pantalla:
_MPPS-12345 / CMC-67890_).

> La matrícula que cargues acá es la que sale impresa en tus récipes e informes.

**Abajo, tus datos:**

| Campo                       | Nota para el video                                       |
| --------------------------- | -------------------------------------------------------- |
| Título profesional          | Dr., Dra., Lic., Psic., Odont., Nutr., Fisio.            |
| Nombre completo             | Como lo ve el paciente                                   |
| Email                       |                                                          |
| Teléfono                    |                                                          |
| **Cédula / Identificación** | **No editable** — dice _"registrada al crear la cuenta"_ |
| Fecha de nacimiento         |                                                          |
| Especialidad                |                                                          |
| Género                      |                                                          |

**Narración sobre el título:**

> El **título profesional** importa más de lo que parece: es lo que aparece
> delante de tu nombre en presupuestos, en tu página de reservas y en los
> recordatorios que reciben tus pacientes. Si no cargás ninguno, va solo tu
> nombre — el sistema **no asume** que sos médico, porque también usan Delta
> Salud psicólogos, odontólogos y nutricionistas.

**Narración sobre la cédula:**

> Fijate que la **cédula no se puede editar**: queda registrada al crear la
> cuenta y es lo que te identifica. Si está mal, se corrige con soporte.

**Al final de la sección:** el interruptor **Consultas online** —
_"Permitir que pacientes agenden videoconsultas"_.

**Botón:** **Guardar cambios** → cambia a **Guardado**.

---

### Escena 3 — Suscripción (2:00 – 2:30)

**Narración:**

> Acá ves tu plan actual, hasta cuándo va, y el botón para mejorarlo. Como
> tenemos un video dedicado a eso, lo dejamos para ahí.

**Mostrar** la pestaña y pasar rápido. No te detengas: el video 4 la cubre.

---

### Escena 4 — Link público (2:30 – 3:30)

**En pantalla:** pestaña **Link público**.

Contenido real:

- **Tu link público de booking** — con **Ver mi página** (_"Cómo la ve el
  paciente"_) y **Compartir por WhatsApp** (_"Enviar a cualquier contacto"_)
- **Código QR de tu link**
- **Mensaje de WhatsApp / Correo** — el texto que acompaña al enlace, editable,
  con emojis

**Narración:**

> Este es tu enlace de reservas: se lo mandás a un paciente y él elige día, hora
> y servicio sin escribirte.
>
> **Ver mi página** te muestra exactamente lo que ve el paciente — conviene
> mirarlo de vez en cuando.
>
> Y abajo tenés el **código QR**: lo descargás y lo pegás en la puerta del
> consultorio o en tu tarjeta. El paciente lo escanea y entra directo a reservar.

**Mostrar:** el QR y el botón de compartir por WhatsApp.

---

### Escena 5 — Métodos de pago (3:30 – 5:00)

**En pantalla:** **Métodos de pago aceptados**.

**Narración:**

> Acá elegís cómo te pueden pagar. Lo que actives se le muestra al paciente
> cuando reserva, con tus datos, y también aparece en el mensaje de cobro por
> WhatsApp.

**Mostrar con Pago Móvil:** al activarlo se despliegan sus campos —
**Banco**, **Teléfono**, **Cédula/RIF**, **Titular**. En Transferencia son
**Banco**, **N° de cuenta**, **Tipo**, **Cédula/RIF**, **Titular**.

**La función que conviene mostrar sí o sí:**

> Si tenés cuentas en **dos bancos distintos**, no tenés que elegir una. En Pago
> Móvil y en Transferencia hay un botón para **agregar otra**, y el paciente ve
> las dos y paga por donde le quede más cómodo.
>
> Solo esos dos lo permiten, y es a propósito: en pantalla dice _"Solo pago móvil
> y transferencia admiten varios"_. Tener dos cuentas de Zelle confunde más de lo
> que ayuda.

**Botón:** **Guardar métodos y datos**.

**Más abajo, Seguros aceptados:**

> Si trabajás con seguros, los cargás acá. Hay un **buscador con la lista de
> Venezuela** y también podés agregar uno que no esté. Por cada uno cargás
> **Copago**, **Días de crédito** y **Notas**, todos opcionales.

**Y al final, Notificaciones del panel:**

- **Sonido al recibir una cita** — _"Reproduce un beep cuando se agenda una cita nueva"_
- **Notificaciones del navegador** — _"Recibe alertas del sistema cuando haya una cita nueva"_

> Esto es útil si tenés el portal abierto mientras atendés: te avisa cuando entra
> una reserva nueva sin que tengas que estar mirando.

---

### Escena 6 — Integraciones (5:00 – 5:45)

**En pantalla:** **Google Calendar** y **WhatsApp Business API**.

**Narración sobre Google Calendar:**

> Si conectás tu Google Calendar, **todas tus citas aparecen ahí
> automáticamente** — las presenciales con la dirección del consultorio, y las
> online con su enlace de videollamada ya creado.
>
> Es opt-in: si no lo conectás, Delta Salud igual le manda al paciente el correo
> con el archivo de calendario adjunto.

**Mostrar:** el estado **Conectado** / **No conectado** y el botón de conectar.

**Sobre WhatsApp Business API:** es una integración avanzada que pide un token
de Meta. Mencionala al pasar y no te detengas — la mayoría no la va a usar.

---

### Cierre (5:45 – 6:00)

> Y eso es Configuración. Lo que más conviene dejar listo desde el principio son
> **tu firma y tu logo**, porque son los que le dan identidad a cada documento
> que le entregás a un paciente, y **tus métodos de pago**, porque sin eso el
> paciente no sabe cómo pagarte.

---

## Respaldo técnico

| Afirmación                               | Dónde está                           |
| ---------------------------------------- | ------------------------------------ |
| Las 5 pestañas y su orden                | `app/doctor/settings/page.tsx`       |
| "Link público" depende del plan          | condición `bookingEnabled` — ADR-014 |
| La cédula no es editable                 | mismo archivo, campo deshabilitado   |
| Sin título profesional va solo el nombre | ADR-067, `formatProfessionalName`    |
| Varias cuentas por método                | ADR-044                              |
| Google Calendar opt-in, todas las citas  | ADR-010 / ADR-026                    |

## Lo que NO hay que decir

- ❌ No muestres **Efectivo** llegando hasta el cobro (ver la advertencia de arriba).
- ❌ "Notificaciones" como pestaña propia — **está oculta**, no es funcional.
- ❌ "Acá configurás tus servicios" — los servicios viven en **Servicios**, no acá.
