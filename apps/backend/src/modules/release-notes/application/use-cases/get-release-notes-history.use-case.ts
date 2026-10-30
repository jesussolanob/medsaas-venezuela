import { Inject, Injectable } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
} from '../../domain/repositories/irelease-note.repository';
import type { UnseenNoteOutput } from './get-unseen-release-notes.use-case';

/**
 * Returns the history of all published release notes for the doctor's plan.
 *
 * Ordered by publishedAt DESC, limit 50.
 * Includes notes the doctor has already seen.
 */
@Injectable()
export class GetReleaseNotesHistoryUseCase {
  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
  ) {}

  async execute(doctorId: string): Promise<{ items: UnseenNoteOutput[] }> {
    const items = await this.repo.findPublishedForDoctor(doctorId);
    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        imageUrl: item.imageUrl,
        publishedAt: item.publishedAt.toISOString(),
      })),
    };
  }
}
