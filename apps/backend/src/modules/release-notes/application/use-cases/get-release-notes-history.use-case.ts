import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
  type UnseenNoteItem,
} from '../../domain/repositories/irelease-note.repository';
import { STORAGE_PORT, type IStoragePort } from '../../../storage/application/ports/storage.port';
import { signStoredImagePath } from '../../../storage/application/helpers/resign-gcs-image.helper';
import { isValidNoteImagePath } from './create-release-note.use-case';
import type { UnseenNoteOutput } from './get-unseen-release-notes.use-case';

/**
 * Returns the history of all published release notes for the doctor's plan.
 *
 * Ordered by publishedAt DESC, limit 50.
 * Includes notes the doctor has already seen.
 *
 * Images stored as bare GCS paths are signed in parallel; failures fall back
 * to null and log a warn without PII.
 */
@Injectable()
export class GetReleaseNotesHistoryUseCase {
  private readonly logger = new Logger(GetReleaseNotesHistoryUseCase.name);

  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
    @Inject(STORAGE_PORT)
    private readonly storagePort: IStoragePort,
  ) {}

  async execute(doctorId: string): Promise<{ items: UnseenNoteOutput[] }> {
    const items = await this.repo.findPublishedForDoctor(doctorId);

    const signedUrls = await Promise.all(
      items.map((item) => {
        if (item.imageUrl !== null && !isValidNoteImagePath(item.imageUrl)) {
          return Promise.resolve(null);
        }
        return signStoredImagePath(item.imageUrl, this.storagePort, () => {
          this.logger.warn('[release-notes] history — image re-sign failed');
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
