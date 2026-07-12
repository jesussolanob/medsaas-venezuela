import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type {
  ISubscriptionPanelRepository,
  SubscriptionPanelData,
  DurationOption,
  PaymentHistoryItem,
} from '../../../domain/repositories/subscription-panel.repository';
import { SubscriptionModel } from '../models/subscription.model';
import { DoctorProfileModel } from '../models/doctor-profile.model';

// ---------------------------------------------------------------------------
// Raw-query row shapes
// ---------------------------------------------------------------------------

interface PlanConfigRow {
  plan_key: string;
  name: string;
  price: string | null;
  currency: string | null;
  is_permanent: boolean;
}

interface DefaultPlanRow {
  plan_key: string;
}

interface PlanPriceRow {
  period: string;
  price_usd: string;
}

interface PlanPromotionRow {
  id: string;
  duration_months: number;
  original_price_usd: string;
  promo_price_usd: string;
  label: string | null;
}

interface AppSettingRow {
  key: string;
  value: string;
}

interface SubscriptionPaymentRow {
  id: string;
  amount_usd: string;
  duration_months: number;
  method: string;
  reference_number: string | null;
  status: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** app_settings key that lists enabled subscription payment methods as JSON. */
const PAYMENT_METHODS_KEY = 'subscription_payment_methods_enabled';

/** Fallback when app_settings key is absent. */
const DEFAULT_PAYMENT_METHODS = ['pago_movil', 'transferencia', 'zelle'];

/** Maps plan_prices.period → canonical month count. */
const PERIOD_TO_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * SequelizeSubscriptionPanelRepository
 *
 * Aggregates subscription panel data using a combination of:
 *   - @InjectModel for tables owned by DoctorSettingsModule (subscriptions, profiles)
 *   - Sequelize raw queries for shared / cross-module tables:
 *       plan_configs, plan_prices, plan_promotions, subscription_payments, app_settings
 *
 * Using raw queries for cross-module tables avoids re-registering models that are
 * already registered in other modules (BillingModule, AdminModule), which can
 * cause "model already registered" collisions in Sequelize's global registry.
 *
 * Fallback strategy: when the doctor has no subscriptions row, falls back to
 * the profiles snapshot (plan + subscription_status + subscription_expires_at)
 * so the panel always renders instead of throwing.
 */
@Injectable()
export class SequelizeSubscriptionPanelRepository implements ISubscriptionPanelRepository {
  constructor(
    @InjectModel(SubscriptionModel)
    private readonly subscriptionModel: typeof SubscriptionModel,
    @InjectModel(DoctorProfileModel)
    private readonly profileModel: typeof DoctorProfileModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findPanelData(doctorId: string): Promise<SubscriptionPanelData> {
    const [sub, profile, payments, settings] = await Promise.all([
      this.subscriptionModel.findOne({
        where: { doctorId },
        order: [['created_at', 'DESC']],
      }),
      this.profileModel.findByPk(doctorId),
      this.fetchPayments(doctorId),
      this.fetchSettings(),
    ]);

    // Stored plan key + status — subscriptions row wins, profiles is fallback
    const storedPlanKey = sub?.plan ?? profile?.plan ?? null;
    const status = sub?.status ?? profile?.subscriptionStatus ?? null;
    const rawExpiresAt: Date | null = sub?.currentPeriodEnd ?? null;

    // -------------------------------------------------------------------------
    // Resolve effective plan (mirrors GetDoctorFeaturesV2UseCase lazy-downgrade)
    //   Rule 1: if stored plan is permanent → keep it, no downgrade.
    //   Rule 2: if status ∈ {active, trial, trialing} → keep stored plan.
    //   Rule 3: otherwise (expired/suspended/null) → fall back to the permanent
    //           plan for the doctor role (delta_free today).
    // -------------------------------------------------------------------------
    const effectivePlanKey = await this.resolveEffectivePlanKey(storedPlanKey, status);

    // Load plan config + duration options in parallel for the effective plan
    const [planConfig, durationOptions] = await Promise.all([
      this.fetchPlanConfig(effectivePlanKey),
      this.buildDurationOptions(effectivePlanKey),
    ]);

    const isPermanent = planConfig?.is_permanent ?? false;

    // Compute days remaining — permanent plans never expire
    const now = Date.now();
    const expiresAtMs = !isPermanent && rawExpiresAt ? rawExpiresAt.getTime() : null;
    const daysRemaining =
      expiresAtMs !== null
        ? expiresAtMs > now
          ? Math.ceil((expiresAtMs - now) / (1000 * 60 * 60 * 24))
          : 0
        : 0;

    const isExpired = !isPermanent && expiresAtMs !== null ? expiresAtMs < now : false;

    // is_in_trial is true when status is 'trial' or 'trialing' AND the plan is not permanent.
    // 'trialing' is used by the free_trial onboarding plan.
    const TRIAL_STATUSES = new Set(['trial', 'trialing']);
    const isInTrial = !isPermanent && status !== null && TRIAL_STATUSES.has(status);

    const planName = planConfig?.name ?? effectivePlanKey;
    const basePriceUsd =
      planConfig?.price !== null && planConfig?.price !== undefined ? Number(planConfig.price) : 0;
    const currency = planConfig?.currency ?? 'USD';

    const { paymentMethodsEnabled, paymentMethodsConfig } = this.parsePaymentSettings(settings);

    return {
      planKey: effectivePlanKey,
      planName,
      status: status ?? 'active',
      expiresAt: !isPermanent && rawExpiresAt ? rawExpiresAt.toISOString() : null,
      daysRemaining,
      isExpired,
      isPermanent,
      isInTrial,
      basePriceUsd,
      currency,
      durationOptions,
      paymentMethodsEnabled,
      paymentMethodsConfig,
      stripeEnabled: false,
      payments: payments.map((p) => this.toPaymentItem(p)),
    };
  }

  /**
   * Resolves the effective plan key using lazy-downgrade rules:
   *   1. If the stored plan is permanent → return it as-is.
   *   2. If subscription status is active/trial/trialing → return stored plan.
   *   3. Otherwise → query the default permanent plan for role='doctor'.
   */
  private async resolveEffectivePlanKey(
    storedPlanKey: string | null,
    status: string | null,
  ): Promise<string> {
    const FALLBACK = 'delta_free';

    if (storedPlanKey) {
      // Rule 1: check if the stored plan itself is permanent
      const stored = await this.fetchPlanConfig(storedPlanKey);
      if (stored?.is_permanent) {
        return storedPlanKey;
      }

      // Rule 2: active/trial/trialing → keep stored plan
      const validStatuses = new Set(['active', 'trial', 'trialing']);
      if (status && validStatuses.has(status)) {
        return storedPlanKey;
      }
    }

    // Rule 3: no valid plan/status → use the permanent plan for role=doctor
    const permanentPlan = await this.fetchDefaultPermanentPlan('doctor');
    return permanentPlan ?? FALLBACK;
  }

  /** Queries the first active permanent plan for a given role key. */
  private async fetchDefaultPermanentPlan(roleKey: string): Promise<string | null> {
    const rows = await this.sequelize.query<DefaultPlanRow>(
      `SELECT plan_key
         FROM plan_configs
        WHERE role_key = :roleKey
          AND is_permanent = true
          AND is_active = true
        ORDER BY sort_order ASC
        LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { roleKey } },
    );
    return rows[0]?.plan_key ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchPlanConfig(planKey: string): Promise<PlanConfigRow | null> {
    const rows = await this.sequelize.query<PlanConfigRow>(
      `SELECT plan_key, name, price, currency, is_permanent
         FROM plan_configs
        WHERE plan_key = :planKey
        LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { planKey } },
    );
    return rows[0] ?? null;
  }

