import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import {
  DoctorRegistrationDtoSchema,
  UpdateVerificationStatusDtoSchema,
  ListVerificationsDtoSchema,
  type DoctorRegistrationDto,
  type UpdateVerificationStatusDto,
  type ListVerificationsDto,
} from '@delta/shared-types';
import { CompleteRegistrationUseCase } from '../../application/use-cases/complete-registration.use-case';
import { ListPendingVerificationsUseCase } from '../../application/use-cases/list-pending-verifications.use-case';
import { UpdateVerificationStatusUseCase } from '../../application/use-cases/update-verification-status.use-case';
import type { DoctorRegistration } from '../../domain/entities/doctor-registration.entity';
import type { UpdateVerificationStatusOutput } from '../../application/use-cases/update-verification-status.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface RegistrationResponseDto {
  doctorId: string;
  verificationStatus: string;
}

export interface VerificationListItemDto {
  doctorId: string;
  fullName: string;
  email: string;
  cedula: string | null;
  mppsNumber: string | null;
  colegiadoNumber: string | null;
  verificationStatus: string;
  createdAt: Date;
}

function toVerificationListItem(entity: DoctorRegistration): VerificationListItemDto {
  return {
    doctorId: entity.id,
    fullName: entity.fullName,
    email: entity.email,
    cedula: entity.cedula,
    mppsNumber: entity.mppsNumber,
    colegiadoNumber: entity.colegiadoNumber,
    verificationStatus: entity.verificationStatus,
    createdAt: entity.createdAt,
  };
}

/**
 * DoctorRegistrationController — three surfaces:
 *
 *   1. POST /api/doctor/registration
 *      Doctor completes their profile. Auth: role=doctor only.
 *
 *   2. GET  /api/admin/doctor-verifications?status=pending&limit=50&offset=0
 *      Admin lists doctors by verification status. Auth: super_admin.
 *
 *   3. PUT  /api/admin/doctor-verifications/:doctorId
 *      Admin marks a doctor as verified or rejected. Auth: super_admin.
 *
 * NOTE: verification_status does NOT currently restrict doctor access.
 * This data is preparatory for future access-control enforcement in Etapa 2.
 *
 * SECURITY (admin endpoints):
 *   - The response includes identity PII (full_name, cedula, email) intentionally —
 *     this is the admin verification panel, which requires seeing these fields.
 *   - Never log full_name, cedula, mppsNumber, colegiadoNumber from this controller.
 */
@Controller()
@UseGuards(DevAuthGuard)
export class DoctorRegistrationController {
  constructor(
    private readonly completeRegistration: CompleteRegistrationUseCase,
    private readonly listVerifications: ListPendingVerificationsUseCase,
    private readonly updateVerification: UpdateVerificationStatusUseCase,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /api/doctor/registration
  // ---------------------------------------------------------------------------

  @Post('doctor/registration')
  @UseGuards(RolesGuard)
  @Roles('doctor')
  async register(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(DoctorRegistrationDtoSchema)) body: DoctorRegistrationDto,
  ): Promise<SuccessResponse<RegistrationResponseDto>> {
    const result = await this.completeRegistration.execute({
      doctorId: user.sub,
      fullName: body.full_name,
      cedula: body.cedula,
      mppsNumber: body.mpps_number ?? null,
      colegiadoNumber: body.colegiado_number ?? null,
    });

    return { success: true, data: result };
  }

  // ---------------------------------------------------------------------------
  // GET /api/admin/doctor-verifications?status=pending&limit=50&offset=0
  // ---------------------------------------------------------------------------

  @Get('admin/doctor-verifications')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async listVerificationsByStatus(
    @Query(new ZodValidationPipe(ListVerificationsDtoSchema)) query: ListVerificationsDto,
  ): Promise<SuccessResponse<VerificationListItemDto[]>> {
    const items = await this.listVerifications.execute({
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      success: true,
      data: items.map(toVerificationListItem),
    };
  }

  // ---------------------------------------------------------------------------
  // PUT /api/admin/doctor-verifications/:doctorId
  // ---------------------------------------------------------------------------

  @Put('admin/doctor-verifications/:doctorId')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async updateDoctorVerification(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(UpdateVerificationStatusDtoSchema))
    body: UpdateVerificationStatusDto,
  ): Promise<SuccessResponse<UpdateVerificationStatusOutput>> {
    const result = await this.updateVerification.execute({
      doctorId,
      status: body.status,
      actorId: user.sub,
    });

    return { success: true, data: result };
  }
}
