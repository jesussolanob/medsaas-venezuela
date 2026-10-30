import { Inject, Injectable } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
} from '../../domain/repositories/irelease-note.repository';
import { ReleaseNoteNotFoundError } from '../../domain/errors/release-note-not-found.error';
import { ReleaseNoteInvalidTransitionError } from '../../domain/errors/release-note-invalid-transition.error';
import { type CreateReleaseNoteOutput, toOutput } from './create-release-note.use-case';

/**
 * Unpublishes a published release note (sets published_at to NULL).
 *
 * Business rule: only published notes can be unpublished.
 * Throws ReleaseNoteInvalidTransitionError (409) if already a draft.
 */
@Injectable()
export class UnpublishReleaseNoteUseCase {
  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
  ) {}

  async execute(id: string): Promise<CreateReleaseNoteOutput> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new ReleaseNoteNotFoundError(id);

    if (existing.isDraft()) {
      throw new ReleaseNoteInvalidTransitionError('Esta novedad ya es un borrador (no publicada).');
    }

    const unpublished = await this.repo.unpublish(id);
    return toOutput(unpublished);
  }
}
