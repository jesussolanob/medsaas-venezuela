import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
  type AccrueCommissionResult,
} from '../../domain/repositories/seller-commission.repository';

/** Amount credited to the seller when a specialist completes onboarding. */
const SIGNUP_COMMISSION_USD = 10;

/**
 * Attribution sources that earn the signup commission — the ones where the seller
 * actually brought the specialist in:
 *   'code'          → the specialist typed the seller's code when signing up.
 *   'seller_manual' → the seller loaded the specialist by hand from their portal.
 *
 * Deliberately excluded: 'admin', i.e. a lead that arrived through Ads or direct
 * and that a super_admin assigned to a seller. Those only pay on the plan change.
 */
const SIGNUP_ELIGIBLE_SOURCES: ReadonlySet<string> = new Set(['code', 'seller_manual']);

/**
 * AccrueSignupCommissionUseCase
 *
 * Runs after a specialist completes the onboarding wizard
 * (`CompleteOnboardingUseCase` calls this best-effort).
 *
 * Business rules:
 *   - Only generates a commission when the seller brought the specialist in
 *     (sold_by_source in SIGNUP_ELIGIBLE_SOURCES). Admin-assigned leads do NOT
 *     trigger signup commissions — they only pay on the plan change.
 *   - The seller must be active at the time of the event.
 *   - Idempotent: the DB UNIQUE(specialist_id, 'signup') constraint ensures
 *     this can be called multiple times safely.
 *
 * IMPORTANT: This use case NEVER throws. It returns a result enum so callers
 * can call it with `void useCase.execute(...)` (fire-and-forget). The caller's
 * `.catch()` handles unexpected infrastructure errors.
 *
 * SECURITY: Never log specialistId in a way that can be joined with PII.
 */
@Injectable()
export class AccrueSignupCommissionUseCase {
  private readonly logger = new Logger(AccrueSignupCommissionUseCase.name);

  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
  ) {}

  async execute(specialistId: string): Promise<AccrueCommissionResult> {
    // 1. Load attribution info
    const profile = await this.repo.findSpecialistCommissionProfile(specialistId);

    if (!profile) {
      this.logger.warn(
        `[signup-commission] specialist not found — skipped specialistId=${specialistId}`,
      );
      return 'skipped';
    }

    // 2. No seller attributed → nothing to accrue
    //
    // Este camino retornaba MUDO. Es el más frecuente en operación normal (un
    // especialista que se dio de alta solo, sin código), pero también es el que
    // aparece cuando la atribución se escribió tarde o no se escribió — y ahí
    // el silencio hace imposible distinguir "no corresponde" de "algo falló".
    if (!profile.soldBy) {
      this.logger.log(
        `[signup-commission] sin vendedor atribuido — no corresponde comisión, specialistId=${specialistId}`,
      );
      return 'skipped';
    }

    // 3. Signup commission only when the seller actually brought the specialist in
    if (!profile.soldBySource || !SIGNUP_ELIGIBLE_SOURCES.has(profile.soldBySource)) {
      // `log` y no `debug`: en producción el nivel debug no se emite, y este
      // salteo decide si alguien cobra o no.
      this.logger.log(
        `[signup-commission] sold_by_source='${profile.soldBySource}' no elegible — sin comisión`,
      );
      return 'skipped';
    }

    // 4. Seller must be active at the moment of the event
    if (!profile.sellerIsActive) {
      this.logger.warn(
        `[signup-commission] seller is inactive — signup commission skipped for specialist`,
      );
      return 'skipped';
    }

    // 5. Insert commission (idempotent via UNIQUE constraint)
    const result = await this.repo.accrueCommission({
      sellerId: profile.soldBy,
      specialistId,
      type: 'signup',
      amountUsd: SIGNUP_COMMISSION_USD,
      planKey: null,
      earnedAt: new Date(),
    });

    if (result === 'created') {
      this.logger.log(`[signup-commission] created sellerId=${profile.soldBy}`);
    } else {
      this.logger.debug(`[signup-commission] already existed — no-op`);
    }

    return result;
  }
}
