import { SendPatientMessageUseCase } from './send-patient-message.use-case';
import type {
  IPatientPortalRepository,
  PatientMessageRow,
} from '../../../domain/repositories/patient-portal.repository';
import { PatientMessageNotAllowedError } from '../../../domain/errors/patient-message-not-allowed.error';

function makeMessageRow(): PatientMessageRow {
  return {
    id: 'msg-new',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    body: 'Hola doctor, tengo una consulta',
    direction: 'patient_to_doctor',
    readAt: null,
    createdAt: new Date(),
  };
}

describe('SendPatientMessageUseCase', () => {
  let useCase: SendPatientMessageUseCase;
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

    useCase = new SendPatientMessageUseCase(mockRepo);
  });

  it('inserts message correctly when relationship exists', async () => {
    mockRepo.findPatientIdForDoctorRelationship.mockResolvedValue('patient-1');
    const msgRow = makeMessageRow();
    mockRepo.insertMessage.mockResolvedValue(msgRow);

    const result = await useCase.execute({
      authUserId: 'patient-auth-1',
      doctorId: 'doctor-1',
      body: 'Hola doctor, tengo una consulta',
    });

    expect(result.direction).toBe('patient_to_doctor');
    expect(result.patientId).toBe('patient-1');
    expect(mockRepo.insertMessage).toHaveBeenCalledWith(
      'patient-1',
      'doctor-1',
      'Hola doctor, tengo una consulta',
    );
  });

  it('throws PatientMessageNotAllowedError when no patient-doctor relationship exists', async () => {
    mockRepo.findPatientIdForDoctorRelationship.mockResolvedValue(null);

    await expect(
      useCase.execute({ authUserId: 'patient-auth-1', doctorId: 'other-doctor', body: 'Hola' }),
    ).rejects.toThrow(PatientMessageNotAllowedError);

    expect(mockRepo.insertMessage).not.toHaveBeenCalled();
  });

  it('uses the DB-resolved patientId, not any client-supplied value', async () => {
    mockRepo.findPatientIdForDoctorRelationship.mockResolvedValue('patient-from-db');
    mockRepo.insertMessage.mockResolvedValue(makeMessageRow());

    await useCase.execute({
      authUserId: 'patient-auth-1',
      doctorId: 'doctor-1',
      body: 'Mensaje',
    });

    // patientId in the insert call must come from DB lookup, never from client
    expect(mockRepo.insertMessage).toHaveBeenCalledWith('patient-from-db', 'doctor-1', 'Mensaje');
  });
});
