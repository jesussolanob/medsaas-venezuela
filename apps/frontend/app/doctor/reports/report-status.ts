/**
 * Report status of a consultation, derived from its linked appointment.
 *
 * Before, Reportería guessed it from the payment ("past + unpaid = no-show"), so a
 * cancelled appointment still counted as income and an unpaid attended one counted
 * as a no-show. The appointment status is the source of truth; a consultation
 * without an appointment (created directly) is treated as attended.
 */
export type ReportStatus = 'completed' | 'no_show' | 'cancelled' | 'pending';

export function deriveReportStatus(appointmentStatus: string | null | undefined): ReportStatus {
  switch (appointmentStatus) {
    case 'completed':
      return 'completed';
    case 'no_show':
      return 'no_show';
    case 'cancelled':
      return 'cancelled';
    case 'scheduled':
    case 'confirmed':
      return 'pending';
    default:
      return 'completed';
  }
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  completed: 'Atendida',
  no_show: 'No asistió',
  cancelled: 'Cancelada',
  pending: 'Por atender',
};
