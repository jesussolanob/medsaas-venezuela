import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DoctorReleaseNotesController } from './doctor-release-notes.controller';
import { GetUnseenReleaseNotesUseCase } from '../../application/use-cases/get-unseen-release-notes.use-case';
import { MarkReleaseNotesSeenUseCase } from '../../application/use-cases/mark-release-notes-seen.use-case';
import { GetReleaseNotesHistoryUseCase } from '../../application/use-cases/get-release-notes-history.use-case';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const DOCTOR_USER: CurrentUserPayload = {
  sub: 'doctor-uuid-1',
  role: 'doctor',
  email: 'doctor@dev.local',
};

const makeNoteItem = () => ({
  id: 'note-uuid-1',
  title: 'Novedad de prueba',
  body: 'Cuerpo de prueba',
  imageUrl: null,
  publishedAt: new Date('2026-10-30T12:00:00Z').toISOString(),
});

describe('DoctorReleaseNotesController', () => {
  let controller: DoctorReleaseNotesController;
  let getUnseenUseCase: { execute: jest.Mock };
  let markSeenUseCase: { execute: jest.Mock };
  let getHistoryUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    getUnseenUseCase = { execute: jest.fn() };
    markSeenUseCase = { execute: jest.fn() };
    getHistoryUseCase = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorReleaseNotesController],
      providers: [
        { provide: GetUnseenReleaseNotesUseCase, useValue: getUnseenUseCase },
        { provide: MarkReleaseNotesSeenUseCase, useValue: markSeenUseCase },
        { provide: GetReleaseNotesHistoryUseCase, useValue: getHistoryUseCase },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(DoctorReleaseNotesController);
  });

  describe('GET /api/doctor/release-notes/unseen', () => {
    it('returns unseen notes for the doctor', async () => {
      getUnseenUseCase.execute.mockResolvedValue({ items: [makeNoteItem()] });

      const result = await controller.unseen(DOCTOR_USER);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(getUnseenUseCase.execute).toHaveBeenCalledWith(DOCTOR_USER.sub);
    });

    it('returns empty array when no unseen notes', async () => {
      getUnseenUseCase.execute.mockResolvedValue({ items: [] });

      const result = await controller.unseen(DOCTOR_USER);

      expect(result.data).toEqual([]);
    });
  });

  describe('POST /api/doctor/release-notes/seen', () => {
    it('marks notes as seen and returns seenAt', async () => {
      const seenAt = new Date().toISOString();
      markSeenUseCase.execute.mockResolvedValue({ seenAt });

      const result = await controller.markSeen(DOCTOR_USER);

      expect(result.success).toBe(true);
      expect(result.data.seenAt).toBe(seenAt);
      expect(markSeenUseCase.execute).toHaveBeenCalledWith(DOCTOR_USER.sub);
    });
  });

  describe('GET /api/doctor/release-notes', () => {
    it('returns history for the doctor', async () => {
      getHistoryUseCase.execute.mockResolvedValue({ items: [makeNoteItem()] });

      const result = await controller.history(DOCTOR_USER);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(getHistoryUseCase.execute).toHaveBeenCalledWith(DOCTOR_USER.sub);
    });
  });

  describe('RBAC — non-doctor roles are blocked by RolesGuard', () => {
    it('RolesGuard throws ForbiddenException when user has patient role', () => {
      // Use the REAL RolesGuard + Reflector so the @Roles('doctor') class metadata is read.
      // This confirms the controller is correctly decorated AND the guard enforces it.
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const PATIENT_USER: CurrentUserPayload = {
        sub: 'patient-uuid-1',
        role: 'patient',
        email: 'patient@dev.local',
      };

      const mockContext = {
        switchToHttp: () => ({ getRequest: () => ({ user: PATIENT_USER }) }),
        // Point at the class itself so getAllAndOverride reads the class-level @Roles('doctor')
        getHandler: () => DoctorReleaseNotesController.prototype.unseen,
        getClass: () => DoctorReleaseNotesController,
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('RolesGuard allows access when user has doctor role', () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const mockContext = {
        switchToHttp: () => ({ getRequest: () => ({ user: DOCTOR_USER }) }),
        getHandler: () => DoctorReleaseNotesController.prototype.unseen,
        getClass: () => DoctorReleaseNotesController,
      } as unknown as ExecutionContext;

      expect(guard.canActivate(mockContext)).toBe(true);
    });
  });
});
