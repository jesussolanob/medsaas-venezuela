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
11. **Agendar a una hora libre** ("Otra hora", fuera de la grilla) y que la cita guarde la **duración real**
12. **Detalle de cita unificado** y botón de salida directa a la consulta
13. El **detalle de cita abre** (no abría por params sin esperar)
14. **Cancelar y reagendar desde la consulta**, y poder reagendar siempre
15. Una **cita pagada no se cancela, se reagenda**
16. Se puede **marcar asistencia sin confirmar** la cita antes
17. Se eliminó **aceptar/rechazar cita**: confirmar que no falta ninguna acción que usaras
18. La **reagenda mueve también la fecha de la consulta** (agenda y Consultas coinciden) ✅
19. La agenda en **vista Día**: revisar que no marque "Disponible" un bloque ocupado _(defecto conocido)_

## 2 · Consultas

20. **Registrar una consulta del pasado**: sin tope de fecha, avisa y queda **atendida**
21. **Inasistencia**: pregunta por multa y permite reagendar de una vez ✅
22. Inasistencia — impaga, sin reagenda, **sin multa** → costo $0 y sale de Por cobrar ✅
23. Inasistencia — impaga, sin reagenda, **con multa** → queda el monto de la multa ✅
24. Inasistencia — impaga, **con reagenda** → conserva monto y la cita vuelve a estar vigente ✅
25. Inasistencia — **pagada + reagenda** → el pago **viaja** a la fecha nueva ✅
26. Inasistencia — **pagada + multa** → el costo sube y el pago vuelve a pendiente ✅
27. Reagendar desde "No asistió" permite mover al **mismo día** ✅
28. **Editor con texto con formato** (negritas, listas) en la consulta
29. **Disposición configurable de los bloques** de la consulta
30. La **fecha de la consulta se ve** y el detalle abre directo
31. El **total del combo sale del servicio**, no del paquete

## 3 · Documentos y PDF

32. El **documento compartido** con el paciente sale **con el mismo formato** que el editor
33. En el PDF, la **viñeta de las listas** no queda sola en su renglón

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

69. Cada **bloque puede tener su propia duración** de consulta
70. Un día con bloques de **45'** y otro de **20'**: la cita ocupa el largo correcto
71. La **duración del servicio** vuelve, y solo se asocia a consultorios que la soporten
72. **Alta de paciente** (no guardaba)
73. **Listado de pacientes con más de 100 fichas** (se cortaba en 100)
74. **Buscar sin acentos**: "maria jose" encuentra a "María José"

## 10 · Módulo de ventas — 🔴 NUNCA VALIDADO (requiere login de vendedor)

75. Crear un vendedor desde **`/admin/sellers`** ✅ y ver su **código** ✅
76. Solo **`super_admin`** entra a esa pantalla ✅
77. El **vendedor entra y cae en `/seller`**; un doctor o paciente que intente entrar es expulsado a SU portal
78. El vendedor **ve su código arriba**, con botón de copiar
79. El vendedor **registra un especialista** → aparece en su lista, **sin selector de plan** (arranca en prueba)
80. En su lista: **fecha de registro, última entrada y plan**; "Nunca entró" si nunca ingresó
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
- El **método de pago** elegido al crear la cita no se guarda.
- Una consulta de **$0** sin resolver queda en Por cobrar.
- El **CSV de Gastos** dice "Monto" sin divisa.
