import { RescheduleAppointmentUseCase } from './reschedule-appointment.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { AppointmentNotReschedulableError } from '../../../domain/errors/appointment-not-reschedulable.error';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentDuplicateError } from '../../../domain/errors/appointment-duplicate.error';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../domain/entities/appointment.entity';

const DOCTOR_ID = 'doctor-uuid-1';
const PATIENT_ID = 'patient-uuid-1';
const APPT_ID = 'appt-uuid-1';
const now = new Date('2026-06-10T10:00:00Z');
const newDate = new Date('2026-06-11T14:00:00Z');

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  return Appointment.create({
    id: APPT_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    authUserId: null,
    consultationId: null,
    patientName: 'Juan P.',
    patientPhone: null,
    patientEmail: null,
    patientCedula: null,
    scheduledAt: now,
    status: 'scheduled',
    appointmentMode: 'presencial',
    source: null,
    planName: 'Consulta',
    planPrice: 30,
    paymentMethod: null,
    paymentReference: null,
    paymentReceiptUrl: null,
    insuranceName: null,
    bcvRate: null,
    amountBs: null,
    packageId: null,
    sessionNumber: null,
    chiefComplaint: null,
    appointmentCode: null,
    durationMinutes: 30,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeRepo(
  appointment: Appointment | null,
  overrides: Partial<IAppointmentRepository> = {},
): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn().mockResolvedValue(appointment),
    list: jest.fn(),
    save: jest.fn(),
    // Default mock returns an appointment with the requested status so that
    // no_show-reschedule tests can verify the restored status on the result.
    updateStatus: jest
      .fn()
      .mockImplementation((_id: string, status: AppointmentCreateParams['status']) =>
        Promise.resolve(makeAppointment({ status })),
      ),
    updateScheduledAt: jest
      .fn()
      .mockImplementation((_id, scheduledAt) => Promise.resolve(makeAppointment({ scheduledAt }))),
    hasOverlap: jest.fn().mockResolvedValue(false),
    hasPatientOverlap: jest.fn().mockResolvedValue(false),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn().mockResolvedValue(undefined),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
    findByIdForDoctor: jest.fn(),
    updateMeetLink: jest.fn().mockResolvedValue(undefined),
    updateGoogleEventId: jest.fn().mockResolvedValue(undefined),
    updateConsultationId: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn().mockResolvedValue(undefined),
    findFirstCompletedByPaymentId: jest.fn().mockResolvedValue(null),
    findUpcomingWithoutCalendarEvent: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as jest.Mocked<IAppointmentRepository>;
}

describe('RescheduleAppointmentUseCase', () => {
  let useCase: RescheduleAppointmentUseCase;
  let repo: jest.Mocked<IAppointmentRepository>;

  describe('successful reschedule', () => {
    it('updates scheduledAt and logs the change when slot is free', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      const result = await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: newDate,
      });

      expect(repo.hasOverlap).toHaveBeenCalledWith({
        doctorId: DOCTOR_ID,
        scheduledAt: newDate,
        durationMinutes: 30,
        excludeId: APPT_ID,
      });
      expect(repo.hasPatientOverlap).toHaveBeenCalledWith({
        patientId: PATIENT_ID,
        scheduledAt: newDate,
        durationMinutes: 30,
        excludeId: APPT_ID,
      });
      expect(repo.updateScheduledAt).toHaveBeenCalledWith(APPT_ID, newDate);
      expect(repo.logStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: APPT_ID, actorId: DOCTOR_ID }),
      );
      expect(result.scheduledAt).toEqual(newDate);
    });

    it('reschedules a confirmed appointment successfully', async () => {
      const appt = makeAppointment({ status: 'confirmed' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: newDate,
      });

      expect(repo.updateScheduledAt).toHaveBeenCalledTimes(1);
    });

    it('uses default 30-min duration when appointment has no stored durationMinutes', async () => {
      const appt = makeAppointment({ durationMinutes: null });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: newDate,
      });

      expect(repo.hasOverlap).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 30 }),
      );
    });

    it('excludeId prevents self-conflict on doctor overlap check', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt, { hasOverlap: jest.fn().mockResolvedValue(false) });
      useCase = new RescheduleAppointmentUseCase(repo);

      await useCase.execute({ appointmentId: APPT_ID, actorId: DOCTOR_ID, newScheduledAt: now });

      expect(repo.hasOverlap).toHaveBeenCalledWith(expect.objectContaining({ excludeId: APPT_ID }));
    });

    it('excludeId prevents self-conflict on patient overlap check', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt, { hasPatientOverlap: jest.fn().mockResolvedValue(false) });
      useCase = new RescheduleAppointmentUseCase(repo);

      await useCase.execute({ appointmentId: APPT_ID, actorId: DOCTOR_ID, newScheduledAt: now });

      expect(repo.hasPatientOverlap).toHaveBeenCalledWith(
        expect.objectContaining({ excludeId: APPT_ID }),
      );
    });

    it('skips patient overlap check when appointment has no patientId', async () => {
      const appt = makeAppointment({ patientId: null });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: newDate,
      });

      expect(repo.hasPatientOverlap).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Point 11 premise: rescheduling must preserve the consultation/payment link.
  // A cancelled-with-payment appointment can only be MOVED (never refunded/
  // credited), so the payment must simply travel with the new date.
  // -----------------------------------------------------------------------
  describe('preserves the consultation/payment link (point 11 premise)', () => {
    it('only touches scheduled_at — never re-links or clears consultationId', async () => {
      const appt = makeAppointment({ status: 'scheduled', consultationId: 'cons-paid-1' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: newDate,
      });

      // updateScheduledAt is called with exactly (id, newScheduledAt) — no other
      // field, so the consultation FK (and everything downstream of it, e.g. the
      // linked consultation's payment_status/amount) is left untouched at the DB
      // level. Rescheduling never calls updateConsultationId either.
      expect(repo.updateScheduledAt).toHaveBeenCalledWith(APPT_ID, newDate);
      expect(repo.updateConsultationId).not.toHaveBeenCalled();
    });

    it('returned appointment keeps the same consultationId after reschedule', async () => {
      const appt = makeAppointment({ status: 'scheduled', consultationId: 'cons-paid-1' });
      repo = makeRepo(appt, {
        updateScheduledAt: jest
          .fn()
          .mockImplementation((_id, scheduledAt) =>
            Promise.resolve(makeAppointment({ scheduledAt, consultationId: 'cons-paid-1' })),
          ),
      });
      useCase = new RescheduleAppointmentUseCase(repo);

      const result = await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: newDate,
      });

      expect(result.consultationId).toBe('cons-paid-1');
      expect(result.scheduledAt).toEqual(newDate);
    });
  });

  // -----------------------------------------------------------------------
  // B2: rescheduling a no_show appointment restores it to an active status
  // -----------------------------------------------------------------------
  describe('no_show reschedule — restores active status', () => {
    it('reschedules a no_show appointment to near future → restored to confirmed', async () => {
      const nearFuture = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const appt = makeAppointment({ status: 'no_show' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      const result = await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: nearFuture,
      });

      expect(repo.updateScheduledAt).toHaveBeenCalledWith(APPT_ID, nearFuture);
      expect(repo.updateStatus).toHaveBeenCalledWith(APPT_ID, 'confirmed');
      expect(result.status).toBe('confirmed');
    });

    it('reschedules a no_show appointment to far future → restored to scheduled', async () => {
      const farFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
      const appt = makeAppointment({ status: 'no_show' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      const result = await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: farFuture,
      });

      expect(repo.updateScheduledAt).toHaveBeenCalledWith(APPT_ID, farFuture);
      expect(repo.updateStatus).toHaveBeenCalledWith(APPT_ID, 'scheduled');
      expect(result.status).toBe('scheduled');
    });

    it('logs the real no_show → confirmed transition in the audit log', async () => {
      const nearFuture = new Date(Date.now() + 60 * 60 * 1000);
      const appt = makeAppointment({ status: 'no_show' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: nearFuture,
      });

      expect(repo.logStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: APPT_ID,
          actorId: DOCTOR_ID,
          oldStatus: 'no_show',
          newStatus: 'confirmed',
        }),
      );
    });

    it('does NOT call updateStatus when rescheduling a non-no_show appointment', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await useCase.execute({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: newDate,
      });

      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('error cases', () => {
    it('throws AppointmentNotFoundError when appointment does not exist', async () => {
      repo = makeRepo(null);
      useCase = new RescheduleAppointmentUseCase(repo);

      await expect(
        useCase.execute({ appointmentId: 'bad-id', actorId: DOCTOR_ID, newScheduledAt: newDate }),
      ).rejects.toBeInstanceOf(AppointmentNotFoundError);

      expect(repo.updateScheduledAt).not.toHaveBeenCalled();
    });

    it('throws AppointmentNotFoundError (anti-enumeration) when actor is not the owning doctor', async () => {
      const appt = makeAppointment({ doctorId: DOCTOR_ID });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await expect(
        useCase.execute({
          appointmentId: APPT_ID,
          actorId: 'other-doctor',
          newScheduledAt: newDate,
        }),
      ).rejects.toBeInstanceOf(AppointmentNotFoundError);

      expect(repo.updateScheduledAt).not.toHaveBeenCalled();
    });

    it('throws AppointmentNotReschedulableError for a cancelled appointment', async () => {
      const appt = makeAppointment({ status: 'cancelled' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await expect(
        useCase.execute({ appointmentId: APPT_ID, actorId: DOCTOR_ID, newScheduledAt: newDate }),
      ).rejects.toBeInstanceOf(AppointmentNotReschedulableError);

      expect(repo.updateScheduledAt).not.toHaveBeenCalled();
    });

    it('throws AppointmentNotReschedulableError for a completed appointment', async () => {
      const appt = makeAppointment({ status: 'completed' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await expect(
        useCase.execute({ appointmentId: APPT_ID, actorId: DOCTOR_ID, newScheduledAt: newDate }),
      ).rejects.toBeInstanceOf(AppointmentNotReschedulableError);
    });

    it('throws AppointmentConflictError when new slot overlaps another doctor appointment', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt, { hasOverlap: jest.fn().mockResolvedValue(true) });
      useCase = new RescheduleAppointmentUseCase(repo);

      await expect(
        useCase.execute({ appointmentId: APPT_ID, actorId: DOCTOR_ID, newScheduledAt: newDate }),
      ).rejects.toBeInstanceOf(AppointmentConflictError);

      expect(repo.updateScheduledAt).not.toHaveBeenCalled();
    });

    it('throws AppointmentDuplicateError when patient has overlapping appointment with another doctor', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt, { hasPatientOverlap: jest.fn().mockResolvedValue(true) });
      useCase = new RescheduleAppointmentUseCase(repo);

      await expect(
        useCase.execute({ appointmentId: APPT_ID, actorId: DOCTOR_ID, newScheduledAt: newDate }),
      ).rejects.toBeInstanceOf(AppointmentDuplicateError);

      expect(repo.updateScheduledAt).not.toHaveBeenCalled();
    });
  });
});
