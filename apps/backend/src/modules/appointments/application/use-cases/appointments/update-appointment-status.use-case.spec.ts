import { UpdateAppointmentStatusUseCase } from './update-appointment-status.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { AppointmentInvalidTransitionError } from '../../../domain/errors/appointment-invalid-transition.error';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../domain/entities/appointment.entity';
import type { UpdateAppointmentStatusDto } from '@delta/shared-types';
import type { CancelCalendarEventUseCase } from '../../../../integrations/application/use-cases/integrations/cancel-calendar-event.use-case';
import type { CreateConsultationUseCase } from '../../../../consultations/application/use-cases/consultations/create-consultation.use-case';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';

const DOCTOR_ID = 'doctor-uuid-1';
const APPT_ID = 'appt-uuid-1';
const PATIENT_ID = 'patient-1';
const CONSULTATION_ID = 'cons-uuid-1111-2222-3333-444444444444';
const EVENT_ID = 'google-event-abc-123';
const now = new Date('2026-06-10T10:00:00Z');

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
    updateStatus: jest.fn().mockImplementation((_id: string, status: string) =>
      Promise.resolve(
        makeAppointment({
          status: status as
            | 'scheduled'
            | 'confirmed'
            | 'completed'
            | 'cancelled'
            | 'no_show'
            | 'pending'
            | 'accepted',
        }),
      ),
    ),
    updateScheduledAt: jest.fn(),
    hasOverlap: jest.fn(),
    hasPatientOverlap: jest.fn(),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn().mockResolvedValue(undefined),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
    findByIdForDoctor: jest.fn(),
    updateMeetLink: jest.fn(),
    updateGoogleEventId: jest.fn().mockResolvedValue(undefined),
    updateConsultationId: jest
      .fn()
      .mockImplementation((_id: string) =>
        Promise.resolve(makeAppointment({ consultationId: CONSULTATION_ID, status: 'confirmed' })),
      ),
    deleteById: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<IAppointmentRepository>;
}

