# Video 8 — Cómo generar un récipe

> Guion verificado contra el código de **producción** (`main`) el 2026-09-13.

**Duración estimada:** 4 a 5 minutos
**Dónde grabar:** producción → **Consultas**, dentro de una consulta abierta
**Qué hace falta:** una consulta abierta con el bloque **Récipe** habilitado

---

## Antes de grabar

- **El bloque "Récipe" tiene que estar en tus bloques de consulta.** Si no lo
  tenés, se agrega desde Configuración › Bloques de consulta. Sin él, el tipo
  "Récipe" aparece deshabilitado y dice _"Sin receta registrada"_.
- **Cargá tu firma, tu logo y tu matrícula antes de grabar** (video 2). Sin eso
  el PDF sale pelado y el video pierde todo su efecto.

---

## Guion

### Escena 1 — Dónde se escribe (0:00 – 1:30)

**En pantalla:** consulta abierta → bloque **Récipe**.

**Narración:**

> El récipe se escribe dentro de la consulta, en el bloque de récipe. Cada
> medicamento es una fila, y cada fila tiene cuatro campos.

**Los campos, con sus ejemplos reales en pantalla:**

| Campo                      | Ejemplo que muestra la app |
| -------------------------- | -------------------------- |
| **Nombre del medicamento** |                            |
| **Dosis**                  | _ej: 500mg_                |
| **Frecuencia**             | _ej: cada 8h_              |
| **Duración**               | _ej: 7 días_               |
| **Indicaciones**           | opcional                   |

**Narración:**

> Cargás el medicamento, la dosis, cada cuánto y por cuántos días. Las
> **indicaciones** son opcionales y es donde ponés cosas como "tomar con
> comida".
>
> Agregás tantos medicamentos como necesites.

**Mostrar:** cargar dos medicamentos, para que después se vea la lista numerada.

**Recordá señalar el autoguardado:**

> Fijate arriba que dice **Guardado**: no hace falta apretar nada, se guarda
> mientras escribís.

---

### Escena 2 — Generar el documento (1:30 – 2:45)

**En pantalla:** botón **Generar Documento** → se abre el modal.

**Narración:**

> Cuando terminaste, vas a **Generar Documento**. Acá está la parte que conviene
> entender bien: **Delta Salud no tiene un botón por documento**. Tenés una sola
> pantalla con **Tipos de documento** y marcás lo que querés.

**Los cinco tipos:**

| Tipo                 | Cuándo se habilita                                 |
| -------------------- | -------------------------------------------------- |
| **Informe médico**   | Si hay bloques de consulta con contenido           |
| **Récipe**           | Si cargaste medicamentos                           |
| **Paraclínicos**     | Si pediste exámenes                                |
| **Historia clínica** | Si el paciente tiene registros de historia clínica |
| **Reposo médico**    | Si indicaste reposo                                |

**Narración — el detalle que ahorra soporte:**

> Fijate que los tipos **se habilitan solos** según lo que cargaste. El que no
> corresponde aparece apagado y te dice por qué: por ejemplo _"Sin receta
> registrada"_ si no cargaste ningún medicamento.
>
> No tenés que acordarte de nada: la pantalla te muestra qué podés emitir.

**Mostrá el detalle del récipe:** al lado dice cuántos medicamentos tiene y
**"2 hojas (Récipe + Indicaciones)"**.

---

### Escena 3 — Por qué son dos hojas (2:45 – 3:45)

**Narración — es el punto más valioso del video:**

> El récipe sale en **dos hojas**, y es a propósito.
>
> La **primera** es el récipe propiamente dicho: la lista de medicamentos con su
> dosis. Es la que va a la farmacia.
>
> La **segunda** se llama **Indicaciones**: lleva los mismos medicamentos pero
> con la presentación, la frecuencia, la duración y las indicaciones completas.
> Es la que se lleva el paciente a la casa para saber cómo tomarlos.
>
> Una es para comprar y la otra es para entender. Por eso van separadas.

**Mostrar:** el PDF generado, pasando de la hoja 1 a la hoja 2.

---

### Escena 4 — Entregarlo (3:45 – 4:30)

**Dos caminos:**

1. **Descargar el PDF** e imprimirlo o mandarlo vos.
2. **Compartir** — genera un enlace con código para el paciente.

**Narración sobre compartir:**

> Con **Compartir** generás un enlace para el paciente. Se le manda por correo y
> también lo podés pasar por WhatsApp.
>
> Para abrirlo tiene que poner **su cédula y un código de acceso** que le llega
> aparte, y el enlace **vence**. Son datos médicos: no queda un PDF suelto dando
> vueltas por WhatsApp.

**Mostrar:** el modal de compartir con el **Enlace de descarga**, el **Código de
acceso** y la línea _"El enlace vence el …"_.

---

### Cierre

> Resumiendo: cargás los medicamentos en el bloque de récipe, vas a **Generar
> Documento**, marcás **Récipe** y sale un PDF de dos hojas con tu logo, tu firma
> y tu matrícula. Y se lo entregás impreso o por enlace seguro.

---

## Respaldo técnico

| Afirmación                                                   | Dónde está                                              |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| Récipe = 2 hojas (Récipe + Indicaciones)                     | ADR-022, `buildDocumentPages`                           |
| Los 5 tipos y su habilitación automática                     | `consultation-documents.ts`, `computeAvailableDocTypes` |
| El PDF lleva logo, firma y matrícula                         | `MedicalDocumentPdf`, plantilla del especialista        |
| Compartir = enlace + código + cédula, con vencimiento        | ADR-013                                                 |
| El PDF del paciente es el MISMO que descarga el especialista | ADR-020                                                 |

## Lo que NO hay que decir

- ❌ "Hay un botón de récipe" — es **Generar Documento** con tipos marcables.
- ❌ "El paciente recibe el PDF adjunto" — recibe un **enlace con código**.
- ❌ "Podés mandarlo sin que el paciente valide nada" — pide cédula y código.
