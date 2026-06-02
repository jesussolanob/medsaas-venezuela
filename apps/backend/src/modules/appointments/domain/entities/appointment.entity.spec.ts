import { Appointment, type AppointmentCreateParams } from './appointment.entity';

const now = new Date('2026-06-02T10:00:00Z');

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  return Appointment.create({
    id: 'appt-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    authUserId: null,
    consultationId: null,
    patientName: 'Juan Pérez',
    patientPhone: '+58412000000',
    patientEmail: 'juan@example.com',
    patientCedula: 'V-12345678',
    scheduledAt: now,
    status: 'scheduled',
    appointmentMode: 'presencial',
    source: 'manual',
    planName: 'Consulta General',
    planPrice: 30,
    paymentMethod: 'efectivo',
    paymentReference: null,
    paymentReceiptUrl: null,
    insuranceName: null,
    bcvRate: null,
    amountBs: null,
    packageId: null,
    sessionNumber: null,
    chiefComplaint: 'Dolor de cabeza',
    appointmentCode: 'APT-001',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('Appointment entity', () => {
  describe('canTransitionTo', () => {
    it('allows scheduled → confirmed', () => {
      const appt = makeAppointment({ status: 'scheduled' });
      expect(appt.canTransitionTo('confirmed')).toBe(true);
    });

    it('allows scheduled → cancelled', () => {
      const appt = makeAppointment({ status: 'scheduled' });
      expect(appt.canTransitionTo('cancelled')).toBe(true);
    });

    it('allows confirmed → completed', () => {
      const appt = makeAppointment({ status: 'confirmed' });
      expect(appt.canTransitionTo('completed')).toBe(true);
    });

    it('allows confirmed → no_show', () => {
      const appt = makeAppointment({ status: 'confirmed' });
      expect(appt.canTransitionTo('no_show')).toBe(true);
    });

    it('allows confirmed → cancelled', () => {
      const appt = makeAppointment({ status: 'confirmed' });
      expect(appt.canTransitionTo('cancelled')).toBe(true);
    });

    it('denies scheduled → completed', () => {
      const appt = makeAppointment({ status: 'scheduled' });
      expect(appt.canTransitionTo('completed')).toBe(false);
    });

    it('denies scheduled → no_show', () => {
      const appt = makeAppointment({ status: 'scheduled' });
      expect(appt.canTransitionTo('no_show')).toBe(false);
    });

    it('denies completed → any status', () => {
      const appt = makeAppointment({ status: 'completed' });
      expect(appt.canTransitionTo('confirmed')).toBe(false);
      expect(appt.canTransitionTo('cancelled')).toBe(false);
      expect(appt.canTransitionTo('no_show')).toBe(false);
      expect(appt.canTransitionTo('scheduled')).toBe(false);
    });

    it('denies cancelled → any status', () => {
      const appt = makeAppointment({ status: 'cancelled' });
      expect(appt.canTransitionTo('scheduled')).toBe(false);
      expect(appt.canTransitionTo('confirmed')).toBe(false);
    });

    it('denies no_show → any status', () => {
      const appt = makeAppointment({ status: 'no_show' });
      expect(appt.canTransitionTo('confirmed')).toBe(false);
      expect(appt.canTransitionTo('scheduled')).toBe(false);
    });

    // Legacy statuses: no transitions allowed from them
    it('denies pending → any status (legacy — no new transitions)', () => {
      const appt = makeAppointment({ status: 'pending' });
      expect(appt.canTransitionTo('confirmed')).toBe(false);
      expect(appt.canTransitionTo('scheduled')).toBe(false);
    });

    it('denies accepted → any status (legacy — no new transitions)', () => {
      const appt = makeAppointment({ status: 'accepted' });
      expect(appt.canTransitionTo('confirmed')).toBe(false);
      expect(appt.canTransitionTo('completed')).toBe(false);
    });
  });

  describe('canBeModifiedBy', () => {
    it('returns true when actorId matches doctorId', () => {
      const appt = makeAppointment({ doctorId: 'doctor-1' });
      expect(appt.canBeModifiedBy('doctor-1')).toBe(true);
    });

    it('returns false when actorId does not match doctorId', () => {
      const appt = makeAppointment({ doctorId: 'doctor-1' });
      expect(appt.canBeModifiedBy('doctor-2')).toBe(false);
    });

    it('returns false for empty actorId', () => {
      const appt = makeAppointment({ doctorId: 'doctor-1' });
      expect(appt.canBeModifiedBy('')).toBe(false);
    });
  });

  describe('create factory', () => {
    it('maps all provided fields correctly', () => {
      const appt = makeAppointment();
      expect(appt.id).toBe('appt-1');
      expect(appt.doctorId).toBe('doctor-1');
      expect(appt.patientId).toBe('patient-1');
      expect(appt.status).toBe('scheduled');
      expect(appt.scheduledAt).toEqual(now);
    });

    it('defaults nullable fields to null when not provided', () => {
      const appt = makeAppointment({ packageId: undefined, consultationId: undefined });
      expect(appt.packageId).toBeNull();
      expect(appt.consultationId).toBeNull();
    });

    it('preserves null patientId (anonymous booking)', () => {
      const appt = makeAppointment({ patientId: null });
      expect(appt.patientId).toBeNull();
    });
  });
});
