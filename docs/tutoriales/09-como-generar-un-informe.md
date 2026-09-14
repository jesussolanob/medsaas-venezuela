# Video 9 — Cómo generar un informe médico

> Guion verificado contra el código de **producción** (`main`) el 2026-09-13.

**Duración estimada:** 4 a 5 minutos
**Dónde grabar:** producción → **Consultas**, dentro de una consulta abierta
**Qué hace falta:** una consulta con **varios bloques llenos**

---

## Antes de grabar

- **Llená al menos tres o cuatro bloques distintos.** El informe se arma
  eligiendo qué bloques incluir: con uno solo no se entiende para qué sirve.
- **Cargá tu firma, tu logo y tu matrícula antes** (video 2).
- **Escribí con formato** —negrita, alguna viñeta— en al menos un bloque, para
  poder mostrar cómo se ve en el documento.

---

## Guion

### Escena 1 — Qué es el informe (0:00 – 0:40)

**Narración:**

> El **informe médico** es el documento que resume la consulta: lo que el
> paciente se lleva, o lo que mandás a otro colega o a un seguro.
>
> Y tiene algo que lo diferencia de los otros documentos: **vos elegís qué
> partes de la consulta entran**. No todo lo que escribís es para que lo lea
> otro.

---

### Escena 2 — De dónde sale el contenido (0:40 – 1:40)

**En pantalla:** la consulta con sus bloques llenos.

**Narración:**

> El informe **no se escribe aparte**. Sale de lo que ya cargaste en la consulta:
> cada bloque que llenaste es un candidato a entrar.
>
> Por eso conviene escribir bien en el momento, sin pensar en el documento: el
> documento se arma después.

**Mostrar:** un par de bloques con su contenido, incluido uno con formato.

---

### Escena 3 — Elegir qué entra (1:40 – 3:00)

**En pantalla:** **Generar Documento** → marcás **Informe médico** → aparece el
sub-selector **"Bloques a incluir"**.

**Narración — es el corazón del video:**

> Marcás **Informe médico** y se abre algo que los otros tipos no tienen:
> **Bloques a incluir**.
>
> Ahí te lista todos los bloques de esta consulta con contenido, y vos tildás los
> que querés que aparezcan.
>
> Esto sirve para lo de siempre: tenés notas internas, observaciones tuyas, cosas
> que te sirven a vos y que no van en un informe para un tercero. Las dejás sin
> tildar y no salen.

**Mostrar:** destildar un bloque y volver a tildarlo, para que se vea que manda el
especialista.

**Nota al pasar:**

> Arriba te dice cuántos bloques hay disponibles. Si no llenaste ninguno, el
> informe aparece deshabilitado con el aviso _"Sin bloques de consulta con
> contenido"_.

---

### Escena 4 — El documento (3:00 – 4:00)

**Clic en Generar PDF.**

**Narración:**

> Y sale el informe con tu identidad: tu **logo** arriba, tu **nombre** y tu
> **especialidad**, tu **firma** y tu **matrícula** al pie. El mismo documento que
> entregarías en papel.

**Mostrar el PDF completo**, señalando el encabezado y el pie.

**Sobre el formato:**

> El formato que le pusiste al texto se conserva: las negritas, las cursivas y las
> viñetas salen en el documento tal como las escribiste.

**Un punto que conviene decir, porque genera preguntas:**

> Y si más adelante corregís algo en la consulta, volvés a generar el documento y
> sale actualizado. El PDF no es una foto vieja: se arma en el momento con lo que
> hay.

---

### Escena 5 — Combinar documentos (4:00 – 4:45)

**Narración:**

> Y lo último, que es lo que más tiempo ahorra: **podés marcar varios tipos a la
> vez**.
>
> Si en la misma consulta le diste récipe, pediste exámenes e hiciste el informe,
> los marcás los tres y sale **un solo PDF** con todo, cada documento en su hoja.
>
> Una sola descarga, un solo enlace para el paciente, en vez de tres archivos
> sueltos.

**Mostrar:** marcar Informe + Récipe + Paraclínicos y generar el PDF combinado.

---

### Cierre

> Resumiendo: el informe se arma con lo que ya escribiste en la consulta, vos
> elegís qué bloques entran, y sale con tu logo, tu firma y tu matrícula. Y si
> hace falta, se combina con el récipe y los demás documentos en un solo archivo.

---

## Respaldo técnico

| Afirmación                                    | Dónde está                                      |
| --------------------------------------------- | ----------------------------------------------- |
| El informe se arma de `blocks_snapshot`       | `consultation-documents.ts`, `informeBlocks`    |
| Sub-selector de bloques solo para el informe  | `GenerateDocumentModal` — _"Bloques a incluir"_ |
| Un solo constructor decide las hojas por tipo | ADR-057, `buildDocumentPages`                   |
| El PDF conserva el formato del editor         | ADR-039 rev.2, `parseHtmlToRichBlocks`          |
| El PDF se renderiza con datos EN VIVO         | ADR-020                                         |
| Marca del especialista en los dos caminos     | ADR-062                                         |

## Lo que NO hay que decir

- ❌ "El informe se escribe en un editor aparte" — sale de los bloques de la
  consulta.
- ❌ "Entran todos los bloques" — entran **los que tildes**.
- ❌ "El PDF queda congelado" — se regenera con el contenido actual.
