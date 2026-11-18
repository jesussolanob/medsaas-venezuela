import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type AppSetting,
} from '../../../domain/repositories/admin.repository';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
} from '../../../../seller-commissions/domain/repositories/seller-commission.repository';
import { InvalidDefaultSellerError } from '../../../domain/errors/invalid-default-seller.error';

/** app_settings key that persists the default seller's profile UUID. */
const SETTING_KEY = 'default_seller_id';

export interface SetDefaultSellerInput {
  /**
   * UUID of the seller profile to use as the default for organic sign-ups.
   * null = clear the current default (organic sign-ups will not be attributed).
   */
  sellerId: string | null;
}

export interface SetDefaultSellerOutput {
  /**
   * The effective default seller UUID after the update, or null when cleared.
   */
  sellerId: string | null;
  /** Raw app_settings row returned by the repository. */
  setting: AppSetting;
}

/**
 * SetDefaultSellerUseCase
 *
 * Validates and persists the system-wide default seller configuration.
 *
 * Business rules:
 *   - sellerId must be a valid UUID pointing to an ACTIVE seller profile
 *     (role = 'seller', is_active = true). Otherwise throws InvalidDefaultSellerError (422).
 *   - null is accepted to clear the current default (no commission is generated
 *     for organic sign-ups until a new default is configured).
 *   - Persists the UUID (or empty string for null) under the 'default_seller_id'
 *     key in app_settings via the existing admin repository.
 *
 * The signup commission engine already handles 'admin' source correctly:
 *   AccrueSignupCommissionUseCase skips commissions for sold_by_source = 'admin'.
 *   The default seller will only earn plan commissions (when the specialist upgrades).
 *
 * SECURITY: logs only the sellerId (a profile UUID) — never names or emails.
 */
@Injectable()
export class SetDefaultSellerUseCase {
  private readonly logger = new Logger(SetDefaultSellerUseCase.name);

  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly commissionRepo: ISellerCommissionRepository,
  ) {}

  async execute(input: SetDefaultSellerInput): Promise<SetDefaultSellerOutput> {
    if (input.sellerId !== null) {
      // Validate: the UUID must point to an active seller.
      const seller = await this.commissionRepo.findSellerById(input.sellerId);

      if (!seller || !seller.isActive) {
        throw new InvalidDefaultSellerError();
      }

      this.logger.log(`[default-seller] setting default sellerId=${input.sellerId}`);
    } else {
      this.logger.log('[default-seller] clearing default seller');
    }

    // Persist: store the UUID, or '' to represent "no default".
    // SequelizeDefaultSellerAdapter reads '' as null so the setting is effectively cleared.
    const valueToStore = input.sellerId ?? '';
    const setting = await this.adminRepo.upsertSetting(SETTING_KEY, valueToStore);

    return {
      sellerId: input.sellerId,
      setting,
    };
  }
}
