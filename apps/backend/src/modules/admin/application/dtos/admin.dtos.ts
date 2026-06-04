import { z } from 'zod';
import { SubscriptionStatusSchema, SubscriptionPlanSchema } from '@delta/shared-types';

// ---------------------------------------------------------------------------
// PUT /admin/doctors/:id/subscription
// ---------------------------------------------------------------------------

export const UpdateSubscriptionBodySchema = z
  .object({
    plan: SubscriptionPlanSchema,
    status: SubscriptionStatusSchema,
    /**
     * ISO 8601 datetime string for the new subscription expiration date.
     * Using z.string().datetime() prevents Invalid Date from reaching the DB.
     */
    expires_at: z
      .string()
      .datetime({ offset: true, message: 'expires_at must be a valid ISO 8601 datetime' }),
    notes: z.string().max(1000).nullable().optional(),
  })
  .strict();

export type UpdateSubscriptionBody = z.infer<typeof UpdateSubscriptionBodySchema>;

// ---------------------------------------------------------------------------
// PUT /admin/plans/:planKey
// ---------------------------------------------------------------------------

export const TogglePlanBodySchema = z
  .object({
    is_active: z.boolean({ error: 'is_active must be a boolean' }),
  })
  .strict();

export type TogglePlanBody = z.infer<typeof TogglePlanBodySchema>;

// ---------------------------------------------------------------------------
// PUT /admin/plan-features/:planKey/:featureKey
// ---------------------------------------------------------------------------

export const TogglePlanFeatureBodySchema = z
  .object({
    feature_label: z.string().min(1, 'feature_label is required').max(200),
    enabled: z.boolean({ error: 'enabled must be a boolean' }),
  })
  .strict();

export type TogglePlanFeatureBody = z.infer<typeof TogglePlanFeatureBodySchema>;

// ---------------------------------------------------------------------------
// Query param enums for GET /admin/doctors and GET /admin/subscriptions
// ---------------------------------------------------------------------------

/** Valid values for the ?activity_status= query parameter. */
export const VALID_ACTIVITY_STATUSES = ['active', 'cold', 'inactive'] as const;

// ---------------------------------------------------------------------------
// POST /admin/subscriptions/{extend,suspend,reactivate} — manual ops
// ---------------------------------------------------------------------------

export const ExtendSubscriptionBodySchema = z
  .object({
    doctor_id: z.string().uuid({ message: 'doctor_id must be a valid UUID' }),
    months: z.number().int().min(1).max(120),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();
export type ExtendSubscriptionBody = z.infer<typeof ExtendSubscriptionBodySchema>;

export const SuspendSubscriptionBodySchema = z
  .object({
    doctor_id: z.string().uuid({ message: 'doctor_id must be a valid UUID' }),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();
export type SuspendSubscriptionBody = z.infer<typeof SuspendSubscriptionBodySchema>;

export const ReactivateSubscriptionBodySchema = z
  .object({
    doctor_id: z.string().uuid({ message: 'doctor_id must be a valid UUID' }),
  })
  .strict();
export type ReactivateSubscriptionBody = z.infer<typeof ReactivateSubscriptionBodySchema>;

/** Valid values for the ?subscription_status= query parameter. */
export const VALID_SUBSCRIPTION_STATUSES = [
  'trial',
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancelled',
] as const;

/** Valid values for the ?plan= and ?status= query parameters on subscriptions. */
export const VALID_SUBSCRIPTION_PLANS = [
  'trial',
  'basic',
  'professional',
  'clinic',
  'enterprise',
] as const;
