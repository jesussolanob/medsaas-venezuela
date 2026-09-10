# QA — lote de paquete pagado + cambio de servicio (2026-09-10)

Guion para el QA en navegador contra **staging** (`https://staging.deltasalud.app`).
Migración incluida: `20260910000001` (`appointments.plan_id` + `appointment_changes_log` ampliado).

## Antes de empezar — dos advertencias que ya costaron sesiones

⚠️ **Staging manda correo REAL a destinatarios REALES** sobre una BD clonada de producción
(`EMAIL_DRIVER=resend`, sin `SANDBOX_EMAIL`). Los dos ítems de este lote **no envían correo**
—verificado en el código: `schedule-pending-consultation` no toca el mailer, y el cambio de
servicio tampoco—, pero **la consulta inmediata y el booking sí notifican**. Si el guion te
lleva por ahí, usá un paciente de prueba, nunca uno clonado de prod.

⚠️ **Una sola cuenta por ventana del navegador.** La sesión de Auth0 es del navegador: con dos
cuentas abiertas se fabrican bugs de permisos que no existen. Ver `sesion-auth0-es-del-navegador`.

## Ítem 1 — una sesión de paquete pagado no vuelve a pedir cobro

Necesitás una consulta que sea **sesión 2..N** de un paquete con pago aprobado
(`appointments.session_number IS NOT NULL` y `payment_id` no nulo).

| #   | Paso                                                       | Qué tiene que pasar                                                                                                              |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Abrir esa consulta en `/doctor/consultations`              | El rótulo **"Consulta N de M"** sigue visible **después** de abrirla (antes se borraba al abrir)                                 |
| 2   | Desplegar el bloque **Pago**                               | El badge dice **"Cubierta"**, no "Aprobado" ni "Pendiente"                                                                       |
| 3   | Mirar el recuadro violeta                                  | Monto del **paquete completo UNA sola vez**, con fecha de pago, método y referencia, y "Esta consulta no genera un cobro nuevo"  |
| 4   | Buscar los controles de cobro                              | **NO** están: ni método/monto/referencia editables, ni selector de estado, ni "Guardar pago"                                     |
| 5   | Mirar arriba del bloque                                    | Aparece **"Servicio: <nombre del plan>"** (antes ese bloque no lo veía nadie)                                                    |
| 6   | Agregar un **Ingreso adicional** a esa consulta            | Sale un bloque aparte "A cobrar aparte en esta consulta" con la suma **solo de los extras**, aclarando que no incluye el paquete |
| 7   | Abrir la **primera** consulta del mismo paquete            | Ahí SÍ está el panel de cobro completo: la sesión 1 es la que paga                                                               |
| 8   | Agendar una preconsulta pendiente de un paquete ya cobrado | La consulta nueva nace **aprobada**, no "por cobrar" — y aparece cubierta                                                        |

**Verificación en BD (la pantalla puede mentir):** la consulta nueva del paso 8 debe tener
`payment_status='approved'` y `amount=0`.

## Ítem 2 — cambiar el servicio de una consulta

Necesitás un especialista con **dos servicios activos del mismo `sessions_count`**.

| #   | Paso                                            | Qué tiene que pasar                                                                                    |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | En el bloque Pago, tocar **"Cambiar servicio"** | Abre el modal con el servicio actual arriba                                                            |
| 2   | Mirar la lista                                  | **Solo** servicios del mismo número de consultas. Un paquete de 4 no puede pasar a una consulta simple |
| 3   | Elegir uno                                      | Aparece el aviso ámbar con **`$viejo → $nuevo`** y qué va a pasar                                      |
| 4   | Confirmar                                       | Toast "Servicio corregido"; la fila "Servicio:" y el monto se actualizan **sin recargar**              |
| 5   | Volver a abrir el modal                         | El servicio que acabás de poner ya no aparece en la lista                                              |

**Verificación en BD — esto es lo que de verdad importa:**

```sql
-- 1. La cita y TODAS sus hermanas del paquete quedaron con el servicio nuevo
SELECT id, session_number, plan_id, plan_name, plan_price
  FROM appointments WHERE payment_id = '<payment_id>' ORDER BY session_number NULLS FIRST;
-- plan_price nuevo SOLO en la que ya tenía precio; las 2..N siguen en 0

-- 2. Las preconsultas por agendar también
SELECT id, plan_name, status FROM pending_consultations WHERE payment_id = '<payment_id>';

-- 3. El pago: monto nuevo y SIGUE aprobado
SELECT amount_usd, amount_bs, bcv_rate, status FROM payments WHERE id = '<payment_id>';
-- amount_bs = amount_usd * bcv_rate CONGELADA del propio pago, no la de hoy

-- 4. El asiento de auditoría
SELECT change_type, old_value, new_value, actor_id, created_at
  FROM appointment_changes_log WHERE appointment_id = '<appointment_id>'
  ORDER BY created_at DESC LIMIT 3;
-- change_type='service', old_value='Plan viejo · $120', new_value='Plan nuevo · $160'
```

## Casos de rechazo (que el error se lea bien, no en inglés ni crudo)

- Cambiar a un servicio de **distinto** número de consultas → el backend responde
  "Solo se puede cambiar entre servicios del mismo número de consultas…". La lista del modal
  ya lo impide, así que este se prueba con `curl` contra el endpoint.
- Cambiar el servicio de una **cita ajena** → "Cita no encontrada".
- Elegir el servicio que ya tenía → no escribe nada (idempotente).

## Lo que este guion NO cubre

- Consultas sin cita (creadas a mano): no muestran "Cambiar servicio" a propósito.
- Citas viejas con **plan_id NULL** por nombres homónimos: el sistema asume 1 sesión y va a
  rechazar el cambio a un paquete. Es deliberado, pero conviene ver cuántas hay.
