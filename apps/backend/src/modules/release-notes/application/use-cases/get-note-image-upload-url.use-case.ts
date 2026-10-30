import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_PORT, type IStoragePort } from '../../../storage/application/ports/storage.port';
import { UploadFileUseCase } from '../../../storage/application/use-cases/upload-file.use-case';

export interface GetNoteImageUploadUrlInput {
  actorId: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface GetNoteImageUploadUrlOutput {
  /** Signed URL for reading the uploaded image. */
  imageUrl: string;
  /** Stored path — persist this in release_notes.image_url. */
  path: string;
}

/**
 * Uploads an image file for a release note and returns a signed read URL
 * along with the stored path.
 *
 * Reuses UploadFileUseCase for all validation (MIME, size, magic bytes).
 * Uses kind='logo' so images are stored as public objects (permanent URL,
 * no expiry). The stored path is saved in release_notes.image_url.
 *
 * NOTE: 'logo' is the closest existing public kind — these images are
 * intended for modal display, need no access control, and share the same
 * image constraints as logos (JPEG/PNG/WEBP, 10 MB max).
 */
@Injectable()
export class GetNoteImageUploadUrlUseCase {
  constructor(
    private readonly uploadFile: UploadFileUseCase,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(input: GetNoteImageUploadUrlInput): Promise<GetNoteImageUploadUrlOutput> {
    const result = await this.uploadFile.execute({
      buffer: input.buffer,
      originalname: input.originalname,
      mimetype: input.mimetype,
      size: input.size,
      kind: 'logo',
      userId: input.actorId,
    });

    return {
      imageUrl: result.url,
      path: result.path,
    };
  }
}
