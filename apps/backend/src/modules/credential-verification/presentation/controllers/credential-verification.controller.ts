import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { VerifyMppsUseCase } from '../../application/use-cases/verify-mpps.use-case';
import { GetCredentialVerificationsUseCase } from '../../application/use-cases/get-credential-verifications.use-case';
import type { VerifyMppsOutput } from '../../application/use-cases/verify-mpps.use-case';
import type { CredentialVerificationOutput } from '../../application/use-cases/get-credential-verifications.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * CredentialVerificationController — admin-only endpoints for MPPS
 * credential verification.
 *
 *   POST /api/admin/doctor-verifications/:doctorId/verify-mpps
 *     Triggers VerifyMppsUseCase and returns the result.
 *     Query param: ?force=true to bypass the verified-cache.
 *
 *   GET /api/admin/doctor-verifications/:doctorId/credentials
 *     Returns all credential verification records for the doctor.
 *
 * SECURITY:
 *   - Both endpoints require super_admin role.
 *   - Never log doctorId values in production.
 *   - The evidence field may contain matched_name — this is intentional
 *     for admin audit purposes only.
 */
@Controller('admin/doctor-verifications')
@UseGuards(DevAuthGuard, RolesGuard)
@Roles('super_admin')
export class CredentialVerificationController {
  constructor(
    private readonly verifyMpps: VerifyMppsUseCase,
    private readonly getVerifications: GetCredentialVerificationsUseCase,
  ) {}

  /**
   * POST /api/admin/doctor-verifications/:doctorId/verify-mpps
   */
  @Post(':doctorId/verify-mpps')
  async triggerMppsVerification(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Query('force') force?: string,
  ): Promise<SuccessResponse<VerifyMppsOutput>> {
    const result = await this.verifyMpps.execute(doctorId, {
      force: force === 'true',
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/admin/doctor-verifications/:doctorId/credentials
   */
  @Get(':doctorId/credentials')
  async getCredentials(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
  ): Promise<SuccessResponse<CredentialVerificationOutput[]>> {
    const result = await this.getVerifications.execute(doctorId);
    return { success: true, data: result };
  }
}
