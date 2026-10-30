import { Inject, Injectable } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
} from '../../domain/repositories/irelease-note.repository';

export interface MarkSeenOutput {
  seenAt: string;
}

/**
 * Marks all release notes as seen for the doctor (sets profiles.release_notes_seen_at).
 *
 * The timestamp is always set by the server — never passed by the client.
 */
@Injectable()
export class MarkReleaseNotesSeenUseCase {
  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
  ) {}

  async execute(doctorId: string): Promise<MarkSeenOutput> {
    const seenAt = new Date();
    await this.repo.markSeen(doctorId, seenAt);
    return { seenAt: seenAt.toISOString() };
  }
}
