import { PatientDashboard } from './patient-dashboard.entity';
import type { AppointmentSummary, PackageSummary } from './patient-dashboard.entity';

function makeAppointmentSummary(overrides: Partial<AppointmentSummary> = {}): AppointmentSummary {
  return {
    id: 'appt-1',
    scheduledAt: new Date('2030-01-01T10:00:00Z'),
    status: 'scheduled',
    appointmentMode: 'presencial',
    planName: 'Consulta General',
    doctorId: 'doctor-1',
    doctorName: 'Dr. Smith',
    ...overrides,
  };
}

function makePackageSummary(overrides: Partial<PackageSummary> = {}): PackageSummary {
  return {
    id: 'pkg-1',
    planName: 'Paquete 5 sesiones',
    totalSessions: 5,
    usedSessions: 2,
    remainingSessions: 3,
    status: 'active',
    doctorId: 'doctor-1',
    doctorName: 'Dr. Smith',
    bookingLink: 'https://booking.example.com/dr-smith',
    ...overrides,
  };
}

describe('PatientDashboard', () => {
  it('creates dashboard with all fields', () => {
    const appt = makeAppointmentSummary();
    const pkg = makePackageSummary();
    const dashboard = new PatientDashboard(appt, [pkg], 10);

    expect(dashboard.nextAppointment).toBe(appt);
    expect(dashboard.activePackages).toHaveLength(1);
    expect(dashboard.totalAppointments).toBe(10);
  });

  describe('hasUpcomingAppointment', () => {
    it('returns true when nextAppointment is set', () => {
      const dashboard = new PatientDashboard(makeAppointmentSummary(), [], 5);
      expect(dashboard.hasUpcomingAppointment()).toBe(true);
    });

    it('returns false when nextAppointment is null', () => {
      const dashboard = new PatientDashboard(null, [], 0);
      expect(dashboard.hasUpcomingAppointment()).toBe(false);
    });
  });

  describe('packagesWithSessionsRemaining', () => {
    it('counts only packages with remaining sessions', () => {
      const pkgs: PackageSummary[] = [
        makePackageSummary({ remainingSessions: 3 }),
        makePackageSummary({ id: 'pkg-2', remainingSessions: 0 }),
        makePackageSummary({ id: 'pkg-3', remainingSessions: 1 }),
      ];
      const dashboard = new PatientDashboard(null, pkgs, 5);
      expect(dashboard.packagesWithSessionsRemaining()).toBe(2);
    });

    it('returns 0 when no packages have remaining sessions', () => {
      const pkgs: PackageSummary[] = [makePackageSummary({ remainingSessions: 0 })];
      const dashboard = new PatientDashboard(null, pkgs, 5);
      expect(dashboard.packagesWithSessionsRemaining()).toBe(0);
    });

    it('returns 0 when activePackages is empty', () => {
      const dashboard = new PatientDashboard(null, [], 0);
      expect(dashboard.packagesWithSessionsRemaining()).toBe(0);
    });
  });
});
