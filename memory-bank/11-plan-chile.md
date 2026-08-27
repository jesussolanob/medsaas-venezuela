# 11 — Plan: Delta Chile

> Planificación iniciada el **2026-08-18**. Estado: **plan aprobado en su forma, sin implementar**.
> Objetivo: el mismo portal operando en Chile, en un despliegue aislado, reutilizando el máximo
> de código posible.

---

## 1 · La forma

**Un repositorio, una imagen, cuatro despliegues** (Venezuela y Chile × producción y
pre-producción). El país entra como **configuración** (`COUNTRY=ve|cl`), inyectada en el
despliegue — **no como fork del repositorio**.

Es el mismo patrón que ya existe entre staging y producción: mismo código, recursos distintos.
Chile es un despliegue más, sobre un eje nuevo (país en vez de etapa).

### Por qué no las alternativas

| Alternativa                       | Por qué no                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Forkear el repo**               | Aislamiento gratis y mantenimiento doble para siempre. Concreto: los 7 defectos arreglados el 17/08 habrían sido 14 arreglos. Con el ritmo de este proyecto, la divergencia es cuestión de semanas. |
| **Multi-tenant en un despliegue** | Máximo reuso, pero choca con el requisito de auditoría y mezcla datos clínicos de dos jurisdicciones en una base.                                                                                   |

---

## 2 · Decisiones tomadas (dueño, 2026-08-18)

| Tema                       | Decisión                                                                        |
| -------------------------- | ------------------------------------------------------------------------------- |
| **Proyecto GCP**           | **El mismo** (`sodium-shard-499116-r3`). No hay proyecto ni facturación aparte. |
| **Región**                 | **`us-east1`**, la misma que hoy.                                               |
| **Auth0**                  | **Mismo inquilino, aplicación nueva.**                                          |
| **Pre-producción chilena** | **Sí**, Chile tiene su propio staging.                                          |
| **Recursos separados**     | **Cloud Run, buckets y bases de datos.**                                        |
| **Recursos compartidos**   | **Secretos, clave de cifrado (`ENCRYPTION_KEY` + HMAC) y cuentas de servicio.** |

### Qué implica lo compartido

El aislamiento queda **a nivel de datos** (cada país con su base y su bucket), **no a nivel de
identidad ni de criptografía**. La cuenta de servicio con la que corre el backend chileno tiene,
técnicamente, alcance sobre los recursos venezolanos; lo que separa los datos es a qué apunta cada
servicio, no un permiso que lo impida.

Es una decisión consciente del dueño y **es reversible barato**: partir claves y cuentas de
servicio más adelante es cambiar configuración del despliegue, no código de la aplicación. Si una
auditoría lo exige después, no se rehace nada.

⚠️ Dato de contexto ya cierto hoy, no introducido por Chile: **staging comparte la clave de cifrado
con producción y corre sobre un clon de la base con pacientes reales**, así que puede descifrar
datos de producción. Es lo que hace posible el clon.

### Por qué el inquilino de Auth0 compartido es seguro

Verificado en `resolve-identity.use-case.ts`: **el rol no sale del token, sale de `profiles.role`
en la base de cada país**, y al crear un perfil nuevo `super_admin`, `admin` y `seller` están en
`FORBIDDEN_ROLES` (no se pueden auto-asignar). Un `super_admin` venezolano que entre a la app
chilena se resuelve contra la **base chilena**, no encuentra perfil y nace como especialista común.
**El privilegio no viaja.**

Consecuencia a tener presente: la misma cuenta de Google puede tener un perfil en cada país, y son
registros sin relación entre sí.

---

## 3 · Cuánto Venezuela hay en el código (medido el 2026-08-18)

Lo que parecía acoplamiento masivo resultó estar concentrado en pocas costuras:

| Eje                  | Superficie aparente        | Realidad                                                                                                                                                                                                                                                             |
| -------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tasa / bolívares** | 150 archivos mencionan BCV | **18 consumen un solo hook** (`useBcvRate`). Es un hook + una columna de snapshot (`bcv_rate`, `amount_bs`), **no lógica desparramada**. Los ~12 que hacen su propia cuenta son del plan que el especialista le paga a Delta, que es **siempre USD** y queda afuera. |
| **Cédula**           | 179 archivos               | **Un componente compartido** (`CedulaInput`, 6 usos) + **2 regex** en DTOs de `shared-types`.                                                                                                                                                                        |
| **Métodos de pago**  | —                          | Ya son **datos, no código**: `profiles.payment_methods` es un arreglo de claves libres.                                                                                                                                                                              |
| **Locale `es-VE`**   | 108 archivos               | Solo **formato de fechas y números**.                                                                                                                                                                                                                                |
| **MPPS / SACS**      | módulo entero              | `credential-verification`, aislado. En Chile **no aplica**.                                                                                                                                                                                                          |

**Conclusión: las costuras ya existen, hay que darlas vuelta.** La divisa incluso ya es
configurable por especialista (USD/EUR) desde el ADR-034.

---

## 4 · Las cuatro costuras

### 4.1 El país como configuración

Un módulo único que resuelva, a partir de `COUNTRY`: divisa, locale, tipo de documento de
identidad, prefijo telefónico, catálogo de métodos de pago, **si existe una segunda moneda**, y si
la verificación de credenciales aplica.

