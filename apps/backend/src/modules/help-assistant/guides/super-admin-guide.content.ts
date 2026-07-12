// Auto-authored user manual for SUPER_ADMIN profile. Plain markdown text, NO backticks inside the template literal.

export const SUPER_ADMIN_GUIDE = `
# Manual del Super Administrador — Delta Salud

Este manual describe, pantalla por pantalla y botón por botón, todo lo que el perfil
SUPER ADMIN puede hacer dentro de Delta Salud. Está pensado como base de conocimiento
para un asistente de ayuda: cada sección explica la ruta, para qué sirve, qué hace cada botón,
los pasos concretos de cada flujo y las reglas de negocio importantes.

## 1. Qué es Delta Salud

Delta Salud (nombre comercial: Delta) es un sistema SaaS multi-tenant para médicos
especialistas en Venezuela. Es un CRM clínico que combina gestión de pacientes, agenda de citas,
historia clínica, finanzas del consultorio, recordatorios y un portal para pacientes. Cada médico
trabaja en su propio espacio aislado; sus datos de pacientes son confidenciales y no se comparten
entre médicos ni con la administración.

El SUPER ADMIN es el administrador de la plataforma completa. No atiende pacientes: gestiona a los
médicos (llamados "especialistas"), sus suscripciones y pagos, las verificaciones de credenciales,
el catálogo de planes y especialidades, los permisos por rol, las plantillas de correo y la
configuración global (tasa de cambio, parámetros del sistema). El super admin NUNCA ve datos
personales de pacientes: solo estadísticas agregadas.

## 2. Acceso y orientación general

- Ruta de entrada al panel: /admin
- Rol requerido: super_admin
- Autenticación: en producción es Auth0; en entorno local es un dev-stub con cookies.
- Idioma de la interfaz: español de Venezuela (es-VE). Las fechas y montos usan formato venezolano.
- Colores de marca: blanco, turquesa (teal) y gris. El encabezado del menú lateral muestra el
  logo Delta y la etiqueta "Super Admin".

### El menú lateral (sidebar)

El menú lateral izquierdo es la navegación principal. Se puede fijar o desfijar con el botón de
pin en la cabecera del menú (queda guardado entre sesiones). En móvil se abre con el botón de
menú (icono de hamburguesa). Las secciones que aparecen dependen de los permisos del rol; con un
super admin completo se ven todas. El orden real de las secciones es:

1. **Dashboard** — ruta /admin
2. **Especialistas** — ruta /admin/doctors
3. **Aprobaciones** — ruta /admin/aprobaciones
4. **Pacientes** — ruta /admin/patients
5. **Finanzas** — ruta /admin/finanzas
6. **Suscripciones** — ruta /admin/subscriptions
7. **Planes** — ruta /admin/plans
8. **Verificaciones** — ruta /admin/verifications
9. **Especialidades** — ruta /admin/specialties
10. **Plantillas de email** — ruta /admin/email-templates
11. **Roles** — ruta /admin/roles
12. **Sugerencias** — ruta /admin/suggestions
13. **Configuración** — ruta /admin/settings

En el pie del menú aparece un indicador "Sistema operativo" (punto verde) y el botón
**Cerrar sesión**, que limpia la sesión y redirige a /login.

En la barra superior (topbar) de cada pantalla está el título de la sección actual, un buscador
rápido (paleta de comandos) y el icono de notificaciones del admin.

## 3. Reglas de negocio transversales (aplican a todo el panel)

Estas reglas son la base para responder muchas preguntas. Memorízalas.

- **Privacidad de pacientes (PII):** El super admin NUNCA ve datos personales de pacientes
  (nombre, cédula, teléfono, email, diagnóstico, tratamiento). Solo ve estadísticas agregadas
  (totales, promedios). El detalle de cada paciente es confidencial de su médico.
- **Pagos manuales con aprobación:** Las suscripciones se pagan por transferencia, Pago Móvil o
  Zelle. El médico sube un comprobante y el super admin lo aprueba o rechaza. No hay cobro
  automático con tarjeta (Stripe está marcado como "próximamente").
- **Downgrade perezoso (lazy downgrade):** Cuando la suscripción de un médico vence, NO se le
  borran datos. El sistema lo baja al plan Delta Free automáticamente en su próximo inicio de
  sesión. No hay un cron que lo haga: ocurre "perezosamente" al entrar.
- **Estados de actividad del especialista:** Se calculan según el último acceso (last_sign_in_at).
  - Activo: acceso en los últimos 7 días.
  - Frío: sin acceso entre 7 y 30 días.
  - Inactivo: sin acceso más de 30 días.
- **Plan permanente:** Delta Free es permanente (is_permanent) y no tiene fecha de vencimiento.
- **Gating doble del médico:** Lo que un médico puede usar = capacidades de su ROL (matriz de
  Roles) INTERSECCIÓN features de su PLAN. Si su plan no incluye un módulo, le aparece un candado
  que lo lleva a /doctor/upgrade.
- **Bloqueo de acceso vs verificación:** Son cosas distintas. El bloqueo de acceso es un veto
  duro a la cuenta (no puede entrar). La verificación de credenciales es revisar su MPPS/colegiado
  y en Etapa 1 NO restringe el acceso.
- **Cédula obligatoria:** La cédula es obligatoria para médicos y pacientes (normalizada como
  V/E/P). Sin cédula del paciente no se pueden compartir documentos.
- **Auditoría:** Las acciones sensibles (aprobaciones de pago, cambios de suscripción, cambios de
  estado de cita) quedan registradas en bitácoras inmutables.

## 4. Dashboard (/admin)

Es el panel de control central. Sirve para ver de un vistazo el estado de la plataforma.

**Qué muestra:**
- Un encabezado con saludo (Buenos días/tardes/noches) y un resumen del día: cuántos pagos hay
  pendientes de revisión, cuántos especialistas nuevos este mes y el crecimiento mensual (MoM).
- Botones de acceso rápido en el encabezado:
  - **Revisar pagos** (si hay pagos pendientes) — lleva a /admin/subscriptions.
  - **Ver especialistas** — lleva a /admin/doctors.
- Primera fila de tarjetas KPI:
  - **Especialistas activos** (y total registrado).
  - **Consultas hoy** (tiempo real).
  - **Consultas este mes** (con comparación vs mes anterior).
  - **Suscripciones activas** (y cuántas en trial).
- Segunda fila de tarjetas KPI:
  - **Especialistas fríos** (sin acceso 7 a 30 días).
  - **Especialistas inactivos** (sin acceso más de 30 días; muestra cuántas suscripciones por
    vencer).
  - **Pacientes totales** (agregado de toda la plataforma, sin datos personales).
  - **Por cobrar** (monto total de pagos de suscripción pendientes de aprobación; cuentas por
    cobrar).
- Gráfico **Suscripciones - últimos 6 meses**: tendencia de crecimiento.
- Panel **Pagos pendientes**: cola corta de comprobantes por revisar. Cada fila lleva a
  /admin/subscriptions. Si no hay nada, muestra "Todo al día. Sin pagos por revisar".
- Tabla **Especialistas recientes**: últimos 5 registrados con su estado de suscripción y fecha.
  Botón **Ver todos** lleva a /admin/doctors.

**Reglas:** Los datos se refrescan automáticamente cada 30 segundos. Los estados de actividad se
basan en el último acceso del médico.

## 5. Especialistas (/admin/doctors)

Gestión completa de los médicos de la plataforma. Aquí se busca, se ve detalle, se crea, se
exporta y se activa/suspende a un especialista.

**Encabezado y acciones principales:**
- Subtítulo con el total de profesionales registrados y cuántos están activos.
- Botón **Exportar** — descarga un archivo CSV (especialistas.csv) con la lista de médicos
  (compatible con Excel).
- Botón **Nuevo médico** — abre un formulario (titulado "Nuevo médico") para dar de alta a un
  médico nuevo. Campos: nombre completo, email, especialidad (selector dinámico) y plan. El botón
  para guardar dice **Crear médico**: al guardar se crea la cuenta y el perfil, y se envía un
  correo de verificación automático.

**Tarjetas KPI:** Total registrados (y nuevos este mes), Activos (% del total), "+7d sin
actividad" (posible churn) y Nuevos este mes.

**Búsqueda y filtros:**
- Buscador por nombre, cédula, email o especialidad (filtra en vivo).
- Filtro "Todas las especialidades".
- Filtro de orden "Más recientes".

**Tabla de especialistas (columnas):**
- **Especialista:** avatar con iniciales + nombre + email.
- **Especialidad.**
- **Plan / Estado:** una etiqueta con el plan (ej: trial) y debajo el estado de la suscripción
  (Activo, Trial, Vencido, Suspendido).
- **Vencimiento:** fecha de expiración de la suscripción.
- **Actividad:** días desde el último acceso (verde si reciente, amarillo 7+ días, rojo 14+ días).
- Botón de los tres puntos / clic en la fila — abre el **Drawer de Detalle del Médico**.

**Drawer de Detalle del Médico** (panel lateral derecho):
- Muestra avatar, nombre, especialidad, email, teléfono, cédula, ubicación (ciudad/estado/país),
  badge de plan, fecha de registro y estadísticas (pacientes, citas del mes, ingresos del mes).
- Botón **Suspender** / **Activar** al pie: cambia el estado de la cuenta del médico. Pide
  confirmación. Suspender impide que el médico opere; Activar lo reactiva.
- Botón **Cerrar** para salir del drawer.

**Reglas:** El bloqueo/suspensión de cuenta es independiente del plan y de la verificación.
Todas las acciones validan que se trate del médico correcto (anti-IDOR). El super admin no puede
bloquearse a sí mismo ni bloquear a otro super admin.

## 6. Aprobaciones (/admin/aprobaciones)

Cola de comprobantes de pago de suscripción pendientes de revisión. Es la pantalla dedicada para
aprobar o rechazar pagos manuales (misma lógica que la pestaña Comprobantes de Suscripciones).

**Tarjetas KPI:** Pendientes (por revisar), Aprobados (histórico), Rechazados (histórico) y
Tiempo promedio de respuesta.

**Pestañas:** Pendientes, Aprobados, Rechazados (cada una muestra su contador).

**Cada fila de la cola muestra:** avatar e iniciales del médico, nombre, especialidad, monto en
USD (y en Bs si aplica, con la tasa BCV usada), duración en meses, método de pago, número de
referencia, nota del médico (si la dejó) y fecha de envío.

**Botones por fila (solo en la pestaña Pendientes):**
- Icono de ojo **Ver comprobante** — abre el comprobante subido por el médico (imagen o PDF) en
  un visor modal.
- **Rechazar** — pide la razón del rechazo (obligatoria) y marca el pago como rechazado.
- **Aprobar** — pide confirmación e indica por cuántos meses se extenderá la suscripción.

En las pestañas Aprobados y Rechazados cada fila muestra su etiqueta de estado en lugar de los
botones de acción.

### Flujo: aprobar un pago de suscripción (paso a paso)

1. Entra a **Aprobaciones** (/admin/aprobaciones) o a **Suscripciones** pestaña **Comprobantes**.
2. Quédate en la pestaña **Pendientes**.
3. Ubica el comprobante del médico. Pulsa el icono de **ojo** para verificar el comprobante
   subido (monto, referencia, banco) contra los datos de la fila.
4. Si todo coincide, pulsa **Aprobar**.
5. Confirma en el cuadro de diálogo (te indica cuántos meses se extenderá la suscripción).
6. El sistema, en una sola operación atómica: marca el pago como aprobado, extiende la fecha de
   fin del periodo de la suscripción (periodo actual + meses pagados), pone la suscripción en
   estado activo y registra el cambio en la bitácora. Se le envía un correo de confirmación al
   médico.
7. Verás un mensaje de éxito con la nueva fecha de expiración.

### Flujo: rechazar un pago

1. En la pestaña **Pendientes**, pulsa **Rechazar** en la fila del comprobante.
2. Escribe la **razón del rechazo** (es obligatoria). Si la cancelas, no pasa nada.
3. El pago queda como rechazado y la razón queda visible en la pestaña Rechazados. El médico es
   notificado.

## 7. Pacientes (/admin/patients)

Vista global de pacientes, SOLO estadísticas agregadas. Por decisión de producto, el super admin
nunca ve datos individuales ni PII de pacientes.

**Tarjetas KPI:**
- **Pacientes totales** (en toda la plataforma).
- **Activos - 30 días** (y su porcentaje del total).
- **Edad promedio** (en años; muestra guion si no hay fechas registradas).
- **Citas totales** (y número de consultas registradas).

Al pie hay una nota de confidencialidad: el detalle de los pacientes es confidencial de cada
médico; la administración solo ve estadísticas agregadas. No hay botones de acción en esta
pantalla.

## 8. Finanzas (/admin/finanzas)

Resumen financiero global de la plataforma: ingresos por suscripciones aprobadas. Es distinto de
las finanzas de cada médico (eso vive en /doctor/finances). Es una vista de solo lectura/consulta.

**Tarjetas KPI:**
- **Ingresos MTD** (mes en curso, con comparación vs mes anterior).
- **Pendientes** (monto en comprobantes sin revisar).
- **Pagos aprobados** (histórico total).
- **Mes anterior** (comparativo mes a mes).

**Gráfico Ingresos mensuales:** barras de los últimos 6 meses.

**Resumen del mes:** ingreso total, pendientes y "Esperado total" (ingreso + pendientes).

**Transacciones recientes:** tabla con ID, fecha, especialista, monto, método y estado de los
últimos pagos aprobados. Enlace **Ver cola de aprobación** que lleva a /admin/aprobaciones.

## 9. Suscripciones (/admin/subscriptions)

Centro de control de las suscripciones de los médicos. Tiene TRES pestañas: Doctores,
Comprobantes y Configuración.

### Pestaña Doctores

Lista de todos los médicos con su estado de suscripción.

- Buscador por nombre o email y botón de recargar.
- Filtros rápidos: Todos, Por vencer, Vencidos, En trial, Activos, Suspendidos.
- Tabla con: Doctor (nombre/email/especialidad), Estado (Activo, Trial, Vencido, Suspendido,
  Cancelado), Plan, Días restantes (en rojo si llegó a 0, naranja si menos de 7), Vence (fecha) y
  Acciones.
- Botones de acción por médico:
  - **Extender** (icono +): pregunta cuántos meses (entre 1 y 36) y una razón/nota opcional, y
    extiende la suscripción. Muestra la nueva fecha de vencimiento.
  - **Suspender** (icono de pausa): pide una razón y suspende la suscripción del médico.
  - **Reactivar** (icono de play): aparece si el médico está suspendido; pide confirmación y
    reactiva la suscripción.

### Pestaña Comprobantes

Es la misma cola de pagos manuales que Aprobaciones, dentro de Suscripciones.
- Filtros: Pendientes, Aprobados, Rechazados.
- Cada comprobante muestra médico, email, monto USD, monto Bs (con tasa BCV usada), duración en
  meses, método, referencia, fecha y notas.
- Botón de ojo para ver el comprobante.
- En Pendientes: botones **Aprobar** (confirma y extiende meses) y **Rechazar** (pide razón).
- Mismo flujo de aprobación atómica descrito en la sección 6.

### Pestaña Configuración

Parámetros globales del modelo de suscripción y promociones.
- **Precio y trial:**
  - Precio mensual base (USD): se aplica a nuevas compras, no es retroactivo.
  - Duración del trial Beta (días): solo para registros nuevos.
  - Días de aviso de vencimiento: lista separada por comas (ej: 7,3,1) que define cuándo se avisa
    al médico antes de vencer.
- **Métodos de pago habilitados:** casillas para Pago Móvil, Transferencia y Zelle, con sus
  campos de datos (teléfono, cédula, banco, número de cuenta, titular, email Zelle). Stripe
  aparece deshabilitado (próximamente). Estos son los métodos que el médico verá al pagar.
- **Botón "Hablar con ventas" del landing:** número de WhatsApp (con código de país, sin el signo
  +) y mensaje pre-rellenado que usa el botón de la página de inicio. Incluye un enlace para
  probar el link.
- **Descuentos por duración (promociones):** crea paquetes de varios meses con precio
  promocional. Indica meses (2 a 36), precio normal, precio promo (debe ser menor al normal) y
  una etiqueta opcional. Cada promoción se puede activar/desactivar o eliminar; muestra el % de
  descuento calculado.

## 10. Planes (/admin/plans)

Editor parametrizable del catálogo de planes vendibles. Todo es configurable desde aquí sin
necesidad de volver a desplegar el sistema (mutación 100% en base de datos).

**Encabezado:** muestra cuántos planes activos hay de cuántos totales. Botón **Nuevo plan** para
crear uno (poco habitual en producción).

**Cada plan se muestra como una tarjeta expandible** con:
- Nombre del plan, su clave (ej: delta_free, delta_base, delta_plus), etiqueta "Permanente" si no
  expira, etiqueta "Inactivo" si está desactivado.
- Resumen: cuántas features activas tiene, precios activos por periodo y rol destino.
- Botón de **lápiz (Editar plan)**: abre el formulario de edición del plan.
- Botón de **chevron** para expandir/contraer la tarjeta.

**Formulario de plan (crear/editar):**
- Clave del plan (snake_case; es inmutable después de crear).
- Nombre.
- Rol destino (doctor, assistant o super_admin).
- Orden de visualización.
- Interruptores: **Activo** y **Permanente (sin expiración)**.
- Botón **Guardar cambios** / **Crear plan**.

Dentro de una tarjeta expandida hay dos pestañas: **Features** y **Precios**.

**Pestaña Features:** lista de funcionalidades con un interruptor por cada una. Las features
dashboard y settings están bloqueadas (siempre activas, no se pueden quitar). Cuando hay cambios,
aparece el botón **Guardar features**. Cambiar features afecta de inmediato lo que ven los
médicos de ese plan.

**Pestaña Precios:** una fila por periodo (Mensual, Trimestral, Semestral, Anual). Cada fila tiene
un interruptor para activar ese periodo y un campo de precio en USD (solo editable si el periodo
está activo). Botón **Guardar precios** cuando hay cambios.

**Planes de referencia (catálogo típico):**
- **Delta Free:** gratis, permanente. Incluye lo básico (dashboard, settings, pacientes,
  consultas) pero NO incluye reservas en línea (booking), IA ni finanzas avanzadas.
- **Delta Base:** plan de pago. Incluye casi todo excepto las funciones de IA.
- **Delta Plus:** plan de pago superior. Incluye todo, más las funciones de IA (asistente de IA,
  transcripción por voz, reportes con IA).

### Flujo: configurar un plan y sus precios (paso a paso)

1. Entra a **Planes** (/admin/plans).
2. Ubica el plan y pulsa el **chevron** para expandirlo (o el lápiz para editar sus datos).
3. Para cambiar nombre, orden o si es permanente/activo: pulsa el **lápiz**, edita y pulsa
   **Guardar cambios**.
4. Para activar o desactivar funcionalidades: ve a la pestaña **Features**, mueve los
   interruptores y pulsa **Guardar features**.
5. Para fijar precios: ve a la pestaña **Precios**, activa el interruptor del periodo deseado,
   escribe el precio en USD y pulsa **Guardar precios**.
6. Si quieres ocultar el plan del catálogo público sin borrarlo, edítalo y desactiva el
   interruptor **Activo**.

> Nota: también existe la pantalla /admin/plan-features como editor alternativo de features por
> plan en forma de matriz. Hace lo mismo que la pestaña Features de Planes.

## 11. Verificaciones (/admin/verifications)

Panel para verificar las credenciales profesionales de los médicos: número MPPS (Ministerio del
Poder Popular para la Salud) de forma automática contra el portal SACS, y el número de colegiado
de forma manual.

**Encabezado:** título "Verificaciones de médicos" y botón **Actualizar** (recarga la lista).

**Pestañas:** Pendientes, Verificados, Rechazados (cada una con su contador). Si hay médicos
pendientes, se muestra un aviso con la cantidad.

**Cada médico aparece como una tarjeta** con: nombre, fecha de registro, etiqueta de estado
(Pendiente, Verificado, Rechazado), email, cédula, MPPS, colegiado.

**Verificación automática de MPPS (contra SACS):**
- Junto al número MPPS hay un botón **Verificar MPPS** (o **Re-verificar MPPS** si ya se intentó).
- Al pulsarlo, el sistema consulta el portal SACS por la cédula del médico y devuelve un resultado
  visible como insignia:
  - **MPPS verificado** (verde): el número coincide en SACS.
  - **MPPS no coincide** (ámbar): el número declarado no coincide con SACS; muestra detalle.
  - **No encontrado en SACS** (gris): no se halló el registro.
  - **Sin verificar** (gris): aún no se intentó.
  - **Error de portal** (rojo): falló la consulta al portal.
- Si un médico no tiene número MPPS, aparece "Sin MPPS".

**Verificación manual (decisión del admin):** en la pestaña Pendientes cada tarjeta tiene:
- **Verificar** (botón turquesa con escudo): marca al médico como Verificado.
- **Rechazar** (botón con escudo tachado): marca al médico como Rechazado.

**Bloqueo/desbloqueo de acceso desde Verificaciones:** en todas las pestañas, cada tarjeta tiene
un control de acceso de cuenta independiente de la verificación:
- **Bloquear acceso** (icono de prohibido): veta la cuenta; el médico recibirá error 403 en
  cualquier operación. Pide confirmación.
- **Desbloquear acceso** (icono de escudo): reactiva la cuenta. Si la cuenta está bloqueada se
  muestra una insignia roja "Acceso bloqueado".
- El sistema no permite bloquear a un super admin ni bloquearte a ti mismo.

### Flujo: verificar credenciales de un médico (paso a paso)

1. Entra a **Verificaciones** (/admin/verifications) y quédate en **Pendientes**.
2. Ubica la tarjeta del médico.
3. Para el **MPPS (automático):** pulsa **Verificar MPPS**. Espera el resultado (insignia). Si dice
   "MPPS verificado", su número es legítimo según SACS. Si dice "no coincide" o "no encontrado",
   revisa el dato manualmente.
4. Para el **colegiado (manual):** no hay verificador automático. Confirma el número con la fuente
   correspondiente por tu cuenta.
5. Cuando estés conforme, pulsa **Verificar** para aprobar al médico, o **Rechazar** si las
   credenciales no son válidas (en Etapa 1 esto NO le quita el acceso, es una marca).
6. Si necesitas vetar la cuenta (por fraude o abuso), usa **Bloquear acceso** en su tarjeta.

> Importante: en Etapa 1 la verificación NO restringe el acceso del médico a la plataforma. El
> control real de acceso es el botón Bloquear acceso, que es independiente.

## 12. Especialidades (/admin/specialties)

Mantenedor del catálogo de especialidades médicas. Es 100% editable desde la base de datos sin
necesidad de redeploy. Estas especialidades alimentan el registro y el onboarding de los médicos.

**Encabezado:** título "Especialidades" y botón **Nueva Especialidad**.

**Tira de estadísticas:** cuántas activas, cuántas inactivas y total.

**Formulario de creación** (al pulsar Nueva Especialidad):
- **Nombre** (obligatorio).
- **Orden de visualización** (opcional; número que controla el orden en las listas).
- Botones **Cancelar** y **Crear Especialidad**.

**Tabla de especialidades (columnas):** Nombre, Orden, Estado (Activa/Inactiva) y Acciones.

**Acciones por fila:**
- Botón de **interruptor** (toggle): activa o desactiva la especialidad de forma inmediata. Una
  inactiva deja de mostrarse en el catálogo público.
- Botón de **lápiz**: edición en línea. Permite cambiar el nombre y el orden. Botones **Guardar**
  y cancelar (X). También funciona con Enter para guardar y Escape para cancelar.

### Flujo: crear / editar / activar una especialidad

1. Entra a **Especialidades** (/admin/specialties).
2. Para crear: pulsa **Nueva Especialidad**, escribe el nombre (y opcionalmente el orden) y pulsa
   **Crear Especialidad**.
3. Para editar: pulsa el **lápiz** de la fila, cambia el nombre o el orden y pulsa **Guardar**.
4. Para activar o desactivar: pulsa el **interruptor** de la fila. El cambio aplica al instante.

Las especialidades disponibles típicas incluyen: Cardiología, Dermatología, Endocrinología,
Gastroenterología, Ginecología y Obstetricia, Medicina General, Medicina Interna, Nefrología,
Neurología, Oftalmología, Ortopedia y Traumatología, Otorrinolaringología, Pediatría, Psicología,
Psiquiatría, Reumatología, Fisioterapia, Urología, Centro de Salud, Clínica General y Otra.

## 13. Plantillas de email (/admin/email-templates)

Editor de las plantillas de correo automáticas de la plataforma. Es un conjunto FIJO de plantillas
(no se crean ni se borran desde la interfaz): solo se editan su asunto, su HTML y su texto plano.

**Vista de lista:** muestra todas las plantillas con su nombre legible, descripción, estado
(Activa/Inactiva) y fecha de última actualización. Una tira superior indica cuántas están activas
y el total. Al pulsar una plantilla se abre el editor.

**Plantillas disponibles (las 9 fijas):**
- appointment_confirmed — confirmación de cita al paciente.
- doctor_pending_verification — aviso de verificación pendiente al médico.
- invoice — factura de pago al médico.
- payment_approved — aviso de pago aprobado al médico.
- reminder_24h — recordatorio 24 horas antes de la cita.
- reminder_3h — recordatorio 3 horas antes de la cita.
- reminder_7d — recordatorio 7 días antes de la cita.
- shared_documents_code — código para compartir documentos con el paciente.
- welcome — correo de bienvenida.

**Editor de una plantilla:**
- Botón de **volver** (flecha) para regresar a la lista.
- Interruptor **Activa / Inactiva**: enciende o apaga el envío de esa plantilla.
- Botón **Preview** / **Ocultar preview**: muestra una vista previa del HTML en un panel aislado
  (iframe seguro). Las variables se ven como texto literal en la vista previa.
- Botón **Guardar**: guarda los cambios (se habilita solo si hubo cambios).
- Campo **Asunto (Subject):** la línea de asunto del correo (máximo 300 caracteres).
- Campo **Contenido HTML:** el cuerpo del correo en HTML.
- Campo **Versión texto plano:** opcional, es el respaldo para clientes de correo sin HTML.
- **Variables:** el editor detecta automáticamente las variables del tipo doble llave (por
  ejemplo nombre del doctor, nombre del paciente, código, monto, método de pago) y las muestra
  como etiquetas de referencia. El sistema reemplaza esas variables por los datos reales al
  enviar el correo.

### Flujo: editar una plantilla de email (paso a paso)

1. Entra a **Plantillas de email** (/admin/email-templates).
2. Pulsa la plantilla que quieres editar.
3. Edita el **Asunto**, el **Contenido HTML** y/o la **Versión texto plano**.
4. Usa las etiquetas de **Variables** como guía: escribe esas variables (en doble llave) donde
   quieras que aparezcan los datos reales.
5. Pulsa **Preview** para ver cómo queda el HTML.
6. Pulsa **Guardar**. Si necesitas desactivar el envío de esa plantilla, usa el interruptor
   **Activa/Inactiva** y guarda.

**Diagnóstico de envíos:** todos los correos enviados quedan registrados en una bitácora interna
(email_send_log) sin datos personales: tipo de destinatario, plantilla, estado (enviado/fallido),
proveedor y, si falló, el detalle del error. Sirve para diagnosticar problemas de entrega. En
producción el proveedor de correo real es Resend.

## 14. Roles (/admin/roles)

Editor de la matriz de permisos (RBAC) por rol. Define qué módulos y qué acciones puede usar cada
rol. Los cambios se aplican al instante, sin necesidad de volver a iniciar sesión.

**Encabezado:** título "Roles y permisos" y botón **Refrescar caché** (borra la caché de permisos;
útil si un cambio no se reflejó).

**Selector de rol:** botones para elegir el rol a editar: Super Admin, Admin, Especialista
(doctor), Asistente (assistant), Paciente (patient).

**Matriz de permisos:** una tabla con una fila por **módulo** (dashboard, doctors, approvals,
patients, subscriptions, plans, roles, settings, etc.) y cuatro columnas de **acción**: Ver,
Crear, Editar, Eliminar. Cada celda es un interruptor (permitido/denegado).

**Cómo funciona:**
- Al mover un interruptor, el permiso se guarda de inmediato (actualización optimista) y se
  invalida la caché del rol, así que el cambio aplica en la siguiente petición del usuario sin
  re-login.
- Por defecto, lo que no está en la matriz está denegado (default-deny).
- Si un cambio no se ve reflejado, pulsa **Refrescar caché**.

### Flujo: editar la matriz de permisos por rol

1. Entra a **Roles** (/admin/roles).
2. Selecciona el **rol** a editar (por ejemplo, Especialista).
3. Busca el **módulo** en la tabla.
4. Activa o desactiva las acciones (Ver, Crear, Editar, Eliminar) con los interruptores.
5. El cambio se guarda solo. Si hace falta, pulsa **Refrescar caché** para forzar la propagación.

> Cuidado: quitarle permisos a super_admin puede ocultarte secciones del propio menú. El menú
> lateral solo muestra una sección si el rol tiene permiso de "Ver" sobre ese módulo.

## 15. Sugerencias (/admin/suggestions)

Bandeja de sugerencias enviadas por los médicos. Sirve para leer, clasificar y responder.

**Encabezado:** muestra cuántas sugerencias se han recibido y cuántas están pendientes.

**Estadísticas:** contadores por estado (Pendiente, En progreso, Resuelto).

**Cada sugerencia muestra:** categoría (Nueva funcionalidad, Problema, Mejora, General) con color,
estado, asunto, mensaje, médico que la envió, su especialidad y fecha. Si ya respondiste, se ve tu
respuesta resaltada.

**Acciones por sugerencia (si no está resuelta):**
- **Responder** — abre un cuadro de texto para escribir la respuesta y el botón **Responder y
  resolver** (envía la respuesta y marca como Resuelto).
- **En progreso** — cambia el estado a En progreso.
- **Marcar resuelto** — cambia el estado a Resuelto sin escribir respuesta.

## 16. Configuración (/admin/settings)

Configuración general del sistema: administradores de la plataforma, tasa de cambio y parámetros
genéricos.

**Bloque Super administradores:**
- Lista los super admins (nombre, email, teléfono).
- Botón **Agregar admin** — formulario con email, nombre completo, teléfono (opcional) y password
  (mínimo 8 caracteres). Crea un nuevo super admin.
- Icono de papelera en cada admin: **Revocar acceso** — pide confirmación y degrada a ese usuario
  de super_admin a doctor.

**Bloque Fuente de tasa del sistema:** ESTA es la tasa que el sistema usa de verdad para convertir
USD a Bs en booking, finanzas y reportes.
- Muestra la **Tasa efectiva** (Bs por USD) y cuál es la fuente activa.
- Tres fuentes seleccionables:
  - **Binance P2P** (mercado paralelo, promedio de órdenes USDT/VES).
  - **BCV oficial** (Banco Central).
  - **Manual** (un valor fijo que tú escribes).
- Para usar una fuente automática, pulsa su tarjeta (Binance o BCV).
- Para usar tasa manual, escribe el valor en el campo y pulsa **Usar tasa manual**.
- Botón **Actualizar** para refrescar los valores. La tasa se refresca automáticamente al
  consultarse (aproximadamente cada 10 minutos).

**Bloque Tasa de cambio BCV (informativo):** muestra la tasa oficial USD y EUR del Banco Central
de Venezuela, con botón **Actualizar**. Es referencial.

**Bloque Configuración general (editor de parámetros):** editor genérico de pares clave/valor de
la plataforma.
- Botón **Actualizar** (recarga) y botón **Nuevo ajuste** (crear un par clave/valor; la clave es
  obligatoria, el valor es texto).
- Cada ajuste se puede editar en línea con el **lápiz** y guardar.
- Las claves de tasas de cambio aparecen como solo-lectura, marcadas como "Gestionado en Fuente de
  tasa", porque se manejan en el bloque de tasa.
- Las claves sensibles (secretos del sistema, llaves de API) NO se exponen aquí.

### Flujo: cambiar la tasa de cambio del sistema

1. Entra a **Configuración** (/admin/settings).
2. Ve al bloque **Fuente de tasa del sistema**.
3. Para automática: pulsa la tarjeta de **Binance P2P** o **BCV oficial**. La que elijas queda
   marcada como "Activa".
4. Para manual: escribe el valor (Bs por USD) en el campo y pulsa **Usar tasa manual**.
5. La "Tasa efectiva" mostrada arriba es la que se aplicará en cobros, booking y reportes.

## 17. Preguntas frecuentes (FAQ)

**¿Puedo ver el nombre, la cédula o el historial de un paciente?**
No. El super admin nunca ve datos personales de pacientes. Solo ves estadísticas agregadas en
/admin/patients (totales, edad promedio, citas). El detalle es confidencial de cada médico.

**¿Dónde apruebo el pago de la suscripción de un médico?**
En /admin/aprobaciones (pestaña Pendientes) o en /admin/subscriptions, pestaña Comprobantes. Pulsa
el ojo para ver el comprobante y luego Aprobar.

**¿Qué pasa cuando vence la suscripción de un médico?**
No se borra nada. En su próximo inicio de sesión el médico baja automáticamente al plan Delta Free
(downgrade perezoso). Conserva todos sus datos.

**¿Cómo bloqueo a un médico para que no entre?**
Dos caminos: en /admin/doctors abre el drawer del médico y pulsa Suspender; o en
/admin/verifications usa el botón Bloquear acceso en su tarjeta. El bloqueo es un veto duro
(error 403). No puedes bloquear a un super admin ni a ti mismo.

**¿Bloquear acceso es lo mismo que rechazar la verificación?**
No. Rechazar la verificación es una marca sobre sus credenciales y en Etapa 1 NO le quita el
acceso. Bloquear acceso sí le impide entrar.

**¿Cómo verifico el MPPS de un médico?**
En /admin/verifications, en la tarjeta del médico pulsa Verificar MPPS. El sistema consulta el
portal SACS por su cédula y muestra el resultado. El colegiado se verifica de forma manual.

**¿Dónde cambio el precio de un plan?**
En /admin/plans: expande el plan, ve a la pestaña Precios, activa el periodo, escribe el precio en
USD y pulsa Guardar precios. Para activar/desactivar funcionalidades usa la pestaña Features.

**¿Cómo agrego una especialidad nueva?**
En /admin/specialties pulsa Nueva Especialidad, escribe el nombre y pulsa Crear Especialidad.

**¿Cómo edito el texto de un correo automático (por ejemplo, la bienvenida o un recordatorio)?**
En /admin/email-templates selecciona la plantilla, edita el Asunto, el HTML y/o el texto plano,
usa Preview para revisarla y pulsa Guardar. Son 9 plantillas fijas: solo se editan, no se crean
ni se borran.

**¿Por qué un médico no ve un módulo (por ejemplo, Finanzas o IA)?**
Por el gating doble: necesita que su ROL tenga permiso (matriz de Roles) Y que su PLAN incluya esa
feature (Planes). La IA solo está en Delta Plus. Si su plan no la incluye, le aparece un candado.

**¿Cómo cambio qué puede hacer un rol?**
En /admin/roles selecciona el rol y mueve los interruptores de Ver/Crear/Editar/Eliminar por
módulo. Aplica al instante. Si no se refleja, pulsa Refrescar caché.

**¿Cómo agrego o quito un super admin?**
En /admin/settings, bloque Super administradores: Agregar admin para crear uno; el icono de
papelera (Revocar acceso) lo degrada a doctor.

**¿Dónde configuro la tasa de cambio que usa el sistema?**
En /admin/settings, bloque Fuente de tasa del sistema. Elige Binance P2P, BCV o Manual. La "Tasa
efectiva" es la que se aplica en toda la app.

**¿Cómo extiendo manualmente la suscripción de un médico sin esperar un pago?**
En /admin/subscriptions, pestaña Doctores, pulsa Extender en su fila e indica los meses (1 a 36).

**¿Dónde descargo la lista de médicos?**
En /admin/doctors, botón Exportar (descarga un CSV).

**¿Cómo respondo una sugerencia de un médico?**
En /admin/suggestions pulsa Responder, escribe el texto y pulsa Responder y resolver. También
puedes marcar En progreso o Resuelto.

**¿Cómo cierro sesión?**
Con el botón Cerrar sesión al pie del menú lateral. Te redirige a /login.
`;
