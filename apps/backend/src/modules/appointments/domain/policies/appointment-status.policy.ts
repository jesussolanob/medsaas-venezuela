import type { AppointmentStatus } from '@delta/shared-types';

/**
 * Number of days from now within which an appointment created or rescheduled
 * by a doctor or admin is automatically set to 'confirmed' instead of
 * remaining as 'scheduled'.
 *
 * Threshold:
 *   daysUntil < AUTO_CONFIRM_DAYS_THRESHOLD  → 'confirmed'
 *   daysUntil >= AUTO_CONFIRM_DAYS_THRESHOLD → 'scheduled'
 *
 * "Dentro de los próximos 2 días (hoy o mañana o pasado mañana)" means < 3 days.
 */
const AUTO_CONFIRM_DAYS_THRESHOLD = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes the active appointment status ('scheduled' | 'confirmed') for
 * a given scheduled date, applying the 3-day auto-confirm rule.
 *
 * "Active" means the appointment is still pending completion.  This function
 * intentionally does NOT return 'completed' — callers that need to handle
 * past-date creation (e.g. CreateAppointmentUseCase) must check the date
 * before calling this function and return 'completed' directly when appropriate.
 *
 * Rule:
 *   slot within 3 days from now → 'confirmed'
 *   slot 3+ days out            → 'scheduled'
 *
 * Past dates (daysUntil < 0) also satisfy the < 3 threshold and return
 * 'confirmed', which is the sensible fallback when reschedule brings a
 * no-show appointment back into the workflow.
 */
export function computeActiveStatus(
  scheduledAt: Date,
): Extract<AppointmentStatus, 'scheduled' | 'confirmed'> {
  const daysUntil = (scheduledAt.getTime() - Date.now()) / MS_PER_DAY;
  return daysUntil < AUTO_CONFIRM_DAYS_THRESHOLD ? 'confirmed' : 'scheduled';
}
