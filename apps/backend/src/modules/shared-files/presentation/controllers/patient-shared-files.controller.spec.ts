import { Test } from '@nestjs/testing';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { PatientSharedFilesController } from './patient-shared-files.controller';
import { CreateSharedFilePatientUseCase } from '../../application/use-cases/shared-files/create-shared-file-patient.use-case';
import { ListSharedFilesPatientUseCase } from '../../application/use-cases/shared-files/list-shared-files-patient.use-case';
import { MarkReadPatientUseCase } from '../../application/use-cases/shared-files/mark-read-patient.use-case';
import { SharedFile } from '../../domain/entities/shared-file.entity';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const PATIENT_USER: CurrentUserPayload = {
  sub: 'auth-001',
  role: 'patient',
  email: 'patient@test.com',
};

const makeSF = () =>
  SharedFile.create({
    id: 'sf-001',
    doctorId: 'doctor-001',
    patientId: 'patient-001',
    title: 'Test item',
    description: null,
    filePath: null,
    fileType: null,
    fileSizeBytes: null,
    category: 'instruction',
    status: 'pending',
    createdBy: 'doctor',
    parentTaskId: null,
    readByDoctor: true,
    readByPatient: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('PatientSharedFilesController', () => {
  let controller: PatientSharedFilesController;
  let createUC: jest.Mocked<CreateSharedFilePatientUseCase>;
  let listUC: jest.Mocked<ListSharedFilesPatientUseCase>;
  let markReadUC: jest.Mocked<MarkReadPatientUseCase>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PatientSharedFilesController],
      providers: [
        { provide: CreateSharedFilePatientUseCase, useValue: { execute: jest.fn() } },
        { provide: ListSharedFilesPatientUseCase, useValue: { execute: jest.fn() } },
        { provide: MarkReadPatientUseCase, useValue: { execute: jest.fn() } },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(PatientSharedFilesController);
    createUC = module.get(
      CreateSharedFilePatientUseCase,
    ) as jest.Mocked<CreateSharedFilePatientUseCase>;
    listUC = module.get(
      ListSharedFilesPatientUseCase,
    ) as jest.Mocked<ListSharedFilesPatientUseCase>;
    markReadUC = module.get(MarkReadPatientUseCase) as jest.Mocked<MarkReadPatientUseCase>;
  });

  describe('list', () => {
    it('returns items scoped to patient', async () => {
      const items = [makeSF()];
      listUC.execute.mockResolvedValue(items);

      const result = await controller.list(PATIENT_USER);

      expect(result).toEqual({ success: true, data: items });
      expect(listUC.execute).toHaveBeenCalledWith({ authUserId: 'auth-001' });
    });

    it('returns empty array when no items', async () => {
      listUC.execute.mockResolvedValue([]);
      const result = await controller.list(PATIENT_USER);
      expect(result).toEqual({ success: true, data: [] });
    });
  });

  describe('create', () => {
    it('returns created item in envelope', async () => {
      const sf = makeSF();
      createUC.execute.mockResolvedValue(sf);

      const result = await controller.create(
        { title: 'My response', category: 'comment' },
        PATIENT_USER,
      );

      expect(result).toEqual({ success: true, data: sf });
      expect(createUC.execute).toHaveBeenCalledWith(
        expect.objectContaining({ authUserId: 'auth-001', title: 'My response' }),
      );
    });
  });

  describe('markRead', () => {
    it('returns marked: true', async () => {
      markReadUC.execute.mockResolvedValue();
      const result = await controller.markRead(PATIENT_USER);
      expect(result).toEqual({ success: true, data: { marked: true } });
      expect(markReadUC.execute).toHaveBeenCalledWith({ authUserId: 'auth-001' });
    });
  });
});
