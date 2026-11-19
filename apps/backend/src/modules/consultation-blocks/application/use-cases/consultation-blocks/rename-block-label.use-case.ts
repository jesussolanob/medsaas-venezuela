import { Inject, Injectable } from '@nestjs/common';
import { LOCKED_BLOCK_KEYS } from '../../../domain/locked-block-keys.constant';
import { InvalidBlockKeyError } from '../../../domain/errors/invalid-block-key.error';
import { LockedBlockKeyError } from '../../../domain/errors/locked-block-key.error';
import {
  CONSULTATION_BLOCK_REPOSITORY,
  type IConsultationBlockRepository,
} from '../../../domain/repositories/consultation-block.repository';
import type { PatchBlockLabelDto } from '../../dtos/consultation-block.dto';

export interface RenameBlockLabelOutput {
  blockKey: string;
  /** Stored value. null means the doctor reset to catalog default. */
  customLabel: string | null;
  /** Effective label shown to users: customLabel when set, else catalog defaultLabel. */
  label: string;
}

/**
 * Persists a custom label for a single consultation block belonging to the
 * authenticated doctor.
 *
 * Business rules:
 *   1. blockKey must exist in the catalog → InvalidBlockKeyError.
 *   2. blockKey must not be in LOCKED_BLOCK_KEYS → LockedBlockKeyError.
 *   3. custom_label null/empty → remove override (restore catalog default).
 *   4. Only custom_label is changed; enabled, sort_order, and other overrides
 *      remain untouched for existing rows.
 *   5. If no doctor row exists for this key, one is created with cascade fallback
 *      values (specialty default → catalog default) so the rename does NOT
 *      accidentally enable, disable, or reorder the block.
 *
 * doctorId always comes from the auth token (anti-IDOR — never from the body
 * or path parameters).
 */
@Injectable()
export class RenameBlockLabelUseCase {
  constructor(
    @Inject(CONSULTATION_BLOCK_REPOSITORY)
    private readonly repo: IConsultationBlockRepository,
  ) {}

  async execute(
    doctorId: string,
    blockKey: string,
    dto: PatchBlockLabelDto,
  ): Promise<RenameBlockLabelOutput> {
    // ── 1. Fetch catalog + specialty in parallel ───────────────────────────
    const [catalogRows, specialty] = await Promise.all([
      this.repo.listCatalog(),
      this.repo.getDoctorSpecialty(doctorId),
    ]);

    // ── 2. Validate blockKey exists in catalog ─────────────────────────────
    const catalogEntry = catalogRows.find((c) => c.key === blockKey) ?? null;
    if (!catalogEntry) {
      throw new InvalidBlockKeyError(blockKey);
    }

    // ── 3. Validate blockKey is not system-locked ──────────────────────────
    if (LOCKED_BLOCK_KEYS.has(blockKey)) {
      throw new LockedBlockKeyError(blockKey);
    }

    // ── 4. Fetch specialty defaults for fallback computation ───────────────
    const specialtyDefaults = await this.repo.listSpecialtyDefaults(specialty);
    const specialtyEntry = specialtyDefaults.find((s) => s.blockKey === blockKey);

    // Fallback cascade (used only when inserting a brand-new doctor row):
    //   specialty default → catalog default
    const fallbackEnabled = specialtyEntry?.enabled ?? catalogEntry.defaultEnabled;
    const fallbackSortOrder = specialtyEntry?.sortOrder ?? catalogEntry.defaultSortOrder;

    const customLabel = dto.custom_label;

    // ── 5. Upsert only custom_label ────────────────────────────────────────
    await this.repo.upsertBlockLabel({
      doctorId,
      blockKey,
      customLabel,
      fallbackEnabled,
      fallbackSortOrder,
    });

    // ── 6. Return effective state ──────────────────────────────────────────
    return {
      blockKey,
      customLabel,
      label: customLabel ?? catalogEntry.defaultLabel,
    };
  }
}
