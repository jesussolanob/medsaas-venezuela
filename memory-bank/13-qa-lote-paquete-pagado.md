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

| #   | Paso                                                       | Qué tiene que pasar                                                                                                                                                                      |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Abrir esa consulta en `/doctor/consultations`              | El rótulo **"Consulta N de M"** sigue visible **después** de abrirla (antes se borraba al abrir)                                                                                         |
| 2   | Desplegar el bloque **Pago**                               | Con el paquete **ya cobrado**, el badge dice **"Cubierta"** (violeta). Con el paquete **sin cobrar**, dice **"Cubierta · por cobrar"** (ámbar) y el recuadro manda a la primera consulta |
| 3   | Mirar el recuadro violeta                                  | Monto del **paquete completo UNA sola vez**, con fecha de pago, método y referencia, y "Esta consulta no genera un cobro nuevo"                                                          |
| 4   | Buscar los controles de cobro                              | **NO** están: ni método/monto/referencia editables, ni selector de estado, ni "Guardar pago"                                                                                             |
| 5   | Mirar arriba del bloque                                    | Aparece **"Servicio: <nombre del plan>"** (antes ese bloque no lo veía nadie)                                                                                                            |
| 6   | Agregar un **Ingreso adicional** a esa consulta            | Sale un bloque aparte "A cobrar aparte en esta consulta" con la suma **solo de los extras**, aclarando que no incluye el paquete                                                         |
| 7   | Abrir la **primera** consulta del mismo paquete            | Ahí SÍ está el panel de cobro completo: la sesión 1 es la que paga                                                                                                                       |
| 8   | Agendar una preconsulta pendiente de un paquete ya cobrado | La consulta nueva nace **aprobada**, no "por cobrar" — y aparece cubierta                                                                                                                |

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

## Estado de los datos de staging (verificado 2026-09-10, tras correr la migración)

Lo que hay hoy en el clon, para no perder tiempo buscando:

- **La migración quedó aplicada**: registrada en `SequelizeMeta`, `appointments.plan_id` creada,
  `appointment_changes_log` con `change_type`/`old_value`/`new_value` y `new_status` ya nullable.
- **Backfill: 30 de 36** citas con plan resolvieron `plan_id`. Las 6 que no, por buenos motivos:
  3 son "Consulta QA Onboarding" de `lucas.rivas.55` — **hay dos planes con ese nombre**, que es
  exactamente la ambigüedad que la columna vino a eliminar — y 3 apuntan a planes ya borrados del
  catálogo. Es evidencia de que la unión por nombre era ambigua con datos reales.
- ⚠️ **No hay ningún paquete con pago APROBADO.** El único paquete real es "Combo" (5 sesiones, $75)
  de `mvillegas@correo.unimet.edu.ve`, con el pago **pendiente**. Las otras 7 preconsultas por
  agendar son basura de QA vieja: su `payment_id` no existe en `payments` y su doctor tampoco.
- **Para el ítem 2 hay material inmediato**: `lucas@deltasalud.app` tiene dos servicios activos de
  una sesión — "Consulta Demo" ($30) y "Consulta QA Prod" ($35) — y varias consultas con cita.
  Para probar la **cascada de paquete** hace falta un segundo servicio de 4 sesiones en el catálogo
  de `lucas.rivas.55` (hoy solo tiene "QA Paquete 4", $120).

**Conclusión:** el ítem 2 se prueba hoy. El ítem 1 exige armar el dato — reservar el paquete de
prueba y aprobar su cobro — porque el caso "ya pagado" no existe en el clon.

## Banco de pruebas armado (2026-09-10, ya verificado en BD)

Reservé el paquete real desde el booking público. Datos listos en staging:

| Qué                        | Valor                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Especialista               | `lucas.rivas.55@gmail.com` (doctor `193c9dae-30da-47b6-8d1a-83408feb8f51`)                     |
| Paciente de prueba         | "Paciente QA Paquete Dos", cédula V-99001410                                                   |
| Servicio                   | QA Paquete 4 — $120, 4 consultas                                                               |
| **Sesión 1 (la que paga)** | **`DLT-202609-0004`** · mié 16/09 10:00 · `covered_by = null` → panel de cobro COMPLETO        |
| **Sesión 2 (cubierta)**    | **`DLT-202609-0005`** · jue 17/09 11:20 · `covered_by.status = 'pending'` → recuadro **ÁMBAR** |
| Sesiones 3 y 4             | preconsultas `pending_scheduling`, con el pago vinculado                                       |
| Pago del paquete           | $120, **pendiente** (efectivo USD)                                                             |

