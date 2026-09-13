# Video 1 — Cómo registrarte

> Guion verificado contra el código de `develop` el 2026-09-13.
> **Todo lo que aparece acá ya está en producción** (`main`) — se puede grabar
> contra `deltasalud.app` sin mostrar nada que el usuario todavía no tenga.

**Duración estimada:** 3 a 4 minutos
**Dónde grabar:** producción (`https://deltasalud.app`), ventana de incógnito
**Qué hace falta:** una cuenta de Google que NUNCA haya entrado a Delta Salud

---

## Antes de grabar — leer esto

Tres cosas que arruinan la toma y no se pueden deshacer:

1. **El modal de bienvenida sale UNA sola vez por cuenta.** Queda marcado en el
   perfil (`welcome_dismissed_at`). Si entrás una vez a "probar", ya lo quemaste
   para esa cuenta y necesitás otra cuenta de Google para grabar.
2. **La sesión de Auth0 es del navegador, no de la pestaña.** Si tenés otra
   cuenta de Delta abierta en la misma ventana, el registro nuevo se va a
   confundir con esa identidad. **Grabar siempre en incógnito**, con una sola
   cuenta de Google activa.
3. **El registro es de una sola pasada.** Una vez completado, volver a
   `/doctor/onboarding` te deja en el paso que corresponda, y la pantalla de
   bienvenida ya no aparece. No hay "reiniciar el registro" desde la interfaz.

**No mostrar la URL `/register`** — redirige a `/login` y confunde.

---

## Guion

### Escena 1 — La entrada (0:00 – 0:25)

**En pantalla:** `https://deltasalud.app` → clic en iniciar sesión → `/login`

**Narración:**

> Para crear tu cuenta en Delta Salud entrás a deltasalud.app y vas a
> "Iniciar sesión". No hay un formulario de registro aparte: en Delta Salud
> **iniciar sesión y crear tu cuenta son lo mismo**. Si es tu primera vez, la
> cuenta se crea sola.

**Detalle a mostrar:** la pantalla dice **"Bienvenido a Delta Salud"** y abajo
**"Inicia sesión o crea tu cuenta"**. Al pie del recuadro está la aclaración:
_"Si es tu primera vez con Google, se creará tu cuenta automáticamente."_
Señalá esa línea — responde la duda más común.

---

### Escena 2 — Elegir cómo entrar (0:25 – 0:50)

**En pantalla:** los dos botones del recuadro.

| Botón                                | Qué hace                                                            |
| ------------------------------------ | ------------------------------------------------------------------- |
| **Continuar con Google**             | Entra con tu cuenta de Gmail o Workspace. Es el camino recomendado. |
| **Continuar con correo electrónico** | Abre la pantalla de Auth0 para crear una clave propia.              |

**Narración:**

> Tenés dos formas de entrar. La más rápida es **Continuar con Google**: usás la
> cuenta de correo que ya tenés y no hay que inventar ni recordar otra clave.
> Si preferís una clave propia, usás **Continuar con correo electrónico**.

**Mostrar:** el clic en "Continuar con Google" y la pantalla de Google.
**Ojo al grabar:** la barra de direcciones va a mostrar `auth.deltasalud.app`.
Eso es correcto y conviene decirlo — es el dominio seguro de Delta Salud.

> Vas a ver que la dirección cambia a **auth.deltasalud.app**. Esa es la puerta
> de acceso segura de Delta Salud: tu contraseña nunca pasa por la aplicación.

---

### Escena 3 — La bienvenida (0:50 – 1:15)

**En pantalla:** pantalla de bienvenida del asistente de configuración.

Texto real en pantalla:

- Título: **"Bienvenido, {tu primer nombre}"**
- Bajada: _"Vamos a dejar tu consulta lista para recibir pacientes. Son tres
  pasos y toma unos pocos minutos."_
- Los tres pasos listados:
  1. **Tus datos** — "Nombre, cédula y especialidad. Es lo que verán tus pacientes al agendar."
  2. **Tu consultorio** — "Dónde atiendes y en qué horarios. Puedes dividir el día en varios bloques."
  3. **Tu primer servicio** — "Qué ofreces y a qué precio. Después podrás agregar más servicios."
- Botón: **"Comenzar"**
- Al pie: _"Puedes cambiar todo esto más adelante desde Configuración."_

