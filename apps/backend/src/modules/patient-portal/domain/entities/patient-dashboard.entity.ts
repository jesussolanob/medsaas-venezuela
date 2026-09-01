/**
 * Appointment summary for the patient portal dashboard.
 * Contains only the fields a patient can safely see — no doctor PHI beyond public info.
 */
export interface AppointmentSummary {
  id: string;
  scheduledAt: Date;
  status: string;
  appointmentMode: string;
  planName: string | null;
  doctorId: string;
  /** Doctor's display name — resolved from profiles.full_name. */
  doctorName: string | null;
}

/**
 * Package summary for the patient portal dashboard.
 * Includes doctor info so the patient can re-book or contact the doctor.
 */
export interface PackageSummary {
  id: string;
  planName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  status: string;
  doctorId: string;
  /** Doctor's display name — resolved from profiles.full_name. */
  doctorName: string | null;
  /**
   * Título profesional elegido por el especialista (`Dr.`, `Psic.`, `Lic.`…).
   *
   * Viaja porque el portal del paciente anteponía "Dr." escrito a mano y a la
   * paciente de una psicóloga le decía "Dr. <nombre>". Puede venir vacío: hay
   * especialistas que nunca lo cargaron.
   */
  doctorTitle: string | null;
  /** Especialidad — respaldo para derivar el título cuando no está cargado. */
  doctorSpecialty: string | null;
  /** Doctor's booking link (if any). Resolved from doctor_invitations. */
  bookingLink: string | null;
}

/**
 * PatientDashboard domain entity.
 *
 * Aggregates the patient's next upcoming appointment, active packages, and
 * total appointment count. All data is scoped to a single auth_user_id.
 *
 * This entity contains no PHI — full_name and cedula are NOT included here.
 * The patient fetches their own profile via GET /patient/profile.
 */
export class PatientDashboard {
  constructor(
    public readonly nextAppointment: AppointmentSummary | null,
    public readonly activePackages: PackageSummary[],
    public readonly totalAppointments: number,
  ) {}

  /** Returns true when the patient has at least one upcoming appointment. */
  hasUpcomingAppointment(): boolean {
    return this.nextAppointment !== null;
  }

  /** Returns the number of packages with remaining sessions. */
  packagesWithSessionsRemaining(): number {
    return this.activePackages.filter((p) => p.remainingSessions > 0).length;
  }
}