### 4.2 El dinero — la simplificación grande

Hoy `useBcvRate()` devuelve `{ rate, toBs, toBsNum, symbol, currencyCode, format }`.

En Chile **el bloque de la segunda moneda no se calcula distinto: desaparece**. No hay tasa, no hay
conversión, no hay equivalencias. El concepto pasa de "tasa BCV" a **"¿este país tiene conversión
local?"**, y en Chile la respuesta es no.

Beneficio lateral: en Chile no existe el problema abierto de **las dos tasas llamadas "BCV"**
(886,20 del plan Delta contra 772,54 del resto del portal).

⚠️ Las columnas `bcv_rate` y `amount_bs` **se dejan como están** y quedan nulas en Chile. Migrar el
esquema por país es más caro que dos columnas vacías.

### 4.3 Documento de identidad

`CedulaInput` pasa a ser un componente de documento nacional, guiado por configuración.
Venezuela: `V/E/P-` + dígitos, sin verificación posible. **Chile: RUT con dígito verificador
(módulo 11), o sea validable de verdad** — mejor que lo que hay hoy.

### 4.4 Habilitación profesional

El módulo del SACS queda **apagado por configuración, no borrado**. Chile tiene otro registro
(Superintendencia de Salud) y es una decisión aparte, fuera del alcance del lanzamiento.

---

## 5 · Las fases

### Fase 0 — Decidir la secuencia (del dueño, antes de escribir código)

Producción está **178 commits atrás**. Si Chile nace de `staging`, nace sobre código que Venezuela
nunca corrió en producción, y el primer defecto chileno no se va a poder atribuir.

**Recomendación: promover a `main` primero.** Es el riesgo más grande del proyecto y no es técnico,
es de orden.

### Fase 1 — Abrir las costuras, con Venezuela idéntica

Refactor puro, **cero funcionalidad nueva**. Las cuatro costuras de la sección 4.

**Criterio de aceptación:** las 3.898 pruebas siguen verdes y Venezuela se comporta **exactamente
igual**. Si algo cambia en Venezuela, la fase está mal hecha.

Es la fase que no se ve y por eso la que se tiende a saltear — y saltearla es exactamente lo que
convierte esto en un fork.

### Fase 2 — La infraestructura chilena

Bases (`delta-db-cl`, y la de pre-producción), buckets, servicios de Cloud Run y el workflow de
despliegue. Al ser el mismo proyecto GCP y compartir secretos y cuentas de servicio, **el workflow
chileno sale casi de copiar `staging.yml`**, cambiando nombres de servicio, bucket y
`DATABASE_URL`.

**Dos medidas para bajar el riesgo:**

1. El primer despliegue chileno va **con `COUNTRY=ve`**. Si funciona, la cañería está bien y el país
   es solo una variable.
2. La base chilena vacía es la **primera prueba real de la cadena de 103 migraciones desde cero**,
   algo que nunca se probó. Sale gratis y vale mucho.

**Las semillas — atención acá.** 28 de 103 migraciones insertan datos, y **8 siembran cosas
venezolanas**: especialidades, métodos de pago, historial de tasa BCV, documentos legales.
La base chilena corre las 103 y nace con datos venezolanos adentro.

**No se tocan las 103 migraciones** (una rota bloquea TODOS los despliegues — ya pasó). La salida es
un **paso de siembra por país** al final de la cadena.

⚠️ Los **documentos legales chilenos** (términos, privacidad) no son un catálogo cosmético: son
contenido legal que necesita redacción propia, probablemente de un abogado. **Dependencia externa,
conviene arrancarla temprano.**

### Fase 3 — Lo propio de Chile

RUT, catálogo de métodos de pago, precios en pesos, y la UI **sin segunda moneda** (se cae todo el
bloque de equivalencias).

### Fase 4 — QA

Con el guion que ya existe (`07-qa-test-script.md` y `09-qa-lote-agosto-2026.md`), corrido contra
Chile con las diferencias marcadas.

---

## 6 · Costos y palancas

Se duplica la **infraestructura**: bases nuevas, buckets nuevos, cuatro servicios más de Cloud Run.
Conviene rehacer los números de `docs/` (presentación de costos) con este alcance.

**Lo que no se duplica es el trabajo**: ese es todo el punto. Un arreglo se hace una vez y llega a
los dos países en el mismo despliegue.

**Palanca de costo:** la pre-producción chilena puede vivir como otra base dentro de la instancia
chilena, en vez de una instancia propia. **Entre Chile y Venezuela no** — entre producción y
pre-producción chilenas es un riesgo aceptable y ahorra una instancia.

---

## 7 · Pendientes y riesgos

| Tema                                          | Estado                                                 |
| --------------------------------------------- | ------------------------------------------------------ |
| Promover Venezuela a `main` antes de arrancar | **Decisión del dueño — Fase 0**                        |
| Documentos legales chilenos                   | **Dependencia externa (abogado)** — arrancar temprano  |
| Registro de habilitación profesional en Chile | Fuera del alcance del lanzamiento                      |
| Catálogo de especialidades chileno            | Revisar si el de Venezuela sirve tal cual              |
| Métodos de pago chilenos                      | Definir el catálogo (transferencia, Webpay, efectivo…) |
| Precios de los planes en pesos                | Definir con el dueño                                   |
