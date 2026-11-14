export type ConsultaStatus = 'pending' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';

/**
 * Maps the linked appointment status (scheduled/confirmed/completed/no_show/cancelled)
 * to the consultation status shown in Consultas. "Atendida" (completed),
 * "No asistió" (no_show) and "Cancelada" persist across reloads instead of
 * resetting to pending — a cancelled appointment used to show as "Pendiente".
 *
 * Shared by the server page (first render) and the client (refetches): two copies
 * of this mapping drifted apart once already.
 */
export function mapAppointmentStatusToConsulta(
  apptStatus: string | null | undefined,
): ConsultaStatus {
  if (apptStatus === 'completed') return 'completed';
  if (apptStatus === 'no_show') return 'no_show';
  if (apptStatus === 'cancelled') return 'cancelled';
  return 'pending';
}
