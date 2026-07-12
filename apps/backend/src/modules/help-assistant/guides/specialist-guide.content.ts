// Auto-authored user manual for SPECIALIST (doctor) profile. Plain markdown text, NO backticks inside the template literal.

export const SPECIALIST_GUIDE = `
# Manual del Especialista — Delta Salud

Esta guia es la base de conocimiento del asistente de ayuda para el perfil ESPECIALISTA (medico). Responde con base UNICAMENTE en este contenido. Todo esta en espanol de Venezuela (es-VE). Las rutas, botones y reglas descritas corresponden al portal del medico, ubicado en la ruta /doctor.

---

## 1. Introduccion: que es Delta Salud para el especialista

Delta Salud (tambien llamado Delta) es un CRM medico para especialistas en Venezuela. Como medico, desde un solo portal puedes:

- Gestionar tus pacientes con su historia clinica cifrada.
- Llevar una agenda de citas con calendario semanal, mensual y diario.
- Registrar consultas con bloques de contenido clinico personalizables.
- Recibir reservas de pacientes por un link publico de booking con su codigo QR.
- Cobrar consultas, registrar ingresos y gastos, y ver tus finanzas del mes.
- Configurar tus consultorios (presencial, online o ambos), tus servicios y tarifas.
- Usar inteligencia artificial (IA) para mejorar tu redaccion, transcribir audio de la consulta y resumir informes (solo en el plan Delta Plus).
- Compartir documentos con tus pacientes de forma segura (enlace + codigo de 6 digitos + cedula).

El portal usa los colores de Delta: blanco, turquesa y gris. El menu lateral (sidebar) izquierdo es tu navegacion principal. El titulo de la pantalla actual aparece arriba en la barra superior, junto a la busqueda global y la campana de notificaciones.

**Acceso:** entras al portal en /doctor. Tu rol es 'doctor'. Para salir, usa el boton **Cerrar sesion** al final del menu lateral; esto limpia tu sesion y te lleva al login.

---

## 2. Onboarding obligatorio: activa tu cuenta

La primera vez que entras al portal, el sistema verifica si completaste tu registro profesional. Si no lo has hecho, te redirige automaticamente a la pantalla **Activa tu cuenta** (ruta /doctor/onboarding). Es una pantalla a pantalla completa, sin menu lateral. No podras usar ningun modulo hasta completarla. El aviso dice: 'Este paso es obligatorio. Necesitas completar tu registro profesional para acceder al portal. Solo tarda un minuto.'

**Campos del formulario de activacion:**

- **Nombre completo** (obligatorio). Ejemplo: Maria Gonzalez Perez.
- **Cedula de identidad / Pasaporte** (obligatorio). Tiene un selector de prefijo a la izquierda con tres opciones:
  - **V** = venezolano. Solo digitos, entre 6 y 9 caracteres. Ejemplo: 12345678. Se guarda como V-12345678.
  - **E** = extranjero. Mismas reglas que V (solo digitos, 6 a 9). Se guarda como E-12345678.
  - **P** = pasaporte. Entre 5 y 20 caracteres alfanumericos (letras y numeros). Ejemplo: AB1234567. Se guarda como P-AB1234567. Al elegir P, la etiqueta del campo cambia a 'Pasaporte'.
  - Debajo del campo veras una vista previa de como se guardara (por ejemplo: 'Se guardara como: V-12345678').
- **Especialidad medica** (obligatorio). Es un combo con buscador: escribe parte del nombre y selecciona de la lista. Si tu especialidad no aparece, elige la opcion **Otra especialidad** al final de la lista y escribe el nombre manualmente.
- **Numero MPPS** (opcional). Ejemplo: MPPS-12345.
- **Numero de colegiado** (opcional). Ejemplo: CVM-56789.

El boton para enviar dice **Activar cuenta y continuar**. Mientras procesa muestra 'Guardando...'. Los campos marcados con asterisco rojo son obligatorios; el boton se mantiene deshabilitado hasta que el nombre, la cedula y la especialidad sean validos.

**Que pasa al enviar:** tu cuenta queda activada y veras la pantalla **Cuenta activada** con el mensaje 'Tus datos fueron recibidos correctamente. Ya puedes continuar al portal.' y un recuadro de **Verificacion de credenciales** que dice: 'Verificaremos tus credenciales profesionales. Si no logramos verificarte, nos contactaremos a tu correo.' Pulsa **Ir al portal** para entrar a /doctor.

**Correo de bienvenida:** al completar tu registro por primera vez recibes en tu correo un **email de bienvenida** con un **paso a paso** de como empezar a usar Delta (configurar consultorios, servicios, plantillas, agenda, etc.). Revisa tu bandeja de entrada (y la carpeta de spam por si acaso).

---

## 3. Verificacion de credenciales y sus estados

Despues de activar tu cuenta, el equipo de Delta verifica tus credenciales profesionales. Esta verificacion es un proceso interno; NO bloquea tu acceso al portal en esta etapa (puedes operar normalmente mientras se verifica).

**Que se verifica:**

- **MPPS (Ministerio del Poder Popular para la Salud):** se consulta de forma automatica en el sistema oficial (SACS) usando tu cedula normalizada (V/E/P). Es un proceso en segundo plano.
- **Colegiado:** se verifica de forma manual por el equipo administrador, ya que no existe un verificador automatico.

**Estados de verificacion que puede tener tu cuenta:**

- **Pendiente:** tu registro fue recibido y aun no se ha verificado. Es el estado inicial tras el onboarding.
- **Verificado / valido:** tus credenciales fueron confirmadas correctamente.
- **No verificado / invalido:** no se logro confirmar tus credenciales. En ese caso, el equipo Delta se comunica contigo por tu correo.

La cedula es obligatoria precisamente porque se usa para esta verificacion y, ademas, para compartir documentos con pacientes de forma segura.

**Bloqueo de cuenta (distinto de la verificacion):** un administrador puede bloquear tu cuenta por separado. Si tu cuenta esta bloqueada, al usar cualquier funcion veras una pantalla completa **Cuenta bloqueada** con el mensaje: 'Tu cuenta ha sido bloqueada por el administrador. Para restablecer el acceso, comunicate con el soporte de Delta Salud.' y un boton **Cerrar sesion**. Esto es independiente de tu plan y de la verificacion.

---

## 4. Planes y gating (candados): Free, Base y Plus

Tu acceso a cada modulo depende de DOS cosas combinadas: las capacidades de tu rol y las features (funciones) que habilita tu plan. Si un modulo no esta habilitado por tu plan, aparece en el menu en gris con un **candado** y, al pulsarlo, te lleva a la pantalla **Mejora tu plan Delta** (ruta /doctor/upgrade). El texto al pasar el cursor dice 'Mejora tu plan para acceder'.

En la parte inferior del menu lateral siempre ves tu plan activo (por ejemplo 'Plan activo' o el nombre de tu plan) con un enlace **Mejorar**, y una nota que dice 'Acceso completo' o, si tu plan fue degradado, 'Plan degradado temporalmente'.

**Los tres planes:**

- **Delta Free** (permanente, gratis, no vence — se muestra como 'Gratis' con la idea de 'sin vencimiento'):
  - Incluye: Inicio (Dashboard), Pacientes, Consultas, Consultorios, Plantillas y Configuracion.
  - NO incluye: Agenda, Cobros, Finanzas, Servicios, Recordatorios, booking online (reservas de pacientes), compartir documentos ni IA.
- **Delta Base** (aproximadamente 10 USD al mes):
  - Incluye todo lo de Free, mas: Agenda, Cobros, Finanzas, Servicios, Recordatorios, Mensajes, historia clinica EHR, booking online y compartir documentos.
  - NO incluye IA.
- **Delta Plus** (aproximadamente 30 USD al mes):
  - Incluye todo lo de Base, mas la inteligencia artificial: Mejorar texto con IA, Transcripcion de audio y Resumen de informes.

Los precios exactos y los periodos se cargan dinamicamente desde el catalogo de planes; pueden variar. Si el precio no esta disponible, la tarjeta muestra 'Precio no disponible'.

### Como mejorar tu plan (pago manual)

En la pantalla **Mejora tu plan Delta** (/doctor/upgrade) veras tarjetas con los planes y un selector de **Ciclo de pago** (por ejemplo mensual, trimestral, semestral o anual; los periodos largos pueden tener descuento). Tu plan actual aparece destacado con un boton deshabilitado. Para los otros planes el boton dice **Mejorar a [plan]**.

El proceso de pago es **manual**, no hay pasarela automatica todavia. La seccion **Como funciona el proceso** lo explica asi:

1. Realizas el pago y envias el comprobante (por transferencia o Pago Movil, segun los datos que se te indiquen).
2. El equipo Delta activa tu nuevo plan en minutos, tras revisar el comprobante.

Es decir: pagas por transferencia o Pago Movil, envias el comprobante y un administrador aprueba tu pago; al aprobarlo, tu plan se activa.

### Panel de suscripcion y downgrade perezoso

- Mientras tu suscripcion este activa, tienes acceso a todos los modulos de tu plan.
- Si tu suscripcion vence, ocurre un **downgrade perezoso**: la proxima vez que inicies sesion, tu cuenta se degrada automaticamente al plan Delta Free. **No pierdes ningun dato** (tus pacientes, consultas y finanzas siguen guardados); solo se restringen los modulos que no estan en Free. Cuando vuelvas a pagar y se apruebe, recuperas el acceso.
- Delta Free es permanente y nunca vence, por eso no sufre downgrade.
- Si tu plan esta cerca de vencer, puede aparecer un banner de aviso (amarillo cuando faltan pocos dias, rojo cuando es mas urgente).

---

## 5. El menu lateral (sidebar) del especialista

El menu lateral esta organizado en items superiores y secciones colapsables. Puedes fijarlo o dejarlo oculto con el boton de pin (Fijar sidebar / Ocultar sidebar). En movil se abre con el icono de menu.

**Items superiores:**
- **Inicio** — /doctor — tu dashboard.
- **Agenda** — /doctor/agenda — calendario de citas.

**Seccion 'Consultorio':**
- **Pacientes** — /doctor/patients
- **Consultas** — /doctor/consultations
- **Consultorios** — /doctor/offices
- **Plantillas** — /doctor/templates

**Seccion 'Finanzas':**
- **Finanzas** — /doctor/finances
- **Cobros** — /doctor/cobros
- **Servicios** — /doctor/services

**Seccion 'Marketing':**
- **Recordatorios** — /doctor/reminders

**Al pie del menu:**
- **Sugerencias** — /doctor/suggestions
- **Configuracion** — /doctor/settings
- **Cerrar sesion**

Los modulos que tu plan no habilita aparecen con candado y llevan a /doctor/upgrade. Los modulos que tu rol no permite ver no aparecen en el menu.

---

## 6. Pantalla por pantalla

### 6.1 Inicio / Dashboard — /doctor

Es tu panel de control. Contiene:

- **Saludo** con tu nombre y especialidad.
- **Tarjetas de indicadores (KPIs):** Ingresos totales (total facturado en USD, con su equivalente en bolivares), Mis pacientes (registrados en tu consultorio) y **Consultas atendidas** (total de consultas). Nota: este KPI antes se llamaba 'Pacientes atendidos'; ahora se llama **Consultas atendidas** y cuenta el total de consultas.
- **Tarjeta guia para configurar plantillas:** si aun no subiste tu **logo** o tu **firma**, aparece en el inicio una tarjeta que te invita a configurar tus plantillas (logo, firma, sello). Desaparece cuando ya subiste tu logo y firma.
- **Cita actual o proxima** destacada, con el paciente y la hora. Al pulsarla te lleva a **Abrir consulta** (si ya existe la consulta) o a **Ver agenda**.
- **Acciones rapidas** (botones en el encabezado de bienvenida): **Ver Pacientes**, **Ver Agenda**, **Crear Consulta** (abre el flujo de nueva consulta, un modal tipo acordeon con varios pasos que tambien agenda la cita) y **Crear Paciente** (abre el formulario de paciente en un modal).
- **Acciones rapidas de finanzas** (en la tarjeta de resumen financiero): **Registrar pago** (abre un modal con los cobros pendientes para aprobarlos) y **Registrar gasto** (abre un modal para anotar un gasto: categoria, monto, moneda, nota).
- **Resumen financiero del mes:** Ingresos, Gastos y Neto (puede ser negativo), en USD y su equivalente en bolivares.
- **Citas del Día:** lista con la hora, el paciente y el estado de cada cita de hoy (si no hay, 'No hay citas programadas para hoy').

Si tu plan no incluye finanzas, esa seccion no se muestra. Los KPIs se calculan en tiempo real cada vez que abres el dashboard.

### 6.2 Agenda — /doctor/agenda

Calendario visual de tus citas. (Requiere plan Base o Plus.)

- **Selector de vista:** Semana, Mes o Dia.
- **Navegacion de fechas:** flechas anterior/siguiente y boton **Hoy**.
- **Disponibilidad / Bloqueos:** seccion **Disponibilidad** (subtitulo 'Bloqueos · Horizonte de booking'). En el bloque **Bloqueos de disponibilidad**, con el boton **Agregar bloqueo** creas una ausencia (por ejemplo 'Vacaciones', 'Feriado' o 'Reunion medica') indicando nombre, fecha de inicio y fecha de fin. En los dias bloqueados no se pueden agendar citas. En la misma seccion, **Semanas visibles en el booking** define el horizonte (cuantas semanas hacia adelante aceptas reservas) y se guarda con su boton **Guardar**.
- **Boton Nueva consulta:** en la cabecera de la agenda, el boton **Nueva consulta** abre el flujo (acordeon) para crear una consulta y agendar su cita.
- **Calendario:** las citas aparecen como tarjetas con color segun su estado.
- **Detalles de cita** (al pulsar una cita): muestra paciente, hora, modalidad, plan, motivo y estado. Botones disponibles:
  - **Confirmar cita** (cuando esta Agendada): pasa la cita a Confirmada.
  - **Cancelar cita** (cuando esta Agendada o Confirmada): pide una razon opcional; si la cita usaba un paquete prepagado, la sesion se restituye.
  - **Ir a consulta**: abre la consulta de esa cita. El estado de la consulta (atendida / no asistio) y el pago se gestionan DENTRO de la consulta, no desde la agenda.
  - Para citas online con Google Meet: boton **Abrir Meet**.

Estados de una cita: Agendada (recien creada), Confirmada (la confirmaste), Atendida/completada (el paciente asistio), No asistio, Cancelada/rechazada. Todo cambio de estado queda auditado automaticamente.

### 6.3 Pacientes — /doctor/patients

Gestion de tus pacientes. Solo ves TUS pacientes.

- **Busqueda:** por nombre, email o cedula.
- **Nuevo paciente:** abre el formulario. Campos: Nombre (obligatorio), **cedula (obligatoria)**, telefono, email, fecha de nacimiento, sexo (Masculino, Femenino, Otro), grupo sanguineo, alergias, condiciones cronicas, contacto de emergencia, notas, direccion y ciudad. Tambien puedes indicar 'Por donde llego este paciente' (canal: WhatsApp, Redes Sociales, Seguro, Manual, Invitacion, etc.). La edad se calcula automaticamente a partir de la fecha de nacimiento. La **fecha de nacimiento no puede ser una fecha futura**.
- **Tabla de pacientes:** muestra nombre, cedula, telefono, email, ultima consulta y paquetes activos.
- **Acciones por paciente:**
  - **Editar paciente** — actualiza sus datos.
  - **Ver consultas** del paciente — historial; cada fila tiene 'Dx:' (diagnostico) y 'Tx:' (tratamiento) y un boton para abrir.
  - **Nueva consulta** — crea una consulta nueva para ese paciente.
  - **Subir archivo al paciente** / **Pedirle algo al paciente** — adjuntos y solicitudes.
  - **Eliminar** — el paciente se oculta pero no se borra (borrado suave).

**Reglas importantes:** la cedula del paciente es obligatoria; sin ella no podras compartirle documentos. Los datos sensibles (nombre, cedula, telefono, email) se guardan cifrados. En listados pueden mostrarse enmascarados; revelar datos completos queda registrado en una auditoria de acceso.

### 6.4 Consultas — /doctor/consultations

Listado de todas tus consultas.

- **Busqueda y filtros:** por codigo de consulta, paciente o motivo; filtro por rango de fechas y por estado de pago (Pendiente / Aprobado).
- Cada consulta tiene un **codigo unico** con formato DLT-AAAAMM-XXXX generado automaticamente.
- **Abrir/Editar** lleva a la pantalla de detalle de la consulta.

### 6.5 Detalle de consulta — /doctor/consultations/[id]

Es el editor completo de una consulta. Contiene:

- **Encabezado:** codigo, paciente y fecha.
- **Datos del paciente.**
- **Ver ficha del paciente:** el boton **Ver ficha del paciente** abre una **ventana emergente (modal) de solo lectura** con la ficha del paciente, sin sacarte de la consulta. Es solo para consultar; para editar la ficha vas a Pacientes.
- **Bloques dinamicos de la consulta:** son los campos clinicos (por ejemplo Motivo de consulta, Diagnostico, Tratamiento, Plan de tratamiento, Evaluacion actual, Observaciones, Reposo, etc.). Los bloques que aparecen los defines tu en Configuracion (ver seccion de bloques de consulta). Cada bloque es un area de texto editable. El bloque que antes se llamaba **'Indicaciones'** ahora se llama **'Evaluacion actual'**, y su contenido **se integra al informe** (ya no genera un documento aparte).
- **Botones de IA en cada bloque** (solo plan Delta Plus): **Mejorar con IA** (mejora la redaccion del bloque), **Resumen del informe** (genera un resumen) y **Resumir historial del paciente** / **Historial del paciente** (trae contexto de consultas anteriores). Tras usar la IA puedes **Copiar texto** o aplicar el resultado. Si no tienes plan Plus, estos botones no estan disponibles.
- **Grabadora de voz / transcripcion** (solo plan Plus): boton **Grabar la consulta** (o 'Grabar consulta'). Mientras procesa veras 'Transcribiendo audio...' y 'Procesando con IA — no cierres esta pagina...'. La IA transcribe el audio y sugiere que bloques llenar. Puedes **Grabar otra vez**.
- **Informacion del pago:** monto en USD y bolivares, metodo de pago y estado. Boton **Marcar pago como aprobado** (al aplicarlo se muestra como 'Pago aprobado ✓'). El estado actual se indica como Pendiente o Aprobado.
- **Compartir documentos:** boton **Compartir** (abre el modal 'Compartir documentos'; ver flujo en la seccion 7).
- **Recetas (recipes):** con **Nueva receta** puedes agregar recetas. Por cada medicamento cargas: **medicamento**, **dosis**, **frecuencia**, **duracion**, **indicaciones** y la **Presentacion** del medicamento. La Presentacion es un selector con estas opciones: Tabletas, Capsulas, Gotas, Jarabe, Spray, Crema, Unguento, Ampolla/Inyeccion, Supositorio, Ovulo, Inhalador, Polvo, Solucion, Parche u 'Otro'.
  - **PDF de 2 hojas del recipe:** al generar un recipe se produce un PDF de **dos hojas**. La **hoja 1 ('Recipe')** lista el medicamento y la dosis; la **hoja 2 ('Indicaciones')** lista el medicamento, la dosis, las indicaciones, la frecuencia, la duracion y la presentacion. Este formato de 2 hojas aplica al **generar, descargar y compartir por enlace** el recipe.
- **Reposo:** solo puedes **generar o compartir el reposo si tiene dias configurados (mayor que 0)**. Si el reposo tiene 0 dias, no se genera ni se comparte.
- **Acciones principales:** **Guardar consulta**, **Marcar como atendida** (completa la cita) y **No asistio**.

### 6.6 Cobros — /doctor/cobros

Gestion de los pagos de tus consultas. (Requiere plan Base o Plus.)

- **Tabla de cobros:** Servicio, Paciente, Metodo de pago, Total USD y Total Bs (convertido con la tasa BCV), Estado del pago (Pendiente / Aprobado) y Fecha. Mientras carga la tasa muestra 'Cargando tasa BCV...'; si no hay tasa, 'Tasa no disponible'.
- **Aprobar** un pago pendiente lo pasa a Aprobado de inmediato y sincroniza la consulta.
- **Detalle del cobro:** abre el detalle; puedes **Anadir al cobro** lineas de servicio. Si se subio comprobante se muestra; si no, 'Sin comprobante adjunto'.
- **Exportar** la informacion.
- Estados de pago: solo existen **Pendiente** y **Aprobado**. No existe 'rechazado' ni 'cancelado'; un pago simplemente sigue pendiente hasta que lo apruebas.

### 6.7 Finanzas — /doctor/finances

Resumen financiero mensual. (Requiere plan Base o Plus.)

- **Selector de mes.**
- **Pestanas:** Resumen e Ingresos (y las demas vistas de finanzas).
- **Tarjetas:** Ingresos (Pagos aprobados), Gastos (Gastos del consultorio) y Balance (Ingresos menos Gastos; puede ser negativo). En USD y bolivares.
- **Grafico de barras de Ingresos vs Gastos:** en las pestanas **Resumen** e **Ingresos** hay un **grafico de barras** que compara Ingresos vs Gastos (es el mismo grafico que ves en Reporteria).
- **Registrar ingreso** y registrar gasto (categorias como Alquiler, Personal, Insumos, Servicios, Impuestos, Otros).
- Tabla de conceptos por fecha. El listado de ingresos/egresos **se actualiza automaticamente** al agregar, editar o eliminar un movimiento. Si no hay datos: 'No hay conceptos aun.'
- La conversion a bolivares usa la tasa USDT/BCV; si no esta configurada, puede mostrarse como no disponible.

### 6.8 Servicios — /doctor/services

Tus servicios y tarifas, que tambien aparecen en el booking publico. (Requiere plan Base o Plus.)

- **Filtros:** por tipo, por consultorio (Todos los consultorios) y por estado.
- **Crear servicio.** Campos: Nombre, Tipo (servicio individual o plan de paquete con varias sesiones), Precio en USD, Duracion en minutos, numero de sesiones (si es paquete), Consultorio asociado (o 'General (todos los consultorios)'), Descripcion (se muestra al paciente en el booking) y **Mostrar en link de booking** (si lo activas, el servicio es 'Visible en booking').
- **Editar**, **Activar/Desactivar** y **Eliminar** cada servicio.
- Si no tienes ninguno: 'No tienes servicios configurados'.
- Solo los servicios con 'Mostrar en booking' activo aparecen en tu pagina publica /book/tu-id.

### 6.9 Consultorios — /doctor/offices

Gestiona tus sedes y horarios de atencion.

- **Crear consultorio.** Campos: Nombre (ejemplo: Consultorio Centro), Direccion, Ciudad, Telefono, **Enlace de ubicacion (Google Maps)** (opcional), **Modalidad** (Presencial, Online o Ambas), **Duracion del slot** en minutos (por defecto 30), **Buffer** entre citas en minutos (por defecto 10), y los **Horarios por dia** (Lunes a Domingo): para cada dia activas si trabajas y defines hora de inicio y fin.
- **Enlace de ubicacion (Google Maps):** es un campo opcional. Si lo completas, ese enlace se envia al paciente en el **correo de confirmacion de la cita**, para que abra la ubicacion del consultorio directamente en su mapa.
- **Editar**, **Activar/Desactivar** y **Eliminar** cada consultorio.
- Si no tienes ninguno: 'No tienes consultorios registrados'. Si un consultorio no tiene horario: 'Sin horarios configurados'.
- Los horarios y la modalidad de los consultorios activos son los que generan los slots disponibles en tu agenda y en el booking. La zona horaria es la de Venezuela (America/Caracas).

### 6.10 Plantillas — /doctor/templates

Plantillas para tus documentos PDF (informe, receta, reposo, etc.): logo, firma, sello, pie de pagina, matricula, tipografia y color. La generacion de PDF esta en desarrollo (diferida a una fase posterior).

### 6.11 Recordatorios — /doctor/reminders

Configuracion de recordatorios automaticos a pacientes. (Requiere plan Base o Plus.)

- Activar/desactivar recordatorios, elegir canal (Email, WhatsApp o ambos), elegir los tiempos de aviso (7 dias antes, 24 horas antes, 3 horas antes), definir horas de silencio (no enviar en ese rango) y una plantilla de mensaje.
- Un monitor muestra los ultimos recordatorios y su estado (Enviado / Fallo).
- Hoy puedes enviar recordatorios manualmente desde la cita; el envio automatico por cron esta diferido a una fase posterior. Si conectas Google Calendar, este envia su propio recordatorio 30 minutos antes.

### 6.12 Configuracion / Perfil — /doctor/settings

Perfil, metodos de pago, notificaciones y mas. Incluye:

- **Perfil:** Nombre, Email (no editable, viene del login), Cedula (no editable, del onboarding), Especialidad (no editable), Titulo profesional, Telefono, Ciudad, Estado, **Consultas online** (activar/desactivar) y **Foto de perfil**. Si registras tu **fecha de nacimiento**, esta debe corresponder a una persona de **18 anios o mas** (no se aceptan menores de edad como especialista) y no puede ser una fecha futura.
- **Metodos de pago:** agregar/editar/eliminar (Pago Movil, Transferencia, Zelle, Binance, Efectivo, Punto de venta), con sus datos. Cada metodo/opcion de pago es **colapsable** (se expande o contrae para ordenar la vista). Tambien puedes configurar seguros. **La tasa de cambio ahora vive DENTRO de esta seccion de Metodos de pago** (ya no es una pantalla aparte): eliges la tasa con la que cobras en bolivares entre **BCV USD**, **BCV EUR** o una **tasa personalizada** que tu defines.
- **Tu link publico de booking** (solo si tu plan habilita booking): muestra tu enlace publico, un boton **Copiar**, el **Codigo QR de tu link** (descargable como PNG con el boton bajo el codigo) y **Ver mi pagina** para previsualizar como lo ve el paciente. Tambien una descripcion de perfil que se muestra en tu pagina publica. Nota: 'El booking (link publico + QR) se habilita por plan.'
- **Compartir por WhatsApp:** mensaje de WhatsApp/Correo configurable (con emojis), para enviar tu link a tus contactos. La integracion plena con WhatsApp Business API esta en desarrollo.
- **Google Calendar:** boton **Conectar Google Calendar y Meet** (inicia el permiso de Google). Una vez conectado, se muestra la cuenta conectada y el boton **Desconectar**. Si lo conectas, tus citas online crean automaticamente un evento con link de Google Meet y un recordatorio 30 minutos antes. Si NO lo conectas, se usa una videollamada alternativa (Jitsi) y un correo. Si hay un problema: 'Error al conectar Google'.
- **Tasa de cambio:** la configuras DENTRO de **Metodos de pago** (BCV USD, BCV EUR o una tasa personalizada). Es la tasa con la que se convierten los montos a bolivares para cobrar. Ya NO es una pantalla/seccion aparte.

### 6.13 Bloques de consulta — /doctor/settings/consultation-blocks

Aqui defines los bloques que apareceran al registrar una consulta. Puedes crear, editar, ordenar y eliminar bloques (por ejemplo Motivo de consulta, Diagnostico, Evaluacion actual, Plan de tratamiento). Cada bloque es un campo de texto que luego rellenas en el detalle de la consulta. Debes tener al menos un bloque y todos deben tener nombre.

**Reordenar bloques (incluidos los fijos):** con las flechas **arriba/abajo (↑↓)** puedes reordenar **TODOS los bloques, incluidos los bloques fijos**. El orden que definas aqui es exactamente el orden en que apareceran las secciones dentro del **informe** de la consulta.

**Nota sobre 'Evaluacion actual':** el bloque que antes se llamaba 'Indicaciones' ahora se llama **'Evaluacion actual'** y su contenido se **integra al informe** (ya no produce un documento separado).

### 6.14 Otras pantallas

- **Sugerencias** — /doctor/suggestions: envia comentarios o ideas al equipo Delta y ve el historial con el estado (Nuevo, En progreso, Resuelto, Rechazado) y la respuesta del administrador.
- **Historia clinica (EHR)** — /doctor/ehr: diagnosticos y planes de tratamiento cifrados por paciente.
- **Facturacion** — /doctor/billing: documentos fiscales (factura, recibo, comprobante) con IVA e IGTF.
- **Reportes** — /doctor/reports y **CRM de leads** — /doctor/crm y **Mensajes** — /doctor/messages: funciones complementarias, algunas en desarrollo. No todas aparecen en el menu lateral.

---

## 7. Flujos completos paso a paso

### 7.1 Crear / agendar una cita (a traves del flujo de Nueva consulta)

En Delta no existe un boton 'Crear Cita' aparte: la cita se agenda como parte del flujo de **Nueva consulta** (un modal tipo acordeon, igual que el booking publico). El boton se llama **Crear Consulta** en Inicio y **Nueva consulta** en Agenda.

1. Desde **Inicio** pulsa **Crear Consulta**, o entra a **Agenda** y pulsa **Nueva consulta**.
2. Selecciona el **paciente** (busca o crea uno nuevo).
3. Selecciona la **fecha** y la **hora** entre los slots disponibles. Para el dia de **hoy** NO puedes elegir **horas que ya pasaron**: solo se ofrecen horarios futuros.
4. Selecciona el **consultorio y la modalidad** (presencial u online).
5. Indica el **motivo** y el **plan de consulta** (tarifa) y, si aplica, el metodo de pago.
6. Pulsa **Crear consulta**. La cita queda en estado **Agendada**.
7. Despues, desde Agenda, abre la cita y pulsa **Confirmar cita**. Para marcarla **Atendida** o **No asistio**, entra a la consulta con **Ir a consulta** (esos estados se gestionan dentro de la consulta, no en la agenda).

Si conectaste Google Calendar y la cita es online, se crea automaticamente el evento con link de Google Meet.

### 7.2 Registrar una consulta con bloques dinamicos

1. Abre la consulta desde la cita: en **Agenda** pulsa la cita y luego **Ir a consulta**; o crea una desde **Pacientes** (**Nueva consulta**) o desde **Consultas** (**Nueva consulta**).
2. Se abre el detalle con tus **bloques dinamicos** (los que configuraste en Bloques de consulta).
3. Escribe el contenido en cada bloque (Motivo, Diagnostico, Tratamiento, etc.).
4. Si tienes plan Plus, usa **Mejorar con IA** para pulir la redaccion de un bloque, o **Grabar la consulta** para transcribir audio.
5. Agrega **recetas (recipes)** si corresponde: por cada medicamento indica medicamento, dosis, frecuencia, duracion, indicaciones y **Presentacion** (Tabletas, Capsulas, Gotas, Jarabe, Spray, Crema, Unguento, Ampolla/Inyeccion, Supositorio, Ovulo, Inhalador, Polvo, Solucion, Parche u 'Otro'). El recipe se genera como un **PDF de 2 hojas** (hoja 1 'Recipe' con medicamento+dosis; hoja 2 'Indicaciones' con medicamento+dosis+indicaciones+frecuencia+duracion+presentacion), tanto al generar como al descargar y al compartir por enlace.
6. Pulsa **Guardar**. Para cerrar la cita, **Marcar como atendida**.

### 7.3 Usar la IA (solo plan Delta Plus)

- **Mejorar bloque (Mejorar con IA):** dentro de un bloque, pulsa el boton; la IA reescribe/mejora el texto. Puedes **Copiar texto** o aplicarlo.
- **Resumir informe (Resumen del informe):** genera un resumen del contenido clinico.
- **Resumen de historial (Resumir historial del paciente / Historial del paciente):** trae contexto de consultas anteriores del mismo paciente.
- **Transcripcion de audio (Grabar la consulta):** graba durante la consulta; al detener, la IA transcribe y sugiere que bloques llenar. Mientras procesa muestra 'Transcribiendo audio...' y 'Procesando con IA — no cierres esta pagina...'. Puedes **Grabar otra vez**.

Si ves estos botones desactivados o ausentes, es porque tu plan no es Plus: mejora tu plan en /doctor/upgrade.

### 7.4 Compartir un documento con el paciente (enlace + codigo de 6 digitos + cedula, 48 horas)

1. En el detalle de la consulta pulsa el boton **Compartir**, que abre el modal 'Compartir documentos'.
2. En el modal, marca que **secciones** compartir (puedes elegir varias):
   - **Informe de la consulta** (diagnostico, motivo y notas clinicas).
   - **Recetas** (medicamentos, dosis e indicaciones).
   - **Historia clinica / EHR** (historial clinico electronico del paciente).
   - Debes seleccionar al menos una seccion.
3. Pulsa **Generar enlace y enviar**. Mientras procesa muestra 'Generando enlace...'.
4. El sistema:
   - Genera un **enlace de descarga** y un **codigo de acceso de 6 digitos**, ambos copiables (boton **Copiar**).
   - Envia automaticamente un email al paciente con el enlace y el codigo: 'Se envio un email al paciente con el enlace y el codigo.'
   - Muestra la fecha de vencimiento: el enlace vence en **48 horas**. Pasada esa fecha el paciente debe solicitar uno nuevo.
5. El paciente abre el enlace y, para descargar el PDF, debe ingresar el **codigo de 6 digitos** y su **cedula**. La cedula es tolerante al formato (V-12345678 equivale a 12345678 o E-12345678).

**Requisito:** el paciente DEBE tener cedula registrada. Si no la tiene, al compartir veras un error accionable indicando que la cedula del paciente es requerida para compartir; agrega la cedula en Pacientes y vuelve a intentar. Por seguridad, el codigo tiene un limite de 5 intentos.

### 7.5 Registrar un pago/cobro y un gasto

- **Cobro de una consulta:** en **Cobros** pulsa **Aprobar**, o dentro del detalle de la consulta pulsa **Marcar pago como aprobado**. El pago pasa de Pendiente a Aprobado y se cuenta como ingreso.
- **Registrar pago manual:** en Cobros puedes registrar un pago indicando paciente, monto (USD/Bs), metodo y referencia.
- **Registrar ingreso manual:** en **Finanzas**, boton **Registrar ingreso** (monto, descripcion, moneda).
- **Registrar gasto:** en **Inicio** (boton **Registrar gasto**) o en **Finanzas**: elige categoria (Alquiler, Personal, Insumos, Servicios, Impuestos, Otros), monto, moneda y nota.

### 7.6 Cobro / compartir por WhatsApp

En **Configuracion** tienes **Compartir por WhatsApp**: redactas un mensaje (con emojis si quieres) para enviar tu link de booking o de cobro a cualquier contacto. La integracion automatica con WhatsApp Business API esta en desarrollo; por ahora envias el mensaje manualmente.

### 7.7 Configurar consultorios (presencial/virtual, Google Calendar/Meet, fallback)

1. Entra a **Consultorios** y crea uno con su **Modalidad** (Presencial, Online o Ambas). Opcionalmente carga el **Enlace de ubicacion (Google Maps)**: si lo completas, ese enlace se incluye en el correo de confirmacion de la cita para que el paciente abra la ubicacion en su mapa.
2. Define **Duracion del slot** (ej. 30 min) y **Buffer** entre citas (ej. 10 min).
3. Activa los **dias** que atiendes y sus horas de inicio/fin.
4. Para videoconsultas: en **Configuracion**, conecta **Google Calendar y Meet** (opt-in). Con Google conectado, las citas online generan link de Meet y recordatorio de Google. Sin Google, el sistema usa una videollamada alternativa (Jitsi) y envia el link por correo. El paciente tambien puede anadir la cita a su calendario (se ofrece 'Anadir a Google Calendar' o un archivo .ics).

### 7.8 Bloqueos de disponibilidad y horizonte de semanas

En **Agenda**, abre la seccion **Disponibilidad** (subtitulo 'Bloqueos · Horizonte de booking'): en **Bloqueos de disponibilidad**, con **Agregar bloqueo** marcas ausencias (vacaciones, feriado, reunion) por rango de fechas — en esos dias no se agendan citas. El campo **Semanas visibles en el booking** define cuantas semanas hacia adelante pueden reservarte los pacientes (se guarda con su boton **Guardar**).

### 7.9 Generar el QR del link publico de booking

En **Configuracion**, seccion 'Tu link publico de booking': ahi esta el **Codigo QR de tu link**. Descargalo como PNG con el boton bajo el codigo, o **Copia** el enlace y usa **Ver mi pagina** para previsualizar. Esto solo esta disponible si tu plan habilita booking (Base o Plus).

### 7.10 Configurar servicios con descripcion

En **Servicios**, crea un servicio con Nombre, Precio USD, Duracion, Consultorio (o General) y una **Descripcion** (que vera el paciente en tu booking). Activa **Mostrar en link de booking** para que aparezca en tu pagina publica.

---

## 8. Pagina publica de booking — /book/tu-id

Es la pagina donde tus pacientes reservan cita, sin necesidad de iniciar sesion (modo invitado). Es un formulario tipo acordeon con estos pasos:

1. **Tipo de consulta (plan):** el paciente elige el servicio/plan; si tiene un paquete prepagado activo, aparece como 'Paquete activo' y se marca como ya pagado.
2. **Consultorio:** si tienes varios, el paciente elige sede; si tienes uno solo, se selecciona automaticamente; si solo atiendes online, se indica 'Solo disponible por videoconsulta'.
3. **Fecha de la cita:** elige dia y hora entre los horarios disponibles. Los horarios bloqueados aparecen deshabilitados ('Horario bloqueado por el medico').
4. **Modalidad:** Presencial o Videoconsulta (online).
5. **Datos del paciente y metodo de pago:** el paciente ingresa Nombre, email, telefono y **cedula** (obligatorios). Si paga por un metodo que requiere comprobante, lo adjunta; con paquete prepagado se salta el pago.
6. **Confirmacion:** muestra un resumen y, al confirmar, un **Codigo de cita**, la fecha, el plan, la modalidad y, si es online, el link de videoconsulta. El paciente puede anadir la cita a su calendario.

El mensaje final indica: 'El medico confirmara tu cita y se pondra en contacto contigo.' Si tu mismo (como doctor) o un administrador abren su propia pagina, se muestra un banner de modo previsualizacion y no se generan citas reales.

---

## 9. Seguridad y reglas clinicas para el doctor

- **Solo ves tus datos:** todos tus pacientes, citas, consultas y finanzas son tuyos; el sistema valida que no accedas a datos de otro medico.
- **Datos cifrados:** nombre, cedula, telefono, email de pacientes, asi como diagnosticos, tratamientos, historia clinica y recetas, se guardan cifrados.
- **Enmascarado en listas:** los datos sensibles pueden aparecer enmascarados en listados. Revelar el dato completo queda registrado en una auditoria de acceso.
- **Cedula obligatoria del paciente:** es requerida para crear/editar un paciente y para poder compartirle documentos.
- **Auditoria:** los cambios de estado de citas, los cambios de suscripcion, los accesos a datos de pacientes y los envios de email quedan registrados de forma inmutable. Los registros de email NO guardan datos personales (solo identificadores internos y el estado del envio).
- **Compartir documentos** usa doble factor: codigo de 6 digitos (vence en 48 horas, 5 intentos) mas la cedula del paciente.
- **No se registra informacion sensible del paciente** en los registros tecnicos del sistema.

---

## 10. Preguntas frecuentes (FAQ)

**Por que veo un candado en un modulo del menu?**
Porque tu plan actual no incluye esa funcion. Pulsa el item con candado o el boton **Mejorar** del pie del menu para ir a /doctor/upgrade y subir de plan (Base o Plus). Por ejemplo, Agenda, Cobros, Finanzas, Servicios y Recordatorios requieren Base o Plus; la IA requiere Plus.

**Donde subo de plan y como pago?**
En /doctor/upgrade. Eliges el plan y el ciclo de pago, realizas el pago por transferencia o Pago Movil, envias el comprobante y el equipo Delta activa tu plan en minutos tras aprobarlo. Es un proceso manual.

**Vencio mi plan, perdi mis datos?**
No. Si tu suscripcion vence, tu cuenta baja a Delta Free al iniciar sesion (downgrade perezoso), pero todos tus datos siguen guardados. Al pagar de nuevo recuperas el acceso a los modulos.

**Como agrego un paciente?**
En **Pacientes** pulsa **Nuevo paciente** (o **Crear Paciente** desde Inicio). La cedula es obligatoria.

**Como comparto un informe o receta con mi paciente?**
Abre la consulta, pulsa el boton **Compartir** (abre 'Compartir documentos'), elige las secciones (Informe, Recetas, EHR), pulsa **Generar enlace y enviar** y se envia por email al paciente con un codigo de 6 digitos. El paciente entra con el codigo y su cedula. El enlace vence en 48 horas. Requiere que el paciente tenga cedula.

**El paciente no tiene cedula y no puedo compartir, que hago?**
Ve a **Pacientes**, edita el paciente y agrega su cedula; luego vuelve a compartir.

**Como uso la inteligencia artificial?**
Necesitas el plan **Delta Plus**. Dentro de una consulta veras **Mejorar con IA**, **Resumen del informe**, **Resumir historial del paciente** y **Grabar la consulta** (transcripcion de audio). Si no aparecen, tu plan no es Plus.

**Donde esta mi link de reservas y el codigo QR?**
En **Configuracion** (/doctor/settings), seccion 'Tu link publico de booking': ahi copias el link, descargas el **Codigo QR** como PNG y previsualizas con **Ver mi pagina**. Disponible con plan Base o Plus.

**Como conecto Google Calendar / Meet?**
En **Configuracion**, boton **Conectar Google Calendar y Meet**. Con Google conectado, las citas online crean link de Meet automaticamente; sin Google, se usa una videollamada alternativa (Jitsi) y se envia por correo.

**Como configuro mis horarios de atencion?**
En **Consultorios** (/doctor/offices): crea un consultorio, define modalidad, duracion del slot, buffer y los dias/horas que atiendes. Esos horarios generan los slots de tu agenda y del booking.

**Como bloqueo dias (vacaciones)?**
En **Agenda**, seccion **Disponibilidad** ('Bloqueos · Horizonte de booking'), usa **Agregar bloqueo** con el rango de fechas. En esos dias no se podran agendar citas.

**Como apruebo un pago?**
En **Cobros** (/doctor/cobros) usa **Aprobar**, o dentro del detalle de la consulta pulsa **Marcar pago como aprobado**. El pago pasa de Pendiente a Aprobado. No existen estados 'rechazado' ni 'cancelado' para pagos.

**Como registro un gasto o un ingreso manual?**
Gasto: en **Inicio** (boton **Registrar gasto**) o en **Finanzas**, eligiendo categoria, monto y moneda. Ingreso manual: en **Finanzas**, **Registrar ingreso**.

**Cual es la diferencia entre Confirmar, Atendida y No asistio?**
**Confirmar cita** (en Agenda) pasa una cita Agendada a Confirmada. **Marcar como atendida** (dentro de la consulta) indica que el paciente asistio (cuenta como ingreso). **No asistio** (dentro de la consulta) indica que no vino (no devuelve sesiones de paquete).

**Mi cuenta dice 'Cuenta bloqueada', que hago?**
Tu cuenta fue bloqueada por un administrador. Comunicate con el soporte de Delta Salud. Esto es distinto de la verificacion de credenciales y del plan.

**Que significa que mi verificacion esta 'Pendiente'?**
Significa que aun no se han confirmado tus credenciales (MPPS/colegiado). No te impide usar el portal. Si no se logra verificar, Delta te contactara por correo.

**Que campos del onboarding son obligatorios?**
Nombre completo, cedula (V/E/P) y especialidad. El numero MPPS y el numero de colegiado son opcionales.

**Donde edito mi perfil, telefono o metodos de pago?**
En **Configuracion** (/doctor/settings). El email, la cedula y la especialidad no se pueden editar ahi (vienen del login y del onboarding).
`;
