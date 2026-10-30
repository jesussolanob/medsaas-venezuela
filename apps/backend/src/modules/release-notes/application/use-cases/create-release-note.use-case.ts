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
import { extractGcsPath } from '../../../storage/application/helpers/resign-gcs-image.helper';

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
 *   3. imageUrl is normalised to a bare GCS object path before persisting:
 *      - If a full GCS URL is received (e.g. from old clients or copy-paste),
 *        extractGcsPath strips the scheme+bucket so only the path is stored.
 *      - If already a bare path or null, stored as-is.
 *      This ensures re-signing at read time always works correctly.
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
      imageUrl: normaliseImagePath(dto.imageUrl),
      audiencePlans: dto.audiencePlans ?? null,
      publishedAt: null,
      createdBy: actorId,
    });

    return toOutput(note);
  }
}

/**
 * Validates that a normalised path was produced by this module's own upload.
 *
 * Accepted shape: `logo/<uuid>/<filename>`
 *   - `logo/` prefix   — enforced by UploadFileUseCase with kind='logo'
 *   - UUID segment     — 36 hex+dash chars (the actorId / user.sub)
 *   - filename segment — only chars produced by sanitizeFilename: [A-Za-z0-9._-]
 *   - no `..`          — explicit path-traversal guard
 *
 * Any other value (e.g. receipt/…, ../…, external URL) must be rejected.
 * This prevents IDOR: an admin cannot manufacture a path into another
 * doctor's private receipt/document bucket.
 */
const VALID_NOTE_IMAGE_PATH_RE = /^logo\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;

export function isValidNoteImagePath(path: string): boolean {
  if (path.includes('..')) return false;
  return VALID_NOTE_IMAGE_PATH_RE.test(path);
}

/**
 * Normalises an imageUrl/imagePath value before persisting:
 *   - Full GCS signed URL → strips scheme+bucket, returns bare object path.
 *   - Bare path → used as-is.
 *   - Null/undefined → null (no image).
 *
 * After normalisation the path MUST match the `logo/<uuid>/<file>` pattern.
 * Anything else (wrong prefix, external URL, traversal) throws
 * ReleaseNoteInvalidError 422 to prevent IDOR via crafted paths.
 */
export function normaliseImagePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const extracted = extractGcsPath(raw);
  const path = extracted ?? raw;
  if (!isValidNoteImagePath(path)) {
    throw new ReleaseNoteInvalidError('La imagen debe subirse desde el formulario de Novedades.');
  }
  return path;
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
