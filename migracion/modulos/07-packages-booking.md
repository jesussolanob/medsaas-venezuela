# Módulo: Packages + Booking Público

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: paquetes prepagados con optimistic lock, flujo de booking público de 5 pasos.

---

## Tablas en BD

```sql
patient_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  auth_user_id UUID,
  plan_name TEXT NOT NULL,
  total_sessions INTEGER NOT NULL,
  used_sessions INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',    -- active | completed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

pricing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  price_usd DECIMAL(10,2) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  sessions_count INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Endpoints — Packages

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/packages/patient/:patientId` | doctor | Paquetes de un paciente |
| `POST` | `/api/packages` | doctor | Crear paquete para paciente |
| `GET` | `/api/patient/packages` | patient | Paquetes activos del paciente autenticado |

## Endpoints — Booking Público

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/booking/:doctorId/info` | público | Info del doctor para el form de booking |
| `GET` | `/api/booking/:doctorId/plans` | público | Planes de precio activos del doctor |
| `GET` | `/api/booking/:doctorId/slots?date=` | público | Slots disponibles para una fecha |
| `POST` | `/api/booking` | público + Turnstile | Crear cita desde el booking público |
| `GET` | `/api/booking/:doctorId/packages?email=` | público | Paquetes activos del paciente (si tiene cuenta) |

---

## Domain

### Entidad `PatientPackage`

```typescript
export class PatientPackage {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly patientId: string,
    public readonly planName: string,
    public readonly totalSessions: number,
    public readonly usedSessions: number,
    public readonly status: PackageStatus,
  ) {}

  get remainingSessions(): number {
    return this.totalSessions - this.usedSessions;
  }

  isAvailableFor(doctorId: string): boolean {
    return this.doctorId === doctorId && this.status === 'active' && this.remainingSessions > 0;
  }

  wouldCompleteAfterUse(): boolean {
    return this.usedSessions + 1 >= this.totalSessions;
  }
}
```

### Errores

- `PackageNotFoundError`
- `PackageExhaustedError`
- `PackageNotOwnedError`

---

## Use Cases

### `ConsumePackageSessionUseCase`
- **Input:** `{ packageId, doctorId }`
- **Acción con optimistic lock:**
  ```sql
  UPDATE patient_packages
  SET used_sessions = used_sessions + 1,
      status = CASE WHEN used_sessions + 1 >= total_sessions THEN 'completed' ELSE 'active' END,
      updated_at = NOW()
  WHERE id = :packageId
    AND used_sessions = :currentUsedSessions  -- optimistic lock
    AND status = 'active'
  RETURNING *
  ```
  Si la query afecta 0 filas → reintentar hasta 3 veces (race condition) → lanzar `InsufficientSessionsError`
- **Tests:**
  - consume sesión correctamente
  - completa el paquete cuando se usa la última sesión
  - previene doble consumo concurrente (test de concurrencia)

### `CreateBookingUseCase`
- **Input:** `BookingDto` (toda la info del form de 5 pasos)
- **Validaciones en orden:**
  1. Verificar token de Cloudflare Turnstile contra la API de CF
  2. Verificar que el doctor existe y está activo
  3. Verificar que el slot está disponible
  4. Si viene `packageId`: verificar ownership del paciente, disponibilidad del paquete
  5. Buscar o crear paciente por email/cédula
  6. Crear cita (`status = 'scheduled'`)
  7. Si usa paquete: consumir sesión con optimistic lock
- **Atomicidad:** pasos 6 y 7 dentro de una transacción Sequelize
- **Tests:**
  - booking exitoso con pago manual
  - booking exitoso consumiendo paquete
  - falla si Turnstile token inválido
  - falla si slot ocupado
  - falla si paquete agotado
  - transacción se revierte si falla el consumo del paquete

---

## Flujo Booking — 5 pasos del formulario

```
Paso 1: Tipo de consulta (plan)
  → GET /api/booking/:doctorId/plans
  → Si el paciente tiene cuenta y paquetes activos → mostrar opción "Usar paquete"
  → GET /api/booking/:doctorId/packages?email=

Paso 2: Fecha
  → GET /api/booking/:doctorId/slots?date=YYYY-MM-DD
  → Selector de días (7 días hacia adelante) + horarios disponibles

Paso 3: Modalidad
  → Presencial / Online (si el doctor permite online)
  → Info de dirección o link de videollamada según modalidad

Paso 4: Método de pago
  → Se omite completamente si está usando un paquete prepagado
  → Opciones según `profiles.payment_methods` del doctor

Paso 5: Confirmación
  → Resumen de todos los datos
  → Botón "Confirmar cita" → POST /api/booking
  → On success: mostrar código de cita + instrucciones
```

---

## Tests obligatorios

```typescript
// patient-package.entity.spec.ts
describe('PatientPackage', () => {
  it('calculates remaining sessions correctly', ...);
  it('isAvailableFor returns false when exhausted', ...);
  it('isAvailableFor returns false for wrong doctor', ...);
  it('wouldCompleteAfterUse returns true on last session', ...);
});

// consume-package-session.use-case.spec.ts
describe('ConsumePackageSessionUseCase', () => {
  it('decrements remaining sessions', ...);
  it('marks package as completed on last session', ...);
  it('retries on concurrent modification', ...);
  it('throws InsufficientSessionsError after max retries', ...);
});

// create-booking.use-case.spec.ts
describe('CreateBookingUseCase', () => {
  it('creates appointment for available slot', ...);
  it('creates appointment using package session', ...);
  it('rejects invalid Turnstile token', ...);
  it('rejects occupied slot', ...);
  it('rolls back transaction if package consumption fails', ...);
});
```
