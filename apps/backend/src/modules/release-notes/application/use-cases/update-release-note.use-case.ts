import { Inject, Injectable } from '@nestjs/common';
import {
  RELEASE_NOTE_REPOSITORY,
  type IReleaseNoteRepository,
} from '../../domain/repositories/irelease-note.repository';
import { ReleaseNote } from '../../domain/entities/release-note.entity';
import { ReleaseNoteNotFoundError } from '../../domain/errors/release-note-not-found.error';
import { ReleaseNoteInvalidError } from '../../domain/errors/release-note-invalid.error';
import { ReleaseNoteAudienceInvalidError } from '../../domain/errors/release-note-audience-invalid.error';
import type { UpdateReleaseNoteDto } from '@delta/shared-types';
import {
  type CreateReleaseNoteOutput,
  normaliseImagePath,
  toOutput,
} from './create-release-note.use-case';

/**
 * Updates editable fields on a release note (draft or published).
 * Editing a published note does NOT re-show it to doctors who already saw it.
 */
@Injectable()
export class UpdateReleaseNoteUseCase {
  constructor(
    @Inject(RELEASE_NOTE_REPOSITORY)
    private readonly repo: IReleaseNoteRepository,
  ) {}

  async execute(id: string, dto: UpdateReleaseNoteDto): Promise<CreateReleaseNoteOutput> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new ReleaseNoteNotFoundError(id);

    // Validate changed fields
    if (dto.title !== undefined) {
      const result = ReleaseNote.validateTitle(dto.title);
      if (!result.valid) throw new ReleaseNoteInvalidError(result.reason);
    }

    if (dto.body !== undefined) {
      const result = ReleaseNote.validateBody(dto.body);
      if (!result.valid) throw new ReleaseNoteInvalidError(result.reason);
    }

    if (dto.audiencePlans && dto.audiencePlans.length > 0) {
      const existingKeys = await this.repo.findAllPlanKeys();
      const unknownKeys = dto.audiencePlans.filter((k) => !existingKeys.includes(k));
      if (unknownKeys.length > 0) throw new ReleaseNoteAudienceInvalidError(unknownKeys);
    }

    const updated = await this.repo.update(id, {
      title: dto.title !== undefined ? dto.title.trim() : undefined,
      body: dto.body !== undefined ? dto.body.trim() : undefined,
      // Normalise: full GCS URL → bare path; bare path → unchanged; null → null.
      imageUrl: dto.imageUrl !== undefined ? normaliseImagePath(dto.imageUrl) : undefined,
      audiencePlans: dto.audiencePlans,
    });

    return toOutput(updated);
  }
}
