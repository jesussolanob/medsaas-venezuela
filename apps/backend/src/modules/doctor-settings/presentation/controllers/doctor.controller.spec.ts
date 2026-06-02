import { Test, type TestingModule } from '@nestjs/testing';
import { DoctorController } from './doctor.controller';
import { GetDoctorProfileUseCase } from '../../application/use-cases/doctor-settings/get-doctor-profile.use-case';
import { UpdateDoctorProfileUseCase } from '../../application/use-cases/doctor-settings/update-doctor-profile.use-case';
import { GetDoctorScheduleUseCase } from '../../application/use-cases/doctor-settings/get-doctor-schedule.use-case';
import { UpdateDoctorScheduleUseCase } from '../../application/use-cases/doctor-settings/update-doctor-schedule.use-case';
import { GetDoctorFeaturesUseCase } from '../../application/use-cases/doctor-settings/get-doctor-features.use-case';
import { GetSubscriptionInfoUseCase } from '../../application/use-cases/doctor-settings/get-subscription-info.use-case';
import { GetServicesUseCase } from '../../application/use-cases/doctor-settings/get-services.use-case';
import { CreateServiceUseCase } from '../../application/use-cases/doctor-settings/create-service.use-case';
import { UpdateServiceUseCase } from '../../application/use-cases/doctor-settings/update-service.use-case';
import { DeleteServiceUseCase } from '../../application/use-cases/doctor-settings/delete-service.use-case';
import { DoctorProfile } from '../../domain/entities/doctor-profile.entity';
import { PricingPlan } from '../../../packages/domain/entities/pricing-plan.entity';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const USER: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@test.com' };

function makeProfile(): DoctorProfile {
  return DoctorProfile.create({
    id: DOCTOR_ID,
    fullName: 'Dr. Test',
    email: 'doc@test.com',
    specialty: 'General',
    professionalTitle: 'Dr.',
    clinicId: null,
    clinicRole: null,
    paymentMethods: ['zelle'],
    paymentDetails: { zelle: 'doc@zelle.com' },
    allowsOnline: true,
    officeAddress: 'Av. Test',
    city: 'Caracas',
    avatarUrl: null,
    plan: 'professional',
    subscriptionStatus: 'active',
  });
}

