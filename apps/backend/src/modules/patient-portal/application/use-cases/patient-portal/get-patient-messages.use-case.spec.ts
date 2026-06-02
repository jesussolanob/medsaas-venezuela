import { GetPatientMessagesUseCase } from './get-patient-messages.use-case';
import type {
  IPatientPortalRepository,
  PatientMessageRow,
} from '../../../domain/repositories/patient-portal.repository';

function makeMessage(
  id: string,
  direction: 'patient_to_doctor' | 'doctor_to_patient' = 'patient_to_doctor',
): PatientMessageRow {
  return {
    id,
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    body: `Mensaje ${id}`,
    direction,
    readAt: null,
    createdAt: new Date('2030-01-01T10:00:00Z'),
  };
}

describe('GetPatientMessagesUseCase', () => {
  let useCase: GetPatientMessagesUseCase;
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

    useCase = new GetPatientMessagesUseCase(mockRepo);
  });

  it('returns messages in chronological order', async () => {
    mockRepo.findPatientIdsByAuthUserId.mockResolvedValue(['patient-1']);
    const messages = [makeMessage('msg-1'), makeMessage('msg-2', 'doctor_to_patient')];
    mockRepo.listMessages.mockResolvedValue(messages);

    const result = await useCase.execute({ authUserId: 'patient-auth-1' });

    expect(result).toHaveLength(2);
    expect(result[0]!.direction).toBe('patient_to_doctor');
    expect(result[1]!.direction).toBe('doctor_to_patient');
  });

  it('filters by doctorId when provided', async () => {
    mockRepo.findPatientIdsByAuthUserId.mockResolvedValue(['patient-1']);
    mockRepo.listMessages.mockResolvedValue([makeMessage('msg-1')]);

    await useCase.execute({ authUserId: 'patient-auth-1', doctorId: 'doctor-1' });

    expect(mockRepo.listMessages).toHaveBeenCalledWith(['patient-1'], 'doctor-1');
  });

  it('returns empty array when patient has no records', async () => {
    mockRepo.findPatientIdsByAuthUserId.mockResolvedValue([]);

    const result = await useCase.execute({ authUserId: 'unknown-auth' });

    expect(result).toHaveLength(0);
    expect(mockRepo.listMessages).not.toHaveBeenCalled();
  });
});
