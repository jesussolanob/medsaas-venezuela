import { Inject, Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_PANEL_REPOSITORY,
  type ISubscriptionPanelRepository,
  type SubscriptionPanelData,
} from '../../../domain/repositories/subscription-panel.repository';

/**
 * Output shape that mirrors SubscriptionData from the frontend SubscriptionPanel component.
 *
 * Field mapping (camelCase backend → frontend SubscriptionData):
 *   state.plan              ← planName
 *   state.status            ← status
 *   state.expires_at        ← expiresAt
 *   state.days_remaining    ← daysRemaining
 *   state.is_expired        ← isExpired
 *   state.is_in_trial       ← isInTrial
 *   pricing.base_price_usd  ← basePriceUsd
 *   pricing.currency        ← currency
 *   pricing.duration_options← durationOptions (mapped)
 *   payment_methods.enabled ← paymentMethodsEnabled
 *   payment_methods.config  ← paymentMethodsConfig
 *   stripe_enabled          ← stripeEnabled
 *   payments[]              ← payments (mapped)
 */

export interface DurationOptionOutput {
  duration_months: number;
  base_price_usd: number;
  final_price_usd: number;
  discount_pct: number;
  promotion_id: string | null;
  label: string | null;
}

export interface PaymentItemOutput {
  id: string;
  amount_usd: number;
  duration_months: number;
  method: string;
  reference_number: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  rejection_reason: string | null;
}

export interface SubscriptionPanelOutput {
  state: {
    plan: string;
    status: string;
    expires_at: string | null;
    days_remaining: number;
    is_expired: boolean;
    is_in_trial: boolean;
  };
  pricing: {
    base_price_usd: number;
    currency: string;
    duration_options: DurationOptionOutput[];
  };
  payment_methods: {
    enabled: string[];
    config: Record<string, Record<string, string>>;
  };
  stripe_enabled: boolean;
  payments: PaymentItemOutput[];
}

/**
 * GetDoctorSubscriptionPanelUseCase
 *
 * Aggregates subscription state + pricing options + payment history for the
 * doctor's SubscriptionPanel component. Returns a safe default when the doctor
 * has no subscription row (never throws).
 *
 * SECURITY: doctorId is taken from the authenticated JWT claim (user.sub) by the
 * controller — never from a request body or query param. This prevents IDOR.
 */
@Injectable()
export class GetDoctorSubscriptionPanelUseCase {
  constructor(
    @Inject(SUBSCRIPTION_PANEL_REPOSITORY)
    private readonly panelRepo: ISubscriptionPanelRepository,
  ) {}

  async execute(doctorId: string): Promise<SubscriptionPanelOutput> {
    const data: SubscriptionPanelData = await this.panelRepo.findPanelData(doctorId);
    return this.toOutput(data);
  }

  // ---------------------------------------------------------------------------
  // Private helpers — pure mapping, no I/O
  // ---------------------------------------------------------------------------

  private toOutput(data: SubscriptionPanelData): SubscriptionPanelOutput {
    return {
      state: {
        plan: data.planName,
        status: data.status,
        expires_at: data.expiresAt,
        days_remaining: data.daysRemaining,
        is_expired: data.isExpired,
        is_in_trial: data.isInTrial,
      },
      pricing: {
        base_price_usd: data.basePriceUsd,
        currency: data.currency,
        duration_options: data.durationOptions.map((opt) => ({
          duration_months: opt.durationMonths,
          base_price_usd: opt.basePriceUsd,
          final_price_usd: opt.finalPriceUsd,
          discount_pct: opt.discountPct,
          promotion_id: opt.promotionId,
          label: opt.label,
        })),
      },
      payment_methods: {
        enabled: data.paymentMethodsEnabled,
        config: data.paymentMethodsConfig,
      },
      stripe_enabled: data.stripeEnabled,
      payments: data.payments.map((p) => ({
        id: p.id,
        amount_usd: p.amountUsd,
        duration_months: p.durationMonths,
        method: p.method,
        reference_number: p.referenceNumber,
        status: p.status,
        created_at: p.createdAt.toISOString(),
        rejection_reason: p.rejectionReason,
      })),
    };
  }
}
