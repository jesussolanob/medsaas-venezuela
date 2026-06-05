import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PORT } from './application/ports/storage.port';
import { createStorageAdapter } from './infrastructure/adapters/storage-adapter.factory';
import { UploadFileUseCase } from './application/use-cases/upload-file.use-case';
import { GetSignedUrlUseCase } from './application/use-cases/get-signed-url.use-case';
import { StorageController } from './presentation/controllers/storage.controller';

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
 */
@Module({
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_PORT,
      useFactory: (config: ConfigService) => createStorageAdapter(config),
      inject: [ConfigService],
    },
    UploadFileUseCase,
    GetSignedUrlUseCase,
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
