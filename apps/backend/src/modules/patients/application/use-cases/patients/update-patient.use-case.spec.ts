import { UpdatePatientUseCase } from './update-patient.use-case';
import { PatientNotFoundError } from '../../../domain/errors/patient-not-found.error';
import { PatientEmailIsDoctorError } from '../../../domain/errors/patient-email-is-doctor.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import type { IPatientRepository } from '../../../domain/repositories/patient.repository';
import type { IDoctorProfileRepository } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { DoctorProfile } from '../../../../doctor-settings/domain/entities/doctor-profile.entity';
import { Patient } from '../../../domain/entities/patient.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'ffffffff-0000-0000-0000-000000000099';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const DOCTOR_EMAIL = 'doctor@example.com';
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

function makeDoctorProfile(email = DOCTOR_EMAIL): DoctorProfile {
  return DoctorProfile.create({
    id: DOCTOR_ID,
    fullName: 'Dr. García',
    email,
    specialty: null,
    professionalTitle: null,
    clinicId: null,
    clinicRole: null,
    paymentMethods: [],
    paymentDetails: {},
    allowsOnline: false,
    officeAddress: null,
    city: null,
    avatarUrl: null,
    plan: null,
    subscriptionStatus: null,
    logoUrl: null,
    signatureUrl: null,
    licenseNumber: null,
    phone: null,
    currencyMode: null,
    customRate: null,
    customRateLabel: null,
    cedula: null,
    birthDate: null,
    onboardingCompleted: true,
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

function makeMockDoctorProfileRepo(): jest.Mocked<IDoctorProfileRepository> {
  return {
    findByDoctorId: jest.fn(),
    update: jest.fn(),
    updateExchangeRate: jest.fn(),
    markOnboardingCompleted: jest.fn().mockResolvedValue(undefined),
    updateBlocksLayout: jest.fn().mockResolvedValue(undefined),
    countUpcomingAppointments: jest.fn().mockResolvedValue(0),
    deactivateOwnAccount: jest.fn().mockResolvedValue(undefined),
    findPlanSnapshot: jest.fn().mockResolvedValue(null),
    scheduleOwnAccountDeactivation: jest.fn().mockResolvedValue(undefined),
    applyExpiredScheduledDeactivations: jest.fn().mockResolvedValue(0),
  };
}

describe('UpdatePatientUseCase', () => {
  let useCase: UpdatePatientUseCase;
  let repo: jest.Mocked<IPatientRepository>;
  let doctorProfileRepo: jest.Mocked<IDoctorProfileRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    doctorProfileRepo = makeMockDoctorProfileRepo();
    useCase = new UpdatePatientUseCase(repo, doctorProfileRepo);
    doctorProfileRepo.findByDoctorId.mockResolvedValue(makeDoctorProfile());
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

  // ---------------------------------------------------------------------------
  // Doctor-email guard
  // ---------------------------------------------------------------------------

  it('throws PatientEmailIsDoctorError (409) when updating email to the doctor own email', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);

    const error = await useCase
      .execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID, email: DOCTOR_EMAIL })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PatientEmailIsDoctorError);
    expect((error as PatientEmailIsDoctorError).code).toBe('PATIENT_EMAIL_IS_DOCTOR');
    expect((error as PatientEmailIsDoctorError).httpStatus).toBe(409);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('is case-insensitive when comparing email to doctor email on update', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);

    const error = await useCase
      .execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID, email: 'DOCTOR@EXAMPLE.COM' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PatientEmailIsDoctorError);
  });

  it('does not check doctor email when email is not being updated (undefined)', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(patient);

    await useCase.execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID, fullName: 'Nuevo Nombre' });

    expect(doctorProfileRepo.findByDoctorId).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it('does not throw doctor-email guard when email is being cleared to null', async () => {
    const patient = makePatient({ email: 'old@example.com' });
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(patient);

    // Clearing email to null should not trigger the doctor-email guard
    await expect(
      useCase.execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID, email: null }),
    ).resolves.toBeDefined();

    expect(doctorProfileRepo.findByDoctorId).not.toHaveBeenCalled();
  });

  it('allows a different email to be set on a patient', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(patient);

    await expect(
      useCase.execute({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        email: 'different@example.com',
      }),
    ).resolves.toBeDefined();

    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it('does not throw if doctor profile is not found during email check (graceful degradation)', async () => {
    doctorProfileRepo.findByDoctorId.mockResolvedValue(null);
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.update.mockResolvedValue(patient);

    await expect(
      useCase.execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID, email: DOCTOR_EMAIL }),
    ).resolves.toBeDefined();
  });
});
