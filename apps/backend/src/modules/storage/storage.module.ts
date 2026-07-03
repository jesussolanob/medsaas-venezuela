import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PORT } from './application/ports/storage.port';
import { createStorageAdapter } from './infrastructure/adapters/storage-adapter.factory';
import { UploadFileUseCase } from './application/use-cases/upload-file.use-case';
import { GetSignedUrlUseCase } from './application/use-cases/get-signed-url.use-case';
import { PublicUploadReceiptUseCase } from './application/use-cases/public-upload-receipt.use-case';
import { StorageController } from './presentation/controllers/storage.controller';
import { PublicStorageController } from './presentation/controllers/public-storage.controller';

/**
 * StorageModule — file upload API backed by MinIO (dev) or GCS (prod).
 *
 * The active adapter is selected at runtime via the STORAGE_DRIVER env var.
 * Default: 'minio' (development). Set to 'gcs' in production.
 *
 * NOTE: No Sequelize models — files live in the bucket. URLs are stored
 * in existing columns (e.g. profiles.avatar_url) by other modules.
 * This avoids migration timestamp collisions with parallel agent work.
 *
 * IMPORTANT: Never add Sequelize or database providers here — this module
 * is intentionally infrastructure-light (no DB dependency).
 *
 * PublicStorageController is intentionally unguarded — it provides the
 * public-upload endpoint for booking payment receipts (unauthenticated callers).
 */
@Module({
  controllers: [StorageController, PublicStorageController],
  providers: [
    {
      provide: STORAGE_PORT,
      useFactory: (config: ConfigService) => createStorageAdapter(config),
      inject: [ConfigService],
    },
    UploadFileUseCase,
    GetSignedUrlUseCase,
    PublicUploadReceiptUseCase,
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
