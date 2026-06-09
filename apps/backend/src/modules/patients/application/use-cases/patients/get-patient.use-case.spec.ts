import { GetPatientUseCase } from './get-patient.use-case';
import { PatientNotFoundError } from '../../../domain/errors/patient-not-found.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import type { IPatientRepository } from '../../../domain/repositories/patient.repository';
import { Patient } from '../../../domain/entities/patient.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'ffffffff-0000-0000-0000-000000000099';
const now = new Date('2026-06-01T00:00:00Z');

function makePatient(): Patient {
  return Patient.create({
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez',
    cedula: 'V-12345678',
    phone: '+58412345678',
    email: 'juan@example.com',
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

function defaultInput(
  overrides: Partial<Parameters<GetPatientUseCase['execute']>[0]> = {},
): Parameters<GetPatientUseCase['execute']>[0] {
  return {
    patientId: 'aaaaaaaa-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    actorId: DOCTOR_ID,
    actorRole: 'doctor',
    ipAddress: '127.0.0.1',
    userAgent: 'Jest/1.0',
    ...overrides,
  };
}

describe('GetPatientUseCase', () => {
  let useCase: GetPatientUseCase;
  let repo: jest.Mocked<IPatientRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new GetPatientUseCase(repo);
  });

  it('returns the patient when found and owned by the doctor', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.logReveal.mockResolvedValue(undefined);

    const result = await useCase.execute(defaultInput());
    expect(result).toBe(patient);
  });

  it('inserts exactly one audit row with fieldRevealed=full_record after ownership OK', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.logReveal.mockResolvedValue(undefined);

    await useCase.execute(defaultInput());

    expect(repo.logReveal).toHaveBeenCalledTimes(1);
    expect(repo.logReveal).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: DOCTOR_ID,
        actorRole: 'doctor',
        patientId: patient.id,
        fieldRevealed: 'full_record',
        ipAddress: '127.0.0.1',
        userAgent: 'Jest/1.0',
      }),
    );
  });

  it('passes ipAddress and userAgent to the audit entry', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.logReveal.mockResolvedValue(undefined);

    await useCase.execute(defaultInput({ ipAddress: '10.0.0.5', userAgent: 'Mozilla/5.0' }));

    const call = repo.logReveal.mock.calls[0]?.[0];
    expect(call?.ipAddress).toBe('10.0.0.5');
    expect(call?.userAgent).toBe('Mozilla/5.0');
  });

  it('still returns the patient when the audit log insert fails (fire-and-forget)', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.logReveal.mockRejectedValue(new Error('DB connection lost'));

    const result = await useCase.execute(defaultInput());
    expect(result).toBe(patient);
  });

  it('throws PatientNotFoundError when patient does not exist — no audit row', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute(defaultInput({ patientId: 'unknown-id' }))).rejects.toThrow(
      PatientNotFoundError,
    );
    expect(repo.logReveal).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError when a different doctor requests the patient — no audit row', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);

    await expect(
      useCase.execute(defaultInput({ doctorId: OTHER_DOCTOR, actorId: OTHER_DOCTOR })),
    ).rejects.toThrow(UnauthorizedError);
    expect(repo.logReveal).not.toHaveBeenCalled();
  });
});
