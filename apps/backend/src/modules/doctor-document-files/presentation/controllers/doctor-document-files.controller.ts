import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateDoctorDocumentFileDtoSchema,
  RenameDoctorDocumentFileDtoSchema,
  type CreateDoctorDocumentFileDto,
  type RenameDoctorDocumentFileDto,
} from '../../application/dtos/doctor-document-file.dto';
import { ListDoctorDocumentFilesUseCase } from '../../application/use-cases/list-doctor-document-files.use-case';
import { CreateDoctorDocumentFileUseCase } from '../../application/use-cases/create-doctor-document-file.use-case';
import { RenameDoctorDocumentFileUseCase } from '../../application/use-cases/rename-doctor-document-file.use-case';
import { DeleteDoctorDocumentFileUseCase } from '../../application/use-cases/delete-doctor-document-file.use-case';
import { GetDoctorDocumentFileUrlUseCase } from '../../application/use-cases/get-doctor-document-file-url.use-case';
import type { DoctorDocumentFileListItem } from '../../application/use-cases/list-doctor-document-files.use-case';
import type { GetDoctorDocumentFileUrlOutput } from '../../application/use-cases/get-doctor-document-file-url.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * DoctorDocumentFilesController
 *
 * All endpoints require AppAuthGuard. The doctorId is ALWAYS taken from
 * user.sub (never from the body or URL) — anti-IDOR at the controller level.
 *
 * Endpoints:
 *   GET    /api/doctor/document-files               → list library
 *   POST   /api/doctor/document-files               → register a file
 *   PATCH  /api/doctor/document-files/:id           → rename
 *   DELETE /api/doctor/document-files/:id           → soft delete
 *   GET    /api/doctor/document-files/:id/url       → signed URL for preview
 */
@Controller('doctor/document-files')
@UseGuards(AppAuthGuard)
export class DoctorDocumentFilesController {
  constructor(
    private readonly listFiles: ListDoctorDocumentFilesUseCase,
    private readonly createFile: CreateDoctorDocumentFileUseCase,
    private readonly renameFile: RenameDoctorDocumentFileUseCase,
    private readonly deleteFile: DeleteDoctorDocumentFileUseCase,
    private readonly getFileUrl: GetDoctorDocumentFileUrlUseCase,
  ) {}

  /**
   * GET /api/doctor/document-files
   *
   * Lists the doctor's active library files.
   * No signed URLs in the list — preview URLs are on-demand via /:id/url.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<DoctorDocumentFileListItem[]>> {
    const data = await this.listFiles.execute(user.sub);
    return { success: true, data };
  }

  /**
   * POST /api/doctor/document-files
   *
   * Registers a file already uploaded to storage in the library.
   *
   * Body: { name, filePath, mimeType, sizeBytes }
   *   - filePath must start with `document/<doctorId>/` — validated in use case.
   *   - mimeType must be one of the allowed types (application/pdf, image/*).
   *
   * Error codes:
   *   422 DoctorDocumentFileInvalidPathError — path fails ownership prefix check
   *   422 DoctorDocumentFileLimitExceededError — 50-file limit reached
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateDoctorDocumentFileDtoSchema))
    dto: CreateDoctorDocumentFileDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<DoctorDocumentFileListItem>> {
    const data = await this.createFile.execute({ doctorId: user.sub, dto });
    return { success: true, data };
  }

  /**
   * PATCH /api/doctor/document-files/:id
   *
   * Renames a file in the library.
   * Body: { name }
   *
   * Error codes:
   *   404 DoctorDocumentFileNotFoundError — file not found or not owned
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RenameDoctorDocumentFileDtoSchema))
    dto: RenameDoctorDocumentFileDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<null>> {
    await this.renameFile.execute({ id, doctorId: user.sub, name: dto.name });
    return { success: true, data: null };
  }

  /**
   * DELETE /api/doctor/document-files/:id
   *
   * Soft-deletes a file from the library.
   * The underlying storage object is NOT deleted (past share links may reference it).
   *
   * Error codes:
   *   404 DoctorDocumentFileNotFoundError — file not found or not owned
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<null>> {
    await this.deleteFile.execute({ id, doctorId: user.sub });
    return { success: true, data: null };
  }

  /**
   * GET /api/doctor/document-files/:id/url
   *
   * Returns a short-lived signed URL (5 minutes) for previewing a library file.
   *
   * Error codes:
   *   404 DoctorDocumentFileNotFoundError — file not found or not owned
   */
  @Get(':id/url')
  async getUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<GetDoctorDocumentFileUrlOutput>> {
    const data = await this.getFileUrl.execute({ id, doctorId: user.sub });
    return { success: true, data };
  }
}
