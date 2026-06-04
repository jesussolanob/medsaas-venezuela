import type { Promotion } from '../../domain/entities/promotion.entity';

/**
 * Full admin response — exposes all fields including is_active, created_at, updated_at.
 */
export function toAdminPromotionResponse(promo: Promotion): Record<string, unknown> {
  return {
    id: promo.id,
    plan_key: promo.planKey,
    duration_months: promo.durationMonths,
    original_price_usd: promo.originalPriceUsd,
    promo_price_usd: promo.promoPriceUsd,
    label: promo.label,
    is_active: promo.isActive,
    ends_at: promo.endsAt?.toISOString() ?? null,
    created_at: promo.createdAt.toISOString(),
    updated_at: promo.updatedAt.toISOString(),
  };
}

/**
 * Public response — omits internal/admin fields (is_active, created_at, updated_at).
 * Only id, plan_key, duration_months, original_price_usd, promo_price_usd, label, ends_at.
 */
export function toPublicPromotionResponse(promo: Promotion): Record<string, unknown> {
  return {
    id: promo.id,
    plan_key: promo.planKey,
    duration_months: promo.durationMonths,
    original_price_usd: promo.originalPriceUsd,
    promo_price_usd: promo.promoPriceUsd,
    label: promo.label,
    ends_at: promo.endsAt?.toISOString() ?? null,
  };
}
