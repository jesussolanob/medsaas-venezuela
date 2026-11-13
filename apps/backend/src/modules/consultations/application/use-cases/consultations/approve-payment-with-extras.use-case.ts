import { Inject, Injectable } from '@nestjs/common';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationAmountRequiredError } from '../../../domain/errors/consultation-amount-required.error';
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
  /**
   * Monto base en USD para consultas price_on_request (amount y base_amount null en BD).
   *
   * Solo se aplica en la PRIMERA aprobación (cuando base_amount IS NULL en la BD).
   * Si la consulta ya tiene un base_amount fijado, este valor es ignorado: el precio
   * no se puede cambiar por esta vía (el cambio va por cambio de servicio).
   *
   * Nombre del campo en el DTO de la API: `base_amount_usd`.
   */
  baseAmountUsd?: number;
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

    // Determine whether to pass a base amount override to the repo.
    //
    // CASE A — price_on_request (amount=null, base_amount=null in DB):
    //   The doctor must supply the price now. `baseAmountUsd` becomes the base.
    //   If neither `baseAmountUsd` nor any extras are provided → reject.
    //
    // CASE B — regular consultation (amount already set at booking):
    //   The base is derived from the stored amount/plan_price by the repo.
    //   `baseAmountUsd` is silently ignored — the price cannot change via this path.
    //
    // CASE C — re-approval (base_amount already persisted from first approval):
    //   The repo reuses the stored base_amount regardless of what is passed here.
    //   `baseAmountUsd` is ignored.
    const isPriceOnRequestFirstApproval =
      consultation.amount === null && consultation.baseAmount === null;

    if (isPriceOnRequestFirstApproval && allExtras.length === 0 && !input.baseAmountUsd) {
      throw new ConsultationAmountRequiredError();
    }

    // Only forward the override when this is the price_on_request first-approval path.
    // For all other paths, passing undefined lets the repo use its normal resolution.
    const effectiveBaseAmountUsd = isPriceOnRequestFirstApproval ? input.baseAmountUsd : undefined;

    return this.repo.approveWithExtras(
      input.consultationId,
      input.doctorId,
      allExtras,
      effectiveMethod,
      effectiveBaseAmountUsd,
    );
  }
}
