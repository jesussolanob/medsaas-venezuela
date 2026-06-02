import { ListPatientsUseCase } from './list-patients.use-case';
import type {
  IPatientRepository,
  PatientListResult,
} from '../../../domain/repositories/patient.repository';
import { Patient } from '../../../domain/entities/patient.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makePatient(): Patient {
  return Patient.create({
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez',
    createdAt: now,
    updatedAt: now,
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

describe('ListPatientsUseCase', () => {
  let useCase: ListPatientsUseCase;
  let repo: jest.Mocked<IPatientRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new ListPatientsUseCase(repo);
  });

  it('returns paginated list from the repository', async () => {
    const patient = makePatient();
    const listResult: PatientListResult = {
      items: [patient],
      total: 1,
      page: 1,
      limit: 20,
    };
    repo.list.mockResolvedValue(listResult);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, page: 1, limit: 20 });

    expect(result).toEqual(listResult);
    expect(repo.list).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      source: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('passes source filter to the repository', async () => {
    repo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await useCase.execute({ doctorId: DOCTOR_ID, source: 'booking', page: 1, limit: 20 });

    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ source: 'booking' }));
  });

  it('returns empty list when no patients exist', async () => {
    repo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    const result = await useCase.execute({ doctorId: DOCTOR_ID, page: 1, limit: 20 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
