import { RevealPatientDataUseCase } from './reveal-patient-data.use-case';
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

function defaultInput(overrides: Partial<Parameters<RevealPatientDataUseCase['execute']>[0]> = {}) {
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

describe('RevealPatientDataUseCase', () => {
  let useCase: RevealPatientDataUseCase;
  let repo: jest.Mocked<IPatientRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new RevealPatientDataUseCase(repo);
  });

  it('returns full plaintext patient data', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.logReveal.mockResolvedValue(undefined);

    const result = await useCase.execute(defaultInput());

    expect(result.fullName).toBe('Juan Pérez');
    expect(result.cedula).toBe('V-12345678');
    expect(result.phone).toBe('+58412345678');
    expect(result.email).toBe('juan@example.com');
  });

  it('inserts audit log entries — one per PII field revealed', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.logReveal.mockResolvedValue(undefined);

    await useCase.execute(defaultInput());

    // Spec: full_name, cedula, phone, email = 4 fields
    expect(repo.logReveal).toHaveBeenCalledTimes(4);

    const fields = repo.logReveal.mock.calls.map((c) => c[0]?.fieldRevealed);
    expect(fields).toContain('full_name');
    expect(fields).toContain('cedula');
    expect(fields).toContain('phone');
    expect(fields).toContain('email');
  });

  it('passes actor and IP information to the audit log', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.logReveal.mockResolvedValue(undefined);

    await useCase.execute(defaultInput({ ipAddress: '192.168.1.1', userAgent: 'TestAgent/2' }));

    const firstCall = repo.logReveal.mock.calls[0]?.[0];
    expect(firstCall?.actorId).toBe(DOCTOR_ID);
    expect(firstCall?.actorRole).toBe('doctor');
    expect(firstCall?.ipAddress).toBe('192.168.1.1');
    expect(firstCall?.userAgent).toBe('TestAgent/2');
  });

  it('throws PatientNotFoundError when patient does not exist', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute(defaultInput())).rejects.toThrow(PatientNotFoundError);
    expect(repo.logReveal).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError when a different doctor requests the reveal', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);

    await expect(
      useCase.execute(defaultInput({ doctorId: OTHER_DOCTOR, actorId: OTHER_DOCTOR })),
    ).rejects.toThrow(UnauthorizedError);
    expect(repo.logReveal).not.toHaveBeenCalled();
  });
});
