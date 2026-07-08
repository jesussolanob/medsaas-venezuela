import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';

import { CreateSharedFileDoctorUseCase } from '../../application/use-cases/shared-files/create-shared-file-doctor.use-case';
import { ListSharedFilesDoctorUseCase } from '../../application/use-cases/shared-files/list-shared-files-doctor.use-case';
import { UpdateSharedFileDoctorUseCase } from '../../application/use-cases/shared-files/update-shared-file-doctor.use-case';
import { DeleteSharedFileDoctorUseCase } from '../../application/use-cases/shared-files/delete-shared-file-doctor.use-case';
import { MarkReadDoctorUseCase } from '../../application/use-cases/shared-files/mark-read-doctor.use-case';
import { GetUnreadCountsDoctorUseCase } from '../../application/use-cases/shared-files/get-unread-counts-doctor.use-case';

import {
  CreateSharedFileDoctorSchema,
  UpdateSharedFileSchema,
  MarkReadDoctorSchema,
  type CreateSharedFileDoctorDto,
  type UpdateSharedFileDto,
  type MarkReadDoctorDto,
} from '../../application/dtos/shared-file.dto';
import type { SharedFile } from '../../domain/entities/shared-file.entity';
import type { UnreadCountsResult } from '../../domain/repositories/shared-file.repository';

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

// ---------------------------------------------------------------------------
// UUID query-param schema (reused)
// ---------------------------------------------------------------------------

const PatientIdQuerySchema = z.object({
  patientId: z.string().uuid('patientId must be a valid UUID'),
});

/**
 * DoctorSharedFilesController — /api/doctor/shared-files
 *
 * All endpoints are scoped to the authenticated doctor (user.sub).
 * doctorId is ALWAYS derived from user.sub — never from body or params.
 *
 * SECURITY (anti-IDOR):
 *   - Create/list: validates patient.doctor_id === user.sub before any operation.
 *   - Update/delete: scoped by (id, doctorId) — wrong doctor gets 404.
 *   - mark-read/unread-counts: scoped by doctorId.
 */
@Controller('doctor/shared-files')
@UseGuards(AppAuthGuard)
export class DoctorSharedFilesController {
  constructor(
    private readonly createSharedFile: CreateSharedFileDoctorUseCase,
    private readonly listSharedFiles: ListSharedFilesDoctorUseCase,
    private readonly updateSharedFile: UpdateSharedFileDoctorUseCase,
    private readonly deleteSharedFile: DeleteSharedFileDoctorUseCase,
    private readonly markReadDoctor: MarkReadDoctorUseCase,
    private readonly getUnreadCounts: GetUnreadCountsDoctorUseCase,
  ) {}

  /**
   * GET /api/doctor/shared-files?patientId=<uuid>
   * Lists all shared files for the given patient, scoped to the doctor.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @Query(new ZodValidationPipe(PatientIdQuerySchema)) query: { patientId: string },
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<SharedFile[]>> {
    const items = await this.listSharedFiles.execute({
      doctorId: user.sub,
      patientId: query.patientId,
    });
    return ok(items);
  }

  /**
   * POST /api/doctor/shared-files
   * Creates a shared file (instruction / task / comment / file) for a patient.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateSharedFileDoctorSchema)) dto: CreateSharedFileDoctorDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<SharedFile>> {
    const item = await this.createSharedFile.execute({
      doctorId: user.sub,
      ...dto,
    });
    return ok(item);
  }

  /**
   * PATCH /api/doctor/shared-files/:id
   * Updates title, description, or status. Scoped to the owning doctor.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSharedFileSchema)) dto: UpdateSharedFileDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<SharedFile>> {
    const item = await this.updateSharedFile.execute({
      id,
      doctorId: user.sub,
      ...dto,
    });
    return ok(item);
  }

  /**
   * DELETE /api/doctor/shared-files/:id
   * Deletes the shared file row. GCS object cleanup is deferred (TODO).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.deleteSharedFile.execute({ id, doctorId: user.sub });
  }

  /**
   * POST /api/doctor/shared-files/mark-read
   * Marks read_by_doctor = true for all patient-created files of a given patient.
   */
  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Body(new ZodValidationPipe(MarkReadDoctorSchema)) dto: MarkReadDoctorDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ marked: true }>> {
    await this.markReadDoctor.execute({ doctorId: user.sub, patientId: dto.patientId });
    return ok({ marked: true });
  }

  /**
   * GET /api/doctor/shared-files/unread-counts
   * Returns { [patientId]: number } for badge display in the patient list.
   */
  @Get('unread-counts')
  @HttpCode(HttpStatus.OK)
  async unreadCounts(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<UnreadCountsResult>> {
    const counts = await this.getUnreadCounts.execute({ doctorId: user.sub });
    return ok(counts);
  }
}
