import type { AppointmentStatus, AppointmentMode } from '@delta/shared-types';

/**
 * Appointment domain entity.
 *
 * Canonical statuses: scheduled, confirmed, completed, cancelled, no_show.
 * Legacy statuses (pending, accepted) exist in the DB enum for historical data
 * but no new transitions are allowed from them — they are terminal for the domain.
 *
 * Invariants enforced here:
 *   - canTransitionTo() guards all status changes.
 *   - canBeModifiedBy() enforces doctor ownership (anti-IDOR).
 */
export class Appointment {
  private static readonly TRANSITIONS: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
    scheduled: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'no_show', 'cancelled'],
    // completed, cancelled, no_show, pending, accepted: no outgoing transitions
  };

  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly patientId: string | null,
    public readonly authUserId: string | null,
    public readonly consultationId: string | null,
    public readonly patientName: string | null,
    public readonly patientPhone: string | null,
    public readonly patientEmail: string | null,
    public readonly patientCedula: string | null,
    public readonly scheduledAt: Date,
    public readonly status: AppointmentStatus,
    public readonly appointmentMode: AppointmentMode,
    public readonly source: string | null,
    public readonly planName: string | null,
    public readonly planPrice: number | null,
    public readonly paymentMethod: string | null,
    public readonly paymentReference: string | null,
    public readonly paymentReceiptUrl: string | null,
    public readonly insuranceName: string | null,
    public readonly bcvRate: number | null,
    public readonly amountBs: number | null,
    public readonly packageId: string | null,
    public readonly sessionNumber: number | null,
    public readonly chiefComplaint: string | null,
    public readonly appointmentCode: string | null,
    public readonly paymentId: string | null,
    /** Google Meet URL or Jitsi fallback for online appointments. Null for in-person. */
    public readonly meetLink: string | null,
    /**
     * FK → doctor_offices(id). Records which office the appointment is booked at.
     * Null for legacy rows or when no office context is provided.
     * Added by migration 20260611000009-office-id-on-pricing-plans-and-appointments.
     */
    public readonly officeId: string | null,
    /**
     * Google Calendar event ID for the appointment's calendar event.
     * Used to cancel the event when the appointment is cancelled.
     * Null for in-person appointments, Jitsi-fallback online appointments,
     * or legacy rows. Added by migration 20260612000001.
     */
    public readonly googleCalendarEventId: string | null,
    /**
     * Duration of the appointment slot in minutes.
     * The appointment occupies the interval [scheduledAt, scheduledAt + durationMinutes).
     * Used for overlap detection. Null for legacy rows (treated as 30 min by the repo layer).
     * Added by migration 20260612000003.
     */
    public readonly durationMinutes: number | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Returns true when the status transition from the current state to newStatus
   * is permitted by the business rules.
   *
   * Legacy statuses (pending, accepted) are treated as terminal: no transitions
   * are allowed from them at the domain level.
   */
  canTransitionTo(newStatus: AppointmentStatus): boolean {
    const allowed = Appointment.TRANSITIONS[this.status];
    return allowed?.includes(newStatus) ?? false;
  }

  /**
   * Returns true when the given actor is the owning doctor of this appointment.
   * Used to enforce anti-IDOR on write operations.
   */
  canBeModifiedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }

  /** Factory — creates a new Appointment value from raw data without persisting. */
  static create(params: AppointmentCreateParams): Appointment {
    return new Appointment(
      params.id,
      params.doctorId,
      params.patientId ?? null,
      params.authUserId ?? null,
      params.consultationId ?? null,
      params.patientName ?? null,
      params.patientPhone ?? null,
      params.patientEmail ?? null,
      params.patientCedula ?? null,
      params.scheduledAt,
      params.status,
      params.appointmentMode,
      params.source ?? null,
      params.planName ?? null,
      params.planPrice ?? null,
      params.paymentMethod ?? null,
      params.paymentReference ?? null,
      params.paymentReceiptUrl ?? null,
      params.insuranceName ?? null,
      params.bcvRate ?? null,
      params.amountBs ?? null,
      params.packageId ?? null,
      params.sessionNumber ?? null,
      params.chiefComplaint ?? null,
      params.appointmentCode ?? null,
      params.paymentId ?? null,
      params.meetLink ?? null,
      params.officeId ?? null,
      params.googleCalendarEventId ?? null,
      params.durationMinutes ?? null,
      params.createdAt,
      params.updatedAt,
    );
  }
}

export interface AppointmentCreateParams {
  id: string;
  doctorId: string;
  patientId?: string | null;
  authUserId?: string | null;
  consultationId?: string | null;
  patientName?: string | null;
  patientPhone?: string | null;
  patientEmail?: string | null;
  patientCedula?: string | null;
  scheduledAt: Date;
  status: AppointmentStatus;
  appointmentMode: AppointmentMode;
  source?: string | null;
  planName?: string | null;
  planPrice?: number | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paymentReceiptUrl?: string | null;
  insuranceName?: string | null;
  bcvRate?: number | null;
  amountBs?: number | null;
  packageId?: string | null;
  sessionNumber?: number | null;
  chiefComplaint?: string | null;
  appointmentCode?: string | null;
  /**
   * FK → payments(id). Set by CreateBookingUseCase when the booking creates
   * a payment record. Null for legacy rows and package-only bookings.
   */
  paymentId?: string | null;
  /**
   * Google Meet URL or Jitsi fallback link for online appointments.
   * Set after calendar event creation in the booking flow. Null for in-person.
   */
  meetLink?: string | null;
  /**
   * FK → doctor_offices(id). Records which office the appointment is booked at.
   * Optional — null for legacy rows.
   */
  officeId?: string | null;
  /**
   * Google Calendar event ID. Set after a successful Google Meet event creation.
   * Optional — null for in-person, Jitsi-fallback, or legacy rows.
   */
  googleCalendarEventId?: string | null;
  /**
   * Duration of the appointment slot in minutes.
   * Derived from the office slotDuration at booking/creation time.
   * Optional — null for legacy rows; treated as 30 min by the overlap detection logic.
   */
  durationMinutes?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
