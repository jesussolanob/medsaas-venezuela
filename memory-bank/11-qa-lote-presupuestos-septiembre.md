# 11 — QA del lote de presupuestos (2026-09-08)

> Entorno: **staging** (`staging.deltasalud.app`). Todo el lote está ahí; **nada en `main`**.
> Orden pensado por RIESGO: los primeros cinco casos cubren defectos que estuvieron a punto de
> llegar a producción. Si el tiempo alcanza para poco, hacé el bloque A completo.

⚠️ **staging manda correo REAL a destinatarios reales sobre una BD clonada de producción.**
Usá SOLO pacientes de prueba con correos tuyos. Nunca dispares un envío contra una ficha con el
correo de un paciente de verdad.

---

## ✅ Estado tras el QA en navegador del 2026-09-09

Un agente con Playwright recorrió los bloques **A, B, D y E** contra staging. Lo que sigue está
**verificado en pantalla** y el QA manual no necesita repetirlo, salvo que quiera confirmar:

| Bloque | Resultado |
| ------ | --------- |
| A1–A5  | **Pasan.** Incluida la página pública con fecha (el 500 que hoy está en producción). |
| B1–B6  | **Pasan**, menos B6.2 (sin datos para probarlo). |
| D1, D2 | **Pasan.** D1 sin confirmar la recepción del correo (hace falta la casilla). |
| E2–E5  | **Pasan**, menos E4 (ver abajo). |

**Cuatro defectos encontrados y ya corregidos** (no hace falta re-testear el diagnóstico, sí el
resultado):

1. **Los bolívares salían con la tasa congelada** en el detalle del especialista y en los dos PDF.
   El mismo presupuesto decía Bs. 47.963 en el PDF y Bs. 41.005 en la página: **17% de diferencia**
   en el documento con el que el paciente paga. Solo la página pública estaba bien.
2. **Al enviar, el detalle perdía el nombre del destinatario** ("Sin nombre" hasta recargar).
3. **Buscar por cédula devolvía cero resultados, siempre** — regresión de este mismo lote. El
   buscador tampoco encontraba por teléfono, aunque lo prometiera.
4. **Ningún campo obligatorio del booking estaba marcado** como tal.

**Un defecto del GUION, no del producto:** el caso A5 pedía que con prefijo `P` la etiqueta dijera
"Pasaporte". Eso solo existe en el alta del **especialista**, no en la ficha de paciente. Ignorar
esa expectativa.

**Descartado tras investigarlo:** un presupuesto que parecía redirigir a Configuración (era un clic
desviado al menú) y un supuesto bucle de peticiones (era el refresco normal del router de Next.js
cada 30 segundos sobre una página cuyo presupuesto ya no existe).

### Re-test del 2026-09-09 (tras corregir)

- **Los bolívares coinciden en las CUATRO superficies** (detalle, PDF del especialista, página
  pública y su PDF): `Bs. 12.301,53` a la misma tasa. ✅
- **El destinatario sobrevive al envío** ✅ · **La búsqueda encuentra la cédula en 6 formatos**
  (con guiones, sin nada, con puntos, solo el número, y teléfono con y sin código de país) ✅ ·
  **Los campos obligatorios del booking están marcados** ✅

El primer intento del re-test **falló de forma útil**: el PDF salió sin ningún monto en bolívares,
lo que probó que la petición de la tasa no fallaba a veces sino **siempre** en el contenedor —antes
quedaba tapada cayendo a la congelada—. La causa era que la app **se pedía la tasa a sí misma por
HTTP**. Ahora se resuelve en proceso. Barriendo el repo apareció el **mismo patrón en el booking
público**, ahí con el error atrapado sin registro: la cita se creaba sin monto en bolívares y nadie
se enteraba. Corregido también.

⚠️ **NO VERIFICADO: que la cita creada desde el booking GUARDE su tasa.** La columna de bolívares de
`/doctor/cobros` se calcula **en vivo** (`precio × tasa actual`), no lee el campo guardado, así que
mirar esa pantalla no confirma nada. Hace falta consultar la base.

🔴 **DECISIÓN ABIERTA:** esa misma columna calcula en vivo **también para los cobros ya aprobados**,
y la regla del dueño es que lo pagado se congela. El modal de detalle sí usa el monto congelado; el
listado no. Son dos números distintos para el mismo cobro según dónde se mire.

### 🔴 Lo que sigue SIN PROBAR y necesita el QA manual

Los cuatro necesitan lo mismo: **acceso a la base de datos** y **esperar una corrida del cron**.

- **Todo el Bloque C** (C1 a C4): el barrido de vencidos y el aviso de "por vencer".
- **B6.2**: el aviso ámbar al editar un borrador con fecha ya pasada (hay que retrofechar en la BD).
- **D1 (correo)**: que al especialista le LLEGUE el aviso de cita nueva.
- **D3** y **E1**: la advertencia de consultas por agendar y los recordatorios de citas.

---

## Bloque A — Lo que casi llega roto a producción

### A1. La página pública de un presupuesto CON fecha de vencimiento 🔴

