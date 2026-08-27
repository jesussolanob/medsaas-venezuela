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
    doctor_id: z.string().uuid({ message: 'doctor_id debe ser un UUID válido' }),
    months: z.number().int().min(1).max(120).optional(),
    days: z.number().int().min(1).max(3650).optional(),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => {
      const hasMonths = data.months !== undefined;
      const hasDays = data.days !== undefined;
      // Exactly one must be present (XOR)
      return hasMonths !== hasDays;
    },
    { message: 'Indicá la extensión en días o en meses, pero no en ambos' },
  );
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
  'delta_free',
  'delta_base',
  'delta_plus',
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
// POST /admin/plans — create a new plan
// ---------------------------------------------------------------------------

export const CreatePlanBodySchema = z
  .object({
    plan_key: z
      .string()
      .min(1, 'plan_key is required')
      .max(100)
      .regex(/^[a-z0-9_]+$/, 'plan_key must be lowercase alphanumeric with underscores'),
    name: z.string().min(1, 'name is required').max(200),
    role_key: z.string().min(1).max(100).default('doctor'),
    is_permanent: z.boolean().default(false),
    is_active: z.boolean().default(true),
    sort_order: z.number().int().min(0).default(0),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict();

export type CreatePlanBody = z.infer<typeof CreatePlanBodySchema>;

// ---------------------------------------------------------------------------
// PUT /admin/plans/:planKey — full edit (replaces TogglePlanBodySchema scope)
// ---------------------------------------------------------------------------

export const UpdatePlanFullBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
    is_permanent: z.boolean().optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.name !== undefined ||
      b.is_active !== undefined ||
      b.sort_order !== undefined ||
      b.is_permanent !== undefined ||
      b.description !== undefined,
    { message: 'Debés enviar al menos un campo' },
  );

export type UpdatePlanFullBody = z.infer<typeof UpdatePlanFullBodySchema>;

// ---------------------------------------------------------------------------
// PUT /admin/plans/:planKey/features — bulk-set feature matrix
// ---------------------------------------------------------------------------

export const SetPlanFeaturesBodySchema = z
  .object({
    features: z
      .array(
        z.object({
          feature_key: z.string().min(1).max(100),
          feature_label: z.string().min(1).max(200),
          enabled: z.boolean(),
        }),
      )
      .min(1, 'features array must not be empty')
      .max(50, 'features array must not exceed 50 entries'),
  })
  .strict();

export type SetPlanFeaturesBody = z.infer<typeof SetPlanFeaturesBodySchema>;

// ---------------------------------------------------------------------------
// PUT /admin/plans/:planKey/prices — bulk-set prices by period
// ---------------------------------------------------------------------------

const VALID_PERIODS = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;

export const SetPlanPricesBodySchema = z
  .object({
    prices: z
      .array(
        z.object({
          period: z.enum(VALID_PERIODS),
          price_usd: z.number().min(0).max(99999.99),
          is_active: z.boolean().default(true),
        }),
      )
      .min(1, 'prices array must not be empty')
      .max(4, 'prices array must not exceed 4 entries'),
  })
  .strict();

export type SetPlanPricesBody = z.infer<typeof SetPlanPricesBodySchema>;

// ---------------------------------------------------------------------------
// PUT /admin/doctors/:id/access — block or unblock a doctor account
// ---------------------------------------------------------------------------

export const SetDoctorAccessBodySchema = z
  .object({
    is_active: z.boolean({ error: 'is_active must be a boolean' }),
    reason: z.string().max(500).optional(),
  })
  .strict();

export type SetDoctorAccessBody = z.infer<typeof SetDoctorAccessBodySchema>;

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
    role: z.enum(['super_admin', 'doctor', 'seller']),
  })
  .strict();

export type SetUserRoleBody = z.infer<typeof SetUserRoleBodySchema>;

// ---------------------------------------------------------------------------
// POST /admin/doctors — admin-provision a new doctor profile + subscription
// ---------------------------------------------------------------------------

/**
 * Plans that the admin is allowed to assign when creating a new doctor.
 * Only the currently active public plans + the default onboarding trial.
 *
 *   free_trial  → 30-day onboarding trial (default when plan is omitted)
 *   delta_free  → permanent free plan
 *   delta_base  → paid base plan (admin sets active status; payment expected later)
 *   delta_plus  → paid plus plan (same)
 */
const ADMIN_ASSIGNABLE_PLANS = ['free_trial', 'delta_free', 'delta_base', 'delta_plus'] as const;
export type AdminAssignablePlan = (typeof ADMIN_ASSIGNABLE_PLANS)[number];

export const CreateAdminDoctorBodySchema = z
  .object({
    full_name: z.string().min(1, 'full_name is required').max(300),
    email: z.string().email({ message: 'email must be a valid email address' }).max(320),
    specialty: z.string().min(1).max(200).nullable().optional(),
    /**
     * Doctor identity document in canonical form: "V-12345678", "E-987654", etc.
     * Stored as-is; the admin panel's CedulaInput emits the canonical format.
     */
    cedula: z.string().max(50).nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    /**
     * Subscription plan to assign.
     *
     * - Omitting `plan` defaults to `free_trial` (30-day onboarding trial).
     * - `delta_free` provisions a permanent free account.
     * - `delta_base` / `delta_plus` provision an active paid account (manual payment
     *   is expected separately — the admin can extend the subscription later).
     *
     * Invalid plan keys are rejected with a 400 validation error.
     */
    plan: z.enum(ADMIN_ASSIGNABLE_PLANS).optional(),
  })
  .strict();

export type CreateAdminDoctorBody = z.infer<typeof CreateAdminDoctorBodySchema>;
