# 10 — Lista completa de QA: lo que hay en staging y NO en producción

> Del diff real `main..staging` al **2026-08-17**.
> **178 commits** · **94 cambios funcionales** · **7 migraciones** · **2 pantallas nuevas**.
> Producción congelada desde el **4 de agosto**.
>
> Leyenda: ✅ ya verificado en staging · 🔴 nunca validado · ⚠️ riesgo

---

## 0 · Antes de promover

1. ⚠️ **7 migraciones sin correr en prod**. El deploy las ejecuta ANTES del build: una rota bloquea TODOS los despliegues.
   `lote-agosto-backend-support` · `subscription-payments-doctor-checkout` · `doctor-inactivity-notices` · `profiles-deactivation` · `payment-instructions-bullets` · `seller-role` · `user-role-add-seller`
2. ⚠️ **Despausar el cron**: `gcloud scheduler jobs resume doctor-inactivity-notices --location=us-east1`
3. ⚠️ El lote cambia el envío de correos: probar solo con pacientes de prueba.

---

## 1 · Agenda y citas

1. Consulta inmediata: **con espacio de sobra** — se crea con la hora actual y abre la consulta ✅
2. Consulta inmediata: **con una cita cerca** — avisa "va a durar N min en vez de M" y la crea acortada ✅
3. Consulta inmediata: **sin espacio** — avisa y el botón cambia a "Registrar igual" ✅
4. Consulta inmediata: **fuera del horario del consultorio** — pregunta a cuál asociarla
5. Consulta inmediata: **paciente con sesiones pagadas de un combo** — las ofrece y no cobra de nuevo ✅
6. Consulta inmediata: **crear un paciente nuevo** sin salir del modal
7. Consulta inmediata: el **nombre del paciente** aparece al buscarlo (salía en blanco)
8. Consulta inmediata: se crea **con su monto**, no en $0
9. **Un turno ocupa el tiempo que dura**: cita de 45' a las 8:00 en bloques de 30' → el 8:30 no se ofrece ni en booking ni al especialista ✅
10. El **modal de reagendar marca los horarios ocupados** ✅
11. **Agendar a una hora libre** ("Otra hora", fuera de la grilla) y que la cita guarde la **duración real** ✅
12. **Detalle de cita unificado** y botón de salida directa a la consulta ✅
13. El **detalle de cita abre** (no abría por params sin esperar) ✅
14. **Cancelar y reagendar desde la consulta**, y poder reagendar siempre ✅
15. Una **cita pagada no se cancela, se reagenda** ✅
16. Se puede **marcar asistencia sin confirmar** la cita antes ✅
17. Se eliminó **aceptar/rechazar cita**: confirmar que no falta ninguna acción que usaras ✅
18. La **reagenda mueve también la fecha de la consulta** (agenda y Consultas coinciden) ✅
19. La agenda en **vista Día**: no marca "Disponible" un bloque ocupado ✅ (estaba roto — arreglado)

## 2 · Consultas

20. **Registrar una consulta del pasado**: sin tope de fecha, avisa y queda **atendida** ✅ (estaba roto — arreglado)
21. **Inasistencia**: pregunta por multa y permite reagendar de una vez ✅
22. Inasistencia — impaga, sin reagenda, **sin multa** → costo $0 y sale de Por cobrar ✅
23. Inasistencia — impaga, sin reagenda, **con multa** → queda el monto de la multa ✅
24. Inasistencia — impaga, **con reagenda** → conserva monto y la cita vuelve a estar vigente ✅
25. Inasistencia — **pagada + reagenda** → el pago **viaja** a la fecha nueva ✅
26. Inasistencia — **pagada + multa** → el costo sube y el pago vuelve a pendiente ✅
27. Reagendar desde "No asistió" permite mover al **mismo día** ✅
28. **Editor con texto con formato** (negritas, listas) en la consulta ✅
29. **Disposición configurable de los bloques** de la consulta ✅
30. La **fecha de la consulta se ve** y el detalle abre directo
31. El **total del combo sale del servicio**, no del paquete ✅

## 3 · Documentos y PDF

32. ✅ **DECIDIDO (dueño, 2026-08-18): el PDF se queda en texto plano.** No se lleva el
    formato del editor al PDF. Lo que sí funciona y hay que verificar: el paciente **ve el
    formato en el portal** (negrita, cursiva, viñetas), porque esa vista renderiza el HTML.
    En el PDF solo se conservan párrafos y viñetas. **No es un defecto — no reportarlo.**
33. En el PDF, la **viñeta de las listas** no queda sola en su renglón ✅