function makePlan(): PricingPlan {
  return PricingPlan.create({
    id: 'plan-uuid',
    doctorId: DOCTOR_ID,
    name: 'Consulta',
    priceUsd: 50,
    durationMinutes: 30,
    sessionsCount: 1,
    description: null,
    type: 'plan',
    showInBooking: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('DoctorController', () => {
  let controller: DoctorController;

  const mockGetProfile = { execute: jest.fn() };
  const mockUpdateProfile = { execute: jest.fn() };
  const mockGetSchedule = { execute: jest.fn() };
  const mockUpdateSchedule = { execute: jest.fn() };
  const mockGetFeatures = { execute: jest.fn() };
  const mockGetSubscription = { execute: jest.fn() };
  const mockGetServices = { execute: jest.fn() };
  const mockCreateService = { execute: jest.fn() };
  const mockUpdateService = { execute: jest.fn() };
  const mockDeleteService = { execute: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorController],
      providers: [
        { provide: GetDoctorProfileUseCase, useValue: mockGetProfile },
        { provide: UpdateDoctorProfileUseCase, useValue: mockUpdateProfile },
        { provide: GetDoctorScheduleUseCase, useValue: mockGetSchedule },
        { provide: UpdateDoctorScheduleUseCase, useValue: mockUpdateSchedule },
        { provide: GetDoctorFeaturesUseCase, useValue: mockGetFeatures },
        { provide: GetSubscriptionInfoUseCase, useValue: mockGetSubscription },
        { provide: GetServicesUseCase, useValue: mockGetServices },
        { provide: CreateServiceUseCase, useValue: mockCreateService },
        { provide: UpdateServiceUseCase, useValue: mockUpdateService },
        { provide: DeleteServiceUseCase, useValue: mockDeleteService },
      ],
    }).compile();

    controller = module.get<DoctorController>(DoctorController);

    jest.clearAllMocks();
  });

  describe('GET /doctor/profile', () => {
    it('returns the doctor profile with success envelope', async () => {
      const profile = makeProfile();
      mockGetProfile.execute.mockResolvedValue(profile);

      const result = await controller.profile(USER);

      expect(result.success).toBe(true);
      expect(result.data).toBe(profile);
      expect(mockGetProfile.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });
  });

  describe('PUT /doctor/profile', () => {
    it('updates the doctor profile', async () => {
      const updated = makeProfile();
      mockUpdateProfile.execute.mockResolvedValue(updated);

      const result = await controller.updateProfileHandler(
        { specialty: 'Cardiología', allows_online: true },
        USER,
      );

      expect(result.success).toBe(true);
      expect(mockUpdateProfile.execute).toHaveBeenCalledWith(DOCTOR_ID, {
        specialty: 'Cardiología',
        professionalTitle: undefined,
        paymentMethods: undefined,
        paymentDetails: undefined,
        allowsOnline: true,
        officeAddress: undefined,
        city: undefined,
        avatarUrl: undefined,
      });
    });
  });

  describe('GET /doctor/schedule', () => {
    it('returns the schedule with success envelope', async () => {
      const schedule = {
        workDays: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '17:00',
        slotDurationMinutes: 30,
        breakStart: null,
        breakEnd: null,
      };
      mockGetSchedule.execute.mockResolvedValue(schedule);

      const result = await controller.schedule(USER);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(schedule);
    });
  });

  describe('PUT /doctor/schedule', () => {
    it('updates the schedule', async () => {
      const schedule = {
        workDays: [1, 3, 5],
        startTime: '09:00',
        endTime: '18:00',
        slotDurationMinutes: 45,
        breakStart: null,
        breakEnd: null,
      };
      mockUpdateSchedule.execute.mockResolvedValue(schedule);

      const dto: import('@delta/shared-types').UpdateDoctorScheduleDto = {
        work_days: [1, 3, 5],
        start_time: '09:00',
        end_time: '18:00',
        slot_duration_minutes: 45,
      };

      const result = await controller.updateScheduleHandler(dto, USER);

      expect(result.success).toBe(true);
      expect(mockUpdateSchedule.execute).toHaveBeenCalledWith(DOCTOR_ID, {
        workDays: [1, 3, 5],
        startTime: '09:00',
        endTime: '18:00',
        slotDurationMinutes: 45,
        breakStart: null,
        breakEnd: null,
      });
    });
  });

  describe('GET /doctor/features', () => {
    it('returns features for the doctor plan', async () => {
      const features = {
        plan: 'professional',
        features: [{ featureKey: 'crm', featureLabel: 'CRM', enabled: true }],
      };
      mockGetFeatures.execute.mockResolvedValue(features);

      const result = await controller.features(USER);

      expect(result.success).toBe(true);
      expect(result.data.plan).toBe('professional');
    });
  });

  describe('GET /doctor/subscription', () => {
    it('returns subscription info with bannerLevel', async () => {
      const sub = {
        status: 'active',
        plan: 'professional',
        expiresAt: null,
        daysUntilExpiry: null,
        bannerLevel: 'none' as const,
      };
      mockGetSubscription.execute.mockResolvedValue(sub);

      const result = await controller.subscription(USER);

      expect(result.success).toBe(true);
      expect(result.data.bannerLevel).toBe('none');
    });
  });

  describe('GET /doctor/services', () => {
    it('returns list of services', async () => {
      const plans = [makePlan()];
      mockGetServices.execute.mockResolvedValue(plans);

      const result = await controller.services(USER);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('POST /doctor/services', () => {
    it('creates a service and returns it', async () => {
      const plan = makePlan();
      mockCreateService.execute.mockResolvedValue(plan);

      const dto: import('@delta/shared-types').CreatePricingPlanDto = {
        name: 'Consulta',
        price_usd: 50,
        duration_minutes: 30,
        sessions_count: 1,
        type: 'plan',
        show_in_booking: true,
      };

      const result = await controller.createServiceHandler(dto, USER);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Consulta');
    });
  });

  describe('PUT /doctor/services/:id', () => {
    it('updates a service', async () => {
      const plan = makePlan();
      mockUpdateService.execute.mockResolvedValue(plan);

      const result = await controller.updateServiceHandler(
        'plan-uuid',
        { name: 'Nueva Consulta', price_usd: 60 },
        USER,
      );

      expect(result.success).toBe(true);
      expect(mockUpdateService.execute).toHaveBeenCalledWith(
        DOCTOR_ID,
        'plan-uuid',
        expect.objectContaining({ name: 'Nueva Consulta' }),
      );
    });
  });

  describe('DELETE /doctor/services/:id', () => {
    it('deletes a service (returns void)', async () => {
      mockDeleteService.execute.mockResolvedValue(undefined);

      const result = await controller.deleteServiceHandler('plan-uuid', USER);

      expect(result).toBeUndefined();
      expect(mockDeleteService.execute).toHaveBeenCalledWith(DOCTOR_ID, 'plan-uuid');
    });
  });
});
