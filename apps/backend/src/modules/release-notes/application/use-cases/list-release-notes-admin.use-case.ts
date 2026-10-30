import { Inject, Injectable } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
  type AdminListItem,
} from '../../domain/repositories/irelease-note.repository';
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
 */
@Injectable()
export class ListReleaseNotesAdminUseCase {
  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
  ) {}

  async execute(query: ListReleaseNotesQuery): Promise<AdminListOutput> {
    const result = await this.repo.adminList({
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: result.items.map(toAdminItem),
      total: result.total,
    };
  }
}

function toAdminItem(item: AdminListItem): AdminNoteItem {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    imageUrl: item.imageUrl,
    audiencePlans: item.audiencePlans,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    createdBy: item.createdBy,
    createdByName: item.createdByName,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
