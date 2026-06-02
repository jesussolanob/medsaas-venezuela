import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { CreatePackageDtoSchema, type CreatePackageDto } from '@delta/shared-types';
import { CreatePackageUseCase } from '../../application/use-cases/packages/create-package.use-case';
import { GetPatientPackagesUseCase } from '../../application/use-cases/packages/get-patient-packages.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Packages controller — Etapa 1, doctor-only endpoints.
 *
 * All routes require DevAuthGuard; doctor_id is always taken from user.sub to
 * prevent cross-doctor IDOR via body injection.
 *
 * DEFERRED (not implemented):
 *   - GET /packages/patient/:patientId (patient portal — requires patient auth)
 *   - DELETE /packages/:id (soft-cancel — not in Etapa 1 scope)
 */
@Controller('packages')
@UseGuards(DevAuthGuard)
export class PackagesController {
  constructor(
    private readonly createPackage: CreatePackageUseCase,
    private readonly getPatientPackages: GetPatientPackagesUseCase,
  ) {}

  /**
   * GET /api/packages/patient/:patientId
   * Returns all packages for a patient scoped to the authenticated doctor.
   */
  @Get('patient/:patientId')
  async listForPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const packages = await this.getPatientPackages.execute({
      patientId,
      doctorId: user.sub,
    });
    return { success: true, data: packages };
  }

  /**
   * POST /api/packages
   * Creates a new pre-paid session package for a patient.
   * The doctor_id is taken from the authenticated session (user.sub).
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreatePackageDtoSchema)) dto: CreatePackageDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const pkg = await this.createPackage.execute(dto, user.sub);
    return { success: true, data: pkg };
  }
}
