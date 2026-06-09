# Reporte: IA en bloques de consulta

Fecha: 2026-04-29
Ámbito del fix: `IA-blocks`

## 1. Diagnóstico de la causa raíz

El botón "Mejorar con IA" parecía funcionar sólo en algunos bloques porque NO existía ninguna integración real entre `DynamicBlocks.tsx` y el endpoint `/api/doctor/ai`. Lo que realmente pasaba:

1. El **panel de IA único** (`Asistente IA powered by Gemini`) está montado en `app/doctor/consultations/page.tsx` líneas ~2054–2148. Sus tres botones (`Resumir informe`, `Mejorar redacción`, `Historial paciente`) operan **hardcodeadamente** sobre `report.notes`, `report.diagnosis` y `report.treatment` (campos clásicos de la tabla `consultations`). El `Aplicar` también escribe únicamente sobre `report.notes` o `report.treatment`.

2. La **renderización de tabs** (línea ~1636) hace que los bloques con `key` igual a `chief_complaint`, `diagnosis` o `treatment` **NO** se muestren como tab dinámica — se redirigen a la tab clásica "Informe" o "Receta". Resultado: si el doctor activaba alguno de estos tres bloques en su plantilla, la IA "funcionaba" porque editaba los campos clásicos que sí están conectados al panel global.

3. Los otros 12 bloques del catálogo (`history`, `physical_exam`, `prescription`, `rest`, `tasks`, `nutrition_plan`, `exercises`, `indications`, `recommendations`, `requested_exams`, `next_followup`, `internal_notes`) se renderizan a través de `DynamicBlocks.tsx`, **componente que no contenía absolutamente ningún botón ni handler de IA**. Por eso para esos bloques nunca había forma de invocar Gemini.

4. El endpoint `/api/doctor/ai/route.ts` sólo soportaba 3 acciones (`summarize`, `improve`, `patient_history`). El prompt de `improve` era genérico — no diferenciaba entre un diagnóstico, un plan nutricional o un examen físico.

**Bloques que "funcionaban" antes:** únicamente `chief_complaint`, `diagnosis`, `treatment` (vía el panel global hardcodeado).
**Bloques que NO funcionaban:** los otros 12 del catálogo.

## 2. Diseño del fix

- Nueva acción en el endpoint: `improve_block`. Recibe `{ content, block_key, block_label }` y construye el prompt según `block_key` (un `switch` con instrucciones específicas por tipo: precisión clínica para `diagnosis`, balance nutricional para `nutrition_plan`, terminología semiológica para `physical_exam`, etc).
- En `DynamicBlocks.tsx`: el botón `Mejorar con IA` aparece **siempre** que el bloque sea `rich_text`, `list` o `structured` y la consulta no esté en modo `readOnly`. Para `date`, `numeric` y `file` no se muestra (no tienen contenido narrativo).
- La IA devuelve una **sugerencia previa** (preview) en un panel violeta debajo del editor del bloque. El doctor decide si **Aplicar** (pisa el contenido vía `onChange`, lo cual dispara el autosave existente del `page.tsx`) o **Descartar**.
- Reusa el rate-limit existente en BD (10 req/60s) y el cache en memoria del endpoint. La cache key incluye ahora `block_key` para evitar colisiones cross-bloque.
- Errores → `showToast({ type: 'error', ... })` (Toaster ya está montado en `app/doctor/layout.tsx`).
- Para bloques tipo `list`, el componente serializa el array a bullets (`- item\n- item`) antes de mandarlo y lo parsea de vuelta a array al aplicar la sugerencia.

## 3. Archivos modificados

| Archivo | Cambio |
|---|---|
| `/Users/jesussolanob/Desktop/medsaas-venezuela/.claude/worktrees/sad-cori-573286/app/api/doctor/ai/route.ts` | Añade tipo `improve_block` a `AIAction`, función `buildBlockPrompt(blockKey, label, content)` con prompts específicos para los 15 bloques del catálogo (con fallback genérico para bloques nuevos), nueva rama `case 'improve_block'` en el `switch`, y `block_key` en la cache key. |
| `/Users/jesussolanob/Desktop/medsaas-venezuela/.claude/worktrees/sad-cori-573286/components/consultation/DynamicBlocks.tsx` | Importa `createClient`, `showToast`, iconos `Wand2/Loader2/Check`. Agrega estado `aiLoading` y `aiSuggestion` por-bloque. Función `improveBlockWithAI(block)` que llama al endpoint, `applyAISuggestion(block)` y `discardAISuggestion`. Re-estructura el header de cada bloque para incluir el botón "Mejorar con IA" (sólo si el `content_type` lo soporta) y un panel preview con botones Aplicar/Descartar bajo el editor. |

**No se modificó** ningún otro archivo. No se introdujeron dependencias nuevas.

## 4. Resultado de `npx tsc --noEmit`

```
$ npx tsc --version
Version 5.9.3
$ npx tsc --noEmit
(sin output, exit code 0)
```

Sin errores, sin warnings. No hay regresiones tipadas.

## 5. Prompts ejemplo

