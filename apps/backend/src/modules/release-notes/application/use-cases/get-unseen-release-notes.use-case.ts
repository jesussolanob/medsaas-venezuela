import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
  type UnseenNoteItem,
} from '../../domain/repositories/irelease-note.repository';
import { STORAGE_PORT, type IStoragePort } from '../../../storage/application/ports/storage.port';
import { signStoredImagePath } from '../../../storage/application/helpers/resign-gcs-image.helper';
import { isValidNoteImagePath } from './create-release-note.use-case';

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
 *
 * Images are stored as bare GCS object paths. Each path is signed on read
 * via Promise.all so no item blocks another. A signing failure falls back to
 * null (not the raw path) and logs a warn without PII.
 */
@Injectable()
export class GetUnseenReleaseNotesUseCase {
  private readonly logger = new Logger(GetUnseenReleaseNotesUseCase.name);

  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
    @Inject(STORAGE_PORT)
    private readonly storagePort: IStoragePort,
  ) {}

  async execute(doctorId: string): Promise<GetUnseenResult> {
    const items = await this.repo.findUnseenForDoctor(doctorId);

    const signedUrls = await Promise.all(
      items.map((item) => {
        // Guard: only sign paths produced by this module's own upload (logo/<uuid>/<file>).
        // Rows written before the fix or with invalid paths return null — no IDOR possible.
        if (item.imageUrl !== null && !isValidNoteImagePath(item.imageUrl)) {
          return Promise.resolve(null);
        }
        return signStoredImagePath(item.imageUrl, this.storagePort, () => {
          this.logger.warn('[release-notes] unseen — image re-sign failed');
        });
      }),
    );

    return {
      items: items.map((item, i) => toOutput(item, signedUrls[i] ?? null)),
    };
  }
}

function toOutput(item: UnseenNoteItem, signedImageUrl: string | null): UnseenNoteOutput {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    imageUrl: signedImageUrl,
    publishedAt: item.publishedAt.toISOString(),
  };
}