function makeCancelUseCase(): jest.Mocked<CancelCalendarEventUseCase> {
  return {
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CancelCalendarEventUseCase>;
}

function makeCreateConsultationUC(): jest.Mocked<CreateConsultationUseCase> {
  return {
    execute: jest.fn().mockResolvedValue({ id: CONSULTATION_ID }),
  } as unknown as jest.Mocked<CreateConsultationUseCase>;
}

function makeConsultationRepo(
  existingConsultation: { id: string } | null = null,
): jest.Mocked<IConsultationRepository> {
  return {
    findById: jest.fn(),
    findByCode: jest.fn(),
    countByDoctorAndMonth: jest.fn(),
    getMaxSequenceForMonth: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    updatePayment: jest.fn(),
    updatePaymentDetails: jest.fn(),
    approveWithExtras: jest.fn(),
    findExtraItems: jest.fn(),
    list: jest.fn(),
    findByPatient: jest.fn(),
    findByAppointmentId: jest.fn().mockResolvedValue(existingConsultation),
    deleteById: jest.fn().mockResolvedValue(undefined),
    listWithAppointment: jest.fn(),
  } as jest.Mocked<IConsultationRepository>;
}

describe('UpdateAppointmentStatusUseCase', () => {
  let useCase: UpdateAppointmentStatusUseCase;
  let repo: jest.Mocked<IAppointmentRepository>;

  describe('successful transitions', () => {
    it('transitions scheduled → confirmed and logs the change', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: DOCTOR_ID,
      };

      const result = await useCase.execute(dto);

      expect(repo.updateStatus).toHaveBeenCalledWith(APPT_ID, 'confirmed');
      expect(repo.logStatusChange).toHaveBeenCalledWith({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        oldStatus: 'scheduled',
        newStatus: 'confirmed',
      });
      expect(result.status).toBe('confirmed');
    });

    it('transitions confirmed → completed and logs the change', async () => {
      const appt = makeAppointment({ status: 'confirmed' });
      repo = makeRepo(appt);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'completed',
        actor_id: DOCTOR_ID,
      };

      await useCase.execute(dto);

      expect(repo.logStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ oldStatus: 'confirmed', newStatus: 'completed' }),
      );
    });

    it('transitions confirmed → no_show and logs the change', async () => {
      const appt = makeAppointment({ status: 'confirmed' });
      repo = makeRepo(appt);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'no_show',
        actor_id: DOCTOR_ID,
      };

      await useCase.execute(dto);

      expect(repo.logStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ oldStatus: 'confirmed', newStatus: 'no_show' }),
      );
    });

    it('transitions scheduled → cancelled and logs the change', async () => {
      const appt = makeAppointment({ status: 'scheduled' });
      repo = makeRepo(appt);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'cancelled',
        actor_id: DOCTOR_ID,
      };

      await useCase.execute(dto);

      expect(repo.updateStatus).toHaveBeenCalledWith(APPT_ID, 'cancelled');
    });
  });

  describe('error cases', () => {
    it('throws AppointmentNotFoundError when appointment does not exist', async () => {
      repo = makeRepo(null);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: 'non-existent',
        status: 'confirmed',
        actor_id: DOCTOR_ID,
      };

      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(AppointmentNotFoundError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws AppointmentInvalidTransitionError for cancelled → confirmed', async () => {
      const appt = makeAppointment({ status: 'cancelled' });
      repo = makeRepo(appt);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: DOCTOR_ID,
      };

      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(AppointmentInvalidTransitionError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
      expect(repo.logStatusChange).not.toHaveBeenCalled();
    });

    it('throws AppointmentInvalidTransitionError for completed → any status', async () => {
      const appt = makeAppointment({ status: 'completed' });
      repo = makeRepo(appt);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'scheduled',
        actor_id: DOCTOR_ID,
      };

      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(AppointmentInvalidTransitionError);
    });

    it('throws AppointmentNotFoundError (anti-enumeration) when actor is not the owning doctor', async () => {
      const appt = makeAppointment({ doctorId: 'doctor-uuid-1' });
      repo = makeRepo(appt);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: 'another-doctor',
      };

      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(AppointmentNotFoundError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
      expect(repo.logStatusChange).not.toHaveBeenCalled();
    });
  });

  describe('Google Calendar event cancellation (best-effort)', () => {
    it('calls cancelCalendarEvent when cancelling an appointment with a googleCalendarEventId', async () => {
      const appt = makeAppointment({ status: 'scheduled', googleCalendarEventId: EVENT_ID });
      repo = makeRepo(appt);
      const cancelCalendarEvent = makeCancelUseCase();
      useCase = new UpdateAppointmentStatusUseCase(repo, cancelCalendarEvent);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'cancelled',
        actor_id: DOCTOR_ID,
      };

      await useCase.execute(dto);

      expect(cancelCalendarEvent.execute).toHaveBeenCalledWith(DOCTOR_ID, EVENT_ID);
      expect(repo.updateStatus).toHaveBeenCalledWith(APPT_ID, 'cancelled');
    });

    it('does NOT call cancelCalendarEvent when appointment has no googleCalendarEventId', async () => {
      const appt = makeAppointment({ status: 'scheduled', googleCalendarEventId: null });
      repo = makeRepo(appt);
      const cancelCalendarEvent = makeCancelUseCase();
      useCase = new UpdateAppointmentStatusUseCase(repo, cancelCalendarEvent);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'cancelled',
        actor_id: DOCTOR_ID,
      };

      await useCase.execute(dto);

      expect(cancelCalendarEvent.execute).not.toHaveBeenCalled();
      expect(repo.updateStatus).toHaveBeenCalledWith(APPT_ID, 'cancelled');
    });

    it('does NOT call cancelCalendarEvent for non-cancel transitions (e.g. confirmed)', async () => {
      const appt = makeAppointment({ status: 'scheduled', googleCalendarEventId: EVENT_ID });
      repo = makeRepo(appt);
      const cancelCalendarEvent = makeCancelUseCase();
      useCase = new UpdateAppointmentStatusUseCase(repo, cancelCalendarEvent);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: DOCTOR_ID,
      };

      await useCase.execute(dto);

      expect(cancelCalendarEvent.execute).not.toHaveBeenCalled();
    });

    it('does NOT call cancelCalendarEvent when no cancelCalendarEvent is injected (backward compat)', async () => {
      const appt = makeAppointment({ status: 'scheduled', googleCalendarEventId: EVENT_ID });
      repo = makeRepo(appt);
      // No cancelCalendarEvent injected — simulates legacy test contexts
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'cancelled',
        actor_id: DOCTOR_ID,
      };

      // Must not throw — appointment is cancelled successfully without Google Calendar
      await expect(useCase.execute(dto)).resolves.toBeDefined();
      expect(repo.updateStatus).toHaveBeenCalledWith(APPT_ID, 'cancelled');
    });

    it('does NOT break appointment cancellation when cancelCalendarEvent.execute throws (best-effort)', async () => {
      const appt = makeAppointment({ status: 'scheduled', googleCalendarEventId: EVENT_ID });
      repo = makeRepo(appt);
      const cancelCalendarEvent = makeCancelUseCase();
      cancelCalendarEvent.execute.mockRejectedValue(new Error('Google API unavailable'));
      useCase = new UpdateAppointmentStatusUseCase(repo, cancelCalendarEvent);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'cancelled',
        actor_id: DOCTOR_ID,
      };

      // The cancellation must succeed even when Google Calendar throws
      const result = await useCase.execute(dto);
      expect(result.status).toBe('cancelled');
      expect(repo.updateStatus).toHaveBeenCalledWith(APPT_ID, 'cancelled');
      expect(repo.logStatusChange).toHaveBeenCalled();
      // The Google Calendar call was attempted
      expect(cancelCalendarEvent.execute).toHaveBeenCalledWith(DOCTOR_ID, EVENT_ID);
    });
  });

  // -----------------------------------------------------------------------
  // Consultation auto-creation on confirm (Bug 5)
  // -----------------------------------------------------------------------
  describe('consultation auto-creation on confirm', () => {
    it('creates consultation and links consultationId when transitioning to confirmed', async () => {
      const appt = makeAppointment({ status: 'scheduled', patientId: PATIENT_ID });
      repo = makeRepo(appt);
      const createConsultationUC = makeCreateConsultationUC();
      const consultationRepo = makeConsultationRepo(null); // no existing consultation
      useCase = new UpdateAppointmentStatusUseCase(
        repo,
        null,
        createConsultationUC,
        consultationRepo,
      );

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: DOCTOR_ID,
      };

      const result = await useCase.execute(dto);

      expect(repo.updateStatus).toHaveBeenCalledWith(APPT_ID, 'confirmed');
      expect(createConsultationUC.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
          appointmentId: APPT_ID,
        }),
      );
      expect(repo.updateConsultationId).toHaveBeenCalledWith(APPT_ID, CONSULTATION_ID);
      expect(result.consultationId).toBe(CONSULTATION_ID);
    });

    it('reuses existing consultation (idempotent) and updates link', async () => {
      const appt = makeAppointment({ status: 'scheduled', patientId: PATIENT_ID });
      repo = makeRepo(appt);
      const createConsultationUC = makeCreateConsultationUC();
      // Simulate an existing consultation linked to this appointment
      const consultationRepo = makeConsultationRepo({ id: CONSULTATION_ID });
      useCase = new UpdateAppointmentStatusUseCase(
        repo,
        null,
        createConsultationUC,
        consultationRepo,
      );

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: DOCTOR_ID,
      };

      await useCase.execute(dto);

      // Must NOT create a new consultation (idempotent)
      expect(createConsultationUC.execute).not.toHaveBeenCalled();
      // Still links the existing consultation to the appointment
      expect(repo.updateConsultationId).toHaveBeenCalledWith(APPT_ID, CONSULTATION_ID);
    });

    it('does NOT create consultation when appointment has no patientId', async () => {
      const appt = makeAppointment({ status: 'scheduled', patientId: null });
      repo = makeRepo(appt);
      const createConsultationUC = makeCreateConsultationUC();
      useCase = new UpdateAppointmentStatusUseCase(repo, null, createConsultationUC);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: DOCTOR_ID,
      };

      const result = await useCase.execute(dto);

      expect(createConsultationUC.execute).not.toHaveBeenCalled();
      expect(repo.updateConsultationId).not.toHaveBeenCalled();
      expect(result.status).toBe('confirmed');
    });

    it('does NOT create consultation when createConsultationUC is not injected', async () => {
      const appt = makeAppointment({ status: 'scheduled', patientId: PATIENT_ID });
      repo = makeRepo(appt);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: DOCTOR_ID,
      };

      const result = await useCase.execute(dto);

      expect(repo.updateConsultationId).not.toHaveBeenCalled();
      expect(result.status).toBe('confirmed');
    });

    it('returns confirmed appointment (non-fatal) when consultation creation fails', async () => {
      const appt = makeAppointment({ status: 'scheduled', patientId: PATIENT_ID });
      repo = makeRepo(appt);
      const createConsultationUC = makeCreateConsultationUC();
      createConsultationUC.execute.mockRejectedValue(new Error('code exhausted'));
      useCase = new UpdateAppointmentStatusUseCase(repo, null, createConsultationUC);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: DOCTOR_ID,
      };

      const result = await useCase.execute(dto);

      expect(result.status).toBe('confirmed');
      expect(repo.updateConsultationId).not.toHaveBeenCalled();
    });

    it('does NOT create consultation on non-confirm transitions', async () => {
      const appt = makeAppointment({ status: 'confirmed', patientId: PATIENT_ID });
      repo = makeRepo(appt);
      const createConsultationUC = makeCreateConsultationUC();
      useCase = new UpdateAppointmentStatusUseCase(repo, null, createConsultationUC);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'completed',
        actor_id: DOCTOR_ID,
      };

      await useCase.execute(dto);

      expect(createConsultationUC.execute).not.toHaveBeenCalled();
      expect(repo.updateConsultationId).not.toHaveBeenCalled();
    });
  });
});