## 4 · Cobros y Finanzas

34. **Aprobar un cobro** y confirmar que **queda guardado al recargar** ✅
35. **Corregir el monto** de un cobro ya emitido, sin anular nada
36. La **tarjeta de ingresos coincide con la pestaña** ✅
37. Una **cita sin confirmar NO cuenta como ingreso**
38. Una **consulta sin monto sale de Por cobrar** y no ensucia Ingresos ✅
39. El **desglose de ingresos** muestra el mes correcto ✅
40. La **multa sobre una consulta pagada se ve en finanzas** ✅
41. Los **botones de editar y borrar** ingresos/gastos se ven — probar **en tablet y teléfono**
42. Exportar **CSV** de Finanzas
43. Mensaje de **cobro por WhatsApp** con el monto y la divisa correctos

## 5 · Divisa (elegir Euro en Configuración)

44. **Servicios** muestra € y el rótulo EUR ✅
45. **Cobros, Finanzas, Consultas, Inicio, Facturación** con el mismo símbolo ✅
46. El **total del combo** en Servicios en la divisa correcta
47. El **campo de la multa** con el símbolo correcto ✅
48. 🔴 El **booking público**: el paciente ve **€**, no $ ✅
49. Los **rótulos** ("Total EUR", "Tasa BCV Bs/€") y el **mensaje de WhatsApp** ✅
50. Volver a dólar y confirmar que **todo vuelve a $** ✅
51. El **precio del plan Delta sigue en USD** y no cambia con la divisa del especialista ✅

## 6 · Plan y facturación del especialista

52. **Pagar el plan desde la app**, sin WhatsApp
53. **Subir el comprobante** y que la barra avance (2/4 → 3/4)
54. **Cambiar la periodicidad** (mensual/trimestral/semestral/anual) dentro del modal
55. Los textos ya **no invitan a contactar por WhatsApp**
56. Las **instrucciones de pago se ven en viñetas**
57. ⚠️ El equivalente **en bolívares del plan** — hoy usa una tasa distinta a la del resto del portal _(decisión pendiente)_

## 7 · Onboarding — 🔴 NUNCA VALIDADO

58. La **lámina de bienvenida** aparece antes del paso 1
59. El **alta queda completada** al terminar (antes nunca se sellaba)
60. El especialista **queda operativo** al terminar
61. En el consultorio, se puede **partir un día en dos bloques**
62. La consulta que crea el paso 3 aparece como **"Plan"**, no como "Servicio extra"
63. Completar solo el paso 1 **no debe** dejar entrar sin consultorio ni servicio
64. Reentrar al wizard **no debe des-verificar** al especialista
65. El campo **código de vendedor** (ver sección 10)

## 8 · Baja de cuenta — 🔴 NUNCA VALIDADO

66. El especialista puede **dar de baja su propia cuenta**
67. La baja **respeta los días pagos** y muestra hasta cuándo
68. **Volver a entrar reactiva** la cuenta en plan gratuito, sin pedirle nada a un admin

## 9 · Consultorios, servicios y pacientes

69. Cada **bloque puede tener su propia duración** de consulta ✅
70. Un día con bloques de **45'** y otro de **20'**: la cita ocupa el largo correcto ✅
71. La **duración del servicio** vuelve, y solo se asocia a consultorios que la soporten ✅
72. **Alta de paciente** (no guardaba) ✅
73. **Listado de pacientes con más de 100 fichas** (se cortaba en 100) ✅ (seguía roto — arreglado)
74. **Buscar sin acentos**: "maria jose" encuentra a "María José" ✅

## 10 · Módulo de ventas — 🔴 NUNCA VALIDADO (requiere login de vendedor)

75. Crear un vendedor desde **`/admin/sellers`** ✅ y ver su **código** ✅
76. Solo **`super_admin`** entra a esa pantalla ✅
77. El **vendedor entra y cae en `/seller`**; un doctor o paciente que intente entrar es expulsado a SU portal ✅ (falta probar el rebote de un doctor)
78. El vendedor **ve su código arriba**, con botón de copiar ✅
79. El vendedor **registra un especialista** → aparece en su lista, **sin selector de plan** (arranca en prueba) ✅ (perdía el teléfono — arreglado)
80. En su lista: **fecha de registro, última entrada y plan**; "Nunca entró" si nunca ingresó ✅
81. **Aislamiento**: con dos vendedores, cada uno ve **solo los suyos**
82. En el **onboarding**, el código válido muestra "Vendedor: <nombre>" en verde ✅ (endpoint), inventado en rojo ✅, vacío pasa
83. 🔴 **La regla que no se puede romper**: completar el onboarding con un código y después **escribir otro** — la atribución **NO debe cambiar**

