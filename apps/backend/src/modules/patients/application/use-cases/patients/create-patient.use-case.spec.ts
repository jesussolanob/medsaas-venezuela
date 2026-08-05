import { CreatePatientUseCase } from './create-patient.use-case';
import { DuplicatePatientError } from '../../../domain/errors/duplicate-patient.error';
import { PatientEmailIsDoctorError } from '../../../domain/errors/patient-email-is-doctor.error';
import type { IPatientRepository } from '../../../domain/repositories/patient.repository';
import type { IDoctorProfileRepository } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { DoctorProfile } from '../../../../doctor-settings/domain/entities/doctor-profile.entity';
import { Patient } from '../../../domain/entities/patient.entity';
import type { ResolvePatientIdentityUseCase } from '../../../../patient-identities/application/use-cases/resolve-patient-identity.use-case';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const DOCTOR_EMAIL = 'doctor@example.com';
const now = new Date('2026-06-01T00:00:00Z');

function makePatient(overrides: Partial<ConstructorParameters<typeof Patient>[0]> = {}): Patient {
  return Patient.create({
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez',
    cedula: 'V-12345678',
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
  };
}

function makeMockCrypto() {
  return {
    encrypt: jest.fn((v: string) => `enc:${v}`),
    decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
    hashForSearch: jest.fn((v: string) => `hash:${v}`),
  };
}

function makeMockResolveIdentity(): jest.Mocked<ResolvePatientIdentityUseCase> {
  return { execute: jest.fn().mockResolvedValue('identity-uuid-001') } as never;
}

describe('CreatePatientUseCase', () => {
  let useCase: CreatePatientUseCase;
  let repo: jest.Mocked<IPatientRepository>;
  let doctorProfileRepo: jest.Mocked<IDoctorProfileRepository>;
  let crypto: ReturnType<typeof makeMockCrypto>;
  let resolveIdentity: jest.Mocked<ResolvePatientIdentityUseCase>;

  beforeEach(() => {
    repo = makeMockRepo();
    doctorProfileRepo = makeMockDoctorProfileRepo();
    crypto = makeMockCrypto();
    resolveIdentity = makeMockResolveIdentity();
    useCase = new CreatePatientUseCase(repo, doctorProfileRepo, crypto as never, resolveIdentity);
    // Default: doctor profile found with known email
    doctorProfileRepo.findByDoctorId.mockResolvedValue(makeDoctorProfile());
  });

  it('creates a patient successfully', async () => {
    const saved = makePatient();
    repo.findByCedulaHash.mockResolvedValue(null);
    repo.save.mockResolvedValue(saved);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      fullName: 'Juan Pérez',
      cedula: 'V-12345678',
    });

    expect(result).toBe(saved);
    expect(repo.findByCedulaHash).toHaveBeenCalledWith('hash:V-12345678', DOCTOR_ID);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('resolves and sets identityId when cedula is present', async () => {
    const saved = makePatient();
    repo.findByCedulaHash.mockResolvedValue(null);
    repo.save.mockResolvedValue(saved);

    await useCase.execute({
      doctorId: DOCTOR_ID,
      fullName: 'Juan Pérez',
      cedula: 'V-12345678',
    });

    expect(resolveIdentity.execute).toHaveBeenCalledWith('V-12345678');
    const savedArg = repo.save.mock.calls[0]?.[0];
    expect(savedArg?.identityId).toBe('identity-uuid-001');
  });

  it('passes null identityId when cedula is absent', async () => {
    resolveIdentity.execute.mockResolvedValue(null);
    const saved = makePatient({ cedula: null });
    repo.save.mockResolvedValue(saved);

    await useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Anónimo' });

    const savedArg = repo.save.mock.calls[0]?.[0];
    expect(savedArg?.identityId).toBeNull();
  });

  it('creates a patient without optional fields', async () => {
    const saved = makePatient({ cedula: null });
    repo.save.mockResolvedValue(saved);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      fullName: 'Anónimo',
    });

    expect(result).toBe(saved);
    expect(repo.findByCedulaHash).not.toHaveBeenCalled();
  });

  it('throws DuplicatePatientError (409) when the same doctor already has a patient with the same cédula', async () => {
    repo.findByCedulaHash.mockResolvedValue(makePatient());

    const error = await useCase
      .execute({ doctorId: DOCTOR_ID, fullName: 'Otro', cedula: 'V-12345678' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DuplicatePatientError);
    expect((error as DuplicatePatientError).code).toBe('PATIENT_DUPLICATE');
    expect((error as DuplicatePatientError).httpStatus).toBe(409);
  });

  it('does NOT throw when a DIFFERENT doctor has a patient with the same cédula (scoped per doctor)', async () => {
    // findByCedulaHash is scoped to doctorId — a different doctor's patient won't be found.
    repo.findByCedulaHash.mockResolvedValue(null);
    const saved = makePatient({ doctorId: 'other-doctor-uuid' });
    repo.save.mockResolvedValue(saved);

    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Nuevo Paciente', cedula: 'V-12345678' }),
    ).resolves.toBeDefined();

    expect(repo.findByCedulaHash).toHaveBeenCalledWith('hash:V-12345678', DOCTOR_ID);
  });

  it('does not check for duplicate when cédula is absent (null)', async () => {
    const saved = makePatient({ cedula: null });
    repo.save.mockResolvedValue(saved);

    await useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Sin cédula' });

    expect(repo.findByCedulaHash).not.toHaveBeenCalled();
  });

  it('does not check for duplicate when cédula is not provided (undefined)', async () => {
    const saved = makePatient({ cedula: null });
    repo.save.mockResolvedValue(saved);

    await useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Sin cédula también' });

    expect(repo.findByCedulaHash).not.toHaveBeenCalled();
  });

  it('passes all optional fields to the saved patient', async () => {
    const saved = makePatient({ phone: '+58412000000', email: 'patient@example.com' });
    repo.findByCedulaHash.mockResolvedValue(null);
    repo.save.mockResolvedValue(saved);

    await useCase.execute({
      doctorId: DOCTOR_ID,
      fullName: 'Juan',
      cedula: 'V-12345678',
      phone: '+58412000000',
      email: 'patient@example.com',
    });

    const callArg = repo.save.mock.calls[0]?.[0];
    expect(callArg?.phone).toBe('+58412000000');
    expect(callArg?.email).toBe('patient@example.com');
  });

  it('passes emergencyContactRelationship to the saved patient when provided', async () => {
    repo.findByCedulaHash.mockResolvedValue(null);
    const saved = makePatient();
    repo.save.mockResolvedValue(saved);

    await useCase.execute({
      doctorId: DOCTOR_ID,
      fullName: 'Juan',
      cedula: 'V-12345678',
      emergencyContactRelationship: 'Esposo',
    });

    const callArg = repo.save.mock.calls[0]?.[0];
    expect(callArg?.emergencyContactRelationship).toBe('Esposo');
  });

  it('defaults emergencyContactRelationship to null when not provided', async () => {
    const saved = makePatient({ cedula: null });
    repo.save.mockResolvedValue(saved);

    await useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Anónimo' });

    const callArg = repo.save.mock.calls[0]?.[0];
    expect(callArg?.emergencyContactRelationship).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Doctor-email guard (replaces old per-doctor email-duplicate guard)
  // ---------------------------------------------------------------------------

  it('throws PatientEmailIsDoctorError (409) when the patient email matches the doctor own email', async () => {
    resolveIdentity.execute.mockResolvedValue(null);

    const error = await useCase
      .execute({ doctorId: DOCTOR_ID, fullName: 'Otro', email: DOCTOR_EMAIL })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PatientEmailIsDoctorError);
    expect((error as PatientEmailIsDoctorError).code).toBe('PATIENT_EMAIL_IS_DOCTOR');
    expect((error as PatientEmailIsDoctorError).httpStatus).toBe(409);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('is case-insensitive when comparing patient email to doctor email', async () => {
    resolveIdentity.execute.mockResolvedValue(null);

    const error = await useCase
      .execute({ doctorId: DOCTOR_ID, fullName: 'Otro', email: 'DOCTOR@EXAMPLE.COM' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PatientEmailIsDoctorError);
  });

  it('trims whitespace when comparing emails', async () => {
    resolveIdentity.execute.mockResolvedValue(null);

    const error = await useCase
      .execute({ doctorId: DOCTOR_ID, fullName: 'Otro', email: '  doctor@example.com  ' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PatientEmailIsDoctorError);
  });

  it('allows a DIFFERENT email to be used for a patient', async () => {
    const saved = makePatient({ cedula: null, email: 'patient@example.com' });
    repo.save.mockResolvedValue(saved);

    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Paciente', email: 'patient@example.com' }),
    ).resolves.toBeDefined();

    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('allows multiple patients to share the same email (no per-doctor email-duplicate guard)', async () => {
    const saved = makePatient({ cedula: null, email: 'shared@example.com' });
    repo.save.mockResolvedValue(saved);

    // Should NOT call findByEmailHash and should succeed
    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Hermano', email: 'shared@example.com' }),
    ).resolves.toBeDefined();

    expect(repo.findByEmailHash).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('does not check doctor email when email is absent', async () => {
    const saved = makePatient({ cedula: null });
    repo.save.mockResolvedValue(saved);

    await useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Sin email' });

    // doctorProfileRepo should not be called when no email is provided
    expect(doctorProfileRepo.findByDoctorId).not.toHaveBeenCalled();
  });

  it('does not throw if doctor profile is not found (graceful degradation)', async () => {
    doctorProfileRepo.findByDoctorId.mockResolvedValue(null);
    const saved = makePatient({ cedula: null, email: DOCTOR_EMAIL });
    repo.save.mockResolvedValue(saved);

    // If no doctor profile is found, the guard is skipped (safe default)
    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Paciente', email: DOCTOR_EMAIL }),
    ).resolves.toBeDefined();
  });
});
