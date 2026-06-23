import { Test, type TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { CreateAppointmentUseCase } from '../../application/use-cases/appointments/create-appointment.use-case';
import { UpdateAppointmentStatusUseCase } from '../../application/use-cases/appointments/update-appointment-status.use-case';
import { GetDoctorAgendaUseCase } from '../../application/use-cases/appointments/get-doctor-agenda.use-case';
import { GetAppointmentByIdUseCase } from '../../application/use-cases/appointments/get-appointment-by-id.use-case';
import { RescheduleAppointmentUseCase } from '../../application/use-cases/appointments/reschedule-appointment.use-case';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../domain/entities/appointment.entity';
import { AppointmentNotFoundError } from '../../domain/errors/appointment-not-found.error';
import { AppointmentConflictError } from '../../domain/errors/appointment-conflict.error';
import { AppointmentNotReschedulableError } from '../../domain/errors/appointment-not-reschedulable.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { AppointmentListResult } from '../../domain/repositories/appointment.repository';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'doctor-uuid-1';
const APPT_ID = 'appt-uuid-1';
const now = new Date('2026-06-10T10:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  return Appointment.create({
    id: APPT_ID,
    doctorId: DOCTOR_ID,
    patientId: 'patient-1',
    authUserId: null,
    consultationId: null,
    patientName: 'Juan Pérez García',
    patientPhone: '+58412345678',
    patientEmail: 'juan@gmail.com',
    patientCedula: 'V-12345678',
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

describe('AppointmentsController', () => {
  let controller: AppointmentsController;

  const mockCreateUseCase = { execute: jest.fn() };
  const mockUpdateStatusUseCase = { execute: jest.fn() };
  const mockGetAgendaUseCase = { execute: jest.fn() };
  const mockGetByIdUseCase = { execute: jest.fn() };
  const mockRescheduleUseCase = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        { provide: CreateAppointmentUseCase, useValue: mockCreateUseCase },
        { provide: UpdateAppointmentStatusUseCase, useValue: mockUpdateStatusUseCase },
        { provide: GetDoctorAgendaUseCase, useValue: mockGetAgendaUseCase },
        { provide: GetAppointmentByIdUseCase, useValue: mockGetByIdUseCase },
        { provide: RescheduleAppointmentUseCase, useValue: mockRescheduleUseCase },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
  });

  describe('GET /api/appointments (list)', () => {
    it('returns paginated list with masked PII', async () => {
      const appt = makeAppointment();
      const listResult: AppointmentListResult = {
        items: [appt],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockGetAgendaUseCase.execute.mockResolvedValue(listResult);

      const response = await controller.list(mockUser);

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.meta).toEqual({ total: 1, page: 1, limit: 20 });

      // PII masking assertions — maskName keeps first name + last-name initial
      const item = response.data[0] as Appointment;
      expect(item.patientName).not.toBe('Juan Pérez García');
      expect(item.patientName).toBe('Juan G.');
      expect(item.patientPhone).toContain('***');
      expect(item.patientEmail).toContain('***');
      expect(item.patientCedula).toContain('***');
    });

    it('passes filters to the use case', async () => {
      mockGetAgendaUseCase.execute.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.list(mockUser, '2026-06-01', '2026-06-30', 'scheduled', '2', '10');

      expect(mockGetAgendaUseCase.execute).toHaveBeenCalledWith({
        doctorId: DOCTOR_ID,
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        status: 'scheduled',
        page: 2,
        limit: 10,
      });
    });

    it('defaults page=1 and limit=20 when query params are absent', async () => {
      mockGetAgendaUseCase.execute.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.list(mockUser);

      expect(mockGetAgendaUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });
  });

  describe('GET /api/appointments/:id (findOne)', () => {
    it('returns the appointment when found', async () => {
      const appt = makeAppointment();
      mockGetByIdUseCase.execute.mockResolvedValue(appt);

      const response = await controller.findOne(APPT_ID, mockUser);

      expect(response.success).toBe(true);
      expect(response.data).toBe(appt);
      expect(mockGetByIdUseCase.execute).toHaveBeenCalledWith({
        appointmentId: APPT_ID,
        doctorId: DOCTOR_ID,
      });
    });

    it('propagates AppointmentNotFoundError (handled by GlobalExceptionFilter)', async () => {
      mockGetByIdUseCase.execute.mockRejectedValue(new AppointmentNotFoundError('unknown-id'));

      await expect(controller.findOne('unknown-id', mockUser)).rejects.toBeInstanceOf(
        AppointmentNotFoundError,
      );
    });
  });

  describe('POST /api/appointments (create)', () => {
    it('overrides doctor_id with the authenticated actor to prevent IDOR', async () => {
      const appt = makeAppointment();
      mockCreateUseCase.execute.mockResolvedValue(appt);

      const dto = {
        doctor_id: 'malicious-other-doctor', // body value must be overridden
        patient_name: 'Juan P.',
        scheduled_at: '2026-06-10T10:00:00.000Z',
        appointment_mode: 'presencial' as const,
        plan_name: 'Consulta',
        plan_price: 30,
      };

      const response = await controller.create(dto as never, mockUser);

      expect(response.success).toBe(true);
      expect(response.data).toBe(appt);
      // doctor_id must be the authenticated user, not the one from the body
      expect(mockCreateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctor_id: DOCTOR_ID }),
      );
      expect(mockCreateUseCase.execute).not.toHaveBeenCalledWith(
        expect.objectContaining({ doctor_id: 'malicious-other-doctor' }),
      );
    });
  });

  describe('PUT /api/appointments/:id/reschedule', () => {
    const newDate = '2026-06-11T14:00:00.000Z';

    it('delegates to RescheduleAppointmentUseCase with correct params', async () => {
      const rescheduled = makeAppointment({ scheduledAt: new Date(newDate) });
      mockRescheduleUseCase.execute.mockResolvedValue(rescheduled);

      const dto = { scheduled_at: newDate };
      const response = await controller.rescheduleAppointment(APPT_ID, dto, mockUser);

      expect(response.success).toBe(true);
      expect(mockRescheduleUseCase.execute).toHaveBeenCalledWith({
        appointmentId: APPT_ID,
        actorId: DOCTOR_ID,
        newScheduledAt: new Date(newDate),
      });
    });

    it('propagates AppointmentNotFoundError', async () => {
      mockRescheduleUseCase.execute.mockRejectedValue(new AppointmentNotFoundError(APPT_ID));

      await expect(
        controller.rescheduleAppointment(APPT_ID, { scheduled_at: newDate }, mockUser),
      ).rejects.toBeInstanceOf(AppointmentNotFoundError);
    });

    it('propagates AppointmentConflictError when slot is occupied', async () => {
      mockRescheduleUseCase.execute.mockRejectedValue(
        new AppointmentConflictError(new Date(newDate)),
      );

      await expect(
        controller.rescheduleAppointment(APPT_ID, { scheduled_at: newDate }, mockUser),
      ).rejects.toBeInstanceOf(AppointmentConflictError);
    });

    it('propagates AppointmentNotReschedulableError for terminal statuses', async () => {
      mockRescheduleUseCase.execute.mockRejectedValue(
        new AppointmentNotReschedulableError('cancelled'),
      );

      await expect(
        controller.rescheduleAppointment(APPT_ID, { scheduled_at: newDate }, mockUser),
      ).rejects.toBeInstanceOf(AppointmentNotReschedulableError);
    });
  });

  describe('PUT /api/appointments/:id/status (updateAppointmentStatus)', () => {
    it('overrides dto.id with path param and actor_id with authenticated user', async () => {
      const appt = makeAppointment({ status: 'confirmed' });
      mockUpdateStatusUseCase.execute.mockResolvedValue(appt);

      const dto = {
        id: 'some-other-id', // should be overridden by path param
        status: 'confirmed' as const,
        actor_id: 'wrong-actor', // should be overridden by authenticated user
      };

      await controller.updateAppointmentStatus(APPT_ID, dto, mockUser);

      expect(mockUpdateStatusUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ id: APPT_ID, actor_id: DOCTOR_ID }),
      );
    });
  });
});
