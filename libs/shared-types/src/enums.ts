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

/**
 * User-facing (es-VE) label for every appointment status.
 *
 * Single source of truth shared by the backend and the UI. Error messages used
 * to leak the raw enum value to the specialist — "No se puede pasar la cita de
 * 'cancelled' a 'no_show'" — words that appear nowhere on her screen. Anything
 * a person reads must come from here.
 */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Atendida',
  no_show: 'No asistió',
  // Legacy values kept for exhaustiveness; no transition leaves them.
  pending: 'Pendiente',
  accepted: 'Aceptada',
};

/** Spanish label for a status, falling back to the raw value if unknown. */
export function appointmentStatusLabel(status: string): string {
  return APPOINTMENT_STATUS_LABELS[status as AppointmentStatus] ?? status;
}

/**
 * Which statuses an appointment can move to from each state.
 *
 * Shared so the UI hides the actions the domain would reject instead of keeping
 * its own copy of the rules. A specialist was offered "No asistió" on an already
 * cancelled appointment; the click could only ever produce an error.
 *
 * A status missing from this map is final: 'completed', 'cancelled', 'no_show'
 * and the legacy 'pending'/'accepted' admit no outgoing transition.
 */
export const APPOINTMENT_TRANSITIONS: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
  // Desde "Agendada" se permite el desenlace clínico directo, sin exigir el
  // paso administrativo intermedio de confirmar.
  scheduled: ['confirmed', 'cancelled', 'completed', 'no_show'],
  confirmed: ['completed', 'no_show', 'cancelled'],
};

/** Statuses still reachable from `status`. Empty means a final state. */
export function allowedAppointmentTransitions(status: string): AppointmentStatus[] {
  return APPOINTMENT_TRANSITIONS[status as AppointmentStatus] ?? [];
}

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
export const UserRoleSchema = z.enum([
  'super_admin',
  'admin',
  'doctor',
  'assistant',
  'patient',
  'seller',
]);
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
