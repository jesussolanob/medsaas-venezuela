# Módulo: Appointments (Agenda)

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: CRUD de citas, validación de slots, transición de estados, optimistic lock para paquetes.

---

## Tabla en BD

```sql
appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  auth_user_id UUID,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  plan_name TEXT,
  plan_price DECIMAL(10,2),
  payment_method VARCHAR(50),
  package_id UUID REFERENCES patient_packages(id),
  session_number INTEGER,
  appointment_mode VARCHAR(20) DEFAULT 'presencial',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

appointment_changes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  actor_id UUID NOT NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Estados válidos y transiciones

```
scheduled  →  confirmed   (doctor aprueba)
scheduled  →  cancelled   (doctor o admin rechaza)
confirmed  →  completed   (doctor marca atendida)
confirmed  →  no_show     (paciente no asistió)
confirmed  →  cancelled   (cancelación tardía)
```

Cualquier otra transición lanza `AppointmentInvalidTransitionError`.

---

## Endpoints

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/appointments` | doctor | Citas del doctor con filtros |
| `GET` | `/api/appointments/:id` | doctor | Detalle de una cita |
| `POST` | `/api/appointments` | doctor/patient | Crear cita (desde la agenda del doctor) |
| `PUT` | `/api/appointments/:id/status` | doctor | Cambiar estado (confirm, cancel, complete, no_show) |
| `PUT` | `/api/appointments/:id/reschedule` | doctor | Reagendar (valida conflictos) |
| `GET` | `/api/appointments/slots` | doctor | Slots disponibles de un doctor para una fecha |

**Query params de lista:**
- `date_from`, `date_to` (ISO 8601)
- `status` — filtrar por estado
- `page`, `limit`

---

## Domain

### Entidad `Appointment`

```typescript
export class Appointment {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly patientId: string,
    public readonly scheduledAt: Date,
    public readonly status: AppointmentStatus,
    public readonly packageId: string | null,
    public readonly appointmentMode: 'presencial' | 'online',
    public readonly createdAt: Date,
  ) {}

  canTransitionTo(newStatus: AppointmentStatus): boolean {
    const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      scheduled: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'no_show', 'cancelled'],
      cancelled: [],
      completed: [],
      no_show: [],
    };
    return transitions[this.status]?.includes(newStatus) ?? false;
  }

  canBeModifiedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }
}
```

### Value Object `AppointmentSlot`

```typescript
export class AppointmentSlot {
  constructor(
    public readonly startsAt: Date,
    public readonly endsAt: Date,
    public readonly isAvailable: boolean,
  ) {}

  overlaps(other: AppointmentSlot): boolean { ... }
}
```

### Errores

- `AppointmentConflictError` — slot ya ocupado
- `AppointmentNotFoundError`
- `AppointmentInvalidTransitionError` — transición de estado no permitida
- `AppointmentDuplicateError` — mismo paciente, mismo horario ± 15 min

---

## Use Cases

### `CreateAppointmentUseCase`
- **Input:** `{ doctorId, patientId, scheduledAt, mode, planName, planPrice, paymentMethod, packageId? }`
- **Validaciones:**
  1. Verificar que no existe otra cita del mismo paciente en `scheduledAt ± 15 min` (lanza `AppointmentDuplicateError`)
  2. Verificar que el slot no está ocupado por otro paciente (lanza `AppointmentConflictError`)
  3. Si `packageId`: verificar ownership + `status === 'active'` + `used_sessions < total_sessions`
  4. Si usa paquete: incrementar `used_sessions` con **optimistic lock** (`WHERE used_sessions = :current`)
- **Tests:**
  - crea correctamente
  - falla con slot ocupado
  - falla con duplicado del mismo paciente
  - falla si el paquete está agotado
  - el optimistic lock previene doble uso del paquete

### `UpdateAppointmentStatusUseCase`
- **Input:** `{ appointmentId, doctorId, newStatus, actorId }`
- **Validaciones:**
  - doctor es dueño de la cita
  - la transición es válida (`canTransitionTo`)
- **Acción:** actualizar status + insertar en `appointment_changes_log`
- **Tests:** transiciones válidas, transiciones inválidas, registro en audit log

### `RescheduleAppointmentUseCase`
- **Input:** `{ appointmentId, doctorId, newScheduledAt }`
- **Validaciones:**
  - doctor es dueño
  - nuevo slot disponible (sin conflicto)
  - cita en estado `scheduled` o `confirmed`
- **Tests:** reagenda correctamente, falla si nuevo slot ocupado

### `GetDoctorSlotsUseCase`
- **Input:** `{ doctorId, date }`
- **Lógica:**
  1. Obtener configuración de horario del doctor desde `doctor_schedule` (o tabla de settings)
  2. Generar slots del día según duración de consulta y horario configurado
  3. Marcar como no disponibles los que tienen cita en estado `scheduled` o `confirmed`
- **Tests:** genera slots correctamente, marca ocupados, respeta horario del doctor

### `GetDoctorAgendaUseCase`
- **Input:** `{ doctorId, dateFrom, dateTo, status?, page, limit }`
- **Output:** lista paginada de citas con datos del paciente enmascarados
- **Tests:** filtra por fecha, filtra por estado, pagina correctamente

---

## Tests obligatorios

```typescript
// appointment.entity.spec.ts
describe('canTransitionTo', () => {
  it('allows scheduled → confirmed', ...);
  it('allows confirmed → completed', ...);
  it('denies completed → any', ...);
  it('denies no_show → any', ...);
});

// create-appointment.use-case.spec.ts
describe('CreateAppointmentUseCase', () => {
  it('creates appointment for available slot', ...);
  it('throws AppointmentConflictError for occupied slot', ...);
  it('throws AppointmentDuplicateError for same patient ±15min', ...);
  it('uses optimistic lock when consuming package session', ...);
  it('throws InsufficientSessionsError when package is exhausted', ...);
});

// update-appointment-status.use-case.spec.ts
describe('UpdateAppointmentStatusUseCase', () => {
  it('transitions scheduled → confirmed and logs change', ...);
  it('transitions confirmed → completed and logs change', ...);
  it('throws AppointmentInvalidTransitionError for cancelled → confirmed', ...);
  it('throws UnauthorizedError for wrong doctor', ...);
});
```
