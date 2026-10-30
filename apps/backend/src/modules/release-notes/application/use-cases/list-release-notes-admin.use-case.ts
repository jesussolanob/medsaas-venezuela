import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
  type AdminListItem,
} from '../../domain/repositories/irelease-note.repository';
import { STORAGE_PORT, type IStoragePort } from '../../../storage/application/ports/storage.port';
import { signStoredImagePath } from '../../../storage/application/helpers/resign-gcs-image.helper';
import type { ListReleaseNotesQuery } from '@delta/shared-types';

export interface AdminListOutput {
  items: AdminNoteItem[];
  total: number;
}

export interface AdminNoteItem {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  audiencePlans: string[] | null;
  publishedAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lists release notes for admin view with optional status filter.
 *
 * Draft notes: ordered by updatedAt DESC.
 * Published notes: ordered by publishedAt DESC.
 * All: published first (publishedAt DESC), then drafts (updatedAt DESC).
 *
 * Images stored as bare GCS paths are signed in parallel; failures fall back
 * to null and log a warn without PII.
 */
@Injectable()
export class ListReleaseNotesAdminUseCase {
  private readonly logger = new Logger(ListReleaseNotesAdminUseCase.name);

  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
    @Inject(STORAGE_PORT)
    private readonly storagePort: IStoragePort,
  ) {}

  async execute(query: ListReleaseNotesQuery): Promise<AdminListOutput> {
    const result = await this.repo.adminList({
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });

    const signedUrls = await Promise.all(
      result.items.map((item) =>
        signStoredImagePath(item.imageUrl, this.storagePort, () => {
          this.logger.warn('[release-notes] admin-list — image re-sign failed');
        }),
      ),
    );

    return {
      items: result.items.map((item, i) => toAdminItem(item, signedUrls[i] ?? null)),
      total: result.total,
    };
  }
}

function toAdminItem(item: AdminListItem, signedImageUrl: string | null): AdminNoteItem {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    imageUrl: signedImageUrl,
    audiencePlans: item.audiencePlans,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    createdBy: item.createdBy,
    createdByName: item.createdByName,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
