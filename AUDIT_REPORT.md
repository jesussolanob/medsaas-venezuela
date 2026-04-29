# AUDIT_REPORT.md — Delta Medical CRM

**Fecha:** 2026-04-28
**Branch:** `claude/sad-cori-573286`
**Stack:** Next.js 16.2.3 · React 19 · TypeScript 5 · Supabase (Postgres 17 + RLS) · Tailwind 4
**Proyecto Supabase:** `azsismbgfanszkygzwaz`

---

## 0 · Cómo se hizo

- `npx tsc --noEmit` (5 errores, ver §1)
- Introspección BD vía MCP Supabase: `list_tables`, `get_advisors` (security), `pg_policies` directo
- 4 sweeps en paralelo (subagents Explore): code smells, RLS leaks, race/perf, áreas de foco
- Lectura puntual de archivos confirmando hallazgos (`app/doctor/patients/actions.ts`, `lib/consultation-blocks.ts`, `app/api/doctor/view-doc/route.ts`, `app/api/doctor/ai/route.ts`)

> ⚠️ **No tuve acceso al `PROJECT_OVERVIEW.md` (Google Doc privado, 401)**. Las 4–5 deudas TS preexistentes que mencionas no las pude tachar contra ese doc. Si me das acceso (link público o pegándolo como `PROJECT_OVERVIEW.md` en la raíz) cruzo ese inventario antes de FASE 3.

---

## 1 · Errores TypeScript (`tsc --noEmit`)

Total: **5 errores** en 4 archivos.

| # | Archivo:línea | Error | Severidad |
|---|---|---|---|
| TS-1 | [next.config.ts:5](next.config.ts:5) | `Object literal may only specify known properties, and 'eslint' does not exist in type 'NextConfig'` | 🔵 |
| TS-2 | [app/doctor/consultations/page.tsx:2889](app/doctor/consultations/page.tsx:2889) | `'receiptFile' is possibly 'null'` | 🟡 |
| TS-3 | [app/doctor/consultations/page.tsx:2892](app/doctor/consultations/page.tsx:2892) | `'receiptFile' is possibly 'null'` | 🟡 |
| TS-4 | [app/doctor/settings/page.tsx:1029](app/doctor/settings/page.tsx:1029) | `Comparison appears unintentional: TabId vs '"assistants"' (no overlap)` | 🔵 |
| TS-5 | [components/appointment-flow/NewAppointmentFlow.tsx:828](components/appointment-flow/NewAppointmentFlow.tsx:828) | `Type 'string \| boolean' not assignable to 'boolean'` | 🟡 |

> Sin acceso al overview no puedo confirmar cuáles son "preexistentes". Trato los 5 como deuda y los arreglo todos en FASE 3 (cumple con la condición "≤ inicial").

---

## 2 · 🔴 CRÍTICOS

### C-1 · IDOR en `app/doctor/patients/actions.ts` — server actions sin verificar doctor_id

[app/doctor/patients/actions.ts:127-197](app/doctor/patients/actions.ts:127)

Tres funciones usan `createAdminClient()` (bypassea RLS) y reciben `consultationId` / `patientId` por argumento sin validar que pertenezca al doctor que llama:

- `getConsultations(patientId)` — línea 127
- `updateConsultationStatus(consultationId, status)` — línea 169
- `updateConsultationNotes(consultationId, fields)` — línea 184

**Síntoma:** Doctor A puede leer/modificar consultas de Doctor B pasando IDs ajenos.
**Causa raíz:** No hay check `eq('doctor_id', actingDoctorId)` ni resolución del usuario actual.
**Fix (S):** Resolver `auth.getUser()` al inicio, agregar `.eq('doctor_id', user.id)` a SELECT/UPDATE. Si la action ya recibe `doctorId` por arg lo respetamos pero validamos contra `auth.uid()`.
**Complejidad:** S

---

### C-2 · `/api/doctor/view-doc` — descarga sin auth ni validar ownership

[app/api/doctor/view-doc/route.ts:1-46](app/api/doctor/view-doc/route.ts:1)

