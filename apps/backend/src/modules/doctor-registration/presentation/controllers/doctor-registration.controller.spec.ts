import { Test, type TestingModule } from '@nestjs/testing';
import { DoctorRegistrationController } from './doctor-registration.controller';
import { CompleteRegistrationUseCase } from '../../application/use-cases/complete-registration.use-case';
import { ListPendingVerificationsUseCase } from '../../application/use-cases/list-pending-verifications.use-case';
import { UpdateVerificationStatusUseCase } from '../../application/use-cases/update-verification-status.use-case';
import { DoctorRegistration } from '../../domain/entities/doctor-registration.entity';
import { DoctorRegistrationNotFoundError } from '../../domain/errors/doctor-not-found.error';

import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const adminUser: CurrentUserPayload = {
  sub: 'admin-1',
  role: 'super_admin',
  email: 'admin@example.com',
};
const doctorUser: CurrentUserPayload = { sub: 'doc-1', role: 'doctor', email: 'dr@example.com' };

const makeEntity = (
  overrides: Partial<Parameters<typeof DoctorRegistration.create>[0]> = {},
): DoctorRegistration =>
  DoctorRegistration.create({
    id: 'doc-1',
    fullName: 'Dr. Test',
    email: 'dr@example.com',
    cedula: 'V-1',
    mppsNumber: null,
    colegiadoNumber: null,
    specialty: null,
    verificationStatus: 'pending',
    verifiedAt: null,
    verifiedBy: null,
    createdAt: new Date('2026-01-01'),
    isActive: true,
    ...overrides,
  });

describe('DoctorRegistrationController', () => {
  let controller: DoctorRegistrationController;
  let completeRegistrationUseCase: jest.Mocked<CompleteRegistrationUseCase>;
  let listVerificationsUseCase: jest.Mocked<ListPendingVerificationsUseCase>;
  let updateVerificationUseCase: jest.Mocked<UpdateVerificationStatusUseCase>;

  beforeEach(async () => {
    completeRegistrationUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CompleteRegistrationUseCase>;

    listVerificationsUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListPendingVerificationsUseCase>;

    updateVerificationUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateVerificationStatusUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorRegistrationController],
      providers: [
        { provide: CompleteRegistrationUseCase, useValue: completeRegistrationUseCase },
        { provide: ListPendingVerificationsUseCase, useValue: listVerificationsUseCase },
        { provide: UpdateVerificationStatusUseCase, useValue: updateVerificationUseCase },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<DoctorRegistrationController>(DoctorRegistrationController);
  });

  // ---------------------------------------------------------------------------
  // POST /api/doctor/registration
  // ---------------------------------------------------------------------------

  describe('register()', () => {
    it('returns success with verificationStatus when registration succeeds', async () => {
      completeRegistrationUseCase.execute.mockResolvedValue({
        doctorId: 'doc-1',
        verificationStatus: 'pending',
      });

      const result = await controller.register(doctorUser, {
        full_name: 'Dr. Test',
        cedula: 'V-12345',
      });

      expect(result.success).toBe(true);
      expect(result.data.verificationStatus).toBe('pending');
      expect(result.data.doctorId).toBe('doc-1');
    });

    it('passes mpps_number and colegiado_number to use case', async () => {
      completeRegistrationUseCase.execute.mockResolvedValue({
        doctorId: 'doc-1',
        verificationStatus: 'pending',
      });

      await controller.register(doctorUser, {
        full_name: 'Dr. Test',
        cedula: 'V-12345',
        mpps_number: 'MP-1',
        colegiado_number: 'COL-2',
      });

      expect(completeRegistrationUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          mppsNumber: 'MP-1',
          colegiadoNumber: 'COL-2',
        }),
      );
    });

    it('passes specialty to use case when provided', async () => {
      completeRegistrationUseCase.execute.mockResolvedValue({
        doctorId: 'doc-1',
        verificationStatus: 'pending',
      });

      await controller.register(doctorUser, {
        full_name: 'Dr. Test',
        cedula: 'V-12345',
        specialty: 'Cardiología',
      });

      expect(completeRegistrationUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ specialty: 'Cardiología' }),
      );
    });

    it('passes null specialty when not provided', async () => {
      completeRegistrationUseCase.execute.mockResolvedValue({
        doctorId: 'doc-1',
        verificationStatus: 'pending',
      });

      await controller.register(doctorUser, {
        full_name: 'Dr. Test',
        cedula: 'V-12345',
      });

      expect(completeRegistrationUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ specialty: null }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/admin/doctor-verifications
  // ---------------------------------------------------------------------------

  describe('listVerificationsByStatus()', () => {
    it('returns mapped verification items for pending status', async () => {
      const entity = makeEntity();
      listVerificationsUseCase.execute.mockResolvedValue([entity]);

      const result = await controller.listVerificationsByStatus({
        status: 'pending',
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      const item = result.data[0];
      expect(item?.doctorId).toBe('doc-1');
      expect(item?.verificationStatus).toBe('pending');
      expect(item?.isActive).toBe(true);
    });

    it('exposes isActive=false when the doctor account is blocked', async () => {
      const blocked = makeEntity({ isActive: false });
      listVerificationsUseCase.execute.mockResolvedValue([blocked]);

      const result = await controller.listVerificationsByStatus({
        status: 'pending',
        limit: 50,
        offset: 0,
      });

      expect(result.data[0]?.isActive).toBe(false);
    });

    it('passes verified status and pagination to use case', async () => {
      listVerificationsUseCase.execute.mockResolvedValue([]);

      await controller.listVerificationsByStatus({
        status: 'verified',
        limit: 10,
        offset: 5,
      });

      expect(listVerificationsUseCase.execute).toHaveBeenCalledWith({
        status: 'verified',
        limit: 10,
        offset: 5,
      });
    });

    it('passes rejected status to use case', async () => {
      listVerificationsUseCase.execute.mockResolvedValue([]);

      await controller.listVerificationsByStatus({
        status: 'rejected',
        limit: 50,
        offset: 0,
      });

      expect(listVerificationsUseCase.execute).toHaveBeenCalledWith({
        status: 'rejected',
        limit: 50,
        offset: 0,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/admin/doctor-verifications/:doctorId
  // ---------------------------------------------------------------------------

  describe('updateDoctorVerification()', () => {
    it('returns success data when verification update succeeds', async () => {
      const verifiedAt = new Date('2026-06-11T10:00:00Z');
      updateVerificationUseCase.execute.mockResolvedValue({
        doctorId: 'doc-1',
        verificationStatus: 'verified',
        verifiedAt,
        verifiedBy: 'admin-1',
      });

      const result = await controller.updateDoctorVerification('doc-1', adminUser, {
        status: 'verified',
      });

      expect(result.success).toBe(true);
      expect(updateVerificationUseCase.execute).toHaveBeenCalledWith({
        doctorId: 'doc-1',
        status: 'verified',
        actorId: 'admin-1',
      });
    });

    it('propagates DoctorRegistrationNotFoundError when doctor does not exist', async () => {
      updateVerificationUseCase.execute.mockRejectedValue(
        new DoctorRegistrationNotFoundError('doc-999'),
      );

      await expect(
        controller.updateDoctorVerification('doc-999', adminUser, { status: 'verified' }),
      ).rejects.toThrow(DoctorRegistrationNotFoundError);
    });
  });
});
