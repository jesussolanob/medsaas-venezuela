// Auto-authored user manual for PATIENT profile. Plain markdown text, NO backticks inside the template literal.

export const PATIENT_GUIDE = `
# Manual del Paciente — Delta Salud

Esta es la guia oficial para PACIENTES de Delta Salud. Aqui encontraras, paso a paso,
todo lo que puedes hacer: reservar una cita con un especialista, usar tu portal personal y abrir los
documentos medicos que tu doctor te comparte. El asistente de ayuda responde unicamente con la
informacion de esta guia, asi que esta escrita para cubrir todas las acciones reales disponibles.

> Nota importante de alcance: el portal del paciente esta en una version inicial. Algunas
> secciones ya funcionan por completo (reservar citas, ver tus citas, ver tu perfil, abrir
> documentos compartidos) y otras estan EN PREPARACION (mensajes con el especialista, seguimiento
> compartido e informes clinicos detallados). En cada seccion se aclara con honestidad que esta
> disponible hoy y que no.

---

## 1. Que es Delta Salud (desde tu punto de vista)

Delta Salud es una plataforma medica usada por especialistas en Venezuela para
gestionar su consultorio. Como paciente, la plataforma te sirve para tres cosas principales:

1. **Reservar citas** con un especialista desde su enlace publico de reservas, sin necesidad de crear
   una cuenta (puedes agendar como invitado).
2. **Tener un portal personal** donde ves tus proximas citas, tu historial de citas, tus paquetes
   de sesiones prepagadas y tu perfil con tus datos personales y medicos.
3. **Recibir y descargar documentos medicos** (informes de consulta, recetas, historia clinica)
   que tu especialista te comparte de forma segura por enlace y codigo.

La plataforma usa precios en DOLARES (USD) y muestra tambien el equivalente en BOLIVARES (Bs)
segun la tasa del Banco Central de Venezuela (BCV). El idioma es espanol de Venezuela y las
fechas se muestran en formato venezolano.

Tus datos personales y medicos (nombre, cedula, telefono, correo, diagnosticos, tratamientos,
medicamentos) se guardan cifrados. Solo tu especialista y tu pueden acceder a ellos.

---

## 2. Como reservar una cita (booking publico del especialista)

Cada especialista tiene un enlace publico de reservas con la forma /book/ seguido de su identificador
(por ejemplo /book/ID-DEL-ESPECIALISTA). Tu especialista te comparte ese enlace por WhatsApp, correo o redes.
Al abrirlo veras una pagina con el nombre del especialista, su especialidad, su foto y su ciudad, y un
formulario tipo ACORDEON que avanza por pasos. A medida que completas un paso, se abre el
siguiente y el anterior se marca con un check verde (puedes volver a el tocandolo).

NO necesitas cuenta para reservar: puedes agendar como INVITADO.

### Paso 1 — Tipo de consulta (plan / servicio)

Veras las tarjetas de los servicios que ofrece el especialista. Cada tarjeta muestra:
- El **nombre** del servicio (por ejemplo Consulta General, Primera consulta, etc.).
- La **duracion** en minutos.
- El **precio en USD** en grande y, debajo, el equivalente en **Bs** segun la tasa BCV.
- Si el servicio es un **paquete de varias sesiones**, lo indica con una etiqueta tipo
  "X sesiones".
- A veces una de las opciones aparece marcada como "Mas elegido".

Si ya tienes un **paquete prepagado activo** con ese especialista (sesiones que ya pagaste antes),
aparecera arriba una tarjeta morada "Paquete activo" que dice cuantas citas te quedan y marca el
precio como "Gratis". Toca esa tarjeta para usar una sesion de tu paquete y saltar el paso de pago.

Toca el servicio que quieres para continuar.

### Paso 2 — Consultorio

Depende de como tenga configurada su atencion el especialista:
- Si tiene **un solo consultorio**, se selecciona automaticamente y veras su nombre, direccion,
  ciudad y telefono. Toca "Continuar".
- Si tiene **varios consultorios**, elige en cual quieres atenderte. Cada uno indica si es
  "Solo presencial", "Solo online" o "Presencial y online".
- Si el especialista **solo atiende por videoconsulta**, veras un aviso "Solo disponible por
  videoconsulta" y un boton "Continuar".
- Si el especialista **no tiene consultorios ni videoconsulta configurada**, aparece "Sin disponibilidad
  configurada" y se te pide contactarlo directamente para coordinar la cita.

### Paso 3 — Fecha de la cita

Veras un calendario por semanas con tarjetas de dias. Usa las flechas para moverte entre semanas.
- Los dias con horarios libres se pueden tocar; los dias sin disponibilidad aparecen atenuados y
  no se pueden seleccionar.
- Al tocar un dia, abajo aparecen los **horarios disponibles** de ese dia. Se muestran **todos los
  bloques del dia (manana y tarde)** segun la agenda que el especialista haya configurado, no solo un
  turno.
- Los horarios ya ocupados aparecen tachados y deshabilitados ("Horario ocupado"). Los horarios
  que el especialista bloqueo aparecen tambien tachados ("Horario bloqueado por el especialista").
- Toca la hora que prefieras para continuar.

### Paso 4 — Modalidad

Elige como sera la consulta:
- **Presencial** (en el consultorio). Se muestra la direccion del consultorio.
- **Online** (videollamada).

Si el consultorio solo permite un modo, ese sera el unico disponible y se indica con un aviso.

### Paso 5 — Tus datos

Aqui te identificas. El **primer campo es la cedula**. Como invitado debes ingresar:
- **Cedula** (el PRIMER campo, OBLIGATORIA — con prefijo V, E, J o G). Sin cedula no se puede
  agendar. Si **ya eres paciente de ese doctor** (tienes esa misma cedula registrada con el), el
  sistema **te reconoce y asocia tu ficha existente**, sin crear un paciente duplicado.
- **Nombre completo** (obligatorio).
- **Email** (obligatorio).
- **Telefono** (con prefijo +58).

Veras un aviso de que, como invitado, no podras usar paquetes prepagados ni ver tu historial a
menos que tengas cuenta. Tambien existe la opcion "Iniciar sesion" para acceder a tus paquetes,
aunque la creacion de cuenta con correo y contrasena dentro del booking no esta activa en esta
version: el sistema te continuara como invitado. Para tener cuenta se usa el inicio de sesion con
Google desde la pagina principal de login.

### Paso 6 — Metodo de pago

Este paso se SALTA si estas usando un paquete prepagado (ya esta pagado).

Se muestra el **monto a pagar** en USD y en Bs. Luego eliges el metodo de pago entre los que
acepta el especialista. Las opciones posibles son:
- Pago Movil
- Transferencia
- Zelle
- Binance
- Efectivo (USD)
- Efectivo (Bs)
- Punto de venta

Al elegir un metodo de pago, el sistema te muestra los **datos de pago del doctor** para ese
metodo (por ejemplo el **numero de cuenta** para transferencia, o el **numero y datos de Pago
Movil**), de modo que puedas hacer la transferencia. Luego puedes **subir el comprobante** o elegir
**"pagar despues"**. El comprobante que subes le llega al doctor en su area de cobros.

Segun el metodo:
- En **Pago Movil, Transferencia, Zelle o Binance** se muestran los **datos de pago del especialista**
  (numero de cuenta, Pago Movil, etc.) para que pagues, y puedes **subir el comprobante** (imagen
  JPG, PNG o PDF) o elegir **"pagar despues"**. El comprobante le llega al doctor a su area de
  cobros para que lo revise.
- En **Efectivo (USD), Efectivo (Bs) o Punto de venta** no se sube comprobante: pagas el dia de la
  consulta.

### Paso 7 — Confirmar cita

Veras un resumen con el plan, el precio (USD y Bs), la fecha y hora, la modalidad y el metodo de
pago, ademas de tus datos. Puedes escribir un **Motivo de consulta** (opcional). Luego toca
**"Confirmar cita"**.

### Confirmacion final

Al confirmar veras la pantalla "Cita agendada" con:
- Un **codigo de cita**.
- La fecha y hora.
- El plan y el precio.
- La modalidad. Si es presencial, la direccion del consultorio; si es online, el enlace de la
  videollamada (o el aviso de que lo recibiras por correo o WhatsApp).
- Un boton para **Anadir a Google Calendar**.
- El mensaje de que el especialista confirmara la cita y se pondra en contacto contigo.

Ademas, recibiras un **correo de confirmacion** de la cita. Si el consultorio tiene una **ubicacion
configurada**, ese correo incluira un **enlace para abrir la ubicacion en Google Maps** y llegar
facilmente.

### Importante: cuando NO puedes reservar en linea

Si al abrir el enlace ves alguno de estos mensajes, la reserva online no esta disponible con ese
especialista y debes contactarlo directamente:
- **"Reservas en linea no disponibles"**: el plan del especialista no tiene habilitada la reserva en
  linea. Esto ocurre tipicamente cuando el especialista esta en el plan gratuito (Delta Free), que no
  incluye la funcion de reservas. No es un error tuyo.
- **"Reservas no disponibles"**: el especialista todavia no configuro servicios o tarifas para agendar.
- **"Especialista no encontrado"**: el enlace no es valido o el especialista ya no esta disponible.

---

## 3. Tu portal del paciente (/patient)

El portal del paciente requiere iniciar sesion. El acceso se hace desde la pagina de login
unificada (boton de Google). Una vez dentro, veras una barra lateral con estas secciones:

- **Inicio** (panel principal)
- **Mis citas**
- **Mis informes**
- **Mi seguimiento**
- **Mi perfil**

Abajo a la izquierda aparece tu nombre, con quien fue tu ultima cita y el boton **"Cerrar sesion"**.

### 3.1 Inicio (panel principal)

Es tu pagina de bienvenida. Muestra:
- Un saludo con tu nombre.
- Una tarjeta **"Proxima cita"** con el servicio y la fecha/hora de tu siguiente cita (o
  "Sin citas agendadas" si no tienes). Si no tienes cita, aparece un boton "Agendar cita".
- Una tarjeta **"Total de citas"** con el numero total de tus citas.
- Una tarjeta **"Informes"** que te lleva a tus informes medicos.
- La seccion **"Paquetes activos"** (si tienes paquetes prepagados): cada paquete muestra el
  nombre del plan, cuantas citas te quedan, una barra de progreso (usadas / totales), el nombre
  del doctor y un boton **"Agendar siguiente cita"** que te lleva al booking de ese especialista para
  usar una sesion.
- Accesos rapidos a **"Mis Informes"** y **"Mi Perfil"**.

### 3.2 Mis citas (/patient/appointments)

Es tu historial de citas. Funciona y muestra cada cita con:
- El nombre del servicio.
- El estado de la cita, con etiquetas: **Agendada**, **Confirmada**, **Completada** o
  **Cancelada**.
- La fecha y la hora.
- El precio en USD.
- La modalidad: **Consulta Online** o **Presencial**.
- Si fue online y hay enlace de videollamada disponible, un boton **"Unirme a la llamada"**
  (Google Meet).
- El motivo de la consulta (si lo registraste).
- Un boton **"Agendar otra cita con [este doctor]"** que te lleva de nuevo a su booking.

Puedes filtrar la lista con los botones **"Todas"**, **"Proximas"** y **"Pasadas"**.

Importante: el portal NO tiene hoy un boton para cancelar o reprogramar una cita por tu cuenta.
Para cancelar o cambiar la fecha de una cita ya agendada, debes contactar directamente a tu
especialista; el o su personal hacen el cambio desde su agenda. Si quieres una nueva cita, usa el boton
"Agendar otra cita".

### 3.3 Mis informes (/patient/reports)

Esta seccion existe y carga, pero la exposicion del detalle clinico de tus consultas (notas,
diagnostico, tratamiento) todavia esta EN PREPARACION en esta version. Por ahora normalmente
veras el mensaje **"No hay informes disponibles"** con la nota de que tus informes apareceran aqui
despues de tus consultas.

Cuando la funcion este activa, cada informe podra expandirse para ver el motivo de consulta, el
informe medico, el diagnostico, el plan de tratamiento y los medicamentos recetados (con nombre,
dosis, frecuencia y duracion).

Mientras tanto, la via segura por la que tu especialista te entrega tus documentos medicos es el
**documento compartido** (ver la seccion 4 de esta guia): recibes un enlace y un codigo para
descargar el PDF con tu informe, recetas e historia clinica.

### 3.4 Mi seguimiento (/patient/seguimiento)

Esta seccion esta EN PREPARACION. Muestra el mensaje **"Modulo en preparacion"**: el seguimiento
compartido con tu especialista (tareas, archivos y mensajes en un solo lugar) estara disponible
proximamente. Mientras tanto, la recomendacion es consultar directamente con tu especialista.

### 3.5 Mi perfil (/patient/profile)

Aqui ves y editas tus datos. La pagina esta organizada en cuatro bloques:

1. **Informacion Personal**: Nombre completo, Cedula (con prefijo V, E, J o G), Fecha de
   nacimiento, Edad (se calcula sola), Sexo (Masculino, Femenino, Otro) y Tipo de sangre.
2. **Informacion de Contacto**: Email (no editable), Telefono (prefijo +58), Direccion y Ciudad.
3. **Informacion Medica**: Alergias y Condiciones Cronicas.
4. **Contacto de Emergencia**: Nombre y Telefono.

Toca **"Guardar Cambios"** para guardar. Ten en cuenta que en esta version, al guardar, solo se
persisten de forma permanente la **Direccion** y la **Ciudad**. Los demas campos se muestran y
puedes verlos, pero su edicion permanente desde el portal todavia esta EN PREPARACION. Si necesitas
corregir tu nombre, cedula u otros datos clinicos de inmediato, comunicaselo a tu especialista.

### 3.6 Secciones redirigidas

Algunas rutas antiguas ya no existen como pagina propia y te redirigen automaticamente:
- **Recetas** (/patient/prescriptions) ahora vive dentro de "Mi seguimiento".
- **Mensajes** (/patient/messages): el chat con el especialista esta fuera de esta version; te redirige
  al inicio del portal.

---

## 4. Como abrir un documento medico que te comparte tu especialista

Cuando tu especialista te comparte documentos (informe de consulta, recetas o historia clinica), recibes
un **enlace** (por correo o WhatsApp) con la forma /documents/ seguido de un token. Esa pagina es
publica y segura: no necesitas iniciar sesion, pero si verificar tu identidad.

### Pasos para descargar tu documento

1. Abre el enlace que recibiste. Veras la pantalla **"Descarga tus documentos"**.
2. Ingresa tu **Cedula** (por ejemplo V-12345678).
3. Ingresa el **codigo de 6 digitos** que recibiste por correo.
4. Toca **"Verificar codigo"**. La cedula y el codigo deben coincidir con los del paciente.
5. Si todo es correcto, veras **"Acceso verificado"** con: el nombre del especialista, tu nombre
   (parcialmente oculto por seguridad), hasta cuando es valido el enlace y las **secciones
   incluidas** (Informe de consulta, Recetas, Historia clinica EHR).
6. Toca **"Descargar PDF"**. El archivo se guarda en tu dispositivo como un PDF.

### Validez y seguridad del enlace

- El enlace tiene una **validez de 48 horas**. Despues de ese tiempo vence y debes pedir uno nuevo.
- Tu nombre se muestra parcialmente oculto en la pantalla por proteccion de tus datos.
- Si ingresas el codigo incorrecto demasiadas veces, el enlace se **bloquea** por seguridad y
  veras la pantalla "Acceso bloqueado". En ese caso solicita un nuevo codigo.

### Si no recibiste el codigo o no funciona

- En la pantalla de ingreso hay un enlace **"Solicitar nuevo codigo"** (o el boton del mismo
  nombre si el acceso quedo bloqueado). Al usarlo, el sistema te envia un codigo nuevo por correo.
  Revisa tu bandeja de entrada (y la carpeta de spam o correo no deseado).
- Asegurate de escribir la **cedula exactamente** como esta registrada (con el prefijo correcto:
  V, E, etc.) y el **codigo completo de 6 digitos**.
- Si el enlace ya vencio (mas de 48 horas), solicita un codigo nuevo; eso reactiva el acceso.
- Si despues de solicitar un codigo nuevo sigue sin funcionar, contacta a tu especialista para que te
  vuelva a compartir el documento.

---

## 5. Preguntas frecuentes (FAQ)

**Como reservo una cita?**
Abre el enlace de reservas de tu especialista (/book/ seguido de su identificador) y sigue los pasos del
acordeon: elige el servicio, el consultorio, la fecha y hora, la modalidad, ingresa tus datos
(incluida tu cedula, que es obligatoria), elige el metodo de pago y toca "Confirmar cita". No
necesitas cuenta; puedes agendar como invitado.

**Necesito crear una cuenta para reservar?**
No. Puedes reservar como invitado solo con tu nombre, email, telefono y cedula. Tener cuenta (con
Google, desde el login) te permite ver tu historial y usar paquetes prepagados.

**Por que no puedo reservar en linea con cierto especialista?**
Si ves "Reservas en linea no disponibles", el plan de ese especialista (normalmente el plan gratuito
Delta Free) no incluye la reserva en linea. Si ves "Reservas no disponibles", aun no configuro sus
servicios. En ambos casos, contacta al especialista directamente para coordinar la cita.

**Por que me piden la cedula?**
La cedula es obligatoria para identificarte de forma segura, vincular la cita a tu ficha y permitir
que luego puedas verificar tu identidad al descargar documentos medicos.

**Como cancelo o reprogramo una cita?**
El portal no permite hoy cancelar ni reprogramar una cita por tu cuenta. Contacta directamente a tu
especialista (o a su personal) para que cancele o cambie la fecha desde su agenda. Si lo que quieres es
agendar de nuevo, usa el boton "Agendar otra cita con [tu doctor]" en "Mis citas".

**Donde veo las citas que ya tengo?**
En el portal, seccion "Mis citas". Puedes filtrar por Todas, Proximas o Pasadas, y ver el estado
de cada una (Agendada, Confirmada, Completada o Cancelada).

**Como me uno a una videoconsulta (cita online)?**
Si tu cita es online y ya hay enlace disponible, en "Mis citas" aparece el boton
"Unirme a la llamada" (Google Meet). Tambien puedes recibir el enlace por correo o WhatsApp.

**Como veo el documento que me envio mi especialista?**
Abre el enlace /documents/ que recibiste, ingresa tu cedula y el codigo de 6 digitos del correo,
toca "Verificar codigo" y luego "Descargar PDF". El enlace es valido 48 horas.

**Que hago si el codigo del documento no funciona?**
Verifica que escribiste bien la cedula (con su prefijo) y los 6 digitos del codigo. Si sigue sin
funcionar, usa "Solicitar nuevo codigo" para recibir uno nuevo por correo (revisa tambien spam).
Si el enlace vencio (mas de 48 horas) o quedo bloqueado por intentos fallidos, solicitar un codigo
nuevo reactiva el acceso. Como ultimo recurso, pidele a tu especialista que vuelva a compartir el
documento.

**Que es un paquete prepagado?**
Es un plan de varias sesiones que pagas una sola vez. Aparece en tu portal en "Paquetes activos"
con una barra de progreso. Al agendar, puedes usar una sesion del paquete y te saltas el paso de
pago. Cuando usas todas las sesiones, el paquete se completa.

**Puedo cambiar mis datos en el perfil?**
Si puedes ver y editar los campos en "Mi perfil", pero en esta version solo se guardan de forma
permanente la Direccion y la Ciudad. Para corregir tu nombre, cedula u otros datos medicos, avisa a
tu especialista.

**Mis datos estan seguros?**
Si. Tus datos personales y medicos se guardan cifrados, y los documentos compartidos requieren tu
cedula mas un codigo de un solo uso para descargarse. Solo tu y tu especialista acceden a tu informacion.

**Veo precios en dolares pero quiero saber cuanto es en bolivares.**
La plataforma muestra el precio en USD y, justo debajo, el equivalente en Bs segun la tasa del
BCV vigente, tanto en el booking como en el resumen de pago.

---

Fin del manual del paciente.
`;
