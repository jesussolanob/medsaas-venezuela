# 09 — Guion de QA priorizado por riesgo (lote de agosto 2026)

> Cubre **siete lotes acumulados en staging sin validar** (09/08 al 16/08). Nada de
> esto está en `main`: `main` arrastra ~60 commits.
> Estado por caso: `PENDIENTE` | `OK` | `FALLA`.
>
> **El orden importa.** Está ordenado por lo que pasa si está mal, no por lo que
> se construyó primero. Si solo hay tiempo para una tanda, hacé P0 completo.

## Reglas del entorno — leer antes de tocar nada

- **staging usa una BD CLON de producción, con pacientes REALES.** Los datos que
  ves son de gente de verdad.
- ⚠️ **staging manda correo REAL al destinatario REAL.** Cualquier caso que
  dispare un envío (recordatorios, compartir documentos, baja de cuenta) se
  prueba **solo con pacientes de prueba creados a mano**.
- El login oculto de reviewer está **APAGADO** en staging desde el 27/07, así que
  hace falta **login real de Auth0**.
- El modal de bienvenida sale **una sola vez por cuenta**: si lo cerrás, para
  volver a verlo hay que poner `welcome_dismissed_at` en NULL.
- Reponer el onboarding **no alcanza** con `onboarding_completed=false`: la
  página se auto-sella si el doctor ya tiene consultorio y servicio activos. Hay
  que apagar las tres.

## Prioridades

|        | Significa                                                                                   |
| ------ | ------------------------------------------------------------------------------------------- |
| **P0** | Si está mal, hay **plata mal calculada** o el especialista transfiere un monto equivocado.  |
| **P1** | Si está mal, **no puede trabajar**: pierde turnos, no puede entrar, o se le duplican citas. |
| **P2** | Molesta o confunde, pero no rompe nada ni mueve dinero.                                     |
| **P3** | Cosmético.                                                                                  |

---

# P0 — Plata

## P0.1 · Los totales de meses YA CERRADOS se mueven

**Por qué es lo primero:** cambiamos el criterio de qué cuenta como ingreso
(ADR-029 y ADR-031). Una consulta **pagada** cuya cita quedó en "no asistió"
antes figuraba en _Por ingresar_ —plata ya cobrada mostrada como pendiente— y
ahora suma en _Ingresos_. **Es la corrección de una clasificación equivocada, no
plata nueva**, pero si comparás contra una captura vieja los números no van a
coincidir, y eso es esperable.

1. Entrá a **Finanzas** y elegí un mes pasado con movimiento (julio).
2. Anotá **Total ingresos** (la tarjeta) y el total de la **tabla de abajo**.
3. **Tienen que coincidir.** Si la tarjeta dice un número y la tabla otro, es
   FALLA — es exactamente el bug que arreglamos el 12/08 y que volvió a aparecer
   en otra esquina.
4. Sumá _Ingresos_ + _Por cobrar_ y comparalo con lo que veías antes.
   **Regla de oro: ningún importe puede desaparecer de los dos lados a la vez.**
   Que un monto se mueva de una columna a la otra está bien; que no esté en
   ninguna, no.

## P0.2 · Inasistencia: las cuatro combinaciones

El caso completo son cuatro, y **cada uno hace algo distinto con la plata**.
Usá un paciente de prueba.

| #   | Situación                                                                | Qué tiene que pasar                                                                        |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| a   | Consulta **impaga**, marcar "No asistió", **NO reagenda**, sin multa     | El costo pasa a **$0** y la consulta **desaparece de Por cobrar**                          |
| b   | Consulta **impaga**, "No asistió", **NO reagenda**, **con multa de $10** | El costo queda en **$10** y eso es lo que aparece en Por cobrar                            |
| c   | Consulta **impaga**, "No asistió", **SÍ reagenda**                       | Conserva su monto, sigue pendiente, y la cita **vuelve a estar vigente** en la fecha nueva |
| d   | Consulta **PAGADA**, "No asistió", **SÍ reagenda**, sin multa            | El monto cobrado **se mantiene** y el pago **viaja** con la cita a la fecha nueva          |

Y el caso que más se puede discutir:

| e | Consulta **PAGADA** de $50, "No asistió", **con multa de $10** | El costo pasa a **$60** y el pago **vuelve a "pendiente" por el total**. El modal lo avisa antes de guardar. Al cobrar la diferencia, se aprueba de nuevo y quedan $60 en Ingresos |

