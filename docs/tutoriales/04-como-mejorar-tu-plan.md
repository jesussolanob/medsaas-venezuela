# Video 4 — Cómo pasar de Delta Free a Delta Base o Delta Plus

> Guion verificado contra el código de **producción** (`main`) el 2026-09-13.
> Incluye el arreglo de la tasa BCV desplegado ese mismo día.

**Duración estimada:** 4 a 5 minutos
**Dónde grabar:** producción → **Configuración › Suscripción**, o `/doctor/upgrade`
**Qué hace falta:** una cuenta que **no** esté ya en el plan más alto

---

## Antes de grabar

1. **Comprobá la tasa en pantalla antes de rodar.** El modal muestra
   _"Tasa BCV: …"_. Tiene que coincidir con la del BCV de ese día. Si no coincide,
   **frená y avisá** — no dejes un número equivocado grabado.
2. **No completes el envío con un comprobante real** salvo que quieras generar un
   pago de verdad que después alguien tenga que rechazar. Podés grabar hasta el
   paso del comprobante y cortar.
3. El pago es **manual y con aprobación**: no hay pasarela. El video tiene que
   decirlo con todas las letras o el especialista va a esperar un acceso
   instantáneo que no llega.

---

## Guion

### Escena 1 — Por qué mejorar el plan (0:00 – 0:40)

**Narración:**

> Delta Salud tiene tres planes. **Delta Free** es gratis para siempre y te da lo
> esencial: pacientes, consultas y tu panel. **Delta Base** suma todo lo demás —
> agenda, finanzas, reservas online, historia clínica. Y **Delta Plus** agrega
> las funciones con inteligencia artificial.
>
> Cuando intentás entrar a un módulo que tu plan no incluye, no te deja: te
> muestra un candado y te trae justo a esta pantalla.

**Mostrar:** un módulo con candado en el menú lateral, y el clic que lleva a la
pantalla de planes. Es la forma natural de llegar.

---

### Escena 2 — La pantalla de planes (0:40 – 1:50)

**En pantalla:** encabezado turquesa con **"Mejora tu plan Delta Salud"** y arriba
la línea _"Módulo no disponible en tu plan actual"_.

El texto de la página:

> _"Desbloquea todas las herramientas que necesitas para gestionar tu práctica
> médica. Elige tu plan, paga desde aquí y sube tu comprobante: activamos el
> acceso apenas lo verifiquemos."_

**Señalá esa frase.** Resume el flujo completo y evita la duda más común.

**Las tarjetas muestran:**

- El nombre del plan y **cuántos módulos incluye**
- El precio, con **"Plan actual"** marcado en el que ya tenés
- **"Gratis para siempre"** en Delta Free
- **"Popular"** en el destacado
- Botón **Pagar este plan**

**El selector de periodicidad — esto es lo que hay que mostrar:**

> Arriba podés cambiar la periodicidad: **mensual, trimestral, semestral o
> anual**. Y fijate qué pasa con el precio: al elegir un período largo aparece
> **"Ahorra X%"** y abajo te dice cuánto te sale por mes.
>
> Es la diferencia real entre pagar mes a mes o de una: conviene mirarlo antes de
> decidir.

**Mostrar:** alternar entre mensual y anual y señalar el ahorro.

Más abajo está la **Comparación completa de módulos** — una tabla de qué incluye
cada plan. Mostrala pasando.

---

### Escena 3 — El pago (1:50 – 3:30)

**En pantalla:** clic en **Pagar este plan** → modal **"Pagar plan {nombre}"**.

**Lo que muestra el modal:**

| Elemento                                  | Qué decir                         |
| ----------------------------------------- | --------------------------------- |
| **Periodicidad**                          | Confirmás mensual/trimestral/etc. |
| **Total a pagar**                         | En dólares                        |
| **Bs.**                                   | El equivalente en bolívares       |
| **Tasa BCV: … Bs/USD · actualizada el …** | La tasa oficial y su fecha        |
| **Instrucciones de pago**                 | Los datos a los que transferís    |

**Narración — el punto importante:**

> Acá está el total en dólares y su equivalente en bolívares, calculado con la
> **tasa oficial del BCV**, y te dice de qué día es esa tasa.
>
> El plan siempre se cobra en dólares: los bolívares son una referencia para que
> sepas cuánto transferir.

**Después, el formulario:**

- **Seleccionar comprobante** (la foto o PDF de la transferencia)
- **Referencia** — _"Ej. 00123456789"_
- **Banco de origen** _(obligatorio)_
- **Resumen del envío** con el adjunto marcado

**Botón:** **Enviar pago**.

---

### Escena 4 — Qué pasa después (3:30 – 4:30)

**En pantalla:** la confirmación **"Pago enviado correctamente"**:

> _"Tu comprobante está en revisión. Te notificaremos cuando el equipo lo apruebe
> y tu plan sea activado."_

**Narración — decilo claro:**

> Y acá lo más importante, para que no lo esperes en vano: **el acceso no se
> activa solo**. Alguien del equipo de Delta Salud revisa tu comprobante y
> aprueba el pago. Cuando lo hace, los módulos se desbloquean y te avisamos.
>
> No es instantáneo porque **no hay pasarela de pago**: transferís por tu banco y
> mandás el comprobante, como le cobrás vos a tus propios pacientes.

**Cerrá con el dato que más tranquiliza:**

> Y si tu plan se vence, **no perdés absolutamente nada**. Tu cuenta vuelve a
> Delta Free: los módulos de los planes pagos se bloquean, pero tus pacientes,
> tus consultas y tu historial siguen todos ahí, intactos, esperándote para
> cuando renueves.

---

## Respaldo técnico

| Afirmación                            | Dónde está                                    |
| ------------------------------------- | --------------------------------------------- |
| Los tres planes y el gating           | ADR-007 / ADR-014                             |
| Pago manual + aprobación de admin     | módulo `billing`, `submit-doctor-payment`     |
| La tasa es la del BCV                 | ADR-082 y ADR-083 (2026-09-13)                |
| El plan se cobra siempre en USD       | ADR-034                                       |
| Al vencer cae a Free sin perder datos | ADR-007, downgrade perezoso al iniciar sesión |
| Descuento por período                 | `plan_prices`, `getDiscountPct`               |

## Lo que NO hay que decir

- ❌ "Pagás y se activa al instante" — **no**. Requiere aprobación.
- ❌ "Podés pagar con tarjeta" — no hay pasarela.
- ❌ "Si se te vence perdés los datos" — **falso y es lo que más miedo da**. No se
  pierde nada.
- ❌ No des por buena la tasa en pantalla sin compararla con la del BCV ese día.