**Narración:**

> Apenas entrás, Delta Salud te recibe con el asistente de configuración. Son
> tres pasos: tus datos, tu consultorio y tu primer servicio. Todo lo que cargues
> acá lo podés cambiar después desde Configuración, así que no te trabes
> buscando el dato perfecto. Le damos a **Comenzar**.

---

### Escena 4 — Paso 1: Tus datos (1:15 – 2:15)

**En pantalla:** título **"Activa tu cuenta"**, con el aviso ámbar:
_"Este paso es obligatorio. Necesitas completar tu registro profesional para
acceder al portal. Solo tarda un minuto."_

**Narración de apertura:**

> Este paso es obligatorio: sin completarlo no se entra al portal. Son datos
> básicos y toma menos de un minuto.

**Campos, en el orden real de la pantalla:**

| #   | Campo                      | Obligatorio | Qué decir                                                                                                                         |
| --- | -------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Teléfono**               | Sí          | "Es la vía por la que te vamos a contactar desde Delta Salud." El cursor arranca acá solo.                                        |
| 2   | **Nombre completo**        | Sí          | "Tal como querés que lo vean tus pacientes." Ejemplo en pantalla: _María González Pérez_.                                         |
| 3   | **Cédula de identidad**    | Sí          | Selector **V / E / P** + número. Mostrar la vista previa que aparece debajo: _"Se guardará como: V-12345678"_.                    |
| 4   | **Especialidad**           | Sí          | Buscador. Escribí dos letras y filtra. Si no está la tuya, al final de la lista hay **"Otra especialidad"** y la escribís a mano. |
| 5   | **Género**                 | No          | "Es opcional, con fines estadísticos. La primera opción es _Prefiero no decirlo_."                                                |
| 6   | **Número MPPS**            | No          | "Si lo cargás, verificamos tus credenciales automáticamente."                                                                     |
| 7   | **Número de colegiado**    | No          | Igual que el anterior.                                                                                                            |
| 8   | **Código de vendedor**     | No          | Solo si alguien de Delta te dio un código.                                                                                        |
| 9   | **Términos y Condiciones** | Sí          | Casilla obligatoria. Mostrar que el enlace abre los términos en una ventana.                                                      |

**Puntos que conviene mostrar en cámara:**

- **El selector V / E / P.** Explicá: V para venezolanos, E para extranjeros con
  cédula, P para pasaporte. Si elegís P, el campo acepta letras y números.
- **El buscador de especialidad.** Es el campo que más los traba. Mostrá que se
  escribe para filtrar, no que se baja una lista larga.
- **El código de vendedor se verifica solo.** Si escribís un código real, abajo
  aparece en verde **"Vendedor: {nombre}"**. Si el código está mal, avisa
  _"Ese código no existe. Revisalo o dejalo vacío."_ — **y aun así te deja
  seguir**, porque el campo es opcional. Vale la pena decirlo para que nadie se
  frene ahí.
- **Si te olvidás de tildar los Términos**, la casilla se sacude y se pone en
  rojo. Es buen momento para mostrarlo a propósito.

**Botón final:** **"Guardar y continuar"**.

---

### Escena 5 — Paso 2: Tu consultorio (2:15 – 3:00)

**En pantalla:** **"Tu primer consultorio"** — _"Los pacientes verán esta
información al agendar una cita"_.

**Campos:**

| Campo                     | Obligatorio | Ejemplo en pantalla                       |
| ------------------------- | ----------- | ----------------------------------------- |
| Nombre                    | Sí          | _Consultorio Principal_                   |
| Dirección                 | Sí          | _Av. Francisco de Miranda, Chacao_        |
| Ciudad                    | Sí          | _Caracas_                                 |
| Teléfono                  | No          | _0212-1234567_                            |
| URL del mapa              | No          | enlace de Google Maps                     |
| **Modalidad de atención** | Sí          | Presencial · Online · Presencial y Online |
| **Horario**               | Sí          | por día, con bloques                      |
| Duración de cita          | Sí          | minutos por consulta                      |
| Tiempo entre citas        | Sí          | minutos de respiro entre una y otra       |

**Narración:**