**Mirá también:** al reagendar desde "No asistió", la cita tiene que poder
moverse **al mismo día** (antes solo se ofrecía desde mañana, y "no vino a las 9,
viene a las 4" es el caso típico).

## P0.3 · El precio del plan Delta en bolívares

**Por qué es P0:** ese es el monto que el especialista **transfiere** cuando paga
su plan con un método en bolívares. Si está mal, manda mal la plata.

1. En **Configuración → Métodos de pago**, poné la tasa en **Euro (BCV)**.
2. Andá al panel de **Suscripción** / Mejorar plan.
3. El precio del plan Delta tiene que seguir **en dólares** y su equivalente en
   bolívares tiene que estar calculado con la **tasa del dólar**, no la del euro.
4. Volvé a dejar la tasa como estaba.

## P0.4 · La divisa del portal

Con la tasa en **Euro** puesta en Configuración:

1. **Servicios**: los precios se muestran con **€** y el rótulo dice EUR.
2. **Cobros, Finanzas, Consultas, Inicio, Facturación**: mismo símbolo.
3. El **mensaje de WhatsApp de cobro** dice EUR (antes decía "USD" fijo).
4. Los **CSV** que exporta Finanzas traen "Monto EUR" en el encabezado.
5. 🔴 **Abrí tu link público de booking** (`/book/<tu-id>`) y confirmá que el
   **paciente ve € también**. Si ahí ve `$`, es FALLA: es el caso que más nos
   costó resolver.
6. Volvé a dólar y confirmá que todo vuelve a `$`.

> El mismo **número** se muestra con otro símbolo: un servicio de 50 pasa a €50,
> no se convierte. Eso es lo pedido, no un error.

---

# P1 — La agenda: turnos que se ofrecen o se pierden

## P1.1 · Un turno ocupa el tiempo que dura 🔴 el más importante de esta sección

Antes, una cita bloqueaba **solo su hora de inicio**. Se ofrecían horarios que
después no se podían tomar.

1. Consultorio con bloques de **30 minutos**.
2. Agendá una cita a las **8:00** con un servicio de **45 minutos**.
3. Abrí el **booking público** en otra pestaña: el slot de las **8:30 no tiene
   que aparecer**. El de las **9:00 sí** (la cita termina 8:45).
4. Repetí desde el **flujo del especialista** (Agenda → Nueva consulta): tampoco
   se le ofrece el 8:30.
5. Abrí el **modal de reagendar** de cualquier cita: el 8:30 tiene que verse
   ocupado. **Este modal nunca marcó ningún horario como ocupado** — mostraba
   todo libre y el choque aparecía recién al confirmar.

## P1.2 · Consulta inmediata

Botón nuevo en **Inicio** y en **Agenda**.

1. **Con espacio de sobra** (sin citas cercanas): tocá el botón, elegí un
   paciente, elegí el servicio → se crea con la hora actual y **abre la consulta**.
2. **Con una cita cerca**: si tenés una cita a las 15:00 y son las 14:37 con un
   servicio de 30', el modal avisa _"va a durar 23 min en vez de 30"_ y la cita
   se crea con esa duración.
3. **Sin espacio** (próxima cita en menos de 5 minutos): avisa que no hay lugar y
   el botón cambia a **"Registrar igual"**. Solo ahí se permite pisar.
4. **Fuera del horario del consultorio**: te pregunta a cuál asociarla.
5. **Paciente con sesiones pagadas de un combo**: el modal las ofrece; al usar
   una, la consulta se crea **sin cobrar de nuevo** y esa sesión sale de
   "Consultas por agendar".
6. Paciente nuevo: se puede crear ahí mismo sin salir del modal.

## P1.3 · Hora libre y duración por bloque

1. En un consultorio con bloques de 60', usá **"Otra hora"** en el paso de
   horario: 9:30, duración 60.
2. Se crea. Después, **los slots de 9:00 y 10:00 tienen que quedar bloqueados**.
3. Configurá un día con bloques de **45'** y otro de **20'**; agendá en cada uno
   y confirmá que la cita **ocupa el largo correcto** en la agenda (antes se
   guardaba siempre la duración del consultorio).

## P1.4 · Baja de cuenta y reingreso — NUNCA VALIDADO (09/08)

Conejillo: **`marcovillegas1197@gmail.com`**, que ya está dado de baja por él
mismo en staging.

1. Entrá con esa cuenta.
2. Tiene que **reactivarse sola en plan gratuito** y poder mejorar el plan sin
   pedirle nada a un admin.
3. Con otra cuenta de prueba: dar de baja teniendo días pagos → la cuenta
   **conserva el plan hasta la fecha de vencimiento** y muestra hasta cuándo.

## P1.5 · Onboarding — NUNCA VALIDADO (10/08)

Requiere preparar la cuenta: apagar **las tres** banderas (`onboarding_completed`,
el consultorio activo y el servicio activo), o la página se auto-sella.

1. Se ve la **lámina de bienvenida** antes del paso 1 (solo si arranca de cero).
2. En el paso del consultorio, se puede **partir un día en dos bloques**.
3. La consulta que crea el paso 3 aparece en `/doctor/services` como **"Plan"**,
   NO como "Servicio extra".
4. Completar solo el paso 1 y navegar a `/doctor` **no** debe dejarte entrar sin
   consultorio ni servicio.
5. Reentrar al wizard **no debe des-verificar** al especialista si no cambiaste
   cédula, MPPS ni colegiado.

## P1.6 · Módulo de ventas — TODO NUEVO, y es el único lote con MIGRACIÓN

⚠️ **Este lote agrega dos columnas a `profiles`** (`seller_code` y `sold_by`). El deploy corre
migraciones **antes** del build: si falló, no hay nada más que probar acá — mirá primero que el
deploy de staging haya cerrado en verde.

**Preparación:** hace falta un vendedor. Lo crea un administrador (`POST /api/admin/sellers` o la
pantalla de admin). El backend le genera el código solo.

1. **El vendedor entra** y cae en `/seller`. Un doctor o un paciente que intente entrar a `/seller`
   tiene que ser expulsado a SU portal, no a `/login`.
2. **Ve su código** arriba de todo, con botón de copiar.
3. **Registra un especialista** desde su portal → aparece en su lista. **No hay selector de plan**:
   la cuenta arranca en prueba. Eso es lo pedido, no un olvido.
4. **El camino del código, que es el que escala:** en el onboarding de un especialista nuevo,
   escribí el código en "Código de vendedor". Tiene que mostrar **"Vendedor: <nombre>"** en verde
   mientras lo escribís. Poné uno inventado → **"Ese código no existe"** en rojo. Dejalo vacío →
   sigue sin problema (el campo es opcional).
5. 🔴 **La regla que no se puede romper:** completá el onboarding con un código, y después
   **volvé a entrar al wizard y escribí OTRO código**. La atribución **NO debe cambiar**. Si
   cambia, es FALLA grave: dos vendedores podrían robarse ventas y no habría nada que auditar.
6. En la lista del vendedor: **fecha de registro, última entrada y plan**. Un especialista que
   nunca entró tiene que decir "Nunca entró", no una fecha vacía.
7. **Aislamiento:** con DOS vendedores, cada uno tiene que ver **solo los suyos**.

> Recordá que hay una decisión pendiente: `/admin` hoy solo admite `super_admin`, así que la
> gestión de vendedores en la práctica la hace el super aunque el backend acepte a `admin`.

---

# P2 — Confunde, pero no rompe

## P2.1 · Consumo del paquete

1. Ficha de un paciente con un combo: tarjeta con **"X de N atendidas"**, barra
   de progreso y el desglose _agendadas / por agendar / sin asistir_.
2. En la **lista** de pacientes, la insignia dice **"N por agendar"**.
3. En el **detalle de la consulta**, bajo "Consulta 2 de 3", la misma línea.
4. Una consulta marcada **"no asistió" NO cuenta como atendida** — aparece en su
   propio balde. El paciente conserva el derecho a esa sesión.

> Antes, esta tarjeta y esa insignia leían una tabla vacía: **nunca se veían**.

## P2.2 · Consulta del pasado

1. Al crear una consulta, retrocedé en el selector de días: **no hay tope**.
2. Usá el **selector de fecha** para saltar a hace meses.
3. Al elegir una fecha pasada aparece el aviso _"se va a registrar como atendida"_.
4. Al guardar, la consulta queda **Atendida** de una vez.

## P2.3 · Del lote del 11/08, todavía sin validar

- **Comprobante de pago del plan**: subir un PDF y que la barra avance (2/4 →
  3/4). Era **bloqueante**: el botón no hacía nada y no avisaba.
- **Buscar pacientes sin acentos**: "maria jose" tiene que encontrar a "María José".
- **Listado de pacientes** con más de 100 fichas: aparecen todas.
- **Rótulo "Consulta 2 de 3"** en las consultas de un combo.
- **Periodicidad** editable dentro del modal de pago del plan.
- 🔴 **Caso abierto de la Dra. Ana María Solano**: su pantalla "Consultas por
  agendar" salía vacía. El arreglo viaja en este lote — hay que confirmarlo con
  su cuenta.

---

# P3 — Cosmético

- **Botones de editar/borrar** en Ingresos y Gastos: tienen que verse **siempre**,
  sin pasar el mouse. Probalo **en tablet o teléfono**, que es donde no existían.
- **Agenda**: se eliminó un modal que nadie podía abrir. Confirmá que no falta
  ninguna acción que usaras.

---

## Si algo falla

Anotá: **qué cuenta**, **qué pantalla**, **qué esperabas** y **qué pasó**, y si
hay plata de por medio, **el número que viste**. Con eso se reproduce en
minutos; sin el número, un caso de finanzas puede llevar horas.

Para "esto antes estaba y ya no": hay **telemetría de clics por doctor**
(`telemetry_sessions.journey`) y los logs de Cloud Run guardan ~60 días con la
URL completa. Cruzando eso con la BD se dictamina si el dato existió o nunca se
guardó — así se resolvió el caso "Ana Sweeney".

## Al promover a `main`

1. `staging` → `main` recién **después** de validar P0 y P1.
2. ⚠️ **Despausar el cron**: `gcloud scheduler jobs resume doctor-inactivity-notices --location=us-east1`.
   Si no, queda muerto sin avisar.
3. El deploy corre **migraciones antes del build**. El módulo de ventas SÍ trae una
   (`20260816000001-seller-role`: dos columnas en `profiles`) — es la única del lote. Si esa
   migración falla, bloquea TODOS los despliegues, así que confirmá que corrió en staging antes
   de promover.
