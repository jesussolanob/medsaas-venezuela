import { CreatePatientUseCase } from './create-patient.use-case';
import { DuplicatePatientError } from '../../../domain/errors/duplicate-patient.error';
import type { IPatientRepository } from '../../../domain/repositories/patient.repository';
import { Patient } from '../../../domain/entities/patient.entity';
import type { ResolvePatientIdentityUseCase } from '../../../../patient-identities/application/use-cases/resolve-patient-identity.use-case';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
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
  let crypto: ReturnType<typeof makeMockCrypto>;
  let resolveIdentity: jest.Mocked<ResolvePatientIdentityUseCase>;

  beforeEach(() => {
    repo = makeMockRepo();
    crypto = makeMockCrypto();
    resolveIdentity = makeMockResolveIdentity();
    useCase = new CreatePatientUseCase(repo, crypto as never, resolveIdentity);
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
    const saved = makePatient({ phone: '+58412000000', email: 'j@example.com' });
    repo.findByCedulaHash.mockResolvedValue(null);
    repo.findByEmailHash.mockResolvedValue(null);
    repo.save.mockResolvedValue(saved);

    await useCase.execute({
      doctorId: DOCTOR_ID,
      fullName: 'Juan',
      cedula: 'V-12345678',
      phone: '+58412000000',
      email: 'j@example.com',
    });

    const callArg = repo.save.mock.calls[0]?.[0];
    expect(callArg?.phone).toBe('+58412000000');
    expect(callArg?.email).toBe('j@example.com');
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
  // Email duplicate guard
  // ---------------------------------------------------------------------------

  it('throws DuplicatePatientError (409) when the same doctor already has a patient with the same email', async () => {
    resolveIdentity.execute.mockResolvedValue(null);
    repo.findByEmailHash.mockResolvedValue(makePatient({ cedula: null, email: 'dup@example.com' }));

    const error = await useCase
      .execute({ doctorId: DOCTOR_ID, fullName: 'Otro', email: 'dup@example.com' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DuplicatePatientError);
    expect((error as DuplicatePatientError).code).toBe('PATIENT_DUPLICATE');
    expect((error as DuplicatePatientError).httpStatus).toBe(409);
    expect(repo.findByEmailHash).toHaveBeenCalledWith('hash:dup@example.com', DOCTOR_ID);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not check email duplicate when email is absent', async () => {
    const saved = makePatient({ cedula: null });
    repo.save.mockResolvedValue(saved);

    await useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Sin email' });

    expect(repo.findByEmailHash).not.toHaveBeenCalled();
  });

  it('does NOT throw email duplicate when a DIFFERENT doctor has a patient with the same email (scoped per doctor)', async () => {
    // findByEmailHash is scoped to doctorId — another doctor's patient won't be returned.
    resolveIdentity.execute.mockResolvedValue(null);
    repo.findByEmailHash.mockResolvedValue(null);
    const saved = makePatient({ cedula: null, email: 'shared@example.com' });
    repo.save.mockResolvedValue(saved);

    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Nuevo', email: 'shared@example.com' }),
    ).resolves.toBeDefined();

    expect(repo.findByEmailHash).toHaveBeenCalledWith('hash:shared@example.com', DOCTOR_ID);
  });

  it('checks email duplicate independently of cédula guard', async () => {
    // Both cédula and email provided; cédula guard passes, email guard fires.
    repo.findByCedulaHash.mockResolvedValue(null);
    repo.findByEmailHash.mockResolvedValue(makePatient({ email: 'taken@example.com' }));

    const error = await useCase
      .execute({
        doctorId: DOCTOR_ID,
        fullName: 'Otro',
        cedula: 'V-99999999',
        email: 'taken@example.com',
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DuplicatePatientError);
    expect((error as DuplicatePatientError).httpStatus).toBe(409);
    expect(repo.findByCedulaHash).toHaveBeenCalledWith('hash:V-99999999', DOCTOR_ID);
    expect(repo.findByEmailHash).toHaveBeenCalledWith('hash:taken@example.com', DOCTOR_ID);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
