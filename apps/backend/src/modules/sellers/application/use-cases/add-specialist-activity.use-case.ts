import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SpecialistActivityRow,
} from '../../domain/repositories/seller.repository';
import { SpecialistNotInPortfolioError } from '../../domain/errors/specialist-not-in-portfolio.error';
import { SpecialistAlreadySameStatusError } from '../../domain/errors/specialist-already-same-status.error';

export interface AddSpecialistActivityInput {
  sellerId: string;
  specialistId: string;
  /** New status to set. undefined = comment-only entry. */
  status?: string;
  /** Free text note. undefined = status-only entry. */
  comment?: string;
}

export interface AddSpecialistActivityResult {
  activity: SpecialistActivityRow;
  currentStatus: string;
}

/**
 * AddSpecialistActivityUseCase
 *
 * Records a follow-up action against a specialist in the seller's portfolio.
 *
 * Business rules:
 *   1. The specialist must belong to the authenticated seller (anti-IDOR).
 *   2. If the requested status equals the current status AND no comment is
 *      provided → 422 SpecialistAlreadySameStatusError.
 *   3. If only a comment is provided (no status) → type = 'comment'.
 *   4. If a status is provided (regardless of comment) → type = 'status_change'
 *      with from_status = current, to_status = requested.
 *      Exception: if status == current AND a comment IS provided, treat as a
 *      pure 'comment' entry (the status hint is redundant but not an error).
 *   5. Comment is trimmed before persistence; max 2000 chars enforced at input.
 *   6. Entries are append-only: no edit, no delete.
 *
 * SECURITY: sellerId always comes from CurrentUserPayload.sub — never the body.
 * Comment is free text — do NOT log it.
 */
@Injectable()
export class AddSpecialistActivityUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(input: AddSpecialistActivityInput): Promise<AddSpecialistActivityResult> {
    const { sellerId, specialistId } = input;

    // Anti-IDOR: specialist must be in this seller's portfolio.
    const specialist = await this.sellerRepo.findSoldSpecialist(sellerId, specialistId);
    if (!specialist) {
      throw new SpecialistNotInPortfolioError();
    }

    const currentStatus = await this.sellerRepo.getSpecialistCurrentStatus(specialistId);

    const trimmedComment = input.comment?.trim();
    const hasNewStatus = input.status !== undefined;
    const hasComment = trimmedComment !== undefined && trimmedComment.length > 0;
    const isStatusChange = hasNewStatus && input.status !== currentStatus;

    // Rule 2: status == current AND no comment → reject.
    if (hasNewStatus && input.status === currentStatus && !hasComment) {
      throw new SpecialistAlreadySameStatusError();
    }

    let activity: SpecialistActivityRow;

    if (isStatusChange) {
      // Status is changing — always a status_change entry (comment is optional).
      activity = await this.sellerRepo.createSpecialistActivity({
        specialistId,
        sellerId,
        type: 'status_change',
        fromStatus: currentStatus === 'sin_contactar' ? null : currentStatus,
        toStatus: input.status!,
        comment: hasComment ? trimmedComment! : null,
      });
    } else {
      // Either: only comment provided, OR status == current with a comment
      // (redundant status hint → downgrade to comment-only).
      activity = await this.sellerRepo.createSpecialistActivity({
        specialistId,
        sellerId,
        type: 'comment',
        fromStatus: null,
        toStatus: null,
        comment: trimmedComment!,
      });
    }

    // Recompute current status after the insert (may have changed).
    const newCurrentStatus = await this.sellerRepo.getSpecialistCurrentStatus(specialistId);

    return { activity, currentStatus: newCurrentStatus };
  }
}
