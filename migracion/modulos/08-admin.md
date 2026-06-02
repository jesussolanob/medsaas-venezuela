# Módulo: Admin

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: super admin — gestión de médicos, suscripciones, planes, features, tasa USDT, dashboard global.
> Todos los endpoints requieren `@Roles('super_admin')`.

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/admin/dashboard` | KPIs: médicos activos/fríos/inactivos, citas, pacientes, ingresos |
| `GET` | `/api/admin/doctors` | Lista de médicos con estado de actividad y suscripción |
| `GET` | `/api/admin/doctors/:id` | Detalle de un médico |
| `PUT` | `/api/admin/doctors/:id/subscription` | Actualizar suscripción manualmente |
| `GET` | `/api/admin/subscriptions` | Todas las suscripciones con filtros |
| `GET` | `/api/admin/plans` | Configuración de planes |
| `PUT` | `/api/admin/plans/:planKey` | Activar/desactivar plan |
| `GET` | `/api/admin/plan-features` | Features por plan |
| `PUT` | `/api/admin/plan-features/:planKey/:featureKey` | Habilitar/deshabilitar feature |
| `GET` | `/api/admin/patients` | Estadísticas globales de pacientes |
| `POST` | `/api/admin/settings/usdt-rate` | Actualizar tasa USDT |
| `GET` | `/api/admin/settings` | Configuración general |

---

## Domain

### Entidad `DoctorWithActivity`

```typescript
export class DoctorWithActivity {
  constructor(
    public readonly id: string,
    public readonly fullName: string,
    public readonly email: string,
    public readonly specialty: string | null,
    public readonly subscriptionStatus: SubscriptionStatus,
    public readonly subscriptionPlan: string,
    public readonly subscriptionExpiresAt: Date | null,
    public readonly lastSignInAt: Date | null,
  ) {}

  get activityStatus(): 'active' | 'cold' | 'inactive' {
    if (!this.lastSignInAt) return 'inactive';
    const daysSinceLastLogin = Math.floor(
      (Date.now() - this.lastSignInAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLastLogin <= 7) return 'active';
    if (daysSinceLastLogin <= 30) return 'cold';
    return 'inactive';
  }
}
```

### Value Object `PlanConfig`

```typescript
export class PlanConfig {
  constructor(
    public readonly planKey: string,
    public readonly name: string,
    public readonly priceUsd: number,
    public readonly trialDays: number,
    public readonly isActive: boolean,
  ) {}
}
```

---

## Use Cases

### `GetAdminDashboardUseCase`
- **Métricas:**
  - Médicos: total, activos (≤7 días), fríos (8-30 días), inactivos (>30 días)
  - Citas agendadas en los últimos 30 días
  - Total de pacientes registrados
  - Médicos con suscripción que vence en los próximos 7 días (alerta)
- **Caché:** Redis TTL 300 segundos, invalidar cuando cambia una suscripción
- **Tests:** calcula métricas correctamente, clasifica estados de actividad

### `GetDoctorsListUseCase`
- **Input:** `{ page, limit, activityStatus?, subscriptionStatus? }`
- **Output:** lista de `DoctorWithActivity` con estado calculado
- **Tests:** filtra por actividad, filtra por suscripción, pagina

### `UpdateDoctorSubscriptionUseCase`
- **Input:** `{ doctorId, plan, status, expiresAt }`
- **Acción:** actualizar `subscriptions` + invalidar caché del doctor
- **Tests:** actualiza, invalida caché

### `TogglePlanFeatureUseCase`
- **Input:** `{ planKey, featureKey, enabled }`
- **Acción:** upsert en `plan_features` + invalidar caché de features en Redis
- **Tests:** habilita feature, deshabilita feature, invalida caché

---

## Tests obligatorios

```typescript
// doctor-with-activity.entity.spec.ts
describe('activityStatus', () => {
  it('returns active when last login was 5 days ago', ...);
  it('returns cold when last login was 15 days ago', ...);
  it('returns inactive when last login was 45 days ago', ...);
  it('returns inactive when lastSignInAt is null', ...);
});

// get-admin-dashboard.use-case.spec.ts
describe('GetAdminDashboardUseCase', () => {
  it('counts doctors by activity status correctly', ...);
  it('returns alerts for expiring subscriptions', ...);
  it('returns from cache on second call', ...);
});

// toggle-plan-feature.use-case.spec.ts
describe('TogglePlanFeatureUseCase', () => {
  it('enables a feature for a plan', ...);
  it('disables a feature for a plan', ...);
  it('invalidates feature cache in Redis', ...);
});
```