**Lo que hay que mirar, en orden:**

1. Abrí `DLT-202609-0005`: tiene que decir **"Cubierta · por cobrar"** en ámbar y mandar a la
   primera consulta. Todavía NO dice "ya pagado", porque el cobro no se aprobó.
2. Aprobá el cobro del paquete desde `/doctor/cobros` (o desde `DLT-202609-0004`).
3. Volvé a `DLT-202609-0005`: ahora sí tiene que ponerse **violeta, "Cubierta"**, con la fecha
   de pago. Y no debe ofrecer ningún control de cobro.
4. Agendá la sesión 3 desde "por agendar": la consulta nueva tiene que nacer **aprobada**.

⚠️ El paquete anterior (paciente "Paciente QA Paquete", cédula V-99001409, `DLT-202609-0003`)
se reservó **antes** de los arreglos: su sesión 2 quedó sin consulta y sin pago. Se deja como
evidencia del bug; **no sirve para probar**.

## Defectos encontrados durante este QA (los cinco, ya arreglados)

| #   | Qué pasaba                                                                                                                                                             | Origen       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | La consulta de cada sesión extra **nunca se creaba**: se insertaba dentro de la transacción, la FK contra `appointments` no veía la cita y el error moría en un `warn` | preexistente |
| 2   | La cita extra no llevaba `payment_id`, así que la sesión nunca se veía cubierta y la aprobación del pago no la alcanzaba                                               | del lote     |
| 3   | El booking no guardaba `plan_id` en ninguna cita nueva: el backfill arreglaba el pasado y el presente seguía naciendo en NULL                                          | del lote     |
| 4   | El recuadro afirmaba "paquete ya pagado" sin mirar el estado del pago                                                                                                  | del lote     |
| 5   | Las sesiones extra se guardaban con la **hora del navegador del paciente**: desde UTC-3, las 10:00 elegidas quedaban 09:00 de Caracas, en silencio                     | preexistente |

Ninguno lo veía la suite (4.367 tests verdes). Los cinco aparecieron al reservar un paquete de
verdad y **mirar la base de datos, no la pantalla**.

## Resultado del QA en navegador (2026-09-11) — los dos ítems FUNCIONAN

Ejecutado de punta a punta contra staging con la cuenta `lucas.rivas.55@gmail.com`.

**Ítem 1 — verificado en pantalla:** `DLT-202609-0005` abre con badge **"Cubierta · por cobrar"**
(ámbar), monto del paquete UNA vez, sin ningún control de cobro, con "Servicio:" y el rótulo
"Consulta 2 de 4" intactos. Al aprobar el cobro de `DLT-202609-0004` pasa sola a **violeta
"Cubierta por un paquete ya pagado · Pagado el … · Efectivo USD"**. La sesión 1 sí conserva el
panel de cobro completo.

**Ítem 2 — verificado en pantalla y en BD:** el modal solo ofrece servicios de 4 consultas, avisa
**$120 → $160** antes de confirmar, y al aceptar arrastra las dos citas, **las dos preconsultas por
agendar**, el pago (monto nuevo, **sigue aprobado**, bolívares recalculados con su tasa congelada)
y deja asiento `service` con `"QA Paquete 4 Premium · $160.00" → "QA Paquete 4 · $120.00"`.

### Cuatro defectos MÁS que encontró este QA (ya arreglados y re-verificados)

| #   | Qué pasaba                                                                                                                                                        | Cómo se comprobó el arreglo                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 6   | La cascada **no tocaba las preconsultas**: el filtro decía `status='pending'` y el estado real es `pending_scheduling`, así que no actualizaba ninguna fila       | Cambiando a un servicio de nombre distinto: las preconsultas pasaron a "QA Paquete 4 Premium" |
| 7   | El asiento registraba el monto de la cita **disparadora**: desde una sesión 2..N quedaba `"$0.00 → $160.00"`, mintiendo sobre la diferencia de dinero             | El asiento nuevo dice `$160.00 → $120.00`                                                     |
| 8   | Al aprobar el pago, **las consultas hermanas seguían "pendiente"**: el listado mostraba "Pendiente" lo que el detalle llamaba "Cubierta por un paquete ya pagado" | Tras re-aprobar, la sesión 2 pasó a `approved` y el listado dice "Pagado"                     |
| 9   | El recuadro mostraba bolívares **a la tasa de hoy** (el error ya corregido en Cobros) y el método crudo en inglés: "cash usd"                                     | Ahora "Bs. 132.437,94" (congelados) y "Efectivo USD"                                          |

