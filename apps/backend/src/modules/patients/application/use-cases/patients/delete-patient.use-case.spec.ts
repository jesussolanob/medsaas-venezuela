import { DeletePatientUseCase } from './delete-patient.use-case';
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

describe('DeletePatientUseCase', () => {
  let useCase: DeletePatientUseCase;
  let repo: jest.Mocked<IPatientRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new DeletePatientUseCase(repo);
  });

  it('soft-deletes the patient when owned by the actor', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);
    repo.softDelete.mockResolvedValue(undefined);

    await useCase.execute({ patientId: patient.id, doctorId: DOCTOR_ID });

    expect(repo.softDelete).toHaveBeenCalledWith(patient.id, DOCTOR_ID);
  });

  it('throws PatientNotFoundError when patient does not exist', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute({ patientId: 'no-such-id', doctorId: DOCTOR_ID })).rejects.toThrow(
      PatientNotFoundError,
    );
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError when a different doctor tries to delete', async () => {
    const patient = makePatient();
    repo.findById.mockResolvedValue(patient);

    await expect(
      useCase.execute({ patientId: patient.id, doctorId: OTHER_DOCTOR }),
    ).rejects.toThrow(UnauthorizedError);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});
