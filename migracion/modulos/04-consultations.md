# Módulo: Consultations

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: ciclo de vida de consultas médicas, campos clínicos encriptados, gestión de estado de pago.

---

## Tabla en BD

```sql
consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  appointment_id UUID REFERENCES appointments(id),
  consultation_code VARCHAR(20) UNIQUE NOT NULL,  -- generado: DLT-YYYYMM-XXXX
  consultation_date DATE NOT NULL,
  chief_complaint TEXT,     -- ciphertext en prod (dato clínico)
  diagnosis TEXT,           -- ciphertext en prod
  treatment TEXT,           -- ciphertext en prod
  payment_status VARCHAR(20) DEFAULT 'pending',
  payment_amount DECIMAL(10,2),
  payment_method VARCHAR(50),
  payment_date TIMESTAMPTZ,
  notes TEXT,               -- notas internas del doctor (también ciphertext)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Endpoints

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/consultations` | doctor | Lista de consultas con filtros |
| `GET` | `/api/consultations/:id` | doctor | Detalle de consulta |
| `POST` | `/api/consultations` | doctor | Iniciar nueva consulta |
| `PUT` | `/api/consultations/:id` | doctor | Actualizar datos clínicos |
| `PUT` | `/api/consultations/:id/payment` | doctor | Registrar pago (pending → approved) |
| `GET` | `/api/consultations/patient/:patientId` | doctor | Historial de consultas de un paciente |

**Query params:**
- `date_from`, `date_to`
- `payment_status` — `pending | approved`
- `page`, `limit`

---

## Domain

### Entidad `Consultation`

```typescript
export class Consultation {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly patientId: string,
    public readonly appointmentId: string | null,
    public readonly consultationCode: string,
    public readonly consultationDate: Date,
    public readonly chiefComplaint: string | null,
    public readonly diagnosis: string | null,
    public readonly treatment: string | null,
    public readonly paymentStatus: PaymentStatus,
    public readonly paymentAmount: number | null,
    public readonly createdAt: Date,
  ) {}

  canBeModifiedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  canApprovePayment(): boolean {
    return this.paymentStatus === 'pending';
  }
}
```

### Value Object `ConsultationCode`

```typescript
// Formato: DLT-YYYYMM-XXXX (ej: DLT-202605-0042)
export class ConsultationCode {
  static generate(sequence: number): ConsultationCode { ... }
  static isValid(code: string): boolean { ... }
}
```

### Errores

- `ConsultationNotFoundError`
- `PaymentAlreadyApprovedError`
- `ConsultationNotOwnedError`

---

## Use Cases

### `CreateConsultationUseCase`
- **Input:** `{ doctorId, patientId, appointmentId?, consultationDate, chiefComplaint?, initialNotes? }`
- **Acción:** generar `consultation_code` único, crear consulta con `payment_status = 'pending'`
- **Tests:** crea con código único, vincula con cita si viene appointmentId

### `UpdateConsultationUseCase`
- **Input:** `{ consultationId, doctorId, chiefComplaint?, diagnosis?, treatment?, notes? }`
- **Validación:** doctor es dueño
- **Tests:** actualiza campos clínicos, rechaza si doctor incorrecto

### `ApprovePaymentUseCase`
- **Input:** `{ consultationId, doctorId, amount, paymentMethod, paymentDate }`
- **Validación:** `paymentStatus === 'pending'` (lanza `PaymentAlreadyApprovedError` si ya está aprobado)
- **Tests:** aprueba pago, falla si ya aprobado, registra método y fecha

### `GetPatientConsultationHistoryUseCase`
- **Input:** `{ patientId, doctorId, page, limit }`
- **Validación:** doctor es dueño del paciente
- **Output:** lista cronológica de consultas (datos clínicos en plaintext — el doctor los necesita)
- **Tests:** retorna historial completo, pagina, valida ownership

---

## Encriptación en Sequelize Model

Campos que se encriptan en `beforeCreate`/`beforeUpdate`:
- `chief_complaint`
- `diagnosis`
- `treatment`
- `notes`

No tienen `*_search_hash` porque no se busca por ellos — son solo para visualización.

---

## Tests obligatorios

```typescript
// consultation.entity.spec.ts
describe('canApprovePayment', () => {
  it('returns true when status is pending', ...);
  it('returns false when status is approved', ...);
});

// create-consultation.use-case.spec.ts
describe('CreateConsultationUseCase', () => {
  it('creates consultation with unique code', ...);
  it('generates code in format DLT-YYYYMM-XXXX', ...);
  it('links to appointment when provided', ...);
});

// approve-payment.use-case.spec.ts
describe('ApprovePaymentUseCase', () => {
  it('transitions pending → approved', ...);
  it('throws PaymentAlreadyApprovedError when already approved', ...);
  it('records payment method and date', ...);
});
```
