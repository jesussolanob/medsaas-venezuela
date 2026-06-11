import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type PlanDetail,
  type PlanFeatureRow,
  type PlanPriceRow,
} from '../../../domain/repositories/admin.repository';

const VALID_ROLE_KEYS = new Set(['doctor', 'admin', 'patient']);
const DEFAULT_ROLE_KEY = 'doctor';

/** Public-safe price shape — omits internal `isActive` flag. */
export interface PublicPriceEntry {
  period: string;
  price_usd: number;
}

/** Public-safe feature shape. */
export interface PublicFeatureEntry {
  feature_key: string;
  feature_label: string;
  enabled: boolean;
}

/** Public-safe plan shape exposed by GET /api/plans. */
export interface PublicPlanCatalogItem {
  plan_key: string;
  name: string;
  is_permanent: boolean;
  sort_order: number;
  prices: PublicPriceEntry[];
  features: PublicFeatureEntry[];
}

function toPublicPrices(prices: PlanPriceRow[]): PublicPriceEntry[] {
  return prices.filter((p) => p.isActive).map((p) => ({ period: p.period, price_usd: p.priceUsd }));
}

function toPublicFeatures(features: PlanFeatureRow[]): PublicFeatureEntry[] {
  return features.map((f) => ({
    feature_key: f.featureKey,
    feature_label: f.featureLabel,
    enabled: f.enabled,
  }));
}

function toCatalogItem(plan: PlanDetail): PublicPlanCatalogItem {
  return {
    plan_key: plan.planKey,
    name: plan.name,
    is_permanent: plan.isPermanent,
    sort_order: plan.sortOrder,
    prices: toPublicPrices(plan.prices),
    features: toPublicFeatures(plan.features),
  };
}

export interface GetPublicPlanCatalogInput {
  role?: string;
}

/**
 * Returns the public-safe catalog of active plans for a given role.
 *
 * - Filters by is_active=true and role_key (default: 'doctor').
 * - Invalid role values fall back to the default silently.
 * - Strips internal fields (is_active, internal ids) and exposes only
 *   active prices per period.
 * - No authentication required — safe for unauthenticated callers.
 */
@Injectable()
export class GetPublicPlanCatalogUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: GetPublicPlanCatalogInput): Promise<PublicPlanCatalogItem[]> {
    const roleKey = input.role && VALID_ROLE_KEYS.has(input.role) ? input.role : DEFAULT_ROLE_KEY;

    const allPlans = await this.adminRepo.listPlansWithDetails();

    return allPlans
      .filter((p) => p.isActive && p.roleKey === roleKey)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toCatalogItem);
  }
}
