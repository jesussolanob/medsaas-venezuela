import { CreatePatientUseCase } from './create-patient.use-case';
import { PatientAlreadyExistsError } from '../../../domain/errors/patient-already-exists.error';
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

  it('throws PatientAlreadyExistsError when cédula hash matches an existing patient', async () => {
    repo.findByCedulaHash.mockResolvedValue(makePatient());

    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Otro', cedula: 'V-12345678' }),
    ).rejects.toThrow(PatientAlreadyExistsError);
  });

  it('does not check for duplicate when cédula is absent', async () => {
    const saved = makePatient({ cedula: null });
    repo.save.mockResolvedValue(saved);

    await useCase.execute({ doctorId: DOCTOR_ID, fullName: 'Sin cédula' });

    expect(repo.findByCedulaHash).not.toHaveBeenCalled();
  });

  it('passes all optional fields to the saved patient', async () => {
    const saved = makePatient({ phone: '+58412000000', email: 'j@example.com' });
    repo.findByCedulaHash.mockResolvedValue(null);
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
});
