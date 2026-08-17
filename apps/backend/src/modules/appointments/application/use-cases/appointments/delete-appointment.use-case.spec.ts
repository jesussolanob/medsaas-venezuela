import {
  DeleteAppointmentUseCase,
  type DeleteAppointmentInput,
} from './delete-appointment.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../domain/entities/appointment.entity';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------
const DOCTOR_ID = 'doctor-uuid-del-1';
const PATIENT_ID = 'patient-uuid-del-1';
const APPT_ID = 'appt-uuid-del-1111-2222-3333-444444444444';
const CONSULTATION_ID = 'cons-uuid-del-1111-2222-3333-444444444444';
const now = new Date('2026-06-15T14:00:00Z');

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------
function makeAppointment(
  overrides: Partial<AppointmentCreateParams & { consultationId: string | null }> = {},
): Appointment {
  return Appointment.create({
    id: APPT_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    authUserId: null,
    consultationId: null,
    patientName: 'Ana G.',
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

function makeAppointmentRepo(
  appointment: Appointment | null,
  overrides: Partial<IAppointmentRepository> = {},
): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn(),
    findByIdForDoctor: jest.fn().mockResolvedValue(appointment),
    list: jest.fn(),
    save: jest.fn(),
    updateStatus: jest.fn(),
    updateScheduledAt: jest.fn(),
    hasOverlap: jest.fn(),
    hasPatientOverlap: jest.fn(),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn().mockResolvedValue(undefined),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
    updateMeetLink: jest.fn(),
    updateGoogleEventId: jest.fn().mockResolvedValue(undefined),
    updateConsultationId: jest.fn(),
    deleteById: jest.fn().mockResolvedValue(undefined),
    findFirstCompletedByPaymentId: jest.fn().mockResolvedValue(null),
    findUpcomingWithoutCalendarEvent: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as jest.Mocked<IAppointmentRepository>;
}

function makeConsultationRepo(): jest.Mocked<IConsultationRepository> {
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
    findByAppointmentId: jest.fn(),
    deleteById: jest.fn().mockResolvedValue(undefined),
    findFirstCompletedByPaymentId: jest.fn().mockResolvedValue(null),
    listWithAppointment: jest.fn(),
    applyNoShowFee: jest.fn(),
  } as jest.Mocked<IConsultationRepository>;
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------
describe('DeleteAppointmentUseCase', () => {
  let appointmentRepo: jest.Mocked<IAppointmentRepository>;
  let consultationRepo: jest.Mocked<IConsultationRepository>;
  let useCase: DeleteAppointmentUseCase;

  const input: DeleteAppointmentInput = {
    appointmentId: APPT_ID,
    actorId: DOCTOR_ID,
  };

  describe('successful deletion', () => {
    it('deletes appointment without linked consultation', async () => {
      const appt = makeAppointment({ consultationId: null });
      appointmentRepo = makeAppointmentRepo(appt);
      useCase = new DeleteAppointmentUseCase(appointmentRepo);

      await useCase.execute(input);

      expect(appointmentRepo.findByIdForDoctor).toHaveBeenCalledWith(APPT_ID, DOCTOR_ID);
      expect(appointmentRepo.logStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: APPT_ID,
          actorId: DOCTOR_ID,
          oldStatus: 'scheduled',
          newStatus: 'deleted',
        }),
      );
      expect(appointmentRepo.deleteById).toHaveBeenCalledWith(APPT_ID);
    });

    it('deletes linked consultation before deleting appointment (FK constraint)', async () => {
      const appt = makeAppointment({ consultationId: CONSULTATION_ID });
      appointmentRepo = makeAppointmentRepo(appt);
      consultationRepo = makeConsultationRepo();
      useCase = new DeleteAppointmentUseCase(appointmentRepo, consultationRepo);

      await useCase.execute(input);

      // Consultation must be deleted before the appointment (FK order)
      const consultDeleteOrder =
        consultationRepo.deleteById.mock.invocationCallOrder[0] ?? Infinity;
      const apptDeleteOrder = appointmentRepo.deleteById.mock.invocationCallOrder[0] ?? Infinity;
      expect(consultDeleteOrder).toBeLessThan(apptDeleteOrder);

      expect(consultationRepo.deleteById).toHaveBeenCalledWith(CONSULTATION_ID);
      expect(appointmentRepo.deleteById).toHaveBeenCalledWith(APPT_ID);
    });

    it('does NOT call consultationRepo.deleteById when appointment has no consultationId', async () => {
      const appt = makeAppointment({ consultationId: null });
      appointmentRepo = makeAppointmentRepo(appt);
      consultationRepo = makeConsultationRepo();
      useCase = new DeleteAppointmentUseCase(appointmentRepo, consultationRepo);

      await useCase.execute(input);

      expect(consultationRepo.deleteById).not.toHaveBeenCalled();
      expect(appointmentRepo.deleteById).toHaveBeenCalledWith(APPT_ID);
    });

    it('writes audit log entry with newStatus "deleted" before deleting the row', async () => {
      const appt = makeAppointment({ status: 'confirmed', consultationId: null });
      appointmentRepo = makeAppointmentRepo(appt);
      useCase = new DeleteAppointmentUseCase(appointmentRepo);

      await useCase.execute(input);

      expect(appointmentRepo.logStatusChange).toHaveBeenCalledWith({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        oldStatus: 'confirmed',
        newStatus: 'deleted',
      });

      // audit log must be written before the row is deleted
      const auditOrder = appointmentRepo.logStatusChange.mock.invocationCallOrder[0] ?? Infinity;
      const deleteOrder = appointmentRepo.deleteById.mock.invocationCallOrder[0] ?? Infinity;
      expect(auditOrder).toBeLessThan(deleteOrder);
    });

    it('skips consultation deletion when consultationRepo is not injected', async () => {
      // Even if appointment has a consultationId, without consultationRepo we skip it
      const appt = makeAppointment({ consultationId: CONSULTATION_ID });
      appointmentRepo = makeAppointmentRepo(appt);
      // No consultationRepo injected
      useCase = new DeleteAppointmentUseCase(appointmentRepo);

      await expect(useCase.execute(input)).resolves.toBeUndefined();
      expect(appointmentRepo.deleteById).toHaveBeenCalledWith(APPT_ID);
    });
  });

  // -----------------------------------------------------------------------
  // Anti-IDOR / not-found
  // -----------------------------------------------------------------------
  describe('ownership enforcement (anti-IDOR)', () => {
    it('throws AppointmentNotFoundError when appointment does not belong to actor', async () => {
      // findByIdForDoctor returns null for appointments that do not belong to the actor
      appointmentRepo = makeAppointmentRepo(null);
      useCase = new DeleteAppointmentUseCase(appointmentRepo);

      await expect(
        useCase.execute({ appointmentId: APPT_ID, actorId: 'other-doctor-id' }),
      ).rejects.toThrow(AppointmentNotFoundError);

      expect(appointmentRepo.logStatusChange).not.toHaveBeenCalled();
      expect(appointmentRepo.deleteById).not.toHaveBeenCalled();
    });

    it('throws AppointmentNotFoundError when appointment does not exist', async () => {
      appointmentRepo = makeAppointmentRepo(null);
      useCase = new DeleteAppointmentUseCase(appointmentRepo);

      await expect(
        useCase.execute({ appointmentId: 'non-existent-id', actorId: DOCTOR_ID }),
      ).rejects.toThrow(AppointmentNotFoundError);

      expect(appointmentRepo.deleteById).not.toHaveBeenCalled();
    });

    it('uses findByIdForDoctor (not findById) for the ownership lookup', async () => {
      appointmentRepo = makeAppointmentRepo(null);
      useCase = new DeleteAppointmentUseCase(appointmentRepo);

      await expect(useCase.execute(input)).rejects.toThrow(AppointmentNotFoundError);

      expect(appointmentRepo.findByIdForDoctor).toHaveBeenCalledWith(APPT_ID, DOCTOR_ID);
      expect(appointmentRepo.findById).not.toHaveBeenCalled();
    });
  });
});
