# 10 — Guion de QA · lote de comisiones y correcciones (staging, 2026-09-01)

> **Entorno:** `https://staging.deltasalud.app` · **Rama:** `staging` · **HEAD:** `4aa3112e`
> **Alcance:** 39 commits desde `5faac77d`. Nada de esto está en producción.
>
> ⚠️ **Staging manda correo REAL a la dirección real, sobre un clon de la base de
> producción con pacientes de verdad.** Probar envíos SOLO con pacientes de prueba.
>
> ⚠️ **La sesión de Auth0 es del navegador, no de la pestaña.** Para cambiar de rol hay que
> cerrar sesión primero; abrir otra pestaña no alcanza y fabrica bugs de permisos que no existen.
>
> ⚠️ **No hacer el QA solo con la cuenta del dueño (super_admin).** Tiene plan permanente y
> bypass de gating: con ella no se ven ni los candados por plan ni los títulos profesionales.

---

## 0. Antes de empezar

| Necesitás                                        | Para qué                               |
| ------------------------------------------------ | -------------------------------------- |
| Una cuenta **super_admin**                       | Todo el bloque de admin                |
| Una cuenta **vendedor**                          | Bloque 2                               |
| Una cuenta **especialista** con plan **no-Plus** | Bloques 3 y 5 (los candados)           |
| Un especialista de **psicología u odontología**  | Bloque 5.3 (título profesional)        |
| Un correo real libre                             | Bloque 1 (alta con código de vendedor) |

Los correos tienen que ser reales por Auth0 — el truco de `+algo@gmail` no sirve.

**Migraciones de este lote** (ya aplicadas en staging):

| Migración                                         | Qué toca                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `20260828000001-seller-commissions`               | tablas `seller_commissions`, `seller_payments`, `seller_attribution_logs`, `profiles.sold_by_source`, `plan_prices.compare_at_price` |
| `20260830000001-seller-payment-bcv-rate`          | bolívares y tasa BCV en los pagos al vendedor                                                                                        |
| `20260830000002-verification-email-especialista`  | correo de verificación: "doctor" → "especialista"                                                                                    |
| `20260831000001-welcome-email-sin-dr`             | correo de bienvenida: deja de tratar de "Dr/a."                                                                                      |
| `20260901000001-verification-email-enlace-muerto` | el botón del correo apuntaba a un enlace muerto                                                                                      |

---

## 1. Programa de vendedores — el circuito completo

Es lo más grande del lote y lo más importante: **mueve plata**.

### 1.1 Alta del vendedor (admin)

1. `/admin/sellers` → **Nuevo vendedor**. Crear uno con un correo real.
2. Verificar que aparece en la tabla con su **código de 6 caracteres**, estado _Habilitado_,
   0 especialistas.
3. Copiar el código.

### 1.2 El especialista se registra con el código

4. En **incógnito**, abrir `https://staging.deltasalud.app/r/<CODIGO>`.
   **Debe abrir el registro, no decir "enlace no válido".**
5. Completar el registro y **todo el onboarding** hasta el final.
6. Volver como admin a `/admin/sellers`: el vendedor debe contar **1 especialista**.

> 🔍 **Lo que hay que mirar de verdad:** que la **comisión de entrada (USD 10)** haya quedado
> registrada. Si el onboarding no se completa, no se genera. Los leads asignados a mano por el
> admin **no** generan comisión de entrada — solo la de plan.

### 1.3 Portal del vendedor

7. Entrar como el vendedor → `/seller/comisiones`.
8. Arriba debe verse **cuánto le deben**; abajo el detalle (qué especialista, entrada o plan,
   monto, fecha) y el historial de pagos.
9. `/seller/cobros` → cargar datos de cobro. **Solo debe ofrecer Pago Móvil y Transferencia.**
   Confirmar que Zelle, Binance, efectivo y POS **no** aparecen.

### 1.4 El admin le paga

10. `/admin/comisiones` → elegir el vendedor, seleccionar comisiones.
    El **total debe actualizarse en vivo** al marcar y desmarcar.
11. Registrar el pago **subiendo un comprobante real**.
    El monto debe mostrarse en **bolívares a la tasa BCV**, con el equivalente en USD y la
    tasa del día.
12. ⚠️ **El pago es irreversible desde la UI.** No hay forma de deshacerlo. Usar datos de prueba.
13. Volver a `/seller/comisiones` como vendedor: la comisión debe figurar **pagada**, con los
    bolívares transferidos, el equivalente en USD y la tasa.
14. Abrir el **comprobante** desde el historial. Debe abrir el archivo subido.

### 1.5 Datos de cobro vistos por el admin

15. `/admin/sellers` → **Ver cobro** de un vendedor **con** datos cargados: se ven todos los
    métodos y entradas.
16. Idem con un vendedor **sin** datos: debe decir que no figura a dónde transferirle, y **no**
    debe afirmar que el pago está bloqueado (no lo está).

### 1.6 Baja del vendedor

17. Como vendedor, darse de baja desde su portal, **escribiendo un motivo**.
18. Como admin, confirmar que quedó deshabilitado y que **el motivo y la fecha se guardaron**.
19. Rehabilitarlo desde `/admin/sellers`.

### 1.7 Asignar un especialista a un vendedor

20. `/admin/doctors` → **Ver detalle** de un especialista → **Asignar a vendedor**.
21. Si ya tiene vendedor, el modal debe decir **cuál es** (no adivinarlo).
22. **Cancelar sin confirmar**: no debe cambiar nada.
23. Asignar de verdad y verificar que la ficha del especialista muestra su vendedor.

---

