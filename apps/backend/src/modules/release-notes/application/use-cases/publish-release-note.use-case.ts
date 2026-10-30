import { Inject, Injectable } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
} from '../../domain/repositories/irelease-note.repository';
import { ReleaseNoteNotFoundError } from '../../domain/errors/release-note-not-found.error';
import { ReleaseNoteInvalidTransitionError } from '../../domain/errors/release-note-invalid-transition.error';
import { type CreateReleaseNoteOutput, toOutput } from './create-release-note.use-case';

/**
 * Publishes a draft release note (sets published_at to server time).
 *
 * Business rule: only drafts can be published.
 * Throws ReleaseNoteInvalidTransitionError (409) if already published.
 */
@Injectable()
export class PublishReleaseNoteUseCase {
  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
  ) {}

  async execute(id: string): Promise<CreateReleaseNoteOutput> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new ReleaseNoteNotFoundError(id);

    if (existing.isPublished()) {
      throw new ReleaseNoteInvalidTransitionError('Esta novedad ya está publicada.');
    }

    const published = await this.repo.publish(id, new Date());
    return toOutput(published);
  }
}
