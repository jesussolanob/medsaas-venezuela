import { z } from 'zod';
import { SubscriptionStatusSchema } from './enums';

// Columns from CLAUDE.md: doctor_id, plan, status, current_period_end
// Full columns from sql_migration_v24_missing_tables.sql (subscriptions table):
// id, doctor_id, plan (subscription_plan enum), status (subscription_status enum),
// price_usd, billing_cycle, current_period_start, current_period_end,
// trial_ends_at, cancelled_at, notes, created_at, updated_at

// Subscription plan key (matches plan_configs.plan_key)
export const SubscriptionPlanSchema = z.enum([
  'trial',
  'basic',
  'professional',
  'clinic',
  // 'enterprise' is a legacy value migrated to 'clinic' (fixes_remediation.sql, Section C)
  'enterprise',
]);
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  plan: SubscriptionPlanSchema,
  status: SubscriptionStatusSchema,
  price_usd: z.number().default(0),
  billing_cycle: z.string().default('monthly'),
  current_period_start: z.string().datetime({ offset: true }),
  current_period_end: z.string().datetime({ offset: true }),
  trial_ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  cancelled_at: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;

export const CreateSubscriptionSchema = SubscriptionSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type CreateSubscription = z.infer<typeof CreateSubscriptionSchema>;