## 2. Planes y precios — el tachado tiene que verse en LAS TRES pantallas

> ⚠️ Este bloque decía antes "verificar que se ve tachado en la tabla de planes", a secas.
> Era ambiguo y por eso se escapó: el tachado funcionaba en las dos pantallas internas y
> **no en la pública**, que es la única que ve quien todavía no es cliente. Cuando una
> feature se muestra en varios lados, hay que enumerarlos **todos**.

24. `/admin/plans` → cargar un **precio tachado** (`compare_at_price`) en un plan de pago.
    Probar que **rechaza** un tachado menor o igual al precio real (sería un descuento al revés).
25. **`/admin/plans`** — se ve tachado en el editor.
26. **`/doctor/upgrade`** (como especialista) — se ve el precio anterior tachado junto al actual.
27. **`https://staging.deltasalud.app/` (landing pública)** — en la tarjeta del plan debe
    aparecer _"Antes $N"_ tachado debajo del precio.
    ❌ Hasta el 2026-09-01 **nunca se dibujó acá**: el dato viajaba en `/api/public/plans`, la
    clase `.original` estaba en el CSS, y el código que los unía no existía.
28. Confirmar que el precio real **sigue siendo el que se cobra** en los tres lados.
29. Quitar el tachado desde el admin y confirmar que desaparece en las tres pantallas.

---

## 3. Textos que antes mentían

Este bloque es corto pero **cada punto era una afirmación falsa en pantalla**.

30. **`/admin/doctors` → Ver detalle** de un especialista: el bloque **Plan** debe mostrar su
    plan real, su estado y la fecha de vencimiento.
    ❌ Antes decía _"Plan profesional · Acceso completo a todas las funcionalidades"_ a **todos**.
    ✔️ Comprobar con al menos **dos especialistas de planes distintos** — si no, no se detecta.
31. **Inicio del especialista** y **barra lateral**: junto al nombre del plan debe decir
    _"Acceso completo"_ **solo si de verdad lo tiene**; si no, _"N módulos bloqueados"_.
    ❌ Antes decía "Acceso completo" siempre, con medio menú con candados.
32. **`/admin/sellers` → Ver cobro** sin datos (ya cubierto en 1.5, punto 16).

---

## 4. Correos

⚠️ Recordar: **staging envía correo real**.

33. **Alta de un especialista nuevo** → el admin recibe _"Nuevo especialista pendiente de
    verificación"_ (ya no dice "doctor").
34. En ese correo, pulsar **"Revisar en el panel"**.
    ❌ Antes llevaba a un enlace muerto (dominio equivocado y ruta inexistente).
    ✔️ Ahora debe abrir la pantalla de verificaciones **de staging**, no de producción.
35. **Correo de bienvenida**: no debe tratar de "Dr/a." a quien no eligió ese título.

---

## 5. Especialista: consultas, IA y títulos

36. **Ficha de un paciente → Historial → Abrir una consulta.**
    Debe ir **directo al detalle**, sin pasar por el listado.
37. **Asistente de IA** dentro de una consulta (requiere plan con IA): mejorar redacción,
    resumir informe y resumen del historial deben responder.
    Si falla, el mensaje debe ser claro y **en español** — nunca _"Error al conectar con la IA"_
    a secas.
38. **Título profesional**: entrar con un especialista de **psicología** y mirar el saludo del
    inicio. Debe decir **"Psic. \<nombre\>"**, no "Dr.".
    Probar también odontología ("Odont.") si hay cuenta.
39. **Documento PDF** generado desde una consulta: debe conservar el **formato que escribió el
    especialista** (negritas, listas, saltos), no texto plano.

---

## 6. Agenda — mensajes de error

Estos solo aparecen al intentar algo inválido. **Ninguno debe salir en inglés ni mostrar
claves internas como `completed` o `no_show`.**

40. Abrir una consulta **ya atendida** y pulsar **"No asistió"** → **"No reagenda"**.
    Debe decir: _"Esta cita ya quedó atendida y no se puede volver a cambiar…"_.
    ❌ Antes: _"No se puede pasar la cita de 'completed' a 'no_show'"_.
41. Intentar **reagendar** una cita ya cerrada.
    Debe explicar que una cita cerrada no se mueve de fecha y sugerir agendar una nueva.
42. Intentar agendar a un paciente en un horario **donde ya tiene otra cita**.
    El mensaje debe mostrar la hora **legible en horario de Caracas** y **no** el identificador
    del paciente.

---

## 7. Regresión — lo que no debía romperse

43. Alta de especialista **sin** código de vendedor: debe funcionar igual.
44. Configuración del especialista → **datos de cobro**: el editor se compartió con el portal
    del vendedor. Verificar que el especialista sigue guardando bien sus métodos, **incluidos**
    Zelle, Binance y efectivo (al especialista **no** se le restringen).
45. Booking público `/book/<id>`: nombre y título del especialista correctos.
46. Aprobar un pago de suscripción y extender una suscripción desde el admin: siguen andando
    (se les añadió el enganche de comisión).

---

## Fuera de alcance

- **`/patient` (portal del paciente)** — está construido pero **nadie puede entrar**: ningún
  alta crea un perfil con `role='patient'`. **No perder tiempo probándolo.** Detalle y
  decisión en `02-components.md`.
- El reintento de la IA cuando **Gemini está saturado** — no se puede forzar a voluntad.

## Cómo reportar

Por cada hallazgo: **qué cuenta usaste** (rol y plan), **qué hiciste**, **qué esperabas**,
**qué pasó**, y captura. El rol y el plan son lo que más se olvida y lo que más falta hace.
