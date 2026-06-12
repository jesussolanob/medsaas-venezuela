import { RescheduleAppointmentUseCase } from './reschedule-appointment.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { AppointmentNotReschedulableError } from '../../../domain/errors/appointment-not-reschedulable.error';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../domain/entities/appointment.entity';

const DOCTOR_ID = 'doctor-uuid-1';
const APPT_ID = 'appt-uuid-1';
const now = new Date('2026-06-10T10:00:00Z');
const newDate = new Date('2026-06-11T14:00:00Z');

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  return Appointment.create({
    id: APPT_ID,
    doctorId: DOCTOR_ID,
    patientId: 'patient-1',
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
    updateStatus: jest.fn(),
    updateScheduledAt: jest
      .fn()
      .mockImplementation((_id, scheduledAt) => Promise.resolve(makeAppointment({ scheduledAt }))),
    hasSlotConflict: jest.fn().mockResolvedValue(false),
    hasDuplicate: jest.fn(),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn().mockResolvedValue(undefined),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
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

      expect(repo.hasSlotConflict).toHaveBeenCalledWith({
        doctorId: DOCTOR_ID,
        scheduledAt: newDate,
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

    it('throws AppointmentNotReschedulableError for a no_show appointment', async () => {
      const appt = makeAppointment({ status: 'no_show' });
      repo = makeRepo(appt);
      useCase = new RescheduleAppointmentUseCase(repo);

      await expect(
        useCase.execute({ appointmentId: APPT_ID, actorId: DOCTOR_ID, newScheduledAt: newDate }),
      ).rejects.toBeInstanceOf(AppointmentNotReschedulableError);
    });

    it('throws AppointmentConflictError when new slot is already occupied', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt, { hasSlotConflict: jest.fn().mockResolvedValue(true) });
      useCase = new RescheduleAppointmentUseCase(repo);

      await expect(
        useCase.execute({ appointmentId: APPT_ID, actorId: DOCTOR_ID, newScheduledAt: newDate }),
      ).rejects.toBeInstanceOf(AppointmentConflictError);

      expect(repo.updateScheduledAt).not.toHaveBeenCalled();
    });

    it('passes excludeId so self-conflict is not raised when rescheduling to same slot', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt, { hasSlotConflict: jest.fn().mockResolvedValue(false) });
      useCase = new RescheduleAppointmentUseCase(repo);

      await useCase.execute({ appointmentId: APPT_ID, actorId: DOCTOR_ID, newScheduledAt: now });

      expect(repo.hasSlotConflict).toHaveBeenCalledWith(
        expect.objectContaining({ excludeId: APPT_ID }),
      );
    });
  });
});
