import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PublicUploadReceiptUseCase } from '../../application/use-cases/public-upload-receipt.use-case';
import type { StorageUploadResult } from '../../application/ports/storage.port';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * PublicStorageController
 *
 * Provides an UNAUTHENTICATED upload endpoint for booking payment receipts.
 * This exists because the booking flow (public, no auth) must upload
 * a payment proof before the appointment is confirmed.
 *
 * SECURITY:
 *   - NO auth guard — intentionally public (guests cannot obtain a token).
 *   - Accepts ONLY image/jpeg, image/png, image/webp, image/gif, application/pdf.
 *   - Magic-byte validation enforced in PublicUploadReceiptUseCase (no spoofing).
 *   - Max 10 MB.
 *   - Files stored under `receipts/public/` prefix — isolated from
 *     user-scoped private receipts (`receipt/<userId>/...`).
 *   - Does NOT expose existing files, signed URLs, or any user data.
 *   - Does NOT accept any `kind` parameter — kind is hardcoded to 'receipt'
 *     in the use case; callers cannot influence the storage path kind.
 *
 * Etapa 2 DEUDA: add Turnstile captcha + rate limiting (IP + bucket).
 */
@Controller('storage')
export class PublicStorageController {
  constructor(private readonly publicUploadReceipt: PublicUploadReceiptUseCase) {}

  /**
   * POST /api/storage/public-upload
   *
   * Multipart upload (field name: `file`).
   *
   * Returns a permanent public URL for the uploaded receipt so the doctor
   * can view the payment proof from the appointment panel at any time
   * without needing to refresh a time-limited signed URL.
   *
   * Accepted types: image/jpeg, image/png, image/webp, image/gif, application/pdf
   * Max size: 10 MB
   */
  @Post('public-upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async publicUpload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<SuccessResponse<StorageUploadResult>> {
    const result = await this.publicUploadReceipt.execute({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    return { success: true, data: result };
  }
}
