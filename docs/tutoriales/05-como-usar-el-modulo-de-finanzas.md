# Video 5 — Cómo usar el módulo de finanzas

> Guion verificado contra el código de **producción** (`main`) el 2026-09-13.
> `app/doctor/finances` es **idéntico** en producción y en desarrollo.

**Duración estimada:** 6 a 7 minutos
**Dónde grabar:** producción → **Finanzas** y **Cobros**
**Qué hace falta:** una cuenta con consultas cobradas y pendientes, y algún gasto

---

## Antes de grabar

- **Finanzas no existe en Delta Free.** Grabá con plan de prueba, Base o Plus.
- Tené a mano **al menos una consulta pagada y una impaga**, para que la
  diferencia entre _Ingresos_ y _Por ingresar_ se vea con números reales.
- **Efectivo ya funciona**: estuvo roto en producción hasta el 2026-09-14 y se
  corrigió. Se puede usar en los ejemplos.

---

## La idea que hay que dejar clara

Son **dos pantallas distintas y la gente las confunde**:

| Pantalla     | Para qué                                    |
| ------------ | ------------------------------------------- |
| **Cobros**   | Lo que te **falta cobrar** y cómo lo cobrás |
| **Finanzas** | Lo que **ya entró y salió**, y tu balance   |

El video tiene que empezar por ahí.

---

## Guion

### Escena 1 — Las dos pantallas (0:00 – 0:45)

**Narración:**

> Delta Salud separa la plata en dos pantallas, y conviene tenerlo claro desde el
> principio.
>
> **Cobros** es tu lista de pendientes: quién te debe y cómo le vas a cobrar.
>
> **Finanzas** es la foto de tu consultorio: cuánto entró, cuánto salió y cómo
> venís. Empecemos por Cobros, que es donde se origina todo.

---

### Escena 2 — Cobros (0:45 – 2:30)

**En pantalla:** tres pestañas — **Pendientes**, **Aprobados**, **Todas**.

**Narración:**

> Arranca en **Pendientes**: son las consultas cobradas a medias o sin cobrar.
> Cada fila es un paciente con su monto.

**Al abrir un cobro, mostrá:**

- El **Código** de la cita
- **Marcar como pendiente** / **Marcar como aprobado**
- **Fecha de pago**, **Tasa (Bs/USD)**, **Monto Bs**
- **Referencia (opcional)** y **Subir comprobante**
- **Cargos adicionales** → **Total actualizado**

**Narración:**

> Cuando el paciente te paga, abrís el cobro, cargás la referencia, subís el
> comprobante si querés, y lo marcás como **aprobado**. Recién ahí ese dinero
> cuenta como ingreso.
>
> Y si además le vendiste algo o hubo un costo extra, lo agregás en **cargos
> adicionales** y el total se recalcula solo.

**La función que más se usa y menos se descubre:**

> Fijate en el botón de **WhatsApp**. Te arma el mensaje de cobro completo: el
> monto en dólares, el equivalente en bolívares con la tasa, y **tus datos de
> pago** — los que cargaste en Configuración. Le llega al paciente listo para
> que transfiera.

**Mostrar:** el mensaje generado. Es el mejor momento del video.

**Arriba a la derecha** están el **Total** del período y la **Tasa BCV**, y el
botón **Exportar**.

---

### Escena 3 — Finanzas: el encabezado (2:30 – 3:15)

**En pantalla:** **Finanzas** — _"Control de ingresos, gastos y balance del consultorio"_.

Arriba, dos controles:

1. **Día / Semana / Mes** — el tamaño del período
2. Las flechas para moverte entre períodos

Y cuatro pestañas: **Resumen · Ingresos · Gastos · Reportería**.

**Narración:**

> Arriba elegís si querés ver el día, la semana o el mes, y te movés con las
> flechas. Todo lo de abajo responde a ese período.

---

### Escena 4 — Los cuatro números (3:15 – 4:30)

