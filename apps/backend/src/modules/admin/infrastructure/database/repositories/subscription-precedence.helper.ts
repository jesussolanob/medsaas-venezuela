import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';

/**
 * Resolves subscription plan, status and expiry following ADR-042:
 *
 *   profiles (profile) is the source of truth.
 *   subscriptions (sub) is a legacy table that may desync — used only as
 *   fallback for accounts whose profile columns have not been backfilled yet.
 *
 * Rule: profile field wins when present (non-null/undefined); subscription
 * field is used only when the profile field is null/undefined.
 */
export interface SubscriptionFields {
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: SubscriptionPlan;
  subscriptionExpiresAt: Date | null;
}

export interface ProfileSubscriptionInput {
  /** From profiles table */
  profileStatus: string | null | undefined;
  profilePlan: string | null | undefined;
  profileExpiresAt: Date | null | undefined;
  /** From subscriptions table (may be absent for very old accounts) */
  subStatus?: string | null;
  subPlan?: string | null;
  subExpiresAt?: Date | null;
}

export function resolveSubscriptionFields(input: ProfileSubscriptionInput): SubscriptionFields {
  return {
    subscriptionStatus: (input.profileStatus ?? input.subStatus ?? 'trial') as SubscriptionStatus,
    subscriptionPlan: (input.profilePlan ?? input.subPlan ?? 'trial') as SubscriptionPlan,
    subscriptionExpiresAt: input.profileExpiresAt ?? input.subExpiresAt ?? null,
  };
}