## 11 · Consultas por agendar (preconsultas)

84. Reservar un **paquete multi-sesión** desde el booking y que se generen las preconsultas ✅
85. La pantalla **distingue "falló la carga" de "lista vacía"**
86. El paciente recibe el **enlace por correo** y puede autoagendar una sesión
87. **Consumo del paquete**: tarjeta con "X de N atendidas" y desglose agendadas / por agendar / sin asistir ✅
88. La insignia **"N por agendar"** en la lista de pacientes ✅
89. Una consulta **"no asistió" NO cuenta como atendida** ✅

## 12 · Recordatorios y correo

90. **Correo de reactivación por inactividad** del especialista
91. Recordatorios escalonados de las preconsultas

## 13 · Seguridad

92. La **guarda de `/seller`** ahora corre ✅ (más otros tres hallazgos de la auditoría)
93. Verificar que un doctor **no** vea datos de otro (anti-IDOR) en las pantallas nuevas

---

## Cabos sueltos conocidos (no bloquean, pero anotar)

- Causa raíz de las preconsultas no generadas de la **Dra. Solano**: sin identificar. Ya hay un WARN para cazarla.
- **Dos tasas llamadas "BCV"** con 14,7% de diferencia entre el plan Delta y el resto del portal.
- Una consulta de **$0** sin resolver queda en Por cobrar.
- El **CSV de Gastos** dice "Monto" sin divisa.

---

## Hallado y arreglado en el QA del 17 de agosto de 2026

Siete defectos que la lista no anticipaba, todos ya en staging:

1. **La vista Día ofrecía huecos ya tomados.** Una cita de 09:07 a 09:32 dejaba el slot
   de 09:30 rotulado "Disponible" con el botón de agendar encima, mientras el booking
   público —que sí mira el solapamiento— lo rechazaba. Ahora dice "Ocupado — <paciente>
   hasta <hora>".
2. **La consulta del pasado no quedaba atendida.** El asistente lo prometía por pantalla
   y no se cumplía: el alta del especialista pasa por el use case del booking _público_,
   que fija `scheduled` a mano. Quedaba en la agenda como si estuviera por venir.
3. **El método de pago del alta se perdía.** Se guardaba en `appointments` pero la
   consulta nacía con `payment_method` en null, así que al cobrar había que volver a
   elegir el método ya elegido. (Estaba anotado como cabo suelto; ahora tiene causa y
   arreglo.)
4. **"Todas" traía solo las primeras 100.** El backend recorta a 100 por request. En
   pacientes, ingresos y egresos se pedía más y se recibían 100, y el paginador rotulaba
   "1–{total} de {total}" sin página siguiente: el tope seguía ahí, disimulado. También
   afectaba el CSV de egresos.
5. **La insignia de servicios estaba fija** en "Visible en booking": al ocultar uno, la
   BD cambiaba pero el texto seguía diciendo visible.
6. **Los mensajes de compatibilidad servicio↔consultorio decían el número equivocado**
   (la duración del consultorio en vez del bloque más largo, que es lo que decide).
7. **El alta del vendedor descartaba teléfono y cédula** en el `create()` del repositorio.

### Cabos sueltos nuevos

- El **lint del frontend está roto**: 122 errores y 177 avisos en `develop`. `nx lint
frontend` falla, así que no frena nada — mismo agujero que los tests que no corre el CI.
- La vista Día calcula el fin de cita con la duración del **consultorio**, no la real:
  una cita de 25' desde las 09:07 se muestra "hasta 09:37" y el detalle dice 09:32.
  Bloquea de más, no de menos.
- El encabezado de la agenda dice "Citas cada 30 min" aunque el día tenga bloques de otra
  duración.

---

## Lote de 25 observaciones del 19 de agosto de 2026 — arregladas y desplegadas

De los 27 puntos de `Pruebas 18-08.txt`: **2 ya estaban resueltos** (son las regresiones
de abajo), **1 no se pudo reproducir** y **25 entraron en el lote**. Detalle completo en
`05-progress-log.md` (entrada 2026-08-19); decisiones en **ADR-044** y **ADR-045**.

### Lo que hay que probar

1. 🔴 **Consulta inmediata, los cuatro caminos:** crear un paciente nuevo desde el modal y
   que **avance** · que la consulta quede **confirmada** (no "por confirmar") · sin
   espacio, que "Registrar igual" **registre** · que el nombre no se parta entre el
   buscador y el formulario.
