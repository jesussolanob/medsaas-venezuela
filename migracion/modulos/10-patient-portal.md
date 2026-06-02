# Módulo: Patient Portal

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: portal del paciente autenticado — dashboard, citas, recetas, mensajes, perfil.

---

## Endpoints

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/patient/dashboard` | patient | Dashboard: próxima cita + paquetes activos |
| `GET` | `/api/patient/appointments` | patient | Historial de citas del paciente |
| `GET` | `/api/patient/packages` | patient | Paquetes activos con info del doctor |
| `GET` | `/api/patient/prescriptions` | patient | Recetas del paciente |
| `GET` | `/api/patient/prescriptions/:id/pdf` | patient | PDF de una receta |
| `GET` | `/api/patient/reports` | patient | Informes médicos |
| `GET` | `/api/patient/messages` | patient | Mensajes con el doctor |
| `POST` | `/api/patient/messages` | patient | Enviar mensaje al doctor |
| `GET` | `/api/patient/profile` | patient | Perfil del paciente |
| `PUT` | `/api/patient/profile` | patient | Actualizar datos personales |

---

## Domain

### Regla de acceso

El paciente **solo puede ver datos asociados a su `auth_user_id`**. Nunca datos de otro paciente.

```typescript
// En todos los use cases del portal del paciente:
if (patient.authUserId !== currentUserId) throw new UnauthorizedError();
```

### Entidad `PatientDashboard`

```typescript
export class PatientDashboard {
  constructor(
    public readonly nextAppointment: AppointmentSummary | null,
    public readonly activePackages: PackageSummary[],
    public readonly totalAppointments: number,
  ) {}
}
```

---

## Use Cases

### `GetPatientDashboardUseCase`
- **Input:** `{ authUserId }`
- **Lógica:**
  1. Encontrar el `patient_id` asociado al `auth_user_id`
  2. Buscar la próxima cita (status = 'scheduled' o 'confirmed', scheduled_at > NOW())
  3. Buscar paquetes activos con el nombre del doctor y link de booking
- **Tests:** retorna próxima cita, retorna paquetes activos, maneja caso sin citas

### `GetPatientAppointmentsUseCase`
- Lista citas del paciente ordenadas por fecha descendente
- Tests: retorna citas, pagina correctamente

### `GetPatientPackagesUseCase`
- Incluir info del doctor (nombre, link de booking) para el link "Agendar con este doctor"
- Tests: incluye info del doctor, filtra solo paquetes activos

### `SendPatientMessageUseCase`
- **Input:** `{ authUserId, doctorId, body }`
- Insertar en `patient_messages` con `direction = 'patient_to_doctor'`
- Tests: inserta mensaje correctamente

### `GetPatientMessagesUseCase`
- Retorna conversación del paciente con un doctor específico
- Tests: retorna mensajes en orden cronológico

---

## Tests obligatorios

```typescript
// get-patient-dashboard.use-case.spec.ts
describe('GetPatientDashboardUseCase', () => {
  it('returns next upcoming appointment', ...);
  it('returns null when no upcoming appointments', ...);
  it('returns active packages with doctor info', ...);
  it('throws UnauthorizedError for wrong patient', ...);
});

// get-patient-packages.use-case.spec.ts
describe('GetPatientPackagesUseCase', () => {
  it('includes doctor name and booking link', ...);
  it('only returns active packages', ...);
});
```
