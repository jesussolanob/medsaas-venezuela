import { UpdatePatientProfileUseCase } from './update-patient-profile.use-case';
import type { IPatientPortalRepository } from '../../../domain/repositories/patient-portal.repository';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import { PatientPortalAccessDeniedError } from '../../../domain/errors/patient-portal-access-denied.error';

function makePatient(id: string, authUserId: string): Patient {
  return Patient.create({
    id,
    doctorId: 'doctor-1',
    authUserId,
    fullName: 'Juan Pérez',
    address: 'Calle 1',
    city: 'Caracas',
    notes: 'Notas previas',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('UpdatePatientProfileUseCase', () => {
  let useCase: UpdatePatientProfileUseCase;
  let mockRepo: jest.Mocked<IPatientPortalRepository>;

  beforeEach(() => {
    mockRepo = {
      findPatientIdsByAuthUserId: jest.fn(),
      findPatientsByAuthUserId: jest.fn(),
      findPatientByIdAndAuthUserId: jest.fn(),
      updatePatient: jest.fn(),
      findNextAppointment: jest.fn(),
      countAppointments: jest.fn(),
      listAppointments: jest.fn(),
      findActivePackages: jest.fn(),
      listPackages: jest.fn(),
      listPrescriptions: jest.fn(),
      listMessages: jest.fn(),
      insertMessage: jest.fn(),
      findPatientIdForDoctorRelationship: jest.fn(),
    } as jest.Mocked<IPatientPortalRepository>;

    useCase = new UpdatePatientProfileUseCase(mockRepo);
  });

  it('updates patient profile successfully', async () => {
    const updated = makePatient('p-1', 'auth-1');
    mockRepo.updatePatient.mockResolvedValue(updated);

    const result = await useCase.execute({
      authUserId: 'auth-1',
      patientId: 'p-1',
      address: 'Calle Nueva 123',
      city: 'Valencia',
    });

    expect(result).toBe(updated);
    expect(mockRepo.updatePatient).toHaveBeenCalledWith('p-1', 'auth-1', {
      address: 'Calle Nueva 123',
      city: 'Valencia',
      notes: undefined,
    });
  });

  it('throws PatientPortalAccessDeniedError when patient does not belong to authUserId', async () => {
    mockRepo.updatePatient.mockResolvedValue(null);

    await expect(
      useCase.execute({ authUserId: 'auth-attacker', patientId: 'p-victim', address: 'hack' }),
    ).rejects.toThrow(PatientPortalAccessDeniedError);
  });
});