  private async buildDurationOptions(planKey: string): Promise<DurationOption[]> {
    const [priceRows, promoRows] = await Promise.all([
      this.sequelize.query<PlanPriceRow>(
        `SELECT period, price_usd
           FROM plan_prices
          WHERE plan_key = :planKey
            AND is_active = true
          ORDER BY price_usd ASC`,
        { type: QueryTypes.SELECT, replacements: { planKey } },
      ),
      this.sequelize.query<PlanPromotionRow>(
        `SELECT id, duration_months, original_price_usd, promo_price_usd, label
           FROM plan_promotions
          WHERE plan_key = :planKey
            AND is_active = true
            AND (ends_at IS NULL OR ends_at > NOW())
          ORDER BY duration_months ASC`,
        { type: QueryTypes.SELECT, replacements: { planKey } },
      ),
    ]);

    const options: DurationOption[] = [];

    // Build options from plan_prices, merging promotions when duration matches
    for (const row of priceRows) {
      const months = PERIOD_TO_MONTHS[row.period] ?? null;
      if (months === null) continue;

      const basePriceUsd = Number(row.price_usd);
      const promo = promoRows.find((pr) => pr.duration_months === months);

      if (promo) {
        const originalPriceUsd = Number(promo.original_price_usd);
        const promoPriceUsd = Number(promo.promo_price_usd);
        const discountPct =
          originalPriceUsd > 0
            ? Math.round(((originalPriceUsd - promoPriceUsd) / originalPriceUsd) * 100)
            : 0;

        options.push({
          durationMonths: months,
          basePriceUsd: originalPriceUsd,
          finalPriceUsd: promoPriceUsd,
          discountPct,
          promotionId: promo.id,
          label: promo.label,
        });
      } else {
        options.push({
          durationMonths: months,
          basePriceUsd,
          finalPriceUsd: basePriceUsd,
          discountPct: 0,
          promotionId: null,
          label: null,
        });
      }
    }

    // Add promotions for durations not covered by plan_prices
    for (const promo of promoRows) {
      const alreadyCovered = options.some((o) => o.durationMonths === promo.duration_months);
      if (!alreadyCovered) {
        const originalPriceUsd = Number(promo.original_price_usd);
        const promoPriceUsd = Number(promo.promo_price_usd);
        const discountPct =
          originalPriceUsd > 0
            ? Math.round(((originalPriceUsd - promoPriceUsd) / originalPriceUsd) * 100)
            : 0;

        options.push({
          durationMonths: promo.duration_months,
          basePriceUsd: originalPriceUsd,
          finalPriceUsd: promoPriceUsd,
          discountPct,
          promotionId: promo.id,
          label: promo.label,
        });
      }
    }

    return options.sort((a, b) => a.durationMonths - b.durationMonths);
  }

