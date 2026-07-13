import { Inject, Injectable } from '@nestjs/common';
import { Consultation, type BlockDefinition } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';

export interface UpdateConsultationInput {
  consultationId: string;
  doctorId: string;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
  /**
   * Dynamic clinical block VALUES from the doctor's consultation template.
   *
   * Partial-update semantics:
   *   - undefined  → not included in the UPDATE (field left untouched)
   *   - null       → written as NULL (clears the snapshot)
   *   - object     → replaces the stored snapshot
   *
   * ETAPA 2: cifrar blocks_snapshot (PHI) — diferido, igual que patient_messages.body
   */
  blocksSnapshot?: Record<string, unknown> | null;
  /**
   * Per-consultation block STRUCTURE definitions (array).
   * Stored in blocks_structure column — separate from blocks_snapshot values.
   *
   * Partial-update semantics:
   *   - undefined  → not included in the UPDATE (field left untouched)
   *   - null       → written as NULL (clears the structure)
   *   - array      → replaces the stored structure
   */
  blocksStructure?: BlockDefinition[] | null;
}

/**
 * Updates clinical fields on an existing consultation.
 *
 * Ownership is enforced: only the owning doctor can modify a consultation.
 */
@Injectable()
export class UpdateConsultationUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
  ) {}

  async execute(input: UpdateConsultationInput): Promise<Consultation> {
    const consultation = await this.repo.findById(input.consultationId, input.doctorId);
    if (!consultation) {
      throw new ConsultationNotFoundError();
    }
    // findById is already scoped by doctorId so canBeModifiedBy() is redundant in the
    // normal code path. It is kept intentionally as defense-in-depth: if the repo
    // implementation ever changes to return unscoped results, the domain invariant
    // still catches the ownership violation and returns the correct error type.
    if (!consultation.canBeModifiedBy(input.doctorId)) {
      throw new ConsultationNotOwnedError();
    }

    return this.repo.update(input.consultationId, input.doctorId, {
      chiefComplaint: input.chiefComplaint,
      diagnosis: input.diagnosis,
      treatment: input.treatment,
      notes: input.notes,
      blocksSnapshot: input.blocksSnapshot,
      blocksStructure: input.blocksStructure,
    });
  }
}
