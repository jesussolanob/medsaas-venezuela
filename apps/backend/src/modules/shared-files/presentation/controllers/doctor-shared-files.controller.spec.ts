import { Test } from '@nestjs/testing';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { DoctorSharedFilesController } from './doctor-shared-files.controller';
import { CreateSharedFileDoctorUseCase } from '../../application/use-cases/shared-files/create-shared-file-doctor.use-case';
import { ListSharedFilesDoctorUseCase } from '../../application/use-cases/shared-files/list-shared-files-doctor.use-case';
import { UpdateSharedFileDoctorUseCase } from '../../application/use-cases/shared-files/update-shared-file-doctor.use-case';
import { DeleteSharedFileDoctorUseCase } from '../../application/use-cases/shared-files/delete-shared-file-doctor.use-case';
import { MarkReadDoctorUseCase } from '../../application/use-cases/shared-files/mark-read-doctor.use-case';
import { GetUnreadCountsDoctorUseCase } from '../../application/use-cases/shared-files/get-unread-counts-doctor.use-case';
import { SharedFile } from '../../domain/entities/shared-file.entity';
import { SharedFileNotFoundError } from '../../domain/errors/shared-file-not-found.error';
import { PatientNotUnderDoctorError } from '../../domain/errors/patient-not-under-doctor.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const DOCTOR_USER: CurrentUserPayload = {
  sub: 'doctor-001',
  role: 'doctor',
  email: 'doc@test.com',
};

const makeSF = (overrides = {}) =>
  SharedFile.create({
    id: 'sf-001',
    doctorId: 'doctor-001',
    patientId: 'patient-001',
    title: 'Test',
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
    ...overrides,
  });

describe('DoctorSharedFilesController', () => {
  let controller: DoctorSharedFilesController;
  let createUC: jest.Mocked<CreateSharedFileDoctorUseCase>;
  let listUC: jest.Mocked<ListSharedFilesDoctorUseCase>;
  let updateUC: jest.Mocked<UpdateSharedFileDoctorUseCase>;
  let deleteUC: jest.Mocked<DeleteSharedFileDoctorUseCase>;
  let markReadUC: jest.Mocked<MarkReadDoctorUseCase>;
  let unreadCountsUC: jest.Mocked<GetUnreadCountsDoctorUseCase>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DoctorSharedFilesController],
      providers: [
        { provide: CreateSharedFileDoctorUseCase, useValue: { execute: jest.fn() } },
        { provide: ListSharedFilesDoctorUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateSharedFileDoctorUseCase, useValue: { execute: jest.fn() } },
        { provide: DeleteSharedFileDoctorUseCase, useValue: { execute: jest.fn() } },
        { provide: MarkReadDoctorUseCase, useValue: { execute: jest.fn() } },
        { provide: GetUnreadCountsDoctorUseCase, useValue: { execute: jest.fn() } },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(DoctorSharedFilesController);
    createUC = module.get(
      CreateSharedFileDoctorUseCase,
    ) as jest.Mocked<CreateSharedFileDoctorUseCase>;
    listUC = module.get(ListSharedFilesDoctorUseCase) as jest.Mocked<ListSharedFilesDoctorUseCase>;
    updateUC = module.get(
      UpdateSharedFileDoctorUseCase,
    ) as jest.Mocked<UpdateSharedFileDoctorUseCase>;
    deleteUC = module.get(
      DeleteSharedFileDoctorUseCase,
    ) as jest.Mocked<DeleteSharedFileDoctorUseCase>;
    markReadUC = module.get(MarkReadDoctorUseCase) as jest.Mocked<MarkReadDoctorUseCase>;
    unreadCountsUC = module.get(
      GetUnreadCountsDoctorUseCase,
    ) as jest.Mocked<GetUnreadCountsDoctorUseCase>;
  });

  describe('list', () => {
    it('returns success envelope with items', async () => {
      const items = [makeSF()];
      listUC.execute.mockResolvedValue(items);

      const result = await controller.list({ patientId: 'patient-001' }, DOCTOR_USER);

      expect(result).toEqual({ success: true, data: items });
      expect(listUC.execute).toHaveBeenCalledWith({
        doctorId: 'doctor-001',
        patientId: 'patient-001',
      });
    });

    it('propagates PatientNotUnderDoctorError', async () => {
      listUC.execute.mockRejectedValue(new PatientNotUnderDoctorError());
      await expect(controller.list({ patientId: 'patient-999' }, DOCTOR_USER)).rejects.toThrow(
        PatientNotUnderDoctorError,
      );
    });
  });

  describe('create', () => {
    it('returns created shared file in envelope', async () => {
      const sf = makeSF();
      createUC.execute.mockResolvedValue(sf);

      const result = await controller.create(
        { patientId: 'patient-001', title: 'Test', category: 'instruction' },
        DOCTOR_USER,
      );

      expect(result).toEqual({ success: true, data: sf });
      expect(createUC.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'doctor-001', patientId: 'patient-001' }),
      );
    });
  });

  describe('update', () => {
    it('returns updated shared file in envelope', async () => {
      const sf = makeSF({ title: 'Updated' });
      updateUC.execute.mockResolvedValue(sf);

      const result = await controller.update('sf-001', { title: 'Updated' }, DOCTOR_USER);

      expect(result).toEqual({ success: true, data: sf });
      expect(updateUC.execute).toHaveBeenCalledWith({
        id: 'sf-001',
        doctorId: 'doctor-001',
        title: 'Updated',
      });
    });

    it('propagates SharedFileNotFoundError for wrong doctor (anti-IDOR)', async () => {
      updateUC.execute.mockRejectedValue(new SharedFileNotFoundError());
      await expect(controller.update('sf-001', { title: 'X' }, DOCTOR_USER)).rejects.toThrow(
        SharedFileNotFoundError,
      );
    });
  });

  describe('remove', () => {
    it('calls delete use case', async () => {
      deleteUC.execute.mockResolvedValue();
      await controller.remove('sf-001', DOCTOR_USER);
      expect(deleteUC.execute).toHaveBeenCalledWith({ id: 'sf-001', doctorId: 'doctor-001' });
    });

    it('propagates SharedFileNotFoundError', async () => {
      deleteUC.execute.mockRejectedValue(new SharedFileNotFoundError());
      await expect(controller.remove('sf-001', DOCTOR_USER)).rejects.toThrow(
        SharedFileNotFoundError,
      );
    });
  });

  describe('markRead', () => {
    it('returns marked: true', async () => {
      markReadUC.execute.mockResolvedValue();
      const result = await controller.markRead({ patientId: 'patient-001' }, DOCTOR_USER);
      expect(result).toEqual({ success: true, data: { marked: true } });
      expect(markReadUC.execute).toHaveBeenCalledWith({
        doctorId: 'doctor-001',
        patientId: 'patient-001',
      });
    });
  });

  describe('unreadCounts', () => {
    it('returns counts map', async () => {
      const counts = { 'patient-001': 2 };
      unreadCountsUC.execute.mockResolvedValue(counts);

      const result = await controller.unreadCounts(DOCTOR_USER);
      expect(result).toEqual({ success: true, data: counts });
    });
  });
});
