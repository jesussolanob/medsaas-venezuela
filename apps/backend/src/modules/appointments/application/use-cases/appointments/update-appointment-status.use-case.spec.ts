import { UpdateAppointmentStatusUseCase } from './update-appointment-status.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { AppointmentInvalidTransitionError } from '../../../domain/errors/appointment-invalid-transition.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../domain/entities/appointment.entity';
import type { UpdateAppointmentStatusDto } from '@delta/shared-types';

const DOCTOR_ID = 'doctor-uuid-1';
const APPT_ID = 'appt-uuid-1';
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
    updateStatus: jest
      .fn()
      .mockImplementation((_id, status) => Promise.resolve(makeAppointment({ status }))),
    hasSlotConflict: jest.fn(),
    hasDuplicate: jest.fn(),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<IAppointmentRepository>;
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

    it('throws UnauthorizedError when actor is not the owning doctor', async () => {
      const appt = makeAppointment({ doctorId: 'doctor-uuid-1' });
      repo = makeRepo(appt);
      useCase = new UpdateAppointmentStatusUseCase(repo);

      const dto: UpdateAppointmentStatusDto = {
        id: APPT_ID,
        status: 'confirmed',
        actor_id: 'another-doctor',
      };

      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(repo.updateStatus).not.toHaveBeenCalled();
      expect(repo.logStatusChange).not.toHaveBeenCalled();
    });
  });
});