2. 🔴 **Paquete multi-sesión desde el link público:** las consultas 2ª en adelante solo
   ofrecen **días y horas que el especialista atiende** y marcan los ocupados. Al
   confirmar tiene que salir **código de consulta** (`DLT-…`), no de cita (`BK-…`).
3. 🔴 **Multa por inasistencia:** las flechas suben de a **$1** y el monto aparece en
   Por cobrar.
4. 🔴 **Consultorios:** "Copiar a…" con varios días marcados (probarlo también en el
   **onboarding**) · al crear uno nuevo, que ofrezca asociarle los servicios existentes.
5. 🔴 **Divisa euro:** el link público **no debe parpadear** de $ a €.
6. 🔴 **Métodos de pago:** cargar **DOS pagos móviles y DOS cuentas** y verificar que las
   dos aparezcan en el booking y en el mensaje de cobro por WhatsApp.
7. 🔴 **Plan Delta:** el checkout tiene **3 pasos** y muestra los datos de la cuenta.
   ⚠️ En staging hay **datos SIMULADOS** (Banesco, J-40123456-7): cargar los reales de TLS
   desde `/admin/settings` → `platform_payment_instructions` (ahora es un textarea).
8. 🔴 **Baja de cuenta:** vive al final de `/doctor/upgrade`, en gris.
9. 🔴 **Vendedor:** columna **Seguimiento** con "Nunca entró" / "Registro incompleto" /
   "Sin actividad"; el alta pide **cédula**; el onboarding **no vuelve a pedir el teléfono**.
10. 🔴 **Consulta:** bloques **verticales** por defecto (con toggle a horizontal) · la
    fecha muestra **hora** · una consulta con fecha pasada **abre su detalle sola** · el
    detalle de cita en la agenda dice si está **pagada**.

### Verificado con navegador real el 2026-08-19 (Playwright, sobre staging)

Solo la superficie **pública** — el portal del especialista, admin y vendedor necesitan login de
Auth0 y el acceso de reviewer está apagado desde el 27/07:

