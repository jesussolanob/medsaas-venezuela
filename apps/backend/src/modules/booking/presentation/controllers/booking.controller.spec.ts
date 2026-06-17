import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingController } from './booking.controller';
import { CreateBookingUseCase } from '../../application/use-cases/booking/create-booking.use-case';
import { GetBookingDoctorInfoUseCase } from '../../application/use-cases/booking/get-booking-doctor-info.use-case';
import { GetBookingPlansUseCase } from '../../application/use-cases/booking/get-booking-plans.use-case';
import { GetBookingPackagesUseCase } from '../../application/use-cases/booking/get-booking-packages.use-case';
import { GetAvailableSlotsUseCase } from '../../application/use-cases/booking/get-available-slots.use-case';
import { GetBookingOfficesUseCase } from '../../application/use-cases/booking/get-booking-offices.use-case';
import { DoctorNotFoundError } from '../../application/use-cases/booking/create-booking.use-case';
import { Appointment } from '../../../appointments/domain/entities/appointment.entity';
import { PricingPlan } from '../../../packages/domain/entities/pricing-plan.entity';

const makeAppointment = () =>
  Appointment.create({
    id: 'appt-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    patientName: 'María López',
    patientEmail: 'maria@example.com',
    scheduledAt: new Date('2026-07-01T10:00:00Z'),
    status: 'scheduled',
    appointmentMode: 'presencial',
    appointmentCode: 'BK-20260701-123456-AB12',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makePlan = () =>
  PricingPlan.create({
    id: 'plan-001',
    doctorId: 'doc-001',
    name: 'Consulta General',
    priceUsd: 30,
    durationMinutes: 30,
    sessionsCount: 1,
    description: null,
    type: 'plan',
    showInBooking: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('BookingController', () => {
  let controller: BookingController;
  let mockCreateUseCase: jest.Mocked<CreateBookingUseCase>;
  let mockGetDoctorInfo: jest.Mocked<GetBookingDoctorInfoUseCase>;
  let mockGetPlans: jest.Mocked<GetBookingPlansUseCase>;
  let mockGetPackages: jest.Mocked<GetBookingPackagesUseCase>;
  let mockGetSlots: jest.Mocked<GetAvailableSlotsUseCase>;
  let mockGetOffices: jest.Mocked<GetBookingOfficesUseCase>;

  beforeEach(async () => {
    mockCreateUseCase = { execute: jest.fn() } as unknown as jest.Mocked<CreateBookingUseCase>;
    mockGetDoctorInfo = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetBookingDoctorInfoUseCase>;
    mockGetPlans = { execute: jest.fn() } as unknown as jest.Mocked<GetBookingPlansUseCase>;
    mockGetPackages = { execute: jest.fn() } as unknown as jest.Mocked<GetBookingPackagesUseCase>;
    mockGetSlots = { execute: jest.fn() } as unknown as jest.Mocked<GetAvailableSlotsUseCase>;
    mockGetOffices = { execute: jest.fn() } as unknown as jest.Mocked<GetBookingOfficesUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingController],
      providers: [
        { provide: CreateBookingUseCase, useValue: mockCreateUseCase },
        { provide: GetBookingDoctorInfoUseCase, useValue: mockGetDoctorInfo },
        { provide: GetBookingPlansUseCase, useValue: mockGetPlans },
        { provide: GetBookingPackagesUseCase, useValue: mockGetPackages },
        { provide: GetAvailableSlotsUseCase, useValue: mockGetSlots },
        { provide: GetBookingOfficesUseCase, useValue: mockGetOffices },
      ],
    }).compile();

    controller = module.get<BookingController>(BookingController);
  });

  describe('getDoctorInfoEndpoint', () => {
    it('delegates to GetBookingDoctorInfoUseCase and returns data', async () => {
      mockGetDoctorInfo.execute.mockResolvedValue({
        id: 'doc-001',
        fullName: 'Dr. García',
      } as never);
      const response = await controller.getDoctorInfoEndpoint('doc-001');
      expect(response.success).toBe(true);
      expect(mockGetDoctorInfo.execute).toHaveBeenCalledWith('doc-001');
    });

    it('propagates DoctorNotFoundError (404) when doctor not found', async () => {
      mockGetDoctorInfo.execute.mockRejectedValue(new DoctorNotFoundError());
      await expect(controller.getDoctorInfoEndpoint('bad-id')).rejects.toThrow(DoctorNotFoundError);
    });
  });

  describe('getDoctorPlans', () => {
    it('delegates to GetBookingPlansUseCase and returns plans', async () => {
      mockGetPlans.execute.mockResolvedValue([makePlan()]);
      const response = await controller.getDoctorPlans('doc-001');
      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
      expect(mockGetPlans.execute).toHaveBeenCalledWith('doc-001');
    });
  });

  describe('getPatientPackages', () => {
    it('delegates to GetBookingPackagesUseCase with email', async () => {
      mockGetPackages.execute.mockResolvedValue([
        {
          id: 'pkg-001',
          planName: 'Paquete',
          remainingSessions: 7,
          totalSessions: 10,
          usedSessions: 3,
        },
      ]);
      const response = await controller.getPatientPackages('doc-001', 'patient@example.com');
      expect(response.success).toBe(true);
      expect(mockGetPackages.execute).toHaveBeenCalledWith('doc-001', 'patient@example.com');
    });

    it('returns empty array immediately when email is absent (no use case call)', async () => {
      const response = await controller.getPatientPackages('doc-001', '');
      expect(response.data).toEqual([]);
      expect(mockGetPackages.execute).not.toHaveBeenCalled();
    });
  });

  describe('getDoctorSlots', () => {
    const slotsResult = {
      date: '2026-06-10',
      slots: [
        { time: '08:00', available: true },
        { time: '08:30', available: false },
      ],
    };

    it('delegates to GetAvailableSlotsUseCase with doctorId and date', async () => {
      mockGetSlots.execute.mockResolvedValue(slotsResult);

      const response = await controller.getDoctorSlots('doc-001', '2026-06-10');

      expect(response.success).toBe(true);
      expect(response.data).toEqual(slotsResult);
      expect(mockGetSlots.execute).toHaveBeenCalledWith('doc-001', '2026-06-10');
    });

    it('propagates DoctorNotFoundError (404) when doctor not found', async () => {
      mockGetSlots.execute.mockRejectedValue(new DoctorNotFoundError());

      await expect(controller.getDoctorSlots('bad-id', '2026-06-10')).rejects.toThrow(
        DoctorNotFoundError,
      );
    });

    it('throws BadRequestException when date is missing', async () => {
      await expect(
        controller.getDoctorSlots('doc-001', undefined as unknown as string),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockGetSlots.execute).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when date has invalid format (not YYYY-MM-DD)', async () => {
      await expect(controller.getDoctorSlots('doc-001', '10-06-2026')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockGetSlots.execute).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when date is a valid format but invalid calendar date', async () => {
      await expect(controller.getDoctorSlots('doc-001', '2026-13-01')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockGetSlots.execute).not.toHaveBeenCalled();
    });
  });

  describe('getDoctorOffices', () => {
    it('delegates to GetBookingOfficesUseCase and returns offices envelope', async () => {
      const officeDto = {
        id: 'off-001',
        name: 'Consultorio A',
        address: 'Av. Libertador 1',
        city: 'Caracas',
        phone: '+58 212 555 0001',
        schedule: [{ day: 0, enabled: true, start: '08:00', end: '17:00' }],
        slotDuration: 30,
        bufferMinutes: 10,
        modality: 'in_person' as const,
        allowsOnline: false,
      };
      mockGetOffices.execute.mockResolvedValue([officeDto]);

      const response = await controller.getDoctorOffices('doc-001');

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
      expect(mockGetOffices.execute).toHaveBeenCalledWith('doc-001');
    });

    it('returns empty array when doctor has no active offices', async () => {
      mockGetOffices.execute.mockResolvedValue([]);

      const response = await controller.getDoctorOffices('doc-001');

      expect(response.success).toBe(true);
      expect(response.data).toEqual([]);
    });
  });

  describe('create', () => {
    it('returns appointmentCode + appointmentId + scheduledAt — patientId absent', async () => {
      mockCreateUseCase.execute.mockResolvedValue({
        appointment: makeAppointment(),
        patient: { id: 'pat-001' } as never,
        appointmentCode: 'BK-20260701-123456-AB12',
        meetLink: null,
      });

      const dto = {
        cf_turnstile_token: 'stub',
        doctor_id: '980025b4-9956-4646-94f8-58401c86773a',
        patient_name: 'María López',
        patient_email: 'maria@example.com',
        scheduled_at: '2026-07-01T10:00:00Z',
        appointment_mode: 'presencial' as const,
        plan_name: 'Consulta',
        plan_price: 30,
      };

      const response = await controller.create(dto);

      expect(response.success).toBe(true);
      const data = response.data as Record<string, unknown>;
      expect(data.appointmentCode).toBe('BK-20260701-123456-AB12');
      expect(data.appointmentId).toBe('appt-001');
      expect(data.scheduledAt).toBeDefined();
      // patientId must NOT appear in the public response (fix #3)
      expect(data).not.toHaveProperty('patientId');
    });
  });
});
