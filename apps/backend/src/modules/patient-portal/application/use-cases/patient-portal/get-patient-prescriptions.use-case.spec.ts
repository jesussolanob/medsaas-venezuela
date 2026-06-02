import { GetPatientPrescriptionsUseCase } from './get-patient-prescriptions.use-case';
import type { IPatientPortalRepository } from '../../../domain/repositories/patient-portal.repository';
import { Prescription } from '../../../../prescriptions/domain/entities/prescription.entity';

function makePrescription(id: string): Prescription {
  return Prescription.create({
    id,
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    consultationId: null,
    medication: 'Ibuprofeno 400mg',
    dosage: '1 tableta cada 8 horas',
    frequency: 'cada 8 horas',
    duration: '5 días',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('GetPatientPrescriptionsUseCase', () => {
  let useCase: GetPatientPrescriptionsUseCase;
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

    useCase = new GetPatientPrescriptionsUseCase(mockRepo);
  });

  it('returns prescriptions for the authenticated patient', async () => {
    mockRepo.findPatientIdsByAuthUserId.mockResolvedValue(['patient-1', 'patient-2']);
    const prescriptions = [makePrescription('rx-1'), makePrescription('rx-2')];
    mockRepo.listPrescriptions.mockResolvedValue(prescriptions);

    const result = await useCase.execute({ authUserId: 'patient-auth-1' });

    expect(result).toHaveLength(2);
    expect(mockRepo.listPrescriptions).toHaveBeenCalledWith(['patient-1', 'patient-2']);
  });

  it('returns empty array when patient has no patient records', async () => {
    mockRepo.findPatientIdsByAuthUserId.mockResolvedValue([]);

    const result = await useCase.execute({ authUserId: 'patient-auth-unknown' });

    expect(result).toHaveLength(0);
    expect(mockRepo.listPrescriptions).not.toHaveBeenCalled();
  });

  it('resolves patient IDs before fetching prescriptions', async () => {
    mockRepo.findPatientIdsByAuthUserId.mockResolvedValue(['patient-1']);
    mockRepo.listPrescriptions.mockResolvedValue([]);

    await useCase.execute({ authUserId: 'patient-auth-1' });

    expect(mockRepo.findPatientIdsByAuthUserId).toHaveBeenCalledWith('patient-auth-1');
    expect(mockRepo.listPrescriptions).toHaveBeenCalledWith(['patient-1']);
  });
});
