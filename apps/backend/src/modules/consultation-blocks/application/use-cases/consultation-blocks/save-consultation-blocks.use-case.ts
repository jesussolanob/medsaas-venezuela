import { Inject, Injectable } from '@nestjs/common';
import { EmptyBlockConfigError } from '../../../domain/errors/empty-block-config.error';
import { InvalidBlockKeyError } from '../../../domain/errors/invalid-block-key.error';
import {
  CONSULTATION_BLOCK_REPOSITORY,
  type IConsultationBlockRepository,
} from '../../../domain/repositories/consultation-block.repository';
import type { SaveBlocksDto } from '../../dtos/consultation-block.dto';

export interface SaveConsultationBlocksOutput {
  success: true;
  blocks_saved: number;
}

/**
 * Validates and replaces a doctor's entire consultation block configuration.
 *
 * Business rules (domain validation order):
 *   1. blocks must be a non-empty array (enforced by Zod schema upstream).
 *   2. At least one block must have enabled !== false → EmptyBlockConfigError.
 *   3. Every block_key must exist in the catalog → InvalidBlockKeyError.
 *
 * Persistence: atomic DELETE + INSERT via repository transaction.
 * doctorId always comes from the auth token (anti-IDOR — never from body).
 *
 * Deviation from legacy: super_admin acting on another doctor_id is NOT
 * supported in Etapa 1. Every doctor operates only on their own config (user.sub).
 * This simplifies auth and eliminates IDOR risk. Revisit in Etapa 2 if needed.
 */
@Injectable()
export class SaveConsultationBlocksUseCase {
  constructor(
    @Inject(CONSULTATION_BLOCK_REPOSITORY)
    private readonly repo: IConsultationBlockRepository,
  ) {}

  async execute(doctorId: string, dto: SaveBlocksDto): Promise<SaveConsultationBlocksOutput> {
    const { blocks } = dto;

    // Rule 1: at least one enabled block
    const enabledCount = blocks.filter((b) => b.enabled !== false).length;
    if (enabledCount === 0) {
      throw new EmptyBlockConfigError();
    }

    // Rule 2: all block_key values must exist in catalog
    const validKeys = await this.repo.getCatalogKeySet();
    for (const block of blocks) {
      if (!validKeys.has(block.block_key)) {
        throw new InvalidBlockKeyError(block.block_key);
      }
    }

    // Persist: atomic DELETE + INSERT in a single transaction
    const count = await this.repo.replaceDoctorBlocks({
      doctorId,
      blocks: blocks.map((b, idx) => ({
        blockKey: b.block_key,
        enabled: b.enabled ?? true,
        sortOrder: b.sort_order ?? idx,
        customLabel: b.custom_label ?? null,
        customContentType: b.custom_content_type ?? null,
        customDescription: b.custom_description ?? null,
        printable: b.printable ?? null,
        sendToPatient: b.send_to_patient ?? null,
      })),
    });

    return { success: true, blocks_saved: count };
  }
}
