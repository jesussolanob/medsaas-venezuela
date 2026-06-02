# Módulo: Auth

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: sesiones, registro de sesión activa, migración de usuarios de Supabase a Auth0.

---

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/auth/register-session` | `x-action-secret` header | Llamado por Auth0 Action post-login. Registra sesión activa en Redis. |
| `GET` | `/api/auth/me` | JWT | Retorna el perfil del usuario autenticado con su rol y plan |
| `POST` | `/api/auth/logout-all` | JWT | Invalida todas las sesiones del usuario en Redis |

---

## Domain

No hay entidades de dominio propias en este módulo — opera sobre `profiles` que pertenece al módulo de Admin/Doctor.

**Value Object:** `SessionId` — encapsula el ID de sesión de Auth0 y su validación.

---

## Use Cases

### `RegisterActiveSessionUseCase`
- **Input:** `{ userId, sessionId, ip, userAgent }`
- **Validación:** `x-action-secret` debe coincidir con `process.env.AUTH0_ACTION_SECRET`
- **Acción:** `SET active_session:{userId} {data} EX 86400` en Redis. Sobreescribe sesión anterior.
- **Tests:**
  - registra sesión correctamente
  - sobreescribe sesión anterior (segundo login invalida el primero)
  - rechaza si el secreto es incorrecto

### `GetCurrentUserUseCase`
- **Input:** `CurrentUserPayload` del JWT
- **Acción:** busca el perfil en `profiles` por `auth0_user_id = payload.sub`
- **Output:** `{ id, role, full_name, email, plan, subscription_status, features[] }`
- **Tests:**
  - retorna perfil con features del plan
  - lanza `PatientNotFoundError` si el perfil no existe

### `LogoutAllSessionsUseCase`
- **Input:** `userId`
- **Acción:** `DEL active_session:{userId}` en Redis
- **Tests:**
  - borra la sesión del Redis
  - no lanza error si no existía sesión

---

## Estructura de archivos

```
apps/backend/src/
├── domain/
│   └── value-objects/
│       └── session-id.vo.ts
│       └── session-id.vo.spec.ts
├── application/
│   └── use-cases/
│       └── auth/
│           ├── register-active-session.use-case.ts
│           ├── register-active-session.use-case.spec.ts
│           ├── get-current-user.use-case.ts
│           ├── get-current-user.use-case.spec.ts
│           ├── logout-all-sessions.use-case.ts
│           └── logout-all-sessions.use-case.spec.ts
├── infrastructure/
│   └── auth/
│       ├── dev-auth.guard.ts
│       ├── jwt.strategy.ts
│       └── active-session.guard.ts
└── presentation/
    └── controllers/
        ├── auth.controller.ts
        └── auth.controller.spec.ts
```

---

## Script de migración Supabase → Auth0

`tools/scripts/migrate-users-to-auth0.ts`:

1. Leer todos los usuarios de Supabase Auth via API
2. Para cada usuario:
   - Llamar a Auth0 Management API: `POST /api/v2/users`
   - Preservar email, `app_metadata: { role }`
   - Guardar el `auth0_user_id` retornado
3. Actualizar `profiles.auth0_user_id` en PostgreSQL
4. Generar reporte de usuarios migrados / fallidos

---

## Tests obligatorios

```typescript
// auth.controller.spec.ts
describe('POST /api/auth/register-session', () => {
  it('returns 200 with valid action secret', ...);
  it('returns 401 with invalid action secret', ...);
  it('returns 400 with missing body fields', ...);
});

describe('GET /api/auth/me', () => {
  it('returns user profile with features', ...);
  it('returns 401 without JWT', ...);
  it('returns 404 if profile not found', ...);
});
```
