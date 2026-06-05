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

// ---------------------------------------------------------------------------
// PUT /admin/settings — upsert a single app_settings key-value pair
// ---------------------------------------------------------------------------

export const UpsertSettingBodySchema = z
  .object({
    key: z.string().min(1, 'key is required').max(200),
    /**
     * Value is accepted as string or any JSON-serialisable type.
     * Non-string values are coerced to JSON strings before reaching the repo.
     */
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.record(z.string(), z.unknown()),
      z.array(z.unknown()),
    ]),
  })
  .strict();

export type UpsertSettingBody = z.infer<typeof UpsertSettingBodySchema>;

// ---------------------------------------------------------------------------
// PUT /admin/plans/:planKey/config — edit plan price and other editable fields
// ---------------------------------------------------------------------------

export const UpdatePlanBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    price: z.number().min(0).optional(),
    trial_days: z.number().int().min(0).optional(),
    sort_order: z.number().int().min(0).optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      body.price !== undefined ||
      body.trial_days !== undefined ||
      body.sort_order !== undefined ||
      body.description !== undefined,
    {
      message:
        'At least one field (name, price, trial_days, sort_order, description) must be provided',
    },
  );

export type UpdatePlanBody = z.infer<typeof UpdatePlanBodySchema>;

// ---------------------------------------------------------------------------
// PUT /admin/admins/:id/role — set a user's role (grant/revoke super_admin)
// ---------------------------------------------------------------------------

/**
 * Roles that can be set via this endpoint.
 * 'admin' is intentionally excluded — the DB enum uses 'super_admin' directly.
 * 'assistant' and 'patient' are excluded because elevating/demoting to those
 * roles is not a valid admin management operation.
 */
export const SetUserRoleBodySchema = z
  .object({
    role: z.enum(['super_admin', 'doctor']),
  })
  .strict();

export type SetUserRoleBody = z.infer<typeof SetUserRoleBodySchema>;
