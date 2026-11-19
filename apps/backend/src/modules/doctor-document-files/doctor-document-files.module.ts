import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { DoctorDocumentFileModel } from './infrastructure/database/models/doctor-document-file.model';
import { SequelizeDoctorDocumentFileRepository } from './infrastructure/database/repositories/sequelize-doctor-document-file.repository';
import { DOCTOR_DOCUMENT_FILE_REPOSITORY } from './domain/repositories/doctor-document-file.repository';

import { ListDoctorDocumentFilesUseCase } from './application/use-cases/list-doctor-document-files.use-case';
import { CreateDoctorDocumentFileUseCase } from './application/use-cases/create-doctor-document-file.use-case';
import { RenameDoctorDocumentFileUseCase } from './application/use-cases/rename-doctor-document-file.use-case';
import { DeleteDoctorDocumentFileUseCase } from './application/use-cases/delete-doctor-document-file.use-case';
import { GetDoctorDocumentFileUrlUseCase } from './application/use-cases/get-doctor-document-file-url.use-case';

import { DoctorDocumentFilesController } from './presentation/controllers/doctor-document-files.controller';

import { StorageModule } from '../storage/storage.module';

/**
 * DoctorDocumentFilesModule — manages the doctor's "Documentos frecuentes" library.
 *
 * Exports DOCTOR_DOCUMENT_FILE_REPOSITORY so other modules (DocumentSharingModule)
 * can inject it to validate library file IDs when building share attachments.
 *
 * IMPORTANT: StorageModule is imported here for GetDoctorDocumentFileUrlUseCase.
 * CryptoService, ConfigModule, Sequelize are global — do NOT add to providers.
 */
@Module({
  imports: [SequelizeModule.forFeature([DoctorDocumentFileModel]), StorageModule],
  controllers: [DoctorDocumentFilesController],
  providers: [
    // Repository binding — exported for DocumentSharingModule
    {
      provide: DOCTOR_DOCUMENT_FILE_REPOSITORY,
      useClass: SequelizeDoctorDocumentFileRepository,
    },

    // Use cases
    ListDoctorDocumentFilesUseCase,
    CreateDoctorDocumentFileUseCase,
    RenameDoctorDocumentFileUseCase,
    DeleteDoctorDocumentFileUseCase,
    GetDoctorDocumentFileUrlUseCase,
  ],
  exports: [DOCTOR_DOCUMENT_FILE_REPOSITORY],
})
export class DoctorDocumentFilesModule {}
