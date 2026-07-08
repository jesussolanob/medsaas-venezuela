import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';

import { CreateSharedFilePatientUseCase } from '../../application/use-cases/shared-files/create-shared-file-patient.use-case';
import { ListSharedFilesPatientUseCase } from '../../application/use-cases/shared-files/list-shared-files-patient.use-case';
import { MarkReadPatientUseCase } from '../../application/use-cases/shared-files/mark-read-patient.use-case';

import {
  CreateSharedFilePatientSchema,
  type CreateSharedFilePatientDto,
} from '../../application/dtos/shared-file.dto';
import type { SharedFile } from '../../domain/entities/shared-file.entity';

// ---------------------------------------------------------------------------
// Response envelope helpers
// ---------------------------------------------------------------------------

interface SuccessResponse<T> {
  success: true;
  data: T;
}

function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

/**
 * PatientSharedFilesController — /api/patient/shared-files
 *
 * All endpoints are scoped to the authenticated patient (resolved from user.sub).
 * authUserId is ALWAYS derived from user.sub — never from body or params.
 * patientId and doctorId are resolved from the DB in the use cases.
 *
 * SECURITY (anti-IDOR):
 *   - user.sub is the Auth0 subject / dev-stub user ID.
 *   - Patient record lookup uses patients.auth_user_id = user.sub.
 *   - A patient can only see and create files for their own record(s).
 */
@Controller('patient/shared-files')
@UseGuards(AppAuthGuard)
export class PatientSharedFilesController {
  constructor(
    private readonly createSharedFile: CreateSharedFilePatientUseCase,
    private readonly listSharedFiles: ListSharedFilesPatientUseCase,
    private readonly markReadPatient: MarkReadPatientUseCase,
  ) {}

  /**
   * GET /api/patient/shared-files
   * Lists all shared files for the authenticated patient.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() user: CurrentUserPayload): Promise<SuccessResponse<SharedFile[]>> {
    const items = await this.listSharedFiles.execute({ authUserId: user.sub });
    return ok(items);
  }

  /**
   * POST /api/patient/shared-files
   * Creates a shared file (reply / comment / upload) on behalf of the patient.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateSharedFilePatientSchema)) dto: CreateSharedFilePatientDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<SharedFile>> {
    const item = await this.createSharedFile.execute({
      authUserId: user.sub,
      ...dto,
    });
    return ok(item);
  }

  /**
   * POST /api/patient/shared-files/mark-read
   * Marks read_by_patient = true for all doctor-created files visible to the patient.
   */
  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ marked: true }>> {
    await this.markReadPatient.execute({ authUserId: user.sub });
    return ok({ marked: true });
  }
}
