import { GetPatientProfileUseCase } from './get-patient-profile.use-case';
import type { IPatientPortalRepository } from '../../../domain/repositories/patient-portal.repository';
import { Patient } from '../../../../patients/domain/entities/patient.entity';

function makePatient(id: string, authUserId: string): Patient {
  return Patient.create({
    id,
    doctorId: 'doctor-1',
    authUserId,
    fullName: 'Juan Pérez',
    cedula: 'V-12345678',
    phone: '+58412345678',
    email: 'juan@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('GetPatientProfileUseCase', () => {
  let useCase: GetPatientProfileUseCase;
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

    useCase = new GetPatientProfileUseCase(mockRepo);
  });

  it('returns all patient records for the authenticated user', async () => {
    const patients = [makePatient('p-1', 'auth-1'), makePatient('p-2', 'auth-1')];
    mockRepo.findPatientsByAuthUserId.mockResolvedValue(patients);

    const result = await useCase.execute({ authUserId: 'auth-1' });

    expect(result).toHaveLength(2);
    expect(mockRepo.findPatientsByAuthUserId).toHaveBeenCalledWith('auth-1');
  });

  it('returns empty array when no patient records found', async () => {
    mockRepo.findPatientsByAuthUserId.mockResolvedValue([]);

    const result = await useCase.execute({ authUserId: 'auth-unknown' });

    expect(result).toHaveLength(0);
  });
});
