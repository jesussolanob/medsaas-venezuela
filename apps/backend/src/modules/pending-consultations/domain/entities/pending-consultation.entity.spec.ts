import { PendingConsultation } from './pending-consultation.entity';

const BASE_DATE = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date(Date.now() + 86_400_000); // +1 day
const PAST = new Date(Date.now() - 86_400_000); // -1 day

function make(overrides: Partial<Parameters<typeof PendingConsultation.create>[0]> = {}) {
  return PendingConsultation.create({
    id: 'pc-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    planName: 'Paquete Ortopedia',
    sessionNumber: 2,
    status: 'pending_scheduling',
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    ...overrides,
  });
}

describe('PendingConsultation entity', () => {
  // ---------------------------------------------------------------------------
  // isSchedulable
  // ---------------------------------------------------------------------------

  describe('isSchedulable()', () => {
    it('returns true when status=pending_scheduling and expiresAt is null', () => {
      const pc = make({ expiresAt: null });
      expect(pc.isSchedulable()).toBe(true);
    });

    it('returns true when status=pending_scheduling and expiresAt is in the future', () => {
      const pc = make({ expiresAt: FUTURE });
      expect(pc.isSchedulable()).toBe(true);
    });

    it('returns false when status=pending_scheduling but expiresAt is in the past', () => {
      const pc = make({ expiresAt: PAST });
      expect(pc.isSchedulable()).toBe(false);
    });

    it('returns false when status=scheduled', () => {
      const pc = make({ status: 'scheduled' });
      expect(pc.isSchedulable()).toBe(false);
    });

    it('returns false when status=completed', () => {
      const pc = make({ status: 'completed' });
      expect(pc.isSchedulable()).toBe(false);
    });

    it('returns false when status=expired', () => {
      const pc = make({ status: 'expired' });
      expect(pc.isSchedulable()).toBe(false);
    });

    it('returns false when status=cancelled', () => {
      const pc = make({ status: 'cancelled' });
      expect(pc.isSchedulable()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // markScheduled
  // ---------------------------------------------------------------------------

  describe('markScheduled()', () => {
    it('returns a new instance with status=scheduled and correct IDs', () => {
      const pc = make();
      const updated = pc.markScheduled('appt-001', 'consult-001');

      expect(updated).not.toBe(pc); // immutable — new instance
      expect(updated.status).toBe('scheduled');
      expect(updated.scheduledAppointmentId).toBe('appt-001');
      expect(updated.consultationId).toBe('consult-001');
    });

    it('accepts null for consultationId (best-effort auto-create may fail)', () => {
      const pc = make();
      const updated = pc.markScheduled('appt-001', null);

      expect(updated.status).toBe('scheduled');
      expect(updated.consultationId).toBeNull();
    });

    it('preserves all other fields unchanged', () => {
      const pc = make({ packageId: 'pkg-001', officeId: 'office-001', expiresAt: FUTURE });
      const updated = pc.markScheduled('appt-001', 'consult-001');

      expect(updated.id).toBe(pc.id);
      expect(updated.doctorId).toBe(pc.doctorId);
      expect(updated.patientId).toBe(pc.patientId);
      expect(updated.packageId).toBe(pc.packageId);
      expect(updated.planName).toBe(pc.planName);
      expect(updated.sessionNumber).toBe(pc.sessionNumber);
      expect(updated.expiresAt).toBe(pc.expiresAt);
      expect(updated.officeId).toBe(pc.officeId);
    });

    it('does NOT mutate the original', () => {
      const pc = make();
      pc.markScheduled('appt-001', 'consult-001');

      expect(pc.status).toBe('pending_scheduling');
      expect(pc.scheduledAppointmentId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // markCancelled
  // ---------------------------------------------------------------------------

  describe('markCancelled()', () => {
    it('returns a new instance with status=cancelled', () => {
      const pc = make();
      const cancelled = pc.markCancelled();

      expect(cancelled).not.toBe(pc);
      expect(cancelled.status).toBe('cancelled');
    });

    it('does NOT mutate the original', () => {
      const pc = make();
      pc.markCancelled();

      expect(pc.status).toBe('pending_scheduling');
    });

    it('preserves all other fields', () => {
      const pc = make({ packageId: 'pkg-001', sessionNumber: 3 });
      const cancelled = pc.markCancelled();

      expect(cancelled.id).toBe(pc.id);
      expect(cancelled.packageId).toBe(pc.packageId);
      expect(cancelled.sessionNumber).toBe(pc.sessionNumber);
    });
  });

  // ---------------------------------------------------------------------------
  // markExpired
  // ---------------------------------------------------------------------------

  describe('markExpired()', () => {
    it('returns a new instance with status=expired', () => {
      const pc = make({ expiresAt: PAST });
      const expired = pc.markExpired();

      expect(expired).not.toBe(pc);
      expect(expired.status).toBe('expired');
    });

    it('does NOT mutate the original', () => {
      const pc = make();
      pc.markExpired();

      expect(pc.status).toBe('pending_scheduling');
    });
  });

  // ---------------------------------------------------------------------------
  // Factory defaults
  // ---------------------------------------------------------------------------

  describe('create() factory', () => {
    it('applies nullable defaults for optional fields', () => {
      const pc = make();

      expect(pc.authUserId).toBeNull();
      expect(pc.packageId).toBeNull();
      expect(pc.paymentId).toBeNull();
      expect(pc.officeId).toBeNull();
      expect(pc.appointmentMode).toBeNull();
      expect(pc.expiresAt).toBeNull();
      expect(pc.scheduledAppointmentId).toBeNull();
      expect(pc.consultationId).toBeNull();
      expect(pc.reminderStage).toBe(0);
      expect(pc.lastReminderAt).toBeNull();
    });

    it('stores provided fields correctly', () => {
      const pc = make({
        authUserId: 'auth-001',
        packageId: 'pkg-001',
        paymentId: 'pay-001',
        officeId: 'office-001',
        appointmentMode: 'presencial',
        expiresAt: FUTURE,
        reminderStage: 1,
      });

      expect(pc.authUserId).toBe('auth-001');
      expect(pc.packageId).toBe('pkg-001');
      expect(pc.paymentId).toBe('pay-001');
      expect(pc.officeId).toBe('office-001');
      expect(pc.appointmentMode).toBe('presencial');
      expect(pc.expiresAt).toBe(FUTURE);
      expect(pc.reminderStage).toBe(1);
    });
  });
});