Cada `block_key` tiene su prompt especializado. Ejemplos representativos (uno por categoría — clínico, terapéutico, narrativo, lista):

### `diagnosis` (clínico — precisión)
> Eres un asistente de redacción médica profesional. Mejora la redacción del diagnóstico clínico. Sé preciso, usa terminología CIE-10 cuando sea posible, distingue diagnóstico principal de diagnósticos secundarios o diferenciales si los hay. Mantén toda la información clínica intacta — NO inventes datos que no estén en el texto original. Responde en español (Venezuela) y devuelve SOLO el texto mejorado, sin explicaciones, encabezados, ni comillas.
>
> Texto original (Diagnóstico):
> [contenido del bloque]

### `nutrition_plan` (terapéutico — estructura por comidas)
> Eres un asistente de redacción médica profesional. Mejora la redacción del plan alimenticio. Estructura por comidas (desayuno, merienda, almuerzo, cena), enfatiza balance nutricional, porciones, alimentos recomendados y a evitar. Mantén toda la información clínica intacta — NO inventes datos que no estén en el texto original. Responde en español (Venezuela) y devuelve SOLO el texto mejorado, sin explicaciones, encabezados, ni comillas.

### `physical_exam` (narrativo — semiología por sistemas)
> Eres un asistente de redacción médica profesional. Mejora la redacción del examen físico. Estructura los hallazgos por sistemas (general, cardiopulmonar, abdominal, neurológico, etc.) y usa terminología semiológica precisa. Mantén toda la información clínica intacta — NO inventes datos que no estén en el texto original. Responde en español (Venezuela) y devuelve SOLO el texto mejorado, sin explicaciones, encabezados, ni comillas.

### `requested_exams` (lista — agrupar por tipo de estudio)
> Eres un asistente de redacción médica profesional. Mejora la redacción de los exámenes solicitados. Usa el nombre completo y estandarizado de cada estudio (laboratorio, imagen, especiales) y agrupa por tipo cuando aplique. Mantén toda la información clínica intacta — NO inventes datos que no estén en el texto original. Responde en español (Venezuela) y devuelve SOLO el texto mejorado, sin explicaciones, encabezados, ni comillas.

> Otros prompts disponibles: `chief_complaint`, `history`, `treatment`, `prescription`, `rest`, `tasks`, `exercises`, `indications`, `recommendations`, `next_followup`, `internal_notes`. Si en el futuro se agregan bloques nuevos al `consultation_block_catalog`, hay un fallback genérico (`default`) que también mejora redacción profesional sin asumir tipo.

## 6. Smoke test post-deploy

1. **Login como doctor** (`ing.jesussolanob@gmail.com` o cualquier doctor).
2. **Configurar bloques personalizados**: ir a `/doctor/settings/consultation-blocks` y habilitar al menos estos 4: `physical_exam`, `nutrition_plan`, `requested_exams`, `next_followup`. Guardar.
3. **Crear una consulta** desde `/doctor/agenda` o `/doctor/consultations` (botón "Nueva consulta").
4. Abrir la consulta recién creada. Verificar que aparecen tabs dinámicas con los nombres de los bloques activados.
5. **Bloque `physical_exam` (rich_text):** click en la tab → escribir algo como `paciente con tos`. Verificar que aparece el botón violeta **"Mejorar con IA"** en el header del bloque. Click → spinner → debe aparecer la card violeta "Sugerencia de IA" con un examen físico estructurado por sistemas. Click **Aplicar** → el textarea debe actualizarse con el texto mejorado. El autosave debe disparar a los 1.5s (revisar la base: `consultations.blocks_data->physical_exam`).
6. **Bloque `nutrition_plan` (rich_text):** mismo flujo, escribir `dieta hipocalórica` → IA debe devolver desayuno/almuerzo/cena estructurados.
7. **Bloque `requested_exams` (list):** agregar 3 ítems sueltos como `hematologia`, `urea`, `tac craneal`. Click **Mejorar con IA**. La sugerencia debe llegar como bullet-list con nombres estandarizados (`Hematología completa`, `Urea sérica`, `Tomografía axial computarizada de cráneo`). Aplicar → debe re-poblarse la lista de items con los valores parseados.
8. **Bloque `next_followup` (date):** verificar que NO aparece el botón "Mejorar con IA" (es campo de fecha, no aplica).
9. **Validación de errores:**
   - Vaciar `physical_exam` y dar click en Mejorar con IA → debe salir toast rojo "Escribe algo en 'Examen físico' antes de mejorar con IA."
   - Disparar 11 mejoras seguidas en menos de 60s → la última debe fallar con toast "Demasiadas solicitudes a la IA. Espera un minuto…" (rate limit existente).
10. **Read-only:** abrir una consulta como paciente (`/patient/reports/[id]` o vista que use `<DynamicBlocks readOnly />`). El botón **NO** debe aparecer.
11. **Bloques clásicos:** confirmar que `chief_complaint`, `diagnosis` y `treatment` siguen funcionando con el panel global "Asistente IA" del lateral (sin regresión).

Si los 11 pasos pasan, la integración está OK.