El defecto más grave del lote: hoy en producción esta pantalla **responde 500** para cualquier
presupuesto que tenga fecha de validez. No se notaba porque el campo arrancaba vacío y casi nadie
lo llenaba — prellenarlo lo habría activado en todos.

1. Crear un presupuesto y **dejar la vigencia en 30 días** (viene puesta).
2. Enviarlo.
3. Abrir el **enlace público** (el que recibe el paciente), en una ventana de incógnito.

✅ La página **carga**, muestra el presupuesto y dice hasta cuándo vale.
❌ Pantalla de error, o "no se pudo conectar".

### A2. El PDF público de ese mismo presupuesto 🔴

Sale del mismo endpoint que A1, así que fallaba igual.

1. Desde la página pública, descargar el PDF.

✅ Descarga y muestra el presupuesto con la marca del especialista.

### A3. La vigencia se pide en DÍAS 🟠

1. Abrir "Nuevo presupuesto".

✅ El campo dice **"Vence en `[30]` días"**, no un calendario.
✅ Debajo muestra la fecha que va a quedar ("Vence el 8 de octubre de 2026").

2. Cambiar a `7`. ✅ La fecha de abajo se actualiza sola.
3. **Borrar el campo.** ✅ Dice "Sin vencimiento: no expira y no se envía recordatorio."
4. Escribir **`400`**. ✅ Sale en rojo "Poné entre 1 y 365 días…" y **no deja guardar**.
   ❌ Si guarda sin vencimiento, es el bug al revés: 400 se interpretaría como "no vence nunca".
5. Escribir `0` o letras. ✅ Mismo aviso rojo.

### A4. El título profesional NO se inventa 🟠

La app mostraba **"Psic. Lucas Rivas"** a alguien que nunca eligió un título, y a quien no
reconocía la especialidad le decía **"Dr."**. Aparece en documentos que ve el paciente.

Con una cuenta **sin título cargado** en el perfil (por ejemplo `lucas.rivas.55`):

1. **Inicio del especialista** → ✅ dice solo el nombre, sin "Psic." ni "Dr.".
2. **Facturación** (emisor de la factura) → ✅ solo el nombre.
3. **Página pública de reservas** (`/book/<id>`) → ✅ solo el nombre.
4. **Portal del paciente**, en un paquete de ese especialista → ✅ solo el nombre.

Después, **cargar un título** en el perfil (ej. `Lic.`) y guardar:

5. ✅ Las cuatro pantallas ahora muestran `Lic. <nombre>`.
   ❌ Si sigue sin aparecer, el problema es que el perfil no guarda — avisar.

### A5. La cédula se guarda siempre igual 🟠

1. Crear un paciente con cédula **`v.12.345.678`** (minúscula y con puntos).
2. Abrir su ficha.

✅ Se ve **`V-12345678`**.

3. **Editar ese paciente** (cambiar el teléfono, por ejemplo) y guardar.
   ✅ Guarda sin errores de validación. ❌ Si dice que la cédula es inválida, avisar: es el
   riesgo que evaluamos al conservar el guion.
4. Intentar crear **otro** paciente con **`V 12345678`** (misma persona, otro formato).
   ✅ Lo reconoce como existente / avisa duplicado. ❌ Si crea una segunda ficha, avisar.
5. Repetir con prefijo **`E`** y con **`P`** (pasaporte).
   ✅ `E-8123456` y `P-AB123456`. ✅ Con `P` la etiqueta dice "Pasaporte".

---

## Bloque B — Presupuestos, funcionalidad nueva

### B1. La ventana de envío ya sabe a quién mandarle

Antes mostraba dos campos vacíos pidiendo nombre y correo, y parecía que sin llenarlos no se
enviaba.

1. Presupuesto de un paciente **con correo cargado** → "Enviar".
   ✅ Dice **"Se enviará a `<correo>`"**, sin pedir nada.
   ✅ Hay un enlace **"Enviar a otro correo"** que abre los campos.
2. Presupuesto de un paciente **sin correo** → ✅ pide el correo y aclara que igual se puede
   compartir el enlace a mano.

### B2. Numeración PRE-

1. Crear un presupuesto nuevo. ✅ El número arranca con **`PRE-`**, no `COT-`.
2. Abrir uno **viejo** (de antes del lote). ✅ También se ve como `PRE-`, conservando su número.
3. ✅ El número es el mismo en pantalla, en el PDF y en el correo.

### B3. Bolívares a la tasa del día y en la moneda del especialista

1. Ver un presupuesto ya enviado. ✅ Aclara que el monto en Bs es **a la tasa del día**, indexado
   a la tasa del BCV.
2. ✅ El monto fijo se muestra en la moneda que el especialista tenga configurada (USD o EUR),
   **no siempre USD**.

### B4. Aceptar y rechazar desde el enlace público

1. Desde el enlace público, apretar **Aceptar**.
   ✅ Confirma. ✅ En el listado del especialista el estado pasa a **Aprobado**.
   ✅ **Al especialista le llega un correo** avisando que lo aceptaron.
