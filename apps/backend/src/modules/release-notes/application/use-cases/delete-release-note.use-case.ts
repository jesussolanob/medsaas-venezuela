import { Inject, Injectable } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
} from '../../domain/repositories/irelease-note.repository';
import { ReleaseNoteNotFoundError } from '../../domain/errors/release-note-not-found.error';
import { ReleaseNoteInvalidTransitionError } from '../../domain/errors/release-note-invalid-transition.error';

/**
 * Deletes a release note.
 *
 * Business rule: only drafts can be deleted.
 * A published note must be unpublished first (HTTP 409 if published).
 */
@Injectable()
export class DeleteReleaseNoteUseCase {
  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new ReleaseNoteNotFoundError(id);

    if (existing.isPublished()) {
      throw new ReleaseNoteInvalidTransitionError(
        'Solo se pueden eliminar borradores. Despublica la novedad antes de eliminarla.',
      );
    }

    await this.repo.delete(id);
  }
}
