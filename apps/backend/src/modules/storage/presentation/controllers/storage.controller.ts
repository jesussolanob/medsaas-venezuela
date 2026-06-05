import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { UploadFileUseCase } from '../../application/use-cases/upload-file.use-case';
import type { StorageUploadResult } from '../../application/ports/storage.port';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * StorageController
 *
 * Handles file uploads scoped to the authenticated user (doctor-scoped).
 * Files are uploaded to the configured storage backend (MinIO in dev, GCS in prod).
 *
 * SECURITY:
 *   - userId is ALWAYS taken from the authenticated user (user.sub) — never from the body.
 *   - DevAuthGuard enforces authentication (Etapa 1).
 *   - File size and content-type validation is enforced in UploadFileUseCase (domain rule).
 *     Max: 10 MB. Allowed types: images (jpeg, png, webp, gif, svg) + application/pdf.
 */
@Controller('storage')
@UseGuards(DevAuthGuard)
export class StorageController {
  constructor(private readonly uploadFile: UploadFileUseCase) {}

  /**
   * POST /api/storage/upload
   *
   * Multipart upload. Accepts a `file` field and a `kind` body field.
   * Allowed kinds: avatar | receipt | document | logo | signature
   * Allowed types: images (jpeg, png, webp, gif, svg) + application/pdf
   * Max size: 10 MB
   */
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<StorageUploadResult>> {
    const result = await this.uploadFile.execute({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      kind,
      userId: user.sub,
    });

    return { success: true, data: result };
  }
}