2. Volver a apretar Aceptar (o abrirlo en dos pestañas y responder en las dos).
   ✅ Mensaje **en español** y claro ("Este presupuesto ya está aceptado…").
   ❌ Un mensaje en inglés o con palabras como `sent`/`accepted` es un defecto.
3. Repetir con **Rechazar** en otro presupuesto.

### B5. Estados y filtros del listado

1. ✅ Se puede filtrar por Enviado, Aprobado, Rechazado y Vencido.
2. ✅ El filtro **Vencido** ya no está condenado a salir vacío (ver C1).

### B6. Editar un borrador

1. Abrir un **borrador** y editarlo.
   ✅ La vigencia se edita **en días**, precargada con los que le quedan.
2. Si el borrador tiene una fecha **ya pasada**, ✅ avisa en ámbar que esa fecha ya pasó y que si
   guarda así no vencerá. ❌ Que lo deje sin vencimiento en silencio es el defecto.
3. ✅ Un presupuesto **ya enviado** no se puede editar.

---

## Bloque C — El cron de vencimiento

⚠️ Corre cada 15 minutos. Estos casos necesitan **esperar una corrida**, o pedir que se dispare a
mano.

### C1. Un presupuesto vencido pasa a "Vencido"

Antes **nadie** ponía ese estado: el filtro salía vacío para siempre.

1. Crear un presupuesto con vigencia de 1 día y enviarlo.
2. En la BD, correrle la fecha para atrás (`valid_until` = anteayer).
3. Esperar la corrida del cron.

✅ El estado pasa a **Vencido** solo. ✅ Aparece en el filtro "Vencidos".

### C2. El aviso de "por vencer" llega a los dos

1. Presupuesto enviado con `valid_until` **dentro de los próximos 3 días**.
2. Esperar la corrida.

✅ Llega un correo **al paciente** con el enlace para responder.
✅ Llega otro **al especialista** avisando que está por vencer sin respuesta.
✅ **La fecha del correo es la correcta** — el mismo día que muestra la pantalla.
❌ Si dice **un día antes**, avisar: es el defecto de zona horaria.

3. Esperar **otra** corrida del cron.
   ✅ **NO** vuelve a mandar los mismos correos. ❌ Correos repetidos = falla la idempotencia.

### C3. Un presupuesto ya respondido no se toca

1. Presupuesto **aceptado** cuya fecha ya pasó.

✅ Sigue en **Aprobado**. ❌ Que pase a "Vencido" es un defecto.

### C4. El día vale hasta el final del día venezolano

1. Presupuesto que vence **hoy**.
2. Abrir el enlace público **de noche** (después de las 20:00 hora Venezuela).

✅ Sigue válido y **se puede aceptar**.
❌ Que diga vencido o rechace la aceptación es el defecto de las 4 horas perdidas.

---

## Bloque D — Lo demás del lote

### D1. Correo al especialista cuando un paciente agenda

Antes no existía: el especialista solo se enteraba por Google Calendar, y solo si lo había
conectado.

1. Agendar una cita desde el **booking público**.
   ✅ Le llega un correo al especialista con fecha, hora, modalidad y consultorio.
2. Agendar una cita **desde el especialista** (alta manual). ✅ Igual.
3. ✅ El correo NO muestra llaves literales tipo `{{patient_name}}`.

### D2. La nota amarilla del booking

1. Booking público, paso **5. Tus datos**.
   ✅ **Ya no** está el cuadro amarillo de "como invitado no podrás usar paquetes prepagados…".

### D3. Consultas por agendar

1. Con un paciente que tenga consultas pendientes de agendar, ✅ el especialista **ve una
   advertencia** de que las tiene. ✅ **No lo bloquea** — puede crear consultas igual.

---

## Bloque E — Regresiones a vigilar

Cosas que ya funcionaban y que este lote pudo haber roto.

- **E1.** Los **recordatorios de citas** siguen llegando. El cron nuevo vive en el mismo endpoint;
  si algo falla ahí, no puede arrastrar a los recordatorios.
- **E2.** Enviar un presupuesto **sin fecha de vencimiento** sigue funcionando, y su enlace público
  abre bien.
- **E3.** El PDF que **descarga el especialista** y el que ve el **paciente** son el mismo
  documento, con la misma marca.
- **E4.** El buscador de pacientes por cédula sigue encontrando a los **pacientes viejos**
  (cargados antes de este lote).
- **E5.** Crear un presupuesto para un **prospecto nuevo** (no un paciente existente) sigue
  funcionando y pide teléfono y cédula.

---

## Qué hacer con lo que aparezca

Anotá para cada defecto: **qué cuenta usabas**, **qué hiciste**, **qué esperabas** y **qué pasó**.
Si es un correo, guardá el asunto y la fecha que muestra adentro.

⚠️ Recordatorio de sesiones anteriores: hacer QA con dos cuentas en la misma ventana del navegador
**fabrica bugs de permisos que no existen** — la sesión de Auth0 es del navegador, no de la
pestaña. Usá ventanas de incógnito separadas.
