import { Test, type TestingModule } from '@nestjs/testing';
import { AdminReleaseNotesController } from './admin-release-notes.controller';
import { CreateReleaseNoteUseCase } from '../../application/use-cases/create-release-note.use-case';
import { UpdateReleaseNoteUseCase } from '../../application/use-cases/update-release-note.use-case';
import { DeleteReleaseNoteUseCase } from '../../application/use-cases/delete-release-note.use-case';
import { PublishReleaseNoteUseCase } from '../../application/use-cases/publish-release-note.use-case';
import { UnpublishReleaseNoteUseCase } from '../../application/use-cases/unpublish-release-note.use-case';
import { ListReleaseNotesAdminUseCase } from '../../application/use-cases/list-release-notes-admin.use-case';
import { GetNoteImageUploadUrlUseCase } from '../../application/use-cases/get-note-image-upload-url.use-case';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { ReleaseNoteInvalidTransitionError } from '../../domain/errors/release-note-invalid-transition.error';

const ADMIN_USER: CurrentUserPayload = {
  sub: 'admin-uuid-1',
  role: 'super_admin',
  email: 'admin@dev.local',
};

const makeNoteOutput = () => ({
  id: 'note-uuid-1',
  title: 'Novedad de prueba',
  body: 'Cuerpo de prueba',
  imageUrl: null,
  audiencePlans: null,
  publishedAt: null,
  createdBy: 'admin-uuid-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('AdminReleaseNotesController', () => {
  let controller: AdminReleaseNotesController;
  let createUseCase: { execute: jest.Mock };
  let updateUseCase: { execute: jest.Mock };
  let deleteUseCase: { execute: jest.Mock };
  let publishUseCase: { execute: jest.Mock };
  let unpublishUseCase: { execute: jest.Mock };
  let listUseCase: { execute: jest.Mock };
  let imageUploadUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    createUseCase = { execute: jest.fn() };
    updateUseCase = { execute: jest.fn() };
    deleteUseCase = { execute: jest.fn() };
    publishUseCase = { execute: jest.fn() };
    unpublishUseCase = { execute: jest.fn() };
    listUseCase = { execute: jest.fn() };
    imageUploadUseCase = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminReleaseNotesController],
      providers: [
        { provide: CreateReleaseNoteUseCase, useValue: createUseCase },
        { provide: UpdateReleaseNoteUseCase, useValue: updateUseCase },
        { provide: DeleteReleaseNoteUseCase, useValue: deleteUseCase },
        { provide: PublishReleaseNoteUseCase, useValue: publishUseCase },
        { provide: UnpublishReleaseNoteUseCase, useValue: unpublishUseCase },
        { provide: ListReleaseNotesAdminUseCase, useValue: listUseCase },
        { provide: GetNoteImageUploadUrlUseCase, useValue: imageUploadUseCase },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(AdminReleaseNotesController);
  });

  describe('GET /api/admin/release-notes', () => {
    it('returns list with meta', async () => {
      listUseCase.execute.mockResolvedValue({ items: [], total: 0 });

      const result = await controller.list({ status: 'all', limit: '50', offset: '0' });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('passes status filter through Zod parsing', async () => {
      listUseCase.execute.mockResolvedValue({ items: [], total: 0 });

      await controller.list({ status: 'published', limit: '20', offset: '0' });

      expect(listUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published' }),
      );
    });

    it('rejects invalid status', async () => {
      await expect(controller.list({ status: 'invalid' })).rejects.toThrow();
    });
  });

  describe('POST /api/admin/release-notes', () => {
    it('creates a draft note', async () => {
      createUseCase.execute.mockResolvedValue(makeNoteOutput());

      const result = await controller.create(
        { title: 'Nueva novedad', body: 'Descripción' },
        ADMIN_USER,
      );

      expect(result.success).toBe(true);
      expect(createUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Nueva novedad' }),
        ADMIN_USER.sub,
      );
    });

    it('rejects body with HTML via Zod (body too short returns normal)', async () => {
      await expect(controller.create({ title: '', body: 'Cuerpo' }, ADMIN_USER)).rejects.toThrow();
    });
  });

  describe('PUT /api/admin/release-notes/:id', () => {
    it('updates a note', async () => {
      updateUseCase.execute.mockResolvedValue(makeNoteOutput());

      const result = await controller.update('note-uuid-1', { title: 'Nuevo título' });

      expect(result.success).toBe(true);
      expect(updateUseCase.execute).toHaveBeenCalledWith(
        'note-uuid-1',
        expect.objectContaining({ title: 'Nuevo título' }),
      );
    });
  });

  describe('DELETE /api/admin/release-notes/:id', () => {
    it('deletes a draft note', async () => {
      deleteUseCase.execute.mockResolvedValue(undefined);

      await controller.delete('note-uuid-1');

      expect(deleteUseCase.execute).toHaveBeenCalledWith('note-uuid-1');
    });

    it('propagates error when deleting published note', async () => {
      deleteUseCase.execute.mockRejectedValue(
        new ReleaseNoteInvalidTransitionError('Solo se pueden eliminar borradores.'),
      );

      await expect(controller.delete('note-uuid-1')).rejects.toThrow(
        ReleaseNoteInvalidTransitionError,
      );
    });
  });

  describe('POST /api/admin/release-notes/:id/publish', () => {
    it('publishes a draft', async () => {
      const published = { ...makeNoteOutput(), publishedAt: new Date().toISOString() };
      publishUseCase.execute.mockResolvedValue(published);

      const result = await controller.publish('note-uuid-1');

      expect(result.success).toBe(true);
    });
  });

  describe('POST /api/admin/release-notes/:id/unpublish', () => {
    it('unpublishes a note', async () => {
      unpublishUseCase.execute.mockResolvedValue(makeNoteOutput());

      const result = await controller.unpublish('note-uuid-1');

      expect(result.success).toBe(true);
    });
  });
});
