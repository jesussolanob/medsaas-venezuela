import { Inject, Injectable } from '@nestjs/common';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import { PaymentMethodRequiredError } from '../../../domain/errors/payment-method-required.error';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';

export interface ExtraItemInput {
  description: string;
  amountUsd: number;
}

/** A product-inventory item to add to the consultation payment. */
export interface ProductExtraInput {
  /** UUID of the product in the doctor's catalog. */
  productId: string;
  /** Quantity sold. Must be > 0. */
  quantity: number;
}

export interface ApprovePaymentWithExtrasInput {
  consultationId: string;
  doctorId: string;
  /** Additional free-text service items. Empty array = no extras (base price only). */
  extras: ExtraItemInput[];
  /**
   * Product-catalog items sold in this consultation.
   * Prices are resolved by the repo from the products table.
   * amount_usd is NEVER trusted from the client for these lines.
   */
  productExtras?: ProductExtraInput[];
  /** Optional payment method. May be set later via update-payment-details. */
  paymentMethod?: string | null;
}

/**
 * Approves a consultation payment and persists extra service line items.
 *
 * Business rules:
 *   - base_amount is fixed on the FIRST approval from the consultation's existing
 *     `amount` (which may already have been set from appointment.plan_price at
 *     create-time). On re-approval the stored base_amount is reused — this prevents
 *     the total from accumulating extras on top of a value that already includes them.
 *   - total = base_amount + Σ(extras.amount_usd) is persisted back to
 *     consultations.amount so the finance module's COALESCE(c.amount, ...) reads
 *     the correct total with no query changes needed.
 *   - The replace-all semantics for extras (delete + insert) are executed inside a
 *     single DB transaction provided by the repository.
 *   - This use case does NOT enforce pending→approved; re-approval (editing extras
 *     after first approval) is intentionally permitted so doctors can correct the
 *     extra items list. The payment_status is always set to 'approved'.
 *
 * Guards:
 *   - Throws ConsultationNotFoundError when the consultation does not exist for
 *     the given doctor (covers missing and cross-doctor access).
 *   - Throws ConsultationNotOwnedError as defense-in-depth (canBeModifiedBy).
 */
@Injectable()
export class ApprovePaymentWithExtrasUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
  ) {}

  async execute(input: ApprovePaymentWithExtrasInput): Promise<Consultation> {
    const consultation = await this.repo.findById(input.consultationId, input.doctorId);
    if (!consultation) {
      throw new ConsultationNotFoundError();
    }

    // Defense-in-depth: findById is already doctor-scoped; this check catches any
    // future code path that bypasses the repo scope guard.
    if (!consultation.canBeModifiedBy(input.doctorId)) {
      throw new ConsultationNotOwnedError();
    }

    // INVARIANT: a cobro cannot be approved without a payment method. Accept the method
    // sent now, or the one already stored (re-approval to edit extras keeps it). If
    // neither exists, reject — this is the single source of truth for the rule.
    const effectiveMethod = input.paymentMethod?.trim() || consultation.paymentMethod?.trim();
    if (!effectiveMethod) {
      throw new PaymentMethodRequiredError();
    }

    // Combine service extras and product extras into one list.
    // Product extras carry productId + quantity; the repo resolves price and description.
    const allExtras = [
      ...input.extras.map((e) => ({
        description: e.description,
        amountUsd: e.amountUsd,
        productId: null as string | null,
        quantity: null as number | null,
      })),
      ...(input.productExtras ?? []).map((p) => ({
        description: '', // Repo fills in the product name snapshot.
        amountUsd: 0, // Repo recalculates from price × quantity.
        productId: p.productId,
        quantity: p.quantity,
      })),
    ];

    return this.repo.approveWithExtras(
      input.consultationId,
      input.doctorId,
      allExtras,
      effectiveMethod,
    );
  }
}
