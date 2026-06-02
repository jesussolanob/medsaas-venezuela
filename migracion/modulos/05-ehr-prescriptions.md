# Módulo: EHR + Prescriptions

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: historia clínica electrónica y recetas. Todos los campos clínicos van encriptados.

---

## Tablas en BD

```sql
ehr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  consultation_id UUID REFERENCES consultations(id),
  doctor_id UUID NOT NULL REFERENCES profiles(id),
  diagnosis TEXT,        -- ciphertext en prod
  treatment_plan TEXT,   -- ciphertext en prod
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  doctor_id UUID NOT NULL REFERENCES profiles(id),
  consultation_id UUID REFERENCES consultations(id),
  medication_name TEXT NOT NULL,  -- ciphertext en prod
  dosage TEXT NOT NULL,           -- ciphertext en prod
  frequency TEXT,
  duration TEXT,
  instructions TEXT,
  issued_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Endpoints EHR

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/ehr/patient/:patientId` | doctor | Historia clínica completa del paciente |
| `POST` | `/api/ehr` | doctor | Crear registro de EHR (vinculado a consulta) |
| `PUT` | `/api/ehr/:id` | doctor | Actualizar registro EHR |
| `GET` | `/api/ehr/:id` | doctor | Detalle de un registro |

## Endpoints Prescriptions

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/prescriptions/patient/:patientId` | doctor | Recetas de un paciente |
| `POST` | `/api/prescriptions` | doctor | Emitir receta |
| `GET` | `/api/prescriptions/:id` | doctor/patient | Detalle de receta |
| `GET` | `/api/prescriptions/:id/pdf` | doctor/patient | Generar PDF de la receta |

---

## Domain

### Entidad `EhrRecord`

```typescript
export class EhrRecord {
  constructor(
    public readonly id: string,
    public readonly patientId: string,
    public readonly doctorId: string,
    public readonly consultationId: string | null,
    public readonly diagnosis: string | null,
    public readonly treatmentPlan: string | null,
    public readonly createdAt: Date,
  ) {}

  canBeModifiedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }
}
```

### Entidad `Prescription`

```typescript
export class Prescription {
  constructor(
    public readonly id: string,
    public readonly patientId: string,
    public readonly doctorId: string,
    public readonly consultationId: string | null,
    public readonly medicationName: string,
    public readonly dosage: string,
    public readonly frequency: string | null,
    public readonly duration: string | null,
    public readonly instructions: string | null,
    public readonly issuedDate: Date,
  ) {}

  canBeAccessedBy(actorId: string, actorRole: string): boolean {
    // El doctor dueño o el paciente dueño pueden acceder
    return this.doctorId === actorId || (actorRole === 'patient' && this.patientId === actorId);
  }
}
```

### Errores

- `EhrRecordNotFoundError`
- `PrescriptionNotFoundError`
- `AccessDeniedError`

---

## Use Cases

### `CreateEhrRecordUseCase`
- Crea registro vinculado a `consultation_id`
- Tests: crea correctamente, vincula a consulta

### `GetPatientEhrUseCase`
- Lista todos los registros de un paciente (verificar ownership del doctor)
- Tests: retorna historia, verifica acceso

### `CreatePrescriptionUseCase`
- Emite receta vinculada a consulta
- Tests: crea correctamente, falla si doctor no es dueño del paciente

### `GeneratePrescriptionPdfUseCase`
- Genera PDF usando `@react-pdf/renderer` con la plantilla del doctor
- Usa `doctor_templates` para encabezado, logo, firma
- Tests: genera PDF con datos correctos, falla si receta no existe

---

## Encriptación

Campos encriptados en EHR: `diagnosis`, `treatment_plan`
Campos encriptados en Prescriptions: `medication_name`, `dosage`

No hay `*_search_hash` en estos campos — no se busca por datos clínicos.

---

## Tests obligatorios

```typescript
// ehr-record.entity.spec.ts
describe('EhrRecord', () => {
  it('canBeModifiedBy returns true for owner doctor', ...);
  it('canBeModifiedBy returns false for other doctor', ...);
});

// prescription.entity.spec.ts
describe('Prescription', () => {
  it('canBeAccessedBy allows owner doctor', ...);
  it('canBeAccessedBy allows owner patient', ...);
  it('canBeAccessedBy denies other doctor', ...);
  it('canBeAccessedBy denies other patient', ...);
});

// create-prescription.use-case.spec.ts
describe('CreatePrescriptionUseCase', () => {
  it('creates prescription with all fields', ...);
  it('creates prescription with only required fields', ...);
  it('throws AccessDeniedError if doctor does not own patient', ...);
});
```
