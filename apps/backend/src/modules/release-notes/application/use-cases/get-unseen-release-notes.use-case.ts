import { Inject, Injectable } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
  type UnseenNoteItem,
} from '../../domain/repositories/irelease-note.repository';

export interface UnseenNoteOutput {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: string;
}

export interface GetUnseenResult {
  items: UnseenNoteOutput[];
}

/**
 * Returns up to 5 published release notes the doctor has not yet seen.
 *
 * Conditions (evaluated in the repository via raw SQL, plan from DB JOIN):
 *   - published_at IS NOT NULL
 *   - audience_plans IS NULL OR p.plan = ANY(audience_plans)
 *   - published_at > GREATEST(COALESCE(release_notes_seen_at, '-infinity'), profiles.created_at)
 *
 * Ordered newest first (publishedAt DESC).
 */
@Injectable()
export class GetUnseenReleaseNotesUseCase {
  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
  ) {}

  async execute(doctorId: string): Promise<GetUnseenResult> {
    const items = await this.repo.findUnseenForDoctor(doctorId);
    return { items: items.map(toOutput) };
  }
}

function toOutput(item: UnseenNoteItem): UnseenNoteOutput {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    imageUrl: item.imageUrl,
    publishedAt: item.publishedAt.toISOString(),
  };
}
