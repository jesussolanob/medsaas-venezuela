import { z } from 'zod';

// ---------------------------------------------------------------------------
// AppointmentStatus
// SQL (v24): 'scheduled','confirmed','completed','cancelled','no_show','pending','accepted'
// CLAUDE.md canonical: 'scheduled','confirmed','cancelled','completed','no_show'
// Decision: include all SQL values; 'pending' and 'accepted' are legacy but present
// in the enum. Frontend uses only the 5 canonical ones.
// ---------------------------------------------------------------------------
export const AppointmentStatusSchema = z.enum([
  'scheduled',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'pending',
  'accepted',
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

// ---------------------------------------------------------------------------
// PaymentStatus
// SQL (v24): 'pending','verified','rejected' (for subscription_payments)
// CLAUDE.md consultations: 'pending','approved' (no 'cancelled' per taxonomy)
// Decision: use CLAUDE.md values for consultations.payment_status; 'verified'
// and 'rejected' are only relevant for subscription_payments (not modeled here).
// ---------------------------------------------------------------------------
export const PaymentStatusSchema = z.enum(['pending', 'approved']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// ---------------------------------------------------------------------------
// SubscriptionStatus
// SQL (v24 CREATE TYPE): 'active','suspended','cancelled','trial','past_due'
// fixes_remediation.sql CHECK: adds 'trialing'
// CLAUDE.md feature gating: valid = 'active','trial','trialing'
// Decision: include all values found across sources; 'cancelled' present in SQL type
// ---------------------------------------------------------------------------
export const SubscriptionStatusSchema = z.enum([
  'trial',
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancelled',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

// ---------------------------------------------------------------------------
// UserRole
// SQL (v24): 'super_admin','doctor','assistant','patient'
// CLAUDE.md: super_admin, admin, doctor, patient (no 'assistant', but 'admin' appears in code)
// Decision: include both 'admin' and 'assistant' — SQL has assistant, CLAUDE.md code uses admin
// ---------------------------------------------------------------------------
export const UserRoleSchema = z.enum(['super_admin', 'admin', 'doctor', 'assistant', 'patient']);
export type UserRole = z.infer<typeof UserRoleSchema>;

// ---------------------------------------------------------------------------
// PackageStatus
// ---------------------------------------------------------------------------
export const PackageStatusSchema = z.enum(['active', 'completed']);
export type PackageStatus = z.infer<typeof PackageStatusSchema>;

// ---------------------------------------------------------------------------
// AppointmentMode
// ---------------------------------------------------------------------------
export const AppointmentModeSchema = z.enum(['presencial', 'online']);
export type AppointmentMode = z.infer<typeof AppointmentModeSchema>;