- ✅ **Divisa (#20):** el HTML **del servidor** ya trae `€60.00 / €199.98 / €30.00 / €45.00`, y en
  el navegador hay **4 precios en euros y CERO en dólares**. No hay parpadeo posible: el símbolo
  llega resuelto, no depende del fetch de la tasa.
- ✅ **Sesiones adicionales (#10):** el campo de fecha y hora libre **ya no existe**
  (`datetime-local` = 0 en el DOM). Hay dos desplegables por sesión; el de días ofrece solo los que
  el especialista atiende (salta sábado y domingo) y el de horas los 13 slots reales de 08:00 a
  16:00 cada 40 min. **Elegir el mismo día que la 1.ª consulta marca su horario como
  "10:00 — ocupado" y deshabilitado.**
- ✅ **Varias cuentas (#25):** con dos pagos móviles cargados a mano en la BD, el paciente ve **las
  dos** bajo "Datos para transferir (elegí una):", cada una rotulada `Mercantil · 0424…` /
  `Banesco · 0414…`. Los datos se restauraron a su forma original al terminar.
- 🐛 **Hallado al probar:** los rótulos de esos datos salían **en inglés** ("Bank", "Phone",
  "Holder", "Id_number") en la pantalla del paciente. Con un solo bloque pasaba desapercibido.
  Arreglado con `fieldLabel()` en `lib/payment-details`.

**NO se completó ninguna reserva de prueba a propósito** — ver el aviso del correo, abajo.

### 🚨 Aviso para el QA — staging manda correo REAL

`EMAIL_DRIVER=resend` en el servicio desplegado y en `staging.yml:153` desde el 2026-08-09.
**El ADR-024 y el guion 07 decían `noop` y estaban desactualizados** (corregido el 19/08). Staging
corre sobre una **base clonada con pacientes reales**, así que cualquier acción que dispare un
correo —reservar, compartir documentos, recordatorios— **le llega a la persona real**. Probar
envíos SOLO con pacientes de prueba y direcciones inventadas.

### Agregado el 19/08 después del lote — probar también

11. 🔴 **`/admin/subscriptions` → Extender:** abre un **modal de la app**, no un alert de
    Chrome · **selector de días/meses** · muestra la fecha resultante y aclara que se suma
    a lo que ya tenía · la nota está en la misma pantalla.
12. 🔴 **Extender por días de verdad**: regalar 10 días a un especialista y verificar la
    fecha. ⚠️ Probar además el caso de fin de mes: uno que venza un **31**, extendido por
    **1 mes**, NO puede caer en el mes siguiente al esperado (antes daba 3 de marzo).
13. 🔴 **Portal del vendedor: cerrar sesión.** Ahora existe el botón. Verificar que
    realmente salga (con Auth0 tiene que pasar por `/auth/logout`, no solo borrar cookies).
14. 🔴 **Consulta inmediata → paciente nuevo**: el alta **nunca funcionó** hasta este
    arreglo. Crear uno y que avance. Y provocar un rechazo (cédula repetida) para ver que
    ahora **muestre el error** en vez de no hacer nada.
15. 🔴 **Los datos de pago que ve el paciente** salen con rótulos en español: "Banco",
    "Teléfono", "Titular", "Cédula/RIF" — no "Bank", "Phone", "Holder", "Id_number".

### Abierto — necesita al dueño

- ⚠️ **Servicio de 30' que no se asocia a un consultorio de 30+10: NO REPRODUCIBLE.** La
  regla compara la duración del bloque más largo contra la del servicio y **el buffer no
  entra en la cuenta** (30 ≥ 30 es verdadero); se revisaron los 14 consultorios reales de
  staging y ninguno lo contradice. **Hace falta el nombre exacto del consultorio y del
  servicio** para dictaminarlo contra esa fila.

### Cabos sueltos nuevos

- El portal del vendedor usa cortes de actividad de **7 y 30 días** y `/admin` usa **7 y
  14**. Ya divergían antes del lote; unificarlos es decisión de producto.
- El lint del frontend sigue en **123 errores preexistentes** (medido con y sin el lote:
  idéntico). No frena nada y no sirve de señal.

---

## Regresiones halladas por el dueño el 18 de agosto de 2026 — arregladas y desplegadas

Cuatro reportes sobre staging. **Dos eran bugs reales, uno NO era de permisos aunque lo
pareciera, y el cuarto era el navegador.** Detalle completo en `05-progress-log.md`
(entrada 2026-08-18) y decisiones en **ADR-042** y **ADR-043**.

### Lo que hay que probar

1. 🔴 **Especialista con prueba vigente ve TODO.** Entrar como `marcovillegas1197@gmail.com`
   (le quedan días): Agenda, Consultorio, Finanzas, Marketing, Pacientes y Consultas sin
   candado. Su fila quedó reparada a mano en staging.
2. 🔴 **Baja y vuelta conserva el plan.** Con un especialista en prueba: Configuración → dar
   de baja → volver a entrar. Antes caía a Delta Free y perdía los días; ahora los conserva.
   Con la prueba **ya vencida** sí debe quedar en Delta Free.
3. 🔴 **El panel de admin dice lo mismo que ve el especialista.** `/admin/suscripciones`
   tiene que mostrar el mismo plan; deben seguir apareciendo las 15 filas de siempre, con
   fecha y estado.
4. 🔴 **Extender días y cambiar plan** con la cuenta de administrador: funcionan (nunca
   estuvieron rotos). Si falla, el error ahora está en español y dice si la causa es la sesión.
5. 🔴 **Aviso de sesión.** Con `/admin` abierto, entrar en OTRA pestaña de la MISMA ventana
   como especialista: en ≤60s (o al volver el foco) el panel se bloquea con "Esta ventana
   cambió de cuenta".
6. 🔴 **Consulta inmediata → "Es un paciente nuevo":** el nombre tecleado cae en "Nombre y
   apellido" y Chrome ya no parte el nombre entre el buscador y el formulario.
7. 🔴 **Barrido de idioma:** ~110 mensajes de error traducidos en la fuente. Al toparte con
   un error en cualquier módulo, tiene que estar en español.

⚠️ **Cada cuenta en una ventana de incógnito SEPARADA.** Dos pestañas de la misma ventana
comparten la sesión de Auth0 y fabrican falsos errores de permisos — que es exactamente lo
que pasó el 18/08.

### Cabos sueltos nuevos

- **`nx lint backend` está rojo** con 3 errores triviales preexistentes (import sin usar,
  escape innecesario, espacio irregular) en archivos ajenos al lote. Mismo agujero que el
  lint del frontend: no frena nada y no sirve como señal.
- **Dos filas más divergen** entre `profiles` y `subscriptions` en staging y necesitan
  decisión del dueño: `jesussolano4@gmail.com` (el perfil dice `cancelled`, la tabla vieja
  decía `active`) y `mamutstudio.ve@gmail.com` (plan NULL, se comporta como Delta Free).
