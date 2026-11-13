import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models
import { ReleaseNoteModel } from './infrastructure/persistence/models/release-note.model';
import { ReleaseNoteProfileModel } from './infrastructure/persistence/models/release-note-profile.model';

// Repository binding
import { RELEASE_NOTE_REPOSITORY } from './domain/repositories/irelease-note.repository';
import { SequelizeReleaseNoteRepository } from './infrastructure/persistence/repositories/sequelize-release-note.repository';

// Use cases — admin
import { CreateReleaseNoteUseCase } from './application/use-cases/create-release-note.use-case';
import { UpdateReleaseNoteUseCase } from './application/use-cases/update-release-note.use-case';
import { DeleteReleaseNoteUseCase } from './application/use-cases/delete-release-note.use-case';
import { PublishReleaseNoteUseCase } from './application/use-cases/publish-release-note.use-case';
import { UnpublishReleaseNoteUseCase } from './application/use-cases/unpublish-release-note.use-case';
import { ListReleaseNotesAdminUseCase } from './application/use-cases/list-release-notes-admin.use-case';
import { GetNoteImageUploadUrlUseCase } from './application/use-cases/get-note-image-upload-url.use-case';

// Use cases — doctor
import { GetUnseenReleaseNotesUseCase } from './application/use-cases/get-unseen-release-notes.use-case';
import { MarkReleaseNotesSeenUseCase } from './application/use-cases/mark-release-notes-seen.use-case';
import { GetReleaseNotesHistoryUseCase } from './application/use-cases/get-release-notes-history.use-case';

// Guards
import { RolesGuard } from '../../presentation/guards/roles.guard';

// Storage (for image upload)
import { StorageModule } from '../storage/storage.module';
import { UploadFileUseCase } from '../storage/application/use-cases/upload-file.use-case';

// Controllers
import { AdminReleaseNotesController } from './presentation/controllers/admin-release-notes.controller';
import { DoctorReleaseNotesController } from './presentation/controllers/doctor-release-notes.controller';

/**
 * ReleaseNotesModule — "Novedades de versión" feature (Fase 2 del plan de retención).
 *
 * Admin endpoints (super_admin and admin):
 *   GET    /api/admin/release-notes                      — list (status filter, pagination)
 *   POST   /api/admin/release-notes                      — create draft
 *   PUT    /api/admin/release-notes/:id                  — update
 *   DELETE /api/admin/release-notes/:id                  — delete (drafts only)
 *   POST   /api/admin/release-notes/:id/publish          — publish
 *   POST   /api/admin/release-notes/:id/unpublish        — unpublish
 *   POST   /api/admin/release-notes/image-upload         — upload image
 *
 * Doctor endpoints:
 *   GET  /api/doctor/release-notes/unseen  — unseen notes for the modal (max 5)
 *   POST /api/doctor/release-notes/seen    — mark all notes as seen
 *   GET  /api/doctor/release-notes         — history (all published, limit 50)
 *
 * IMPORTANT: Sequelize is NOT added to the providers array — it is already
 * registered globally by SequelizeModule.forRootAsync in AppModule.
 * Adding it again here causes a crash in the dist build.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([ReleaseNoteModel, ReleaseNoteProfileModel]),
    // StorageModule exports STORAGE_PORT for image upload use case.
    StorageModule,
  ],
  controllers: [AdminReleaseNotesController, DoctorReleaseNotesController],
  providers: [
    {
      provide: RELEASE_NOTE_REPOSITORY,
      useClass: SequelizeReleaseNoteRepository,
    },
    RolesGuard,
    // Admin use cases
    CreateReleaseNoteUseCase,
    UpdateReleaseNoteUseCase,
    DeleteReleaseNoteUseCase,
    PublishReleaseNoteUseCase,
    UnpublishReleaseNoteUseCase,
    ListReleaseNotesAdminUseCase,
    // Image upload — wraps UploadFileUseCase from StorageModule
    UploadFileUseCase,
    GetNoteImageUploadUrlUseCase,
    // Doctor use cases
    GetUnseenReleaseNotesUseCase,
    MarkReleaseNotesSeenUseCase,
    GetReleaseNotesHistoryUseCase,
  ],
})
export class ReleaseNotesModule {}