> Acá cargás dónde atendés. Esta información es la que ve el paciente cuando
> entra a agendar, así que conviene que la dirección esté completa.
>
> La **modalidad** define si atendés presencial, por videollamada, o las dos.
>
> Y el **horario** es la parte importante: no es una sola franja. Podés dividir
> el día en bloques — por ejemplo, de 8 a 12 y de 2 a 6 de la tarde — y dejar el
> mediodía libre. Se agrega un bloque por día con el botón de más.

**Mostrar sí o sí:** agregar un segundo bloque en un mismo día. Es la
funcionalidad que nadie descubre solo y la que más consultas genera.

También mostrá **Duración de cita** y **Tiempo entre citas**: son los que
definen los horarios que después se le ofrecen al paciente.

---

### Escena 6 — Paso 3: Tu primera consulta (3:00 – 3:30)

**En pantalla:** **"Tu primer servicio"** — _"Define el servicio que ofrecerás —
luego podrás agregar más desde Servicios"_.

**Campos:** nombre (ej. _Consulta general_), precio, duración, descripción (opcional).

**Narración:**

> Último paso: qué ofrecés y a qué precio. Con uno alcanza para empezar —
> después agregás todos los que quieras desde la sección **Servicios**, incluidos
> paquetes de varias sesiones.
>
> La duración que elijas acá tiene que entrar dentro de los bloques de horario
> que cargaste en el paso anterior.

**Botón final:** **"Finalizar configuración"**.

---

### Escena 7 — Listo (3:30 – 4:00)

**En pantalla:** **"¡Ya puedes atender pacientes!"**
_"Tu cuenta está configurada. Tienes un consultorio y un servicio listos —
puedes crear tu primera consulta desde el portal."_

Debajo, el recuadro turquesa **"Verificación de credenciales"**:
_"Verificaremos tus credenciales profesionales. Si no podemos verificarte, nos
contactaremos a tu correo."_

**Narración:**

> Y listo. Tu cuenta quedó configurada y ya podés atender pacientes.
>
> Vas a ver un aviso sobre la verificación de credenciales: Delta Salud valida
> tus datos profesionales por su cuenta. **No te bloquea el acceso** — podés
> usar la plataforma desde ahora. Si hiciera falta algo, te escribimos al correo.

**Clic en "Ir al portal"** → entra a `/doctor`, aparece el modal de bienvenida.

**Cierre:**

> Entrás a tu portal y arrancás con el **plan de prueba de 30 días**, que te da
> acceso completo. Cuando se terminen los 30 días, tu cuenta pasa sola a
> **Delta Free** y **no perdés ningún dato**. En otro video te mostramos cómo
> pasar a Delta Base o Delta Plus.

---

## Datos técnicos que respaldan el guion

| Afirmación del video                        | Dónde está en el código                                        |
| ------------------------------------------- | -------------------------------------------------------------- |
| Registro = login                            | `app/register/page.tsx` redirige a `/login`                    |
| El acceso lo maneja `auth.deltasalud.app`   | ADR-023, Auth0 Custom Domain                                   |
| El asistente es obligatorio                 | `app/doctor/layout.tsx:251-268` — gate que redirige            |
| Teléfono obligatorio y primero              | `OnboardingForm.tsx:849` (decisión del dueño, 2026-08-17)      |
| La cédula se guarda `V-12345678`            | ADR-066, `toCanonicalCedula()`                                 |
| Código de vendedor no bloquea               | `OnboardingForm.tsx:537-542`                                   |
| Verificación MPPS no restringe acceso       | ADR-011                                                        |
| Arranca en plan de prueba                   | `sequelize-identity.repository.ts` — `free_trial` / `trialing` |
| Al vencer cae a Delta Free sin perder datos | ADR-007, downgrade perezoso al iniciar sesión                  |

### Duración del plan de prueba

**30 días** — confirmado por el dueño el 2026-09-13. El valor vive en
`plan_configs.trial_days` (`free_trial`); si alguna vez se cambia desde
`/admin/plans`, este guion queda desactualizado.

### Lo que NO hay que decir

- ❌ "Vas a recibir un correo de verificación" — no existe ese paso.
- ❌ "Un administrador tiene que aprobar tu cuenta" — **no**. Esa pantalla existe
  en una versión vieja del registro (`/onboarding`) que **ya no se usa y no es
  alcanzable**. El acceso es inmediato.
- ❌ "Elegí tu plan al registrarte" — no se elige plan en el alta.
- ❌ Mostrar la URL `/register`.
