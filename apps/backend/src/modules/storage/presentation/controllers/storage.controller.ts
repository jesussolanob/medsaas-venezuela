import {
  Controller,
  Post,
  Get,
  Query,
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
import { GetSignedUrlUseCase } from '../../application/use-cases/get-signed-url.use-case';
import type { StorageUploadResult } from '../../application/ports/storage.port';
import type { GetSignedUrlResult } from '../../application/use-cases/get-signed-url.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * StorageController
 *
 * Handles file uploads and signed-URL generation scoped to the authenticated user.
 * Files are stored in the configured storage backend (MinIO in dev, GCS in prod).
 *
 * SECURITY:
 *   - userId is ALWAYS taken from the authenticated user (user.sub) — never from the body.
 *   - DevAuthGuard enforces authentication (Etapa 1).
 *   - File size, content-type, and magic-byte validation enforced in UploadFileUseCase.
 *     Max: 10 MB. Allowed types: jpeg, png, webp, gif, application/pdf.
 *   - SVG is excluded (XSS vector via embedded JavaScript).
 *   - Private kinds (receipt, document, signature) return signed URLs (TTL: 1 h).
 *   - Signed-URL endpoint enforces ownership: a user can only request URLs for
 *     their own private objects (anti-IDOR).
 */
@Controller('storage')
@UseGuards(DevAuthGuard)
export class StorageController {
  constructor(
    private readonly uploadFile: UploadFileUseCase,
    private readonly getSignedUrl: GetSignedUrlUseCase,
  ) {}

  /**
   * POST /api/storage/upload
   *
   * Multipart upload. Accepts a `file` field and a `kind` body field.
   *
   * Public kinds (avatar, logo):
   *   Returns a permanent public URL.
   *
   * Private kinds (receipt, document, signature):
   *   Returns a signed URL valid for 1 hour. Clients must refresh via
   *   GET /api/storage/signed-url before the URL expires.
   *
   * Allowed content types: image/jpeg, image/png, image/webp, image/gif, application/pdf
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

  /**
   * GET /api/storage/signed-url?path=<path>
   *
   * Returns a fresh signed URL (TTL: 1 hour) for a private object.
   *
   * Anti-IDOR: the `path` must start with `<privateKind>/<userId>/` where
   * `userId` is the authenticated user (user.sub). Attempting to sign a path
   * owned by a different user returns HTTP 422 (StorageValidationError).
   *
   * Only private kinds are accepted (receipt, document, signature).
   * Public objects (avatar, logo) are always served via their permanent URL.
   */
  @Get('signed-url')
  @HttpCode(HttpStatus.OK)
  async signedUrl(
    @Query('path') path: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<GetSignedUrlResult>> {
    const result = await this.getSignedUrl.execute({
      path,
      userId: user.sub,
    });

    return { success: true, data: result };
  }
}
