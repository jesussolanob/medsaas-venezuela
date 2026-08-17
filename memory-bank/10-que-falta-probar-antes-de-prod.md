# 10 — Lo que hay en staging y NO en producción

> Generado el **2026-08-17** del diff real `main..staging`.
> **178 commits** de atraso · **94 cambios funcionales** · **7 migraciones** · **2 pantallas nuevas**.
> Producción quedó congelada el **4 de agosto**.

---

## ⚠️ Antes de promover — riesgos técnicos

1. **Siete migraciones sin correr en prod.** El deploy las ejecuta **antes** del build:
   si una falla, bloquea TODOS los despliegues.
   `lote-agosto-backend-support` · `subscription-payments-doctor-checkout` ·
   `doctor-inactivity-notices` · `profiles-deactivation` ·
   `payment-instructions-bullets` · `seller-role` · `user-role-add-seller`
2. **Despausar el cron** `doctor-inactivity-notices` en prod, o queda muerto sin avisar:
   `gcloud scheduler jobs resume doctor-inactivity-notices --location=us-east1`
3. **Correo real**: el lote cambia el envío de correos. En staging ya va al destinatario
   real — probar envíos solo con pacientes de prueba.

---

## ✅ Ya verificado en staging (no hace falta repetirlo)

Consulta inmediata (con espacio, acortada y sin espacio) · un turno ocupa el tiempo que dura ·
el modal de reagendar marca ocupados · inasistencia en sus cuatro combinaciones ·
el pago viaja al reagendar · totales de Finanzas (tarjeta = tabla) · divisa en Servicios,
Finanzas, Inicio, Cobros y **booking público** · precio del plan Delta en USD ·
alta y listado de vendedores + código de referido · consumo del paquete.

---

## 🔴 P0 — Si está mal, hay plata mal calculada

| #   | Qué probar                                                                                    | Por qué importa                                |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | **Cobrar una consulta**: aprobar el cobro y confirmar que el monto queda guardado al recargar | "Confirmar cobro" no guardaba nada; se arregló |
| 2   | **Multa por inasistencia** sobre consulta **pagada** e **impaga**                             | Sobre la impaga se cobraba de más              |
| 3   | **Corregir el monto** de un cobro ya emitido, sin anular nada                                 | Función nueva                                  |
| 4   | **Pagar el plan Delta desde la app** (sin WhatsApp): subir comprobante y ver la barra avanzar | Reemplaza el flujo por WhatsApp                |
| 5   | Una cita **sin confirmar no cuenta como ingreso**; el desglose muestra el mes correcto        | Dos bugs de conteo                             |
| 6   | El **total del combo** sale del servicio, no del paquete                                      |                                                |

## 🟠 P1 — Si está mal, el especialista no puede trabajar

| #   | Qué probar                                                                                                                                        | Estado                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 7   | **Alta de cuenta (onboarding) completa**, desde cero                                                                                              | 🔴 **NUNCA VALIDADO**                               |
| 8   | **Dar de baja la cuenta y volver a entrar** (respeta días pagos y reactiva)                                                                       | 🔴 **NUNCA VALIDADO**                               |
| 9   | **Portal del vendedor** `/seller`: entra, ve su código, registra un especialista, ve solo los suyos                                               | 🔴 **NUNCA VALIDADO** (requiere login del vendedor) |
| 10  | **Código de vendedor en el onboarding**: válido en verde, inventado en rojo, vacío pasa. Y que **reescribir otro código NO cambie la atribución** | 🔴 la regla que no se puede romper                  |
| 11  | **Duración por bloque** en consultorios (45', 20', 60') y "Otra hora" fuera de la grilla                                                          |                                                     |
| 12  | **Cancelar y reagendar desde la consulta**; una cita pagada no se cancela, se reagenda                                                            |                                                     |
| 13  | **Registrar una consulta del pasado**: sin tope de fecha y queda atendida                                                                         |                                                     |

## 🟡 P2 — Confunde, pero no rompe

| #   | Qué probar                                                                                   |
| --- | -------------------------------------------------------------------------------------------- |
| 14  | **Editor con formato** en la consulta y disposición configurable de bloques                  |
| 15  | El **documento compartido** con el paciente sale con el mismo formato, y las viñetas del PDF |
| 16  | **Alta de paciente** y listado con **más de 100 fichas** (antes se cortaba)                  |
| 17  | **Buscar pacientes sin acentos**: "maria jose" encuentra "María José"                        |
| 18  | **Correo de reactivación por inactividad** del especialista                                  |
| 19  | **Instrucciones de pago en viñetas**                                                         |

## 🟢 P3 — Cosmético

| #   | Qué probar                                                                              |
| --- | --------------------------------------------------------------------------------------- |
| 20  | Botones de **editar/borrar** en Ingresos y Gastos **en tablet y teléfono**              |
| 21  | Se eliminó el aceptar/rechazar cita de la agenda: confirmar que no falta ninguna acción |

---

## Pantallas nuevas que no existen en prod

- **`/seller`** — portal del vendedor
- **`/admin/sellers`** — gestión de vendedores (solo `super_admin`)

## Cabos sueltos conocidos

- El **caso de la Dra. Solano** se resolvió con un backfill de datos en prod, pero la **causa
  raíz de por qué el booking no generó las preconsultas sigue sin identificarse**. Ya hay un
  WARN en el log para cazarla si vuelve a pasar.
- **Dos tasas distintas llamadas "BCV"**: el plan Delta convierte con `usdt_rate` (886,20) y
  el resto del portal con la BCV oficial (772,54) — 14,7% de diferencia. Decisión pendiente.
- El método de pago elegido al crear la cita **no se guarda**.
- Una consulta de $0 sin resolver **queda en Por cobrar** sin nada que cobrar.
- La vista Día de la agenda marca "Disponible" un bloque ocupado por una consulta inmediata.