**En pantalla:** las tarjetas **Ingresos**, **Por ingresar**, **Total gastos**,
**Balance**.

**Narración — acá está el concepto más importante del video:**

> **Ingresos** es la plata que efectivamente entró.
>
> **Por ingresar** es la que te falta cobrar.
>
> Y acá está la regla que conviene entender: para que una consulta cuente como
> ingreso tienen que pasar **dos cosas**: que el pago esté aprobado **y** que la
> cita esté confirmada. Si el paciente pagó pero la cita sigue "por confirmar",
> todavía no es un ingreso: está en **Por ingresar**.
>
> Suena quisquilloso, pero es lo que hace que el número de arriba sea confiable.

**Mostrar:** **Balance** = ingresos − gastos.

---

### Escena 5 — Ingresos y Gastos (4:30 – 5:45)

**Pestaña Ingresos.** La tabla trae: **Fecha de cobro · Paciente · Origen /
Concepto · Estado · Monto USD · Monto Bs**.

**Narración — señalá las dos columnas que confunden:**

> Ojo con la primera columna: dice **Fecha de cobro**, que es **cuándo entró la
> plata**, y no siempre es el día de la consulta. Por eso al lado tenés
> **Origen / Concepto**, que te dice de qué consulta viene cada ingreso.
>
> Eso evita el susto clásico: dos cobros del mismo paciente por el mismo monto en
> días seguidos **no son un cobro repetido** — son dos consultas distintas, y la
> columna de concepto te lo aclara.

**Botón:** **Registrar ingreso**, para cobros que no vienen de una consulta.

**Pestaña Gastos.** Botón **Registrar gasto**, con **Monto (USD)**,
**Categoría** y **Descripción**, los tres obligatorios.

> Los gastos los cargás vos: alquiler, insumos, sueldos. Es lo que hace que el
> **Balance** signifique algo.

---

### Escena 6 — Resumen y Reportería (5:45 – 6:45)

**Resumen** trae los desgloses: **Desglose de ingresos**, **Desglose de gastos por
categoría**, **Tipos de ingreso** y el gráfico **Ingresos vs Egresos · últimos 6
meses**.

**Reportería** trae **Consultas del mes**, **Pacientes únicos** y
**Crecimiento MoM** (mes contra mes), más los listados detallados con paginación.

**Narración:**

> En **Resumen** ves de dónde viene tu plata y en qué se te va, y la comparación
> de los últimos seis meses.
>
> Y en **Reportería** están los números del consultorio: cuántas consultas diste,
> cuántos pacientes distintos atendiste, y cuánto creciste respecto del mes
> pasado.

**Mencioná la exportación** — los listados se pueden bajar para llevar a tu
contador.

---

### Cierre (6:45 – 7:00)

> En resumen: cobrás desde **Cobros**, y **Finanzas** te devuelve la foto
> completa. Mientras marques los pagos cuando entran y cargues tus gastos, los
> números de arriba son los de tu consultorio de verdad — sin planillas aparte.

---

## Respaldo técnico

| Afirmación                                      | Dónde está                              |
| ----------------------------------------------- | --------------------------------------- |
| Ingreso = pago aprobado Y cita confirmada       | ADR-029 (y ADR-031 para `no_show`)      |
| "Fecha de cobro" + origen de cada ingreso       | ADR-076 (hotfix a prod del 12/09)       |
| Mensaje de cobro por WhatsApp con datos de pago | MVP 7.10, `buildWhatsAppMessage`        |
| Bolívares: congelados si está pagado            | ADR-068                                 |
| Finanzas gateado por plan                       | `plan_features` — no está en Delta Free |

## Lo que NO hay que decir

- ❌ "Todo lo que cobrás aparece al instante en Ingresos" — hace falta el pago
  aprobado **y** la cita confirmada.
- ❌ "Delta Salud te cobra automáticamente" — no hay pasarela; el cobro es manual.
