import { SearchPatientsUseCase } from './search-patients.use-case';
import type { IPatientRepository } from '../../../domain/repositories/patient.repository';
import { Patient } from '../../../domain/entities/patient.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makePatient(overrides: Partial<ConstructorParameters<typeof Patient>[0]> = {}): Patient {
  return Patient.create({
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez',
    cedula: 'V-12345678',
    email: 'juan@example.com',
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

describe('SearchPatientsUseCase', () => {
  let useCase: SearchPatientsUseCase;
  let repo: jest.Mocked<IPatientRepository>;
  let crypto: ReturnType<typeof makeMockCrypto>;

  beforeEach(() => {
    repo = makeMockRepo();
    crypto = makeMockCrypto();
    useCase = new SearchPatientsUseCase(repo, crypto as never);
  });

  it('searches by cédula hash when query starts with V-', async () => {
    const patient = makePatient();
    repo.findByCedulaHash.mockResolvedValue(patient);

    const result = await useCase.execute({
      query: 'V-12345678',
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 20,
    });

    expect(repo.findByCedulaHash).toHaveBeenCalledWith('hash:V-12345678', DOCTOR_ID);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toBe(patient);
  });

  it('searches by cédula hash when query starts with E-', async () => {
    repo.findByCedulaHash.mockResolvedValue(null);

    const result = await useCase.execute({
      query: 'E-99887766',
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 20,
    });

    expect(repo.findByCedulaHash).toHaveBeenCalledWith('hash:E-99887766', DOCTOR_ID);
    expect(result.items).toHaveLength(0);
  });

  it('searches by email hash when query looks like an email', async () => {
    const patient = makePatient();
    repo.findByEmailHash.mockResolvedValue(patient);

    const result = await useCase.execute({
      query: 'juan@example.com',
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 20,
    });

    expect(repo.findByEmailHash).toHaveBeenCalledWith('hash:juan@example.com', DOCTOR_ID);
    expect(result.items).toHaveLength(1);
  });

  it('searches by name substring for generic queries', async () => {
    const patients = [
      makePatient({ id: 'p1', fullName: 'Juan Pérez' }),
      makePatient({ id: 'p2', fullName: 'María García' }),
    ];
    repo.findAllByDoctor.mockResolvedValue(patients);

    const result = await useCase.execute({
      query: 'juan',
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 20,
    });

    expect(repo.findAllByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.fullName).toBe('Juan Pérez');
  });

  it('paginates name-based search results', async () => {
    const patients = Array.from({ length: 25 }, (_, i) =>
      makePatient({ id: `p${i}`, fullName: `Paciente ${i}` }),
    );
    repo.findAllByDoctor.mockResolvedValue(patients);

    const page1 = await useCase.execute({
      query: 'Paciente',
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 10,
    });
    const page2 = await useCase.execute({
      query: 'Paciente',
      doctorId: DOCTOR_ID,
      page: 2,
      limit: 10,
    });

    expect(page1.items).toHaveLength(10);
    expect(page2.items).toHaveLength(10);
    expect(page1.total).toBe(25);
  });

  it('returns empty result when no patients match', async () => {
    repo.findAllByDoctor.mockResolvedValue([]);
    const result = await useCase.execute({
      query: 'nada',
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 20,
    });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
