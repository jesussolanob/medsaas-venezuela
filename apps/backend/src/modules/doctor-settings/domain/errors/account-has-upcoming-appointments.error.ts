import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a specialist tries to deactivate their own account while they
 * still have appointments booked in the future.
 *
 * Deactivation switches the account off for everyone at once: the specialist
 * loses access to the portal, and the public booking page stops answering. Any
 * patient holding a future appointment would simply be left waiting, with the
 * one person who could cancel or reschedule it now locked out. Blocking here
 * keeps that from happening — the specialist resolves the agenda first.
 *
 * The count is carried in the message so the UI can say exactly how many
 * without a second round-trip.
 *
 * HTTP 422 (inherited from DomainError).
 */
export class AccountHasUpcomingAppointmentsError extends DomainError {
  readonly code = 'ACCOUNT_HAS_UPCOMING_APPOINTMENTS';

  constructor(readonly upcomingCount: number) {
    super(
      upcomingCount === 1
        ? 'Tienes 1 cita agendada a futuro. Cancélala o atiéndela antes de dar de baja tu cuenta.'
        : `Tienes ${upcomingCount} citas agendadas a futuro. Cancélalas o atiéndelas antes de dar de baja tu cuenta.`,
    );
  }
}
