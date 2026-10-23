import { resolveSubscriptionFields } from './subscription-precedence.helper';

const EXPIRY_A = new Date('2027-06-01T00:00:00Z');
const EXPIRY_B = new Date('2026-01-01T00:00:00Z');

describe('resolveSubscriptionFields — ADR-042 precedence (profile wins)', () => {
  // ---------------------------------------------------------------------------
  // Plan
  // ---------------------------------------------------------------------------

  it('uses profile plan when both profile and subscription plan are present', () => {
    const { subscriptionPlan } = resolveSubscriptionFields({
      profilePlan: 'professional',
      subPlan: 'basic',
      profileStatus: null,
      profileExpiresAt: null,
    });
    expect(subscriptionPlan).toBe('professional');
  });

  it('falls back to subscription plan when profile plan is null', () => {
    const { subscriptionPlan } = resolveSubscriptionFields({
      profilePlan: null,
      subPlan: 'basic',
      profileStatus: null,
      profileExpiresAt: null,
    });
    expect(subscriptionPlan).toBe('basic');
  });

  it('defaults plan to "trial" when both are null', () => {
    const { subscriptionPlan } = resolveSubscriptionFields({
      profilePlan: null,
      subPlan: null,
      profileStatus: null,
      profileExpiresAt: null,
    });
    expect(subscriptionPlan).toBe('trial');
  });

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  it('uses profile status when both profile and subscription status are present', () => {
    const { subscriptionStatus } = resolveSubscriptionFields({
      profileStatus: 'active',
      subStatus: 'suspended',
      profilePlan: null,
      profileExpiresAt: null,
    });
    expect(subscriptionStatus).toBe('active');
  });

  it('falls back to subscription status when profile status is null', () => {
    const { subscriptionStatus } = resolveSubscriptionFields({
      profileStatus: null,
      subStatus: 'suspended',
      profilePlan: null,
      profileExpiresAt: null,
    });
    expect(subscriptionStatus).toBe('suspended');
  });

  it('defaults status to "trial" when both are null', () => {
    const { subscriptionStatus } = resolveSubscriptionFields({
      profileStatus: null,
      subStatus: null,
      profilePlan: null,
      profileExpiresAt: null,
    });
    expect(subscriptionStatus).toBe('trial');
  });

  // ---------------------------------------------------------------------------
  // Expiry
  // ---------------------------------------------------------------------------

  it('uses profile expiry when both profile and subscription expiry are present', () => {
    const { subscriptionExpiresAt } = resolveSubscriptionFields({
      profileExpiresAt: EXPIRY_A,
      subExpiresAt: EXPIRY_B,
      profileStatus: null,
      profilePlan: null,
    });
    expect(subscriptionExpiresAt).toBe(EXPIRY_A);
  });

  it('falls back to subscription expiry when profile expiry is null', () => {
    const { subscriptionExpiresAt } = resolveSubscriptionFields({
      profileExpiresAt: null,
      subExpiresAt: EXPIRY_B,
      profileStatus: null,
      profilePlan: null,
    });
    expect(subscriptionExpiresAt).toBe(EXPIRY_B);
  });

  it('returns null expiry when both are null', () => {
    const { subscriptionExpiresAt } = resolveSubscriptionFields({
      profileExpiresAt: null,
      subExpiresAt: null,
      profileStatus: null,
      profilePlan: null,
    });
    expect(subscriptionExpiresAt).toBeNull();
  });

  it('returns null expiry when subscription row is absent (no sub fields passed)', () => {
    const { subscriptionExpiresAt } = resolveSubscriptionFields({
      profileExpiresAt: null,
      profileStatus: null,
      profilePlan: null,
    });
    expect(subscriptionExpiresAt).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Combined: all profile fields win over subscription fields
  // ---------------------------------------------------------------------------

  it('returns all profile values when all profile fields are set', () => {
    const result = resolveSubscriptionFields({
      profileStatus: 'active',
      profilePlan: 'delta_plus',
      profileExpiresAt: EXPIRY_A,
      subStatus: 'trial',
      subPlan: 'trial',
      subExpiresAt: EXPIRY_B,
    });
    expect(result.subscriptionStatus).toBe('active');
    expect(result.subscriptionPlan).toBe('delta_plus');
    expect(result.subscriptionExpiresAt).toBe(EXPIRY_A);
  });

  it('returns all subscription values as fallback when profile fields are all null', () => {
    const result = resolveSubscriptionFields({
      profileStatus: null,
      profilePlan: null,
      profileExpiresAt: null,
      subStatus: 'active',
      subPlan: 'basic',
      subExpiresAt: EXPIRY_B,
    });
    expect(result.subscriptionStatus).toBe('active');
    expect(result.subscriptionPlan).toBe('basic');
    expect(result.subscriptionExpiresAt).toBe(EXPIRY_B);
  });
});
