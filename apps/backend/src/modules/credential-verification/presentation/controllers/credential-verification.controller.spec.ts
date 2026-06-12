import { Test, type TestingModule } from '@nestjs/testing';
import { CredentialVerificationController } from './credential-verification.controller';
import { VerifyMppsUseCase } from '../../application/use-cases/verify-mpps.use-case';
import { GetCredentialVerificationsUseCase } from '../../application/use-cases/get-credential-verifications.use-case';

const DOCTOR_ID = 'aaaa1111-aaaa-1111-aaaa-111111111111';

const mockVerifyMpps = {
  execute: jest.fn(),
};

const mockGetVerifications = {
  execute: jest.fn(),
};

describe('CredentialVerificationController', () => {
  let controller: CredentialVerificationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CredentialVerificationController],
      providers: [
        { provide: VerifyMppsUseCase, useValue: mockVerifyMpps },
        { provide: GetCredentialVerificationsUseCase, useValue: mockGetVerifications },
      ],
    })
      .overrideGuard(require('../../../../infrastructure/auth/dev-auth.guard').DevAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../../presentation/guards/roles.guard').RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CredentialVerificationController>(CredentialVerificationController);

    jest.clearAllMocks();
  });

  describe('triggerMppsVerification', () => {
    it('delegates to VerifyMppsUseCase and wraps in success envelope', async () => {
      const useCaseOutput = {
        doctorId: DOCTOR_ID,
        credentialType: 'mpps',
        status: 'verified',
        attempts: 1,
        checkedAt: new Date(),
      };
      mockVerifyMpps.execute.mockResolvedValue(useCaseOutput);

      const result = await controller.triggerMppsVerification(DOCTOR_ID, undefined);

      expect(result.success).toBe(true);
      expect(result.data).toBe(useCaseOutput);
      expect(mockVerifyMpps.execute).toHaveBeenCalledWith(DOCTOR_ID, { force: false });
    });

    it('passes force=true when query param is "true"', async () => {
      mockVerifyMpps.execute.mockResolvedValue({
        doctorId: DOCTOR_ID,
        credentialType: 'mpps',
        status: 'verified',
        attempts: 2,
        checkedAt: new Date(),
      });

      await controller.triggerMppsVerification(DOCTOR_ID, 'true');

      expect(mockVerifyMpps.execute).toHaveBeenCalledWith(DOCTOR_ID, { force: true });
    });

    it('passes force=false when query param is absent', async () => {
      mockVerifyMpps.execute.mockResolvedValue({
        doctorId: DOCTOR_ID,
        credentialType: 'mpps',
        status: 'not_found',
        attempts: 1,
        checkedAt: new Date(),
      });

      await controller.triggerMppsVerification(DOCTOR_ID);

      expect(mockVerifyMpps.execute).toHaveBeenCalledWith(DOCTOR_ID, { force: false });
    });
  });

  describe('getCredentials', () => {
    it('delegates to GetCredentialVerificationsUseCase and wraps in success envelope', async () => {
      const useCaseOutput = [
        {
          id: 'cccc3333-cccc-3333-cccc-333333333333',
          doctorId: DOCTOR_ID,
          credentialType: 'mpps',
          declaredValue: 'MPPS-12345',
          verifierId: null,
          status: 'verified',
          evidence: { fechaRegistro: '2010-01-01' },
          checkedAt: new Date(),
          attempts: 1,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockGetVerifications.execute.mockResolvedValue(useCaseOutput);

      const result = await controller.getCredentials(DOCTOR_ID);

      expect(result.success).toBe(true);
      expect(result.data).toBe(useCaseOutput);
      expect(mockGetVerifications.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('returns empty array when no verifications exist', async () => {
      mockGetVerifications.execute.mockResolvedValue([]);

      const result = await controller.getCredentials(DOCTOR_ID);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });
});
