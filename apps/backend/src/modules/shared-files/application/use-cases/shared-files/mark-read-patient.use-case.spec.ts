import { MarkReadPatientUseCase } from './mark-read-patient.use-case';
import type { ISharedFileRepository } from '../../../domain/repositories/shared-file.repository';
import type { IPatientPortalRepository } from '../../../../patient-portal/domain/repositories/patient-portal.repository';

describe('MarkReadPatientUseCase', () => {
  let useCase: MarkReadPatientUseCase;
  let sharedFileRepo: jest.Mocked<ISharedFileRepository>;
  let portalRepo: jest.Mocked<IPatientPortalRepository>;

  beforeEach(() => {
    sharedFileRepo = {
      save: jest.fn(),
      findByIdAndDoctor: jest.fn(),
      findByIdAndPatient: jest.fn(),
      listByDoctorAndPatient: jest.fn(),
      listByPatient: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      markReadByDoctor: jest.fn(),
      markReadByPatient: jest.fn(),
      getUnreadCountsByDoctor: jest.fn(),
    } as jest.Mocked<ISharedFileRepository>;

    portalRepo = {
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

    useCase = new MarkReadPatientUseCase(sharedFileRepo, portalRepo);
  });

  it('marks files as read for the primary patient record', async () => {
    portalRepo.findPatientIdsByAuthUserId.mockResolvedValue(['patient-001']);
    sharedFileRepo.markReadByPatient.mockResolvedValue();

    await useCase.execute({ authUserId: 'auth-001' });

    expect(sharedFileRepo.markReadByPatient).toHaveBeenCalledWith('patient-001');
  });

  it('is a no-op when no patient record found', async () => {
    portalRepo.findPatientIdsByAuthUserId.mockResolvedValue([]);

    await useCase.execute({ authUserId: 'auth-unknown' });

    expect(sharedFileRepo.markReadByPatient).not.toHaveBeenCalled();
  });
});
