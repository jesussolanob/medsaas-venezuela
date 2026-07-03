import { UpdatePatientUseCase } from './update-patient.use-case';
import { PatientNotFoundError } from '../../../domain/errors/patient-not-found.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import type { IPatientRepository } from '../../../domain/repositories/patient.repository';
import { Patient } from '../../../domain/entities/patient.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'ffffffff-0000-0000-0000-000000000099';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makePatient(overrides: Partial<ConstructorParameters<typeof Patient>[0]> = {}): Patient {
  return Patient.create({
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeMockRepo(): jest.Mocked<IPatientRepository> {
  return {
    findById: jest.fn(),
    findByCedulaHash: jest.fn(),
    findByEmailHash: jest.fn(),
    list: jest.fn(),
    findAllByDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    logReveal: jest.fn(),
  };
}

describe('UpdatePatientUseCase', () => {
  let useCase: UpdatePatientUseCase;
  let repo: jest.Mocked<IPatientRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new UpdatePatientUseCase(repo);
  });

  it('updates the patient when owned by the doctor', async () => {
    const original = makePatient();
    const updated = makePatient({ fullName: 'Juan García' });
    repo.findById.mockResolvedValue(original);
    repo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      fullName: 'Juan García',
    });

    expect(result.fullName).toBe('Juan García');
    expect(repo.update).toHaveBeenCalledWith(
      PATIENT_ID,
      DOCTOR_ID,
      expect.objectContaining({ fullName: 'Juan García' }),
    );
  });

  it('throws PatientNotFoundError when the patient does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ patientId: 'no-such-id', doctorId: DOCTOR_ID })).rejects.toThrow(
      PatientNotFoundError,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError when a different doctor tries to update', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);

    await expect(
      useCase.execute({ patientId: PATIENT_ID, doctorId: OTHER_DOCTOR }),
    ).rejects.toThrow(UnauthorizedError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('passes all provided fields to the repository', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(patient);

    await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      fullName: 'Juan García',
      cedula: 'V-87654321',
      phone: '+584120000000',
      email: 'new@example.com',
      source: 'booking',
      birthDate: '1990-05-15',
      age: 35,
      sex: 'male',
      bloodType: 'O+',
      allergies: 'Penicilina',
      chronicConditions: 'Diabetes',
      address: 'Calle 1',
      city: 'Caracas',
      emergencyContactName: 'María',
      emergencyContactPhone: '+584140000000',
      emergencyContactRelationship: 'Esposa',
      notes: 'Updated notes',
    });

    expect(repo.update).toHaveBeenCalledWith(
      PATIENT_ID,
      DOCTOR_ID,
      expect.objectContaining({
        fullName: 'Juan García',
        cedula: 'V-87654321',
        phone: '+584120000000',
        email: 'new@example.com',
        source: 'booking',
        birthDate: '1990-05-15',
        age: 35,
        sex: 'male',
        bloodType: 'O+',
        allergies: 'Penicilina',
        chronicConditions: 'Diabetes',
        address: 'Calle 1',
        city: 'Caracas',
        emergencyContactName: 'María',
        emergencyContactPhone: '+584140000000',
        emergencyContactRelationship: 'Esposa',
        notes: 'Updated notes',
      }),
    );
  });

  it('passes emergencyContactRelationship to the repository when provided', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(patient);

    await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      emergencyContactRelationship: 'Madre',
    });

    expect(repo.update).toHaveBeenCalledWith(
      PATIENT_ID,
      DOCTOR_ID,
      expect.objectContaining({ emergencyContactRelationship: 'Madre' }),
    );
  });

  it('allows clearing emergencyContactRelationship to null', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(patient);

    await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      emergencyContactRelationship: null,
    });

    expect(repo.update).toHaveBeenCalledWith(
      PATIENT_ID,
      DOCTOR_ID,
      expect.objectContaining({ emergencyContactRelationship: null }),
    );
  });

  it('does NOT include emergencyContactRelationship in the update payload when omitted', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(patient);

    await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      fullName: 'Solo Nombre',
    });

    const payload = repo.update.mock.calls[0]?.[2] ?? {};
    expect(payload).not.toHaveProperty('emergencyContactRelationship');
  });

  it('only sends fields that were explicitly provided — omits undefined keys', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(patient);

    // Only send fullName — all other fields should NOT appear in the update payload
    await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      fullName: 'Solo Nombre',
    });

    // repo.update signature: (id, doctorId, fields) — fields is at index 2
    const payload = repo.update.mock.calls[0]?.[2] ?? {};
    expect(payload).toHaveProperty('fullName', 'Solo Nombre');
    // Verify undefined fields are not present (not just falsy — completely absent)
    expect(Object.keys(payload)).toEqual(['fullName']);
  });

  it('allows clearing nullable fields to null', async () => {
    const patient = makePatient({ cedula: 'V-12345678', phone: '+58412345678' });
    const updated = makePatient({ cedula: null, phone: null });
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(updated);

    await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      cedula: null,
      phone: null,
    });

    expect(repo.update).toHaveBeenCalledWith(
      PATIENT_ID,
      DOCTOR_ID,
      expect.objectContaining({ cedula: null, phone: null }),
    );
  });
});
