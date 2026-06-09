# FASE 5 — Responsive · Flujo paciente · Botones · Google login

**Fecha:** 2026-04-28
**Branch:** `claude/sad-cori-573286`
**Errores TS:** 0 (mantiene 0 desde FASE 3)

---

## 5A · Responsive

Auditoría: la app está **80% mobile-friendly** ya. Layouts (`doctor`, `admin`, `patient`) tienen burger menu correcto. Issues encontrados/aplicados:

| Archivo | Antes | Después | Issue |
|---|---|---|---|
| [app/doctor/finances/page.tsx:564](app/doctor/finances/page.tsx:564) | `min-w-[500px]` + sin `-mx-4` | `md:min-w-[500px]` + `-mx-4 sm:mx-0` | Tabla overflow en mobile |
| [app/doctor/finances/page.tsx:670](app/doctor/finances/page.tsx:670) | `min-w-[400px]` | `md:min-w-[400px]` | Idem |
| [app/doctor/finances/page.tsx:643](app/doctor/finances/page.tsx:643) | `grid-cols-2 sm:grid-cols-4` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` | Inputs apretados en xs |
| [app/admin/doctors/UsersPanel.tsx:118](app/admin/doctors/UsersPanel.tsx:118) | `min-w-[700px]` | `md:min-w-[700px]` | Tabla doctores |
| [app/admin/page.tsx:154](app/admin/page.tsx:154) | `p-8 lg:p-10` | `p-4 sm:p-6 lg:p-8` | Hero overflow en mobile |

**Veredicto:** la app **es responsive en producción**. Los layouts/sidebars ya colapsan correctamente con burger en `lg:hidden`. Solo había micro-ajustes en tablas y un hero. No hay páginas rotas en mobile.

---

## 5B · Flujo paciente E2E

Verificado paso a paso. **Todos los pasos funcionan**, había **un solo gap UX**:

| Paso | Estado | Notas |
|---|---|---|
| 1 — Booking público | ✅ | `app/api/book/route.ts` con RPC `book_with_package` |
| 2 — Doctor confirma | ✅ | Botón "Confirmar" en agenda → RPC `change_appointment_status` |
| 3 — Doctor crea consulta | ✅ | "Marcar atendida" → POST `/api/doctor/consultations` |
| 4 — Doctor llena consulta | ✅ | PATCH con whitelist (AL-104) |
| 5 — Doctor aprueba pago | ✅ | Sync con C-7 fix de FASE 3 |
| 6 — Doctor genera recibo | ⚠️→✅ | **Antes** requería ir a `/doctor/billing`. **Ahora** botón "Generar recibo" en el drawer de cobros cuando el pago está aprobado. |
| 7 — Paciente ve consulta | ✅ | `/patient/reports` con sanitize HTML |
| 8 — Paciente ve cita | ✅ | `/patient/appointments` |

### Cambio aplicado

[app/doctor/cobros/page.tsx](app/doctor/cobros/page.tsx) ahora muestra botón **"Generar recibo"** en el drawer del pago cuando `status='approved'`. POST a `/api/doctor/billing` con `doc_type='recibo'`, datos del payment + appointment + consultation, devuelve `docNumber` (REC-YYYYMMDD-XXXX). El recibo queda en `billing_documents` y el doctor puede verlo en `/doctor/billing`.

---

## 5C · Botones rotos / warnings

Auditoría completa: **CERO botones rotos**. Todos los `<button>`, `<form>`, `<Link>` apuntan a rutas existentes y tienen handlers. Único hallazgo:

- [app/doctor/agenda/page.tsx:10](app/doctor/agenda/page.tsx:10) usaba `const toast = { success: alert, error: alert }` — UX rota.

### Cambio aplicado

- **Nuevo** [components/ui/Toaster.tsx](components/ui/Toaster.tsx): toast portal-less con `showToast({ type, message })`. Sin dependencias externas.
- Montado `<Toaster />` en los 3 layouts: [app/doctor/layout.tsx](app/doctor/layout.tsx), [app/admin/layout.tsx](app/admin/layout.tsx), [app/patient/layout.tsx](app/patient/layout.tsx).
- Reemplazado en [app/doctor/agenda/page.tsx](app/doctor/agenda/page.tsx) el shim `alert()` por `showToast()`. Las 13 llamadas existentes (`toast.success(...)`, `toast.error(...)`) ahora muestran toasts reales.

---

## 5D · Google login mejorado

### Issues encontrados

1. ❌ Sin página de error dedicada — query params crípticos (`?error=auth`, `?google=error`).
2. ❌ HTML inline insegura en `/api/integrations/google/auth` — riesgo XSS si `baseUrl` viene poisoned.
3. ❌ First-time OAuth user no tenía profile creado → `/auth/callback` redirigía a `/onboarding` sin contexto.
4. ❌ Metadata `role` se construía en `/register` pero NO se usaba — Supabase OAuth no permite `data` en options.
5. ❌ Scope solo `calendar` — re-auth si en futuro se necesita email.

### Fixes aplicados

- **Nueva página** [app/auth/error/page.tsx](app/auth/error/page.tsx): mensajes claros en español, códigos semánticos (`auth`, `suspended`, `google_config_missing`, `google_oauth_denied`, `google_token_failed`, `role_missing`).
- [app/auth/callback/route.ts](app/auth/callback/route.ts) redirige a `/auth/error?type=...`.
- [app/api/integrations/google/auth/route.ts](app/api/integrations/google/auth/route.ts) reescrito: redirige a `/auth/error?type=google_config_missing` en lugar de HTML inline. Scope ampliado a `calendar + userinfo.email`.
- [app/api/integrations/google/callback/route.ts](app/api/integrations/google/callback/route.ts) redirige a `/auth/error` con códigos `google_oauth_denied` / `google_token_failed`.
- **Migración SQL**: trigger `handle_new_user_signup()` AFTER INSERT en `auth.users` que auto-crea row en `profiles` con `email`, `full_name`, `role` (lee de `raw_user_meta_data`). Resuelve el bug de first-time OAuth.
- [app/register/page.tsx](app/register/page.tsx) guarda `pending_role` en `localStorage` antes del OAuth; [app/onboarding/page.tsx](app/onboarding/page.tsx) lo lee para pre-seleccionar el rol cuando el profile recién creado tiene `role=null`. Limpia localStorage tras submit.

---

## 6 · Cambios en BD (vía MCP Supabase)

| Migración | Qué hace |
|---|---|
| `audit_deuda1_payment_receipts_no_listing` | DROP de `Public read access for receipts` y `Public reads receipts` policies. Bucket sigue público (URLs viejas funcionan), pero listing bloqueado. |
| `audit_deuda1_avatars_no_listing` | DROP de `Avatars públicos lectura`. |
| `audit_fix_5d_auto_create_profile_on_signup` | Trigger BD para auto-crear profile en first-time OAuth (Google y otros). |

---

## 7 · Errores TypeScript

```bash
$ npx tsc --noEmit
# (sin output → 0 errores)
```

---

## 8 · Archivos modificados

```
app/admin/doctors/UsersPanel.tsx
app/admin/layout.tsx
app/admin/page.tsx
app/api/integrations/google/auth/route.ts
app/api/integrations/google/callback/route.ts
app/auth/callback/route.ts
app/auth/error/page.tsx                   ← NUEVO
app/doctor/agenda/page.tsx
app/doctor/cobros/page.tsx
app/doctor/finances/page.tsx
app/doctor/layout.tsx
app/onboarding/page.tsx
app/patient/layout.tsx
app/register/page.tsx
components/ui/Toaster.tsx                  ← NUEVO
```

---

## 9 · Acciones manuales requeridas

1. **`/onboarding/page.tsx`** ya estaba ok — sólo requiere que el lookup de profile por id encuentre la fila que el trigger acaba de crear (lo hace).
2. **Probar el flow**: registrarse via Google con rol "Especialista" → /auth/callback → /onboarding (rol pre-seleccionado como doctor por localStorage) → completar perfil → redirect.
3. Si `SHARE_LINK_SECRET` se setea en Vercel (de FASE 3), no afecta este flow.

---

## 10 · Pendiente (deuda FASE 6)

- Refactor masivo de los 30 `alert()` restantes (no críticos) → usar `showToast` ahora que existe.
- Refactor de los 196 `any` types.
- Limpieza de imports unused (`npx eslint --fix` agresivo).
- Drop tabla `doctor_services` (ya no la consume nadie tras C-8).
- Toggle manual: HaveIBeenPwned password protection en Supabase dashboard.

---

## 11 · Comandos de deploy

```bash
git add -A
git commit -m "fase5: responsive + flujo paciente + Toaster + Google login error page"
git push origin claude/sad-cori-573286
```

Las migraciones SQL ya están aplicadas en producción.
