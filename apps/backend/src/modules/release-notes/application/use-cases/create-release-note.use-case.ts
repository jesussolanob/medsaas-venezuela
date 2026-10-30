import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
} from '../../domain/repositories/irelease-note.repository';
import { ReleaseNote } from '../../domain/entities/release-note.entity';
import { ReleaseNoteInvalidError } from '../../domain/errors/release-note-invalid.error';
import { ReleaseNoteAudienceInvalidError } from '../../domain/errors/release-note-audience-invalid.error';
import type { CreateReleaseNoteDto } from '@delta/shared-types';

export interface CreateReleaseNoteOutput {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  audiencePlans: string[] | null;
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates a new release note as a draft.
 *
 * Business rules:
 *   1. title and body must pass domain invariants (length, no HTML).
 *   2. audiencePlans keys, when provided, must exist in plan_configs.
 *   3. imageUrl is stored as-is (already a GCS path/URL from the upload flow).
 */
@Injectable()
export class CreateReleaseNoteUseCase {
  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
  ) {}

  async execute(dto: CreateReleaseNoteDto, actorId: string): Promise<CreateReleaseNoteOutput> {
    // 1. Validate title
    const titleResult = ReleaseNote.validateTitle(dto.title);
    if (!titleResult.valid) throw new ReleaseNoteInvalidError(titleResult.reason);

    // 2. Validate body
    const bodyResult = ReleaseNote.validateBody(dto.body);
    if (!bodyResult.valid) throw new ReleaseNoteInvalidError(bodyResult.reason);

    // 3. Validate audiencePlans keys
    if (dto.audiencePlans && dto.audiencePlans.length > 0) {
      const existingKeys = await this.repo.findAllPlanKeys();
      const unknownKeys = dto.audiencePlans.filter((k) => !existingKeys.includes(k));
      if (unknownKeys.length > 0) throw new ReleaseNoteAudienceInvalidError(unknownKeys);
    }

    const note = await this.repo.create({
      id: randomUUID(),
      title: dto.title.trim(),
      body: dto.body.trim(),
      imageUrl: dto.imageUrl ?? null,
      audiencePlans: dto.audiencePlans ?? null,
      publishedAt: null,
      createdBy: actorId,
    });

    return toOutput(note);
  }
}

export function toOutput(note: ReleaseNote): CreateReleaseNoteOutput {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    imageUrl: note.imageUrl,
    audiencePlans: note.audiencePlans,
    publishedAt: note.publishedAt ? note.publishedAt.toISOString() : null,
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
