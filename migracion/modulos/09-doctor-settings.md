# Módulo: Doctor Settings + Subscriptions

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: configuración del médico (perfil, agenda, pagos, plantillas), feature gating, banner de suscripción.

---

## Endpoints

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/doctor/profile` | doctor | Perfil completo del médico autenticado |
| `PUT` | `/api/doctor/profile` | doctor | Actualizar datos del perfil |
| `GET` | `/api/doctor/schedule` | doctor | Configuración de horario y disponibilidad |
| `PUT` | `/api/doctor/schedule` | doctor | Actualizar horario |
| `GET` | `/api/doctor/features` | doctor | Features habilitadas según plan actual |
| `GET` | `/api/doctor/subscription` | doctor | Estado actual de la suscripción |
| `GET` | `/api/doctor/services` | doctor | Planes de precio del médico |
| `POST` | `/api/doctor/services` | doctor | Crear plan de precio |
| `PUT` | `/api/doctor/services/:id` | doctor | Actualizar plan de precio |
| `DELETE` | `/api/doctor/services/:id` | doctor | Eliminar plan de precio |
| `GET` | `/api/doctor/templates` | doctor | Plantillas PDF del médico |
| `PUT` | `/api/doctor/templates` | doctor | Crear o actualizar plantilla |

---

## Domain

### Entidad `DoctorProfile`

```typescript
export class DoctorProfile {
  constructor(
    public readonly id: string,
    public readonly fullName: string,
    public readonly email: string,
    public readonly specialty: string | null,
    public readonly professionalTitle: string | null,
    public readonly clinicId: string | null,
    public readonly clinicRole: string | null,
    public readonly paymentMethods: string[],
    public readonly paymentDetails: Record<string, string>,
    public readonly allowsOnline: boolean,
    public readonly officeAddress: string | null,
    public readonly city: string | null,
    public readonly bookingLink: string,   -- /book/:id
  ) {}
}
```

### Value Object `DoctorSchedule`

```typescript
export class DoctorSchedule {
  constructor(
    public readonly workDays: number[],           // 0=domingo ... 6=sábado
    public readonly startTime: string,            // HH:MM
    public readonly endTime: string,
    public readonly slotDurationMinutes: number,  // default 30
    public readonly breakStart: string | null,
    public readonly breakEnd: string | null,
  ) {}

  generateSlotsForDate(date: Date): TimeSlot[] { ... }
}
```

### Value Object `SubscriptionInfo`

```typescript
export class SubscriptionInfo {
  constructor(
    public readonly status: SubscriptionStatus,
    public readonly plan: string,
    public readonly expiresAt: Date | null,
  ) {}

  get daysUntilExpiry(): number | null { ... }

  get bannerLevel(): 'none' | 'warning' | 'critical' | 'suspended' {
    if (this.status === 'suspended') return 'suspended';
    if (!this.expiresAt || !this.daysUntilExpiry) return 'none';
    if (this.daysUntilExpiry <= 3) return 'critical';
    if (this.daysUntilExpiry <= 7) return 'warning';
    return 'none';
  }
}
```

---

## Use Cases

### `GetDoctorFeaturesUseCase`
- **Input:** `{ doctorId }`
- **Lógica:** leer plan del doctor → leer `plan_features` para ese plan → retornar map de features habilitadas
- **Caché:** Redis TTL 3600 segundos, key: `features:{plan}`
- **Tests:** retorna features correctas por plan, lee de caché

### `GetDoctorScheduleUseCase`
- Leer configuración de horario del doctor
- Si no existe configuración → retornar horario por defecto (L-V 8:00-17:00, 30 min)
- Tests: retorna configuración existente, retorna default si no configurado

### `UpdateDoctorScheduleUseCase`
- Actualizar horario + invalidar caché de slots (`slots:{doctorId}:*`) en Redis
- Tests: actualiza, invalida caché de slots

### `GetSubscriptionInfoUseCase`
- Retorna estado de suscripción con `bannerLevel` calculado
- Tests: calcula nivel de banner correctamente para cada escenario

---

## Tests obligatorios

```typescript
// subscription-info.vo.spec.ts
describe('SubscriptionInfo.bannerLevel', () => {
  it('returns none when expiry is far', ...);
  it('returns warning when 5 days to expiry', ...);
  it('returns critical when 2 days to expiry', ...);
  it('returns suspended when status is suspended', ...);
});

// doctor-schedule.vo.spec.ts
describe('DoctorSchedule.generateSlotsForDate', () => {
  it('generates correct slots for a workday', ...);
  it('returns empty array for non-workday', ...);
  it('excludes break time slots', ...);
  it('respects slot duration', ...);
});

// get-doctor-features.use-case.spec.ts
describe('GetDoctorFeaturesUseCase', () => {
  it('returns enabled features for basic plan', ...);
  it('returns enabled features for professional plan', ...);
  it('reads from cache on second call', ...);
  it('invalidates cache when plan_features change', ...);
});
```