```ts
export async function GET(req: NextRequest) {
  const filePath = searchParams.get('path')          // ← input arbitrario
  const admin = createAdminClient()                  // ← bypass RLS
  const { data } = await admin.storage.from('shared-docs').download(filePath)
  return new NextResponse(htmlContent, …)            // ← sirve cualquier archivo
}
```

**Síntoma:** Endpoint *público* (no llama `getUser()`) que descarga con admin client cualquier path del bucket `shared-docs`. URL del tipo `/api/doctor/view-doc?path=<otro_doctor_id>/<code>/file.html` filtra documentos de cualquier doctor. Riesgo extra de path-traversal (`../`).
**Fix (M):**
1. `getUser()` al inicio; rechazar 401 si anon.
2. Validar `filePath.startsWith(\`${user.id}/\`)` (regex `^[a-f0-9-]{36}/`).
3. Rechazar paths con `..`, `//`, leading `/`.
4. Quitar `createAdminClient()` y usar el client autenticado para descargar (la RLS del bucket valida).
**Complejidad:** M

---

### C-3 · Bucket `shared-docs` público con SELECT broad (advisor `public_bucket_allows_listing`)

[supabase advisor 0025](https://supabase.com/docs/guides/database/database-linter?lint=0025_public_bucket_allows_listing)

3 buckets afectados, los críticos son **`shared-docs`** (informes/recetas que el doctor sube por paciente) y **`payment-receipts`** (comprobantes con datos personales).

**Síntoma:** Un anon con la URL del REST puede listar todos los archivos del bucket. URLs son adivinables si están construidas con UUIDs predecibles o codes incrementales (`A1000000XXX`).
**Fix (M):** Quitar la policy SELECT broad y exponer archivos vía signed URLs desde el endpoint (que ya valida ownership). `avatars` puede quedarse público (no sensibles).
**Complejidad:** M

---

### C-4 · `lib/consultation-blocks.ts:81` — modo zero-friction expone bloques no configurados

[lib/consultation-blocks.ts:81](lib/consultation-blocks.ts:81)

```ts
} else {
  // Si no hay ni config doctor ni specialty default, el bloque NO aparece
  // salvo que sea del catálogo genérico y no haya specialty definida
  enabled = !specialty  // Sin specialty → mostramos todo el catálogo activo
}
```

**Síntoma:** Si el doctor no tiene `specialty` cargada (campo opcional) y NO ha tocado un bloque, **se muestran TODOS los del catálogo**. El comentario dice una cosa, el código hace otra. Contradice R37 ("zero-friction" debe ser opt-in conservador).
**Causa raíz:** lógica `enabled = !specialty` invertida — debería ser `enabled = false` por default.
**Fix (S):** Cambiar a `enabled = catalogEntry.default_enabled ?? false`. Verificar que `consultation_block_catalog` tiene columna `default_enabled` o agregarla por migración.
**Complejidad:** S (+ migración trivial si falta la columna)

---

### C-5 · Race en autosave de consultations (sin version lock)

[app/doctor/consultations/page.tsx ~1235-1256](app/doctor/consultations/page.tsx:1235)

**Síntoma:** Autosave debounced hace `update({...}).eq('id', id)` sin `eq('updated_at', previousUpdatedAt)`. Dos pestañas del doctor o dos usuarios (admin de clínica + doctor) pisan campos.
**Causa raíz:** No hay optimistic concurrency control.
**Fix (M):** Agregar columna `version int` a `consultations` y usar `eq('version', prevVersion)` + incrementar. Alternativa: `eq('updated_at', prevUpdatedAt)`.
**Complejidad:** M (incluye migración + ajuste cliente).

---

### C-6 · Race en `patient_packages.used_sessions` (sin lock atómico)

Múltiples lugares: [app/api/book/route.ts](app/api/book/route.ts), [app/api/doctor/appointments/route.ts](app/api/doctor/appointments/route.ts), [app/api/doctor/consultations/route.ts](app/api/doctor/consultations/route.ts)

**Síntoma:** Lee `used_sessions`, calcula `+1`, escribe sin `eq('used_sessions', prevValue)`. Dos requests concurrentes pueden ambos leer "3", ambos escribir "4" → se "regala" una sesión.
**Causa raíz:** Falta CAS (compare-and-set).
**Fix (M):** Hay un RPC `book_with_package` que ya hace `FOR UPDATE`. Forzar TODOS los caminos a pasar por RPC (ya sea `book_with_package` para INSERT o uno nuevo `consume_package_session(package_id)` para los demás).
**Complejidad:** M

---

### C-7 · `consultations.payment_status` ↔ `payments.status` desincronización (PATCH consultations)

[app/api/doctor/consultations/route.ts ~269-292](app/api/doctor/consultations/route.ts:269)

**Síntoma:** PATCH actualiza `consultations.payment_status` y *intenta* actualizar `payments.status` vía `appointments.payment_id`. Si el payment_id es null, descarta silenciosamente; si el payment pertenece a otro doctor (corner case admin de clínica) escribe sin validar. Resultado: dinero desincronizado.
**Causa raíz:** Falta validar `payments.doctor_id = auth.uid()` antes de update. Falta error si no hay payment_id.
**Fix (S):** Tirar 409 si `payment_id` es null y `payment_status='approved'`. Agregar `eq('doctor_id', user.id)` al update de payments.
**Complejidad:** S

---

### C-8 · `app/doctor/settings/page.tsx` y `app/doctor/billing/page.tsx` aún leen de `doctor_services` (deprecada)

- [app/doctor/settings/page.tsx:207](app/doctor/settings/page.tsx:207), :447, :466, :471
- [app/doctor/billing/page.tsx:70](app/doctor/billing/page.tsx:70)

**Síntoma:** Contradice CLAUDE.md regla #2 ("fuente única = `pricing_plans` con su `type`"). Dos sources of truth → drift de datos (la BD tiene 8 filas en `doctor_services` y 13 en `pricing_plans`).
**Causa raíz:** Refactor incompleto. Settings UI sigue creando filas en `doctor_services`.
**Fix (M):** Migrar las 5 referencias a `pricing_plans` filtrado por `type='service'`. Confirmar que las filas existentes están migradas o agregar migración SQL one-shot. Mantener tabla por ahora; eliminar en una ronda separada.
**Complejidad:** M

---

### C-9 · `app/doctor/patients/page.tsx` — XSS por `dangerouslySetInnerHTML` con campos no sanitizados

[app/doctor/patients/page.tsx:882, :888, :894](app/doctor/patients/page.tsx:882)

```tsx
<div dangerouslySetInnerHTML={{ __html: c.notes }} />
<div dangerouslySetInnerHTML={{ __html: c.diagnosis }} />
<div dangerouslySetInnerHTML={{ __html: c.treatment }} />
```

**Síntoma:** Si el doctor o un admin pega HTML/JS en notas/diagnóstico/tratamiento, ejecuta script en el browser de cualquier otro doctor que vea ese paciente. Mismo patrón en [app/patient/reports/page.tsx:226-252](app/patient/reports/page.tsx:226) → XSS al paciente.
**Causa raíz:** `dangerouslySetInnerHTML` sin sanitizado.
**Fix (S):** Importar `DOMPurify` (`isomorphic-dompurify`, ~7KB) y envolver: `__html: DOMPurify.sanitize(c.notes ?? '')`. O eliminar `dangerouslySetInnerHTML` y renderizar texto plano si el editor no soporta HTML rico.
**Complejidad:** S (+ 1 dependencia)

---

### C-10 · `appointment-flow/NewAppointmentFlow.tsx` y `agenda/page.tsx` usan `confirm()`/`alert()` para decisiones críticas

- [components/appointment-flow/NewAppointmentFlow.tsx:342](components/appointment-flow/NewAppointmentFlow.tsx:342) — `if (confirm('Ya existe paciente...'))` decide flujo de cita
- [app/doctor/agenda/page.tsx:10](app/doctor/agenda/page.tsx:10) — `const toast = { success: (msg) => alert(msg) }` (toast simulado con alert)
- [app/doctor/consultations/page.tsx:514](app/doctor/consultations/page.tsx:514) — `alert('Consulta eliminada correctamente')`
- 37 ocurrencias totales

**Síntoma:** Modales nativos rompen branding y bloquean event loop. En `NewAppointmentFlow` la decisión es de negocio (¿usar paciente existente o crear duplicado?) — UX confuso.
**Fix:** Usar Dialog/Toast de Shadcn (ya está instalado: `radix-ui`, `tw-animate-css`).
**Complejidad:** M (refactor de cada call site, ~37 puntos).

---

## 3 · 🟡 IMPORTANTES

### I-1 · Doble `getUser()` patrón `.then()` sin await

[app/doctor/consultations/page.tsx:349](app/doctor/consultations/page.tsx:349), [app/doctor/crm/page.tsx:100](app/doctor/crm/page.tsx:100), [app/doctor/ehr/page.tsx:54](app/doctor/ehr/page.tsx:54)

```ts
supabase.auth.getUser().then(async ({ data: { user } }) => { … })
```

**Síntoma:** Race entre `getUser()` y siguiente render. Si la sesión expira entre callback y query, user es `null` silencioso.
**Fix:** `const { data: { user } } = await supabase.auth.getUser()` dentro de `useEffect` con cleanup.
**Complejidad:** S

---

### I-2 · `useEffect` con función local en deps → loop si la función no es `useCallback`

- [app/doctor/cobros/page.tsx:136](app/doctor/cobros/page.tsx:136) — `useEffect(() => fetchPayments(), [fetchPayments])`
- [app/doctor/offices/page.tsx:78](app/doctor/offices/page.tsx:78) — idem
- [app/doctor/agenda/page.tsx:553](app/doctor/agenda/page.tsx:553) — idem `loadData`

**Síntoma:** Si la función se recrea en cada render → re-fetch perpetuo.
**Fix:** Envolver en `useCallback` con deps reales o inlinear el fetch dentro del efecto.
**Complejidad:** S

---

### I-3 · Realtime channel sin nombre único → colisión en HMR

[app/doctor/cobros/page.tsx:140-158](app/doctor/cobros/page.tsx:140) (ya tiene cleanup ok). Verificar [app/doctor/agenda/page.tsx](app/doctor/agenda/page.tsx) — R32 mencionado en CLAUDE.md.
**Fix:** sufijar nombre `payments-${user.id}-${crypto.randomUUID()}`.
**Complejidad:** S

---

### I-4 · Concurrencia en `app/doctor/cobros/page.tsx` `updatePaymentStatus`

[app/doctor/cobros/page.tsx ~224-249](app/doctor/cobros/page.tsx:224) — dos UPDATEs separados (payments + consultations) sin transacción.
**Fix:** Crear RPC `update_payment_with_consultation_sync(payment_id, status)`.
**Complejidad:** M

---

### I-5 · `/api/doctor/ai` sin rate limiting

[app/api/doctor/ai/route.ts](app/api/doctor/ai/route.ts) — tiene cache de 5 min pero un usuario puede pegar al endpoint a 100 req/min.
**Fix:** Tabla `ai_request_log(user_id, created_at)` + check `count > 5` en últimos 60s.
**Complejidad:** S (BD + 5 líneas)

---

### I-6 · `app/doctor/page.tsx:67` y otros — `useEffect` que crea client cada vez

[app/doctor/page.tsx:67](app/doctor/page.tsx:67), [app/doctor/SearchCommandPalette.tsx:70](app/doctor/SearchCommandPalette.tsx:70)
**Síntoma:** `const supabase = createClient()` dentro de `useEffect` sin deps explícitas. Cada render crea cliente nuevo, abre canales nuevos.
**Fix:** Crear cliente fuera del componente o memoizar.
**Complejidad:** S

---

### I-7 · `next.config.ts` — propiedad `eslint` inválida en NextConfig (Next 16)

[next.config.ts:5](next.config.ts:5) — TS-1.
**Causa:** Next 16 movió la config de ESLint. AGENTS.md advierte: "This is NOT the Next.js you know".
**Fix:** Leer `node_modules/next/dist/docs/` y migrar (probable: a archivo separado o a un override en script).
**Complejidad:** S

---

### I-8 · Console statements expuestos con datos sensibles

- [app/doctor/consultations/page.tsx:886](app/doctor/consultations/page.tsx:886) — `console.log('[saveRecipe] insertando con patient_id =', selected.patient_id)`
- [app/api/book/route.ts](app/api/book/route.ts) — 13 `console.log` con datos de cita
- 143 ocurrencias totales en 52 archivos

**Síntoma:** Logs en Vercel almacenan datos personales (LOPDP/HIPAA-like).
**Fix:** Logger central (`lib/logger.ts`) con `redact: ['patient_id', 'cedula', 'phone', 'email']`. Quitar `console.log` triviales.
**Complejidad:** M (refactor pero buscar/reemplazar)

---

### I-9 · RLS `shared_files` UPDATE permite al paciente cambiar columnas del doctor

(Resultado de query a `pg_policies`)

```sql
"Patient updates own shared_files" UPDATE
  USING  (patient_id IN (SELECT id FROM patients WHERE auth_user_id = auth.uid()))
  WITH CHECK (patient_id IN (...))
```

**Síntoma:** Paciente puede UPDATE filas suyas, pero **sin restringir columnas** — puede sobrescribir `doctor_id`, `category`, `created_by`, `created_at`. La RLS solo valida fila, no columna.
**Fix:** Crear policy con `column-level grants` (Postgres no las soporta nativamente para RLS) o usar trigger BEFORE UPDATE que rechace cambios fuera de un whitelist (`patient_notes`, `read_at`).
**Complejidad:** M

---

### I-10 · RLS policies duplicadas

- `consultations`: dos policies ALL para doctor (`Médico ve sus propias consultas` + `Medico gestiona sus consultas`)
- `patient_packages`: dos policies ALL idénticas (`Package access` + `Packages visible to doctor and patient`)
- `patients`: tres SELECT solapadas

**Síntoma:** Performance impact (PG evalúa todas) + confusión al modificar.
**Fix:** Drop duplicates. **Complejidad:** S

---

### I-11 · BD: 11 funciones con `search_path` mutable (advisor `function_search_path_mutable`)

Funciones afectadas (las relevantes):
- `freeze_consultation_snapshot`, `reschedule_appointment`, `change_appointment_status`, `sync_consultation_payment_status`, `generate_appointment_code`, `trg_payment_code`, `restore_package_session`, `adjust_package_balance`, `book_with_package` …

**Síntoma:** SECURITY DEFINER + search_path mutable = privilege escalation potencial vía schema spoofing.
**Fix:** `ALTER FUNCTION xyz SET search_path = public, pg_temp;` para cada una.
**Complejidad:** S (1 migración)

---

### I-12 · BD: `doctor_consultation_summary` view es SECURITY DEFINER

Advisor nivel ERROR.
**Fix:** Recrear view sin SECURITY DEFINER (default invoker) o, si necesita acceso a tablas restringidas, blindar con check de `auth.uid()`.
**Complejidad:** S

---

### I-13 · BD: 7 RPC SECURITY DEFINER ejecutables por anon (advisors 0028)

`adjust_package_balance`, `book_with_package`, `change_appointment_status`, `log_appointment_insert/update`, `reschedule_appointment`, `restore_package_session`, `rls_auto_enable`.
**Síntoma:** Un anon puede llamarlas vía REST si conoce los args (book_with_package es legítimo, los otros no).
**Fix:** `REVOKE EXECUTE … FROM anon;` para todos excepto `book_with_package` (que es booking público).
**Complejidad:** S

---

### I-14 · `auth_leaked_password_protection` deshabilitado

Advisor: HaveIBeenPwned check off.
**Fix:** Toggle en Supabase Dashboard. Sin código.
**Complejidad:** S (manual)

---

### I-15 · Ownership en `/api/admin/change-plan` sin auditoría

[app/api/admin/change-plan/route.ts](app/api/admin/change-plan/route.ts) — super_admin cambia `profiles.plan` sin escribir en log.
**Fix:** Insertar en `appointment_changes_log`-like (crear `admin_actions_log` si no existe).
**Complejidad:** M

---

### I-16 · Type errors TS-2/TS-3/TS-5

Ya descritos en §1. Trivial fix.
**Complejidad:** S

---

## 4 · 🔵 LIMPIEZA

| # | Tema | Acción | Complejidad |
|---|---|---|---|
| L-1 | 196 `any` types en 68 archivos | Tipado gradual (priorizar `consultations/page.tsx`, `templates/page.tsx`, `agenda/page.tsx`) | L |
| L-2 | 137 imports no usados (ESLint) | `npx eslint --fix` agresivo | S |
| L-3 | 19 comentarios `// BUG-NN:` | Resolver o convertir a issues | M |
| L-4 | `app/doctor/plans` redirige a `/doctor/services` (CLAUDE.md) | Verificar redirect funciona, sino borrar carpeta | S |
| L-5 | Tablas BD `backup_20260420.*` con RLS pero sin policies (advisors info) | Drop schema o ignorar (es snapshot) | S |
| L-6 | `app/doctor/consultations/page.tsx` 3027 líneas | Romper en sub-componentes (ronda futura) | L |
| L-7 | `consultations.report_data` JSON sin tipo en código | Generar tipos via `mcp__supabase__generate_typescript_types` | S |
| L-8 | Tabla `doctor_services` legacy en BD | Verificar consumo final post-fix C-8, luego DROP en migración separada | S |
| L-9 | Tabla `patient_messages` aún en uso (`app/doctor/messages`, `send-consultation-email`) | NO eliminar — está activa | — |
| L-10 | `next.config.ts` sin `images.remotePatterns` | Revisar si se usa storage remoto en `<Image>` | S |
| L-11 | TS-4 `TabId` vs `'assistants'` | Probable feature dead-code: borrar la rama o agregar al union | S |

---

## 5 · Resumen ejecutivo

| Severidad | Cantidad | Estimación total |
|---|---|---|
| 🔴 Crítico | 10 | ~2 días |
| 🟡 Importante | 16 | ~2 días |
| 🔵 Limpieza | 11 | ~1 día (selectivo) |

**Migraciones SQL que aplicaré (FASE 3 si apruebas):**
1. `consultations`: agregar columna `version int default 1` (C-5)
2. `consultation_block_catalog`: confirmar/agregar `default_enabled boolean` (C-4)
3. `ALTER FUNCTION … SET search_path = public, pg_temp` × 11 (I-11)
4. Recrear view `doctor_consultation_summary` sin SECURITY DEFINER (I-12)
5. `REVOKE EXECUTE` de RPC SECURITY DEFINER excepto `book_with_package` (I-13)
6. Drop policies duplicadas en `consultations`, `patient_packages`, `patients` (I-10)
7. Trigger BEFORE UPDATE en `shared_files` para columnas del paciente (I-9)
8. Tabla `ai_request_log` para rate limit (I-5)
9. Storage: revisar y endurecer policies de `shared-docs` y `payment-receipts` (C-3) — vía dashboard SQL editor

---

## 6 · Pendiente para validar contigo antes de FASE 3

1. **Acceso al `PROJECT_OVERVIEW.md`** (Google Doc privado, 401). Necesario para tachar las 4–5 deudas TS preexistentes y no duplicar trabajo.
2. **`app/patient/seguimiento/page.tsx` no existe** en este worktree — el área 4 del prompt no es aplicable o está en otra rama. Confirma si es esperado.
3. **`lib/report-data.ts` tampoco existe** — el contrato del snapshot sólo lo veo en `lib/consultation-blocks.ts`. ¿Está en otra rama o ya se eliminó?
4. **`ehr_records`** está en backup pero NO en public — ¿migración eliminó la tabla? Hay código que la referencia (verificar).
5. ¿Apruebo aplicar migraciones SQL directamente con MCP Supabase, o prefieres revisarlas una por una?

---

**Listo para tu OK para empezar FASE 3.** Sugiero arrancar por C-1, C-2, C-3, C-4, C-7 (todos S/M sin tocar tipos masivos) — bloquean fugas de datos y son los más rápidos. Los race conditions (C-5, C-6) los hago después porque requieren migración + ajuste cliente.