  private async fetchSettings(): Promise<AppSettingRow[]> {
    return this.sequelize.query<AppSettingRow>(
      `SELECT key, value
         FROM app_settings
        WHERE key LIKE 'subscription_%'
           OR key LIKE 'payment_%'`,
      { type: QueryTypes.SELECT },
    );
  }

  private async fetchPayments(doctorId: string): Promise<SubscriptionPaymentRow[]> {
    return this.sequelize.query<SubscriptionPaymentRow>(
      `SELECT id, amount_usd, duration_months, method, reference_number, status, created_at
         FROM subscription_payments
        WHERE doctor_id = :doctorId
        ORDER BY created_at DESC
        LIMIT 20`,
      { type: QueryTypes.SELECT, replacements: { doctorId } },
    );
  }

  /**
   * Parses payment method configuration from app_settings rows.
   *
   * Expected app_settings keys:
   *   subscription_payment_methods_enabled → JSON array, e.g. '["pago_movil","zelle"]'
   *   payment_<method>_<field>             → per-method config fields
   *     e.g. payment_pago_movil_numero → "04241234567"
   *          payment_pago_movil_banco  → "Banesco"
   *          payment_zelle_email       → "pagos@delta.com"
   */
  private parsePaymentSettings(settings: AppSettingRow[]): {
    paymentMethodsEnabled: string[];
    paymentMethodsConfig: Record<string, Record<string, string>>;
  } {
    const settingMap = new Map<string, string>(settings.map((s) => [s.key, s.value]));

    let paymentMethodsEnabled: string[] = DEFAULT_PAYMENT_METHODS;
    const enabledRaw = settingMap.get(PAYMENT_METHODS_KEY);
    if (enabledRaw) {
      try {
        const parsed: unknown = JSON.parse(enabledRaw);
        if (Array.isArray(parsed) && parsed.every((m) => typeof m === 'string')) {
          paymentMethodsEnabled = parsed as string[];
        }
      } catch {
        // Malformed JSON — fall back to default
      }
    }

    const paymentMethodsConfig: Record<string, Record<string, string>> = {};
    for (const method of paymentMethodsEnabled) {
      const prefix = `payment_${method}_`;
      const config: Record<string, string> = {};
      for (const [key, value] of settingMap.entries()) {
        if (key.startsWith(prefix)) {
          const field = key.slice(prefix.length);
          config[field] = value;
        }
      }
      paymentMethodsConfig[method] = config;
    }

    return { paymentMethodsEnabled, paymentMethodsConfig };
  }

  private toPaymentItem(row: SubscriptionPaymentRow): PaymentHistoryItem {
    return {
      id: row.id,
      amountUsd: Number(row.amount_usd),
      durationMonths: Number(row.duration_months),
      method: row.method,
      referenceNumber: row.reference_number,
      status: row.status as PaymentHistoryItem['status'],
      createdAt: new Date(row.created_at),
      rejectionReason: null,
    };
  }
}