### Lo que queda ABIERTO (decisión del dueño)

⚠️ **Conviven dos vocabularios de método de pago en la BD.** La reserva pública guarda
`cash_usd`/`cash_bs`; el panel del especialista usa `efectivo`/`efectivo_bs`. Consecuencia real: al
abrir una consulta reservada con efectivo, el selector muestra **"— Sin especificar —"**, o sea que
el especialista **no ve cómo dijo pagar el paciente**. Se puso un mapeo de LECTURA para que la
pantalla no muestre inglés; unificar el dato de escritura toca filas existentes y no se hizo.

🔸 Menor, sin reproducir: una vez la pantalla se quedó en "Abriendo la consulta…" al entrar por
`?open=` justo después de un deploy. Con clic desde el listado abre siempre.

## Segunda ronda de QA (2026-09-11) — cinco defectos más

Tras arreglar los nueve anteriores, el QA en navegador de los caminos que faltaban destapó:

| #   | Qué pasaba                                                                                                                                                                                                                                                                              | Cómo se encontró                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 10  | **Agendar una preconsulta dejaba la cita SIN consulta.** El MISMO defecto de FK dentro de la transacción que ya se había corregido en el booking, en el otro camino: el del especialista. La pantalla decía que todo salió bien                                                         | Agendando la sesión 3 en staging y mirando la BD: `consultation_code` en null. El log de Cloud Run tenía la causa textual |
| 11  | **La consulta inmediata sobre un paquete no propagaba `session_number`.** Tres consecuencias: no se mostraba como "Cubierta" (invitaba a cobrar de nuevo), decía "consulta 1 de 4", y **corrompía el monto del paquete en las consultas hermanas** — la que pagó $120 pasó a mostrar $0 | Ejecutando el flujo real y comparando la BD                                                                               |
| 12  | **La subconsulta `package_charge_usd` no excluye las canceladas.** Una cita cancelada con precio 0 gana la selección de "cita pagadora". Por eso cancelar la cita defectuosa NO limpió el $0                                                                                            | Intentando reparar el defecto 11 a mano                                                                                   |
| 13  | El vocabulario de método de pago **estaba partido en dos ejes**, no en "booking vs panel": `/doctor/settings` también escribía inglés, y como el selector se FILTRA por `profiles.payment_methods`, la opción "Efectivo" desaparecía                                                    | Mapeando quién escribe qué antes de tocar nada                                                                            |
| 14  | **Los extras de una sesión cubierta no se pueden agregar.** Al ocultar el panel de cobro se ocultó el único lugar donde se cargan productos e inventario. Incumple la decisión del dueño ("cobro aparte por consulta")                                                                  | Intentando renderizar el bloque "A cobrar aparte" que nadie podía alcanzar                                                |

### Lo que estos cinco tienen en común

Ninguno lo veía la suite. Los defectos 10 y 11 son del mismo tipo que ya se había corregido una vez: **arreglar un camino y dejar el hermano**. La lección operativa es que en este dominio hay TRES caminos que agendan una sesión de paquete (especialista, paciente por token, consulta inmediata) y **hay que recorrer los tres**, no razonar que "delega en el mismo use case".

### Estado de producción (auditado 2026-09-11, solo lectura)

**Cero daño.** No hay ni una cita sin consulta en prod. La feature se usa —hay 6 preconsultas _por agendar_— pero **nadie completó nunca el paso de agendar**, así que el código defectuoso (en `main` desde el 2026-07-23) nunca llegó a ejecutarse hasta el final.

⚠️ Riesgo latente: esas 6 son armas cargadas. El día que un especialista agende cualquiera, con el código que hoy está en `main`, la cita nace sin consulta. **Promover el arreglo antes de que eso pase.**
