import { Inject, Injectable } from '@nestjs/common';
import { Consultation, type BlockDefinition } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';
import { BlockContentSanitizer } from '../../block-content-sanitizer';

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
   * When provided as an object, the four known text columns (chief_complaint,
   * diagnosis, treatment, notes) are also derived from this snapshot in the
   * same UPDATE operation — see deriveColumnFromSnapshot.
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
 * Derives a single text-column value from the (already-sanitized) blocks snapshot.
 *
 * Derivation rules applied in order:
 *
 *  Rule 4 + Rule 6 — key ABSENT from snapshot:
 *    The explicit input value wins.  This preserves columns that the doctor's
 *    template does not include (e.g. chief_complaint written by the patient at
 *    booking time when the template has no such block).
 *
 *  Rule 3 — key PRESENT but value is NOT a string (object, array, number…):
 *    Returns undefined → the column is left untouched.  Writing a serialised
 *    object into a text column is data corruption.  The snapshot "owns" the key
 *    (Rule 6), so the explicit input is also discarded to avoid stale overwrites.
 *
 *  Rule 5 — key PRESENT and value is an EMPTY string:
 *    Returns null → clears the column.  An empty string is an intentional erase.
 *
 *  Rule 2 + Rule 6 — key PRESENT and value is a NON-EMPTY string:
 *    Returns the sanitized string.  Snapshot wins over any explicit input.
 *
 * @param snapshot  - Sanitized snapshot (non-null, post-sanitizeSnapshot).
 * @param key       - Snapshot key in snake_case (e.g. 'chief_complaint').
 * @param fallback  - Explicit input value used when the key is absent.
 */
function deriveColumnFromSnapshot(
  snapshot: Record<string, unknown>,
  key: string,
  fallback: string | null | undefined,
): string | null | undefined {
  if (!(key in snapshot)) {
    return fallback;
  }
  const value = snapshot[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  return value === '' ? null : value;
}

/**
 * Updates clinical fields on an existing consultation.
 *
 * Ownership is enforced: only the owning doctor can modify a consultation.
 *
 * When blocksSnapshot is provided, the four known text columns (chief_complaint,
 * diagnosis, treatment, notes) are derived from the SANITIZED snapshot in a
 * single repo.update() call — one atomic write, impossible to desync.
 *
 * Callers that update only the named columns (no snapshot) are unaffected: when
 * blocksSnapshot is absent the explicit input values are used as-is (Rule 7).
 */
@Injectable()
export class UpdateConsultationUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
    private readonly sanitizer: BlockContentSanitizer,
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

    // Rule 1: sanitize the snapshot BEFORE deriving column values from it so
    // HTML injected inside a block never reaches a named column in raw form.
    // Recurses into nested arrays/objects; validates size and depth caps.
    const sanitizedSnapshot =
      input.blocksSnapshot != null
        ? this.sanitizer.sanitizeSnapshot(input.blocksSnapshot)
        : input.blocksSnapshot;

    // Rules 2–6: resolve each text column.
    // When sanitizedSnapshot is present (non-null, non-undefined), attempt to
    // derive the value from it.  When absent, fall back to the explicit input so
    // that column-only callers (no snapshot) keep working unchanged (Rule 7).
    const resolveColumn = (
      snapshotKey: string,
      explicitValue: string | null | undefined,
    ): string | null | undefined =>
      sanitizedSnapshot != null
        ? deriveColumnFromSnapshot(sanitizedSnapshot, snapshotKey, explicitValue)
        : explicitValue;

    return this.repo.update(input.consultationId, input.doctorId, {
      chiefComplaint: resolveColumn('chief_complaint', input.chiefComplaint),
      diagnosis: resolveColumn('diagnosis', input.diagnosis),
      treatment: resolveColumn('treatment', input.treatment),
      notes: resolveColumn('notes', input.notes),
      blocksSnapshot: sanitizedSnapshot,
      blocksStructure: input.blocksStructure,
    });
  }
}
