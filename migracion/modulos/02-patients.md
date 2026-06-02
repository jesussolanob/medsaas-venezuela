# Módulo: Patients

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: CRUD de pacientes con encriptación de campos sensibles, búsqueda por hash, masking en lista.

---

## Tabla en BD

```sql
patients (
  id UUID PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES profiles(id),
  auth_user_id UUID,                  -- si el paciente tiene cuenta propia
  full_name TEXT NOT NULL,            -- almacena ciphertext en prod
  full_name_search_hash VARCHAR(64),  -- HMAC para búsqueda
  cedula TEXT,                        -- almacena ciphertext en prod
  cedula_search_hash VARCHAR(64),
  phone TEXT,                         -- almacena ciphertext en prod
  email TEXT,                         -- almacena ciphertext en prod
  source VARCHAR(50),                 -- 'booking' | 'manual' | 'import'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Endpoints

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/patients` | doctor | Lista paginada — datos enmascarados |
| `GET` | `/api/patients/:id` | doctor | Detalle del paciente — datos enmascarados |
| `GET` | `/api/patients/:id/reveal` | doctor | Datos reales + entrada en audit log |
| `POST` | `/api/patients` | doctor | Crear paciente |
| `PUT` | `/api/patients/:id` | doctor | Actualizar paciente |
| `DELETE` | `/api/patients/:id` | doctor | Eliminar paciente (soft delete) |
| `GET` | `/api/patients/search?q=` | doctor | Búsqueda por nombre o cédula (usa hash) |

**Query params de lista:**
- `page` (default: 1), `limit` (default: 20, max: 100)
- `source` — filtrar por origen

---

## Domain

### Entidad `Patient`

```typescript
export class Patient {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly fullName: string,         // plaintext en memoria
    public readonly cedula: string | null,
    public readonly phone: string | null,
    public readonly email: string | null,
    public readonly source: PatientSource,
    public readonly authUserId: string | null,
    public readonly createdAt: Date,
  ) {}

  canBeAccessedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  toMasked(): MaskedPatient {
    return {
      id: this.id,
      fullName: maskName(this.fullName),
      cedula: this.cedula ? maskCedula(this.cedula) : null,
      phone: this.phone ? maskPhone(this.phone) : null,
      email: this.email ? maskEmail(this.email) : null,
      source: this.source,
      createdAt: this.createdAt,
    };
  }
}
```

### Value Object `PatientSource`

```typescript
export type PatientSource = 'booking' | 'manual' | 'import';
```

### Errores

- `PatientNotFoundError`
- `PatientAlreadyExistsError` (misma cédula para el mismo doctor)

---

## Use Cases

### `CreatePatientUseCase`
- **Input:** `CreatePatientDto { doctorId, fullName, cedula?, phone?, email?, source }`
- **Validaciones:**
  - Si `cedula` viene, verificar que no exista otro paciente con `cedula_search_hash` igual para el mismo doctor
- **Acción:** crear paciente (el modelo Sequelize encripta en beforeCreate)
- **Tests:** crea correctamente, falla con cédula duplicada

### `GetPatientUseCase`
- **Input:** `{ patientId, doctorId }`
- **Validaciones:** paciente pertenece al doctor
- **Output:** `Patient` en plaintext (la decriptación la hace el hook Sequelize afterFind)
- **Tests:** retorna paciente, lanza `UnauthorizedError` si el doctor no es dueño

### `RevealPatientDataUseCase`
- **Input:** `{ patientId, doctorId, actorIp, actorUserAgent }`
- **Acción:** obtener paciente (plaintext) + insertar en `access_audit_log`
- **Tests:** retorna datos, inserta en audit log, rechaza si doctor incorrecto

### `SearchPatientsUseCase`
- **Input:** `{ query, doctorId, page, limit }`
- **Lógica:**
  - Si `query` parece cédula (empieza con V- o E-): buscar por `cedula_search_hash`
  - Si no: buscar por `full_name_search_hash` (aplicar hash al query también)
- **Output:** lista paginada con datos enmascarados
- **Tests:** busca por nombre, busca por cédula, retorna paginado

### `UpdatePatientUseCase`
- **Input:** `{ patientId, doctorId, ...fields }`
- **Acción:** actualizar (el modelo actualiza los hashes en beforeUpdate)
- **Tests:** actualiza, recalcula hashes, rechaza si doctor incorrecto

### `DeletePatientUseCase`
- **Input:** `{ patientId, doctorId }`
- **Acción:** soft delete (`deleted_at = NOW()`)
- **Tests:** marca como eliminado, rechaza si doctor incorrecto

---

## Sequelize Model — hooks de encriptación

```typescript
// infrastructure/database/models/patient.model.ts
@BeforeCreate
@BeforeUpdate
static async encryptFields(patient: PatientModel, options: { encryptionKey: Buffer, hmacSecret: string }) {
  if (patient.changed('fullName') && patient.fullName) {
    patient.fullNameSearchHash = hashForSearch(patient.fullName, options.hmacSecret);
    patient.fullName = encrypt(patient.fullName, options.encryptionKey);
  }
  if (patient.changed('cedula') && patient.cedula) {
    patient.cedulaSearchHash = hashForSearch(patient.cedula, options.hmacSecret);
    patient.cedula = encrypt(patient.cedula, options.encryptionKey);
  }
  if (patient.changed('phone') && patient.phone) {
    patient.phone = encrypt(patient.phone, options.encryptionKey);
  }
  if (patient.changed('email') && patient.email) {
    patient.email = encrypt(patient.email, options.encryptionKey);
  }
}

@AfterFind
static decryptFields(patients: PatientModel | PatientModel[], options: { encryptionKey: Buffer }) {
  const list = Array.isArray(patients) ? patients : patients ? [patients] : [];
  for (const p of list) {
    if (p.fullName) p.fullName = decrypt(p.fullName, options.encryptionKey);
    if (p.cedula) p.cedula = decrypt(p.cedula, options.encryptionKey);
    if (p.phone) p.phone = decrypt(p.phone, options.encryptionKey);
    if (p.email) p.email = decrypt(p.email, options.encryptionKey);
  }
}
```

---

## Tests obligatorios

```typescript
// patient.entity.spec.ts
describe('Patient entity', () => {
  it('canBeAccessedBy returns true for owner doctor', ...);
  it('canBeAccessedBy returns false for other doctor', ...);
  it('toMasked returns masked fields', ...);
  it('toMasked does not expose full cedula', ...);
});

// create-patient.use-case.spec.ts
describe('CreatePatientUseCase', () => {
  it('creates patient successfully', ...);
  it('throws PatientAlreadyExistsError for duplicate cedula', ...);
  it('creates patient without optional fields', ...);
});

// reveal-patient-data.use-case.spec.ts
describe('RevealPatientDataUseCase', () => {
  it('returns full plaintext data', ...);
  it('inserts entry in access_audit_log', ...);
  it('throws UnauthorizedError for wrong doctor', ...);
});

// patients.controller.spec.ts
describe('GET /api/patients', () => {
  it('returns masked patient list', ...);
  it('returns 401 without auth', ...);
  it('paginates correctly', ...);
});
describe('GET /api/patients/:id/reveal', () => {
  it('returns plaintext data', ...);
  it('creates audit log entry', ...);
});
```
