import { Test, type TestingModule } from '@nestjs/testing';
import { DoctorController } from './doctor.controller';
import { GetDoctorProfileUseCase } from '../../application/use-cases/doctor-settings/get-doctor-profile.use-case';
import { UpdateDoctorProfileUseCase } from '../../application/use-cases/doctor-settings/update-doctor-profile.use-case';
import { GetDoctorScheduleUseCase } from '../../application/use-cases/doctor-settings/get-doctor-schedule.use-case';
import { UpdateDoctorScheduleUseCase } from '../../application/use-cases/doctor-settings/update-doctor-schedule.use-case';
import { GetDoctorFeaturesUseCase } from '../../application/use-cases/doctor-settings/get-doctor-features.use-case';
import { GetDoctorFeaturesV2UseCase } from '../../application/use-cases/doctor-settings/get-doctor-features-v2.use-case';
import { GetSubscriptionInfoUseCase } from '../../application/use-cases/doctor-settings/get-subscription-info.use-case';
import { GetDoctorSubscriptionPanelUseCase } from '../../application/use-cases/doctor-settings/get-doctor-subscription-panel.use-case';
import { GetServicesUseCase } from '../../application/use-cases/doctor-settings/get-services.use-case';
import { CreateServiceUseCase } from '../../application/use-cases/doctor-settings/create-service.use-case';
import { UpdateServiceUseCase } from '../../application/use-cases/doctor-settings/update-service.use-case';
import { DeleteServiceUseCase } from '../../application/use-cases/doctor-settings/delete-service.use-case';
import { GetDoctorExchangeRateUseCase } from '../../application/use-cases/doctor-settings/get-doctor-exchange-rate.use-case';
import { SetDoctorExchangeRateUseCase } from '../../application/use-cases/doctor-settings/set-doctor-exchange-rate.use-case';
import { DoctorProfile } from '../../domain/entities/doctor-profile.entity';
import { PricingPlan } from '../../../packages/domain/entities/pricing-plan.entity';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

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
    logoUrl: null,
    signatureUrl: null,
    licenseNumber: null,
    phone: null,
    currencyMode: 'usd_bcv',
    customRate: null,
    customRateLabel: null,
    cedula: 'V-12345678',
    birthDate: '1985-03-15',
    onboardingCompleted: true,
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
  const mockGetFeaturesV2 = { execute: jest.fn() };
  const mockGetSubscription = { execute: jest.fn() };
  const mockGetSubscriptionPanel = { execute: jest.fn() };
  const mockGetServices = { execute: jest.fn() };
  const mockCreateService = { execute: jest.fn() };
  const mockUpdateService = { execute: jest.fn() };
  const mockDeleteService = { execute: jest.fn() };
  const mockGetExchangeRate = { execute: jest.fn() };
  const mockSetExchangeRate = { execute: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorController],
      providers: [
        { provide: GetDoctorProfileUseCase, useValue: mockGetProfile },
        { provide: UpdateDoctorProfileUseCase, useValue: mockUpdateProfile },
        { provide: GetDoctorScheduleUseCase, useValue: mockGetSchedule },
        { provide: UpdateDoctorScheduleUseCase, useValue: mockUpdateSchedule },
        { provide: GetDoctorFeaturesUseCase, useValue: mockGetFeatures },
        { provide: GetDoctorFeaturesV2UseCase, useValue: mockGetFeaturesV2 },
        { provide: GetSubscriptionInfoUseCase, useValue: mockGetSubscription },
        { provide: GetDoctorSubscriptionPanelUseCase, useValue: mockGetSubscriptionPanel },
        { provide: GetServicesUseCase, useValue: mockGetServices },
        { provide: CreateServiceUseCase, useValue: mockCreateService },
        { provide: UpdateServiceUseCase, useValue: mockUpdateService },
        { provide: DeleteServiceUseCase, useValue: mockDeleteService },
        { provide: GetDoctorExchangeRateUseCase, useValue: mockGetExchangeRate },
        { provide: SetDoctorExchangeRateUseCase, useValue: mockSetExchangeRate },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

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

    it('includes cedula and birthDate in the response data', async () => {
      const profile = makeProfile();
      mockGetProfile.execute.mockResolvedValue(profile);

      const result = await controller.profile(USER);

      expect(result.data.cedula).toBe('V-12345678');
      expect(result.data.birthDate).toBe('1985-03-15');
    });

    it('includes onboardingCompleted in the response data', async () => {
      const profile = makeProfile();
      mockGetProfile.execute.mockResolvedValue(profile);

      const result = await controller.profile(USER);

      expect(result.data.onboardingCompleted).toBe(true);
    });
  });

  describe('PUT /doctor/profile', () => {
    it('updates the doctor profile including new media fields', async () => {
      const updated = makeProfile();
      mockUpdateProfile.execute.mockResolvedValue(updated);

      const result = await controller.updateProfileHandler(
        {
          specialty: 'Cardiología',
          allows_online: true,
          logo_url: 'https://cdn.example.com/logo.png',
          signature_url: 'https://cdn.example.com/sig.png',
          license_number: 'MED-001',
        },
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
        logoUrl: 'https://cdn.example.com/logo.png',
        signatureUrl: 'https://cdn.example.com/sig.png',
        licenseNumber: 'MED-001',
        phone: undefined,
        birthDate: undefined,
      });
    });

    it('passes phone through to the use case', async () => {
      const updated = makeProfile();
      mockUpdateProfile.execute.mockResolvedValue(updated);

      await controller.updateProfileHandler({ phone: '04141234567' }, USER);

      expect(mockUpdateProfile.execute).toHaveBeenCalledWith(
        DOCTOR_ID,
        expect.objectContaining({ phone: '04141234567' }),
      );
    });

    it('passes birth_date to the use case as birthDate (camelCase)', async () => {
      const updated = makeProfile();
      mockUpdateProfile.execute.mockResolvedValue(updated);

      await controller.updateProfileHandler({ birth_date: '1990-06-01' }, USER);

      expect(mockUpdateProfile.execute).toHaveBeenCalledWith(
        DOCTOR_ID,
        expect.objectContaining({ birthDate: '1990-06-01' }),
      );
    });

    it('passes null birth_date to clear the field', async () => {
      const updated = makeProfile();
      mockUpdateProfile.execute.mockResolvedValue(updated);

      await controller.updateProfileHandler({ birth_date: null }, USER);

      expect(mockUpdateProfile.execute).toHaveBeenCalledWith(
        DOCTOR_ID,
        expect.objectContaining({ birthDate: null }),
      );
    });

    it('does not pass cedula to the use case (read-only field)', async () => {
      const updated = makeProfile();
      mockUpdateProfile.execute.mockResolvedValue(updated);

      await controller.updateProfileHandler({ specialty: 'Neurología' }, USER);

      const callArgs = mockUpdateProfile.execute.mock.calls[0][1] as Record<string, unknown>;
      expect('cedula' in callArgs).toBe(false);
    });
  });

  describe('GET /doctor/exchange-rate', () => {
    it('returns the effective exchange rate', async () => {
      const rateOutput = {
        mode: 'usd_bcv',
        rate: 36.5,
        label: 'USD → BsS (BCV oficial)',
        customRate: null,
        customRateLabel: null,
      };
      mockGetExchangeRate.execute.mockResolvedValue(rateOutput);

      const result = await controller.exchangeRate(USER);

      expect(result.success).toBe(true);
      expect(result.data.mode).toBe('usd_bcv');
      expect(mockGetExchangeRate.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });
  });

  describe('PUT /doctor/exchange-rate', () => {
    it('updates the exchange rate mode and custom rate', async () => {
      const rateOutput = {
        mode: 'custom',
        rate: 50.0,
        label: 'Tasa personalizada',
        customRate: 50.0,
        customRateLabel: null,
      };
      mockSetExchangeRate.execute.mockResolvedValue(rateOutput);

      const result = await controller.updateExchangeRate(
        { mode: 'custom', custom_rate: 50.0, custom_rate_label: null },
        USER,
      );

      expect(result.success).toBe(true);
      expect(result.data.mode).toBe('custom');
      expect(mockSetExchangeRate.execute).toHaveBeenCalledWith(DOCTOR_ID, {
        mode: 'custom',
        customRate: 50.0,
        customRateLabel: null,
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
        bookingHorizonWeeks: 8,
      });
    });
  });

  describe('GET /doctor/features', () => {
    it('returns features for the doctor plan with v2 shape', async () => {
      const featuresV2 = {
        plan_key: 'delta_base',
        effective_plan_key: 'delta_base',
        is_downgraded: false,
        features: { dashboard: true, ai_assistant: false },
      };
      mockGetFeaturesV2.execute.mockResolvedValue(featuresV2);

      const result = await controller.features(USER);

      expect(result.success).toBe(true);
      expect(result.data.plan_key).toBe('delta_base');
      expect(result.data.is_downgraded).toBe(false);
      expect(result.data.features['dashboard']).toBe(true);
    });

    it('returns downgraded features when subscription expired', async () => {
      const featuresV2 = {
        plan_key: 'delta_base',
        effective_plan_key: 'delta_free',
        is_downgraded: true,
        features: { dashboard: true, ai_assistant: false },
      };
      mockGetFeaturesV2.execute.mockResolvedValue(featuresV2);

      const result = await controller.features(USER);

      expect(result.success).toBe(true);
      expect(result.data.is_downgraded).toBe(true);
      expect(result.data.effective_plan_key).toBe('delta_free');
    });
  });

  describe('GET /doctor/subscription', () => {
    it('returns full subscription panel data matching SubscriptionData shape', async () => {
      const panelOutput = {
        state: {
          plan: 'Beta Privada',
          status: 'trial',
          expires_at: '2027-06-17T00:00:00.000Z',
          days_remaining: 365,
          is_expired: false,
          is_in_trial: true,
        },
        pricing: {
          base_price_usd: 0,
          currency: 'USD',
          duration_options: [],
        },
        payment_methods: {
          enabled: ['pago_movil', 'zelle'],
          config: { pago_movil: { numero: '04241234567' }, zelle: { email: 'pay@test.com' } },
        },
        stripe_enabled: false,
        payments: [],
      };
      mockGetSubscriptionPanel.execute.mockResolvedValue(panelOutput);

      const result = await controller.subscription(USER);

      expect(result).toEqual({ success: true, data: panelOutput });
      expect(result.data.state.is_in_trial).toBe(true);
      expect(result.data.stripe_enabled).toBe(false);
      expect(mockGetSubscriptionPanel.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('delegates to GetDoctorSubscriptionPanelUseCase using user.sub as doctorId', async () => {
      mockGetSubscriptionPanel.execute.mockResolvedValue({
        state: {
          plan: 'Trial',
          status: 'trial',
          expires_at: null,
          days_remaining: 0,
          is_expired: false,
          is_in_trial: true,
        },
        pricing: { base_price_usd: 0, currency: 'USD', duration_options: [] },
        payment_methods: { enabled: [], config: {} },
        stripe_enabled: false,
        payments: [],
      });

      await controller.subscription(USER);

      expect(mockGetSubscriptionPanel.execute).toHaveBeenCalledTimes(1);
      expect(mockGetSubscriptionPanel.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });
  });

  describe('GET /doctor/subscription/info', () => {
    it('returns lightweight subscription info with bannerLevel', async () => {
      const sub = {
        status: 'active',
        plan: 'professional',
        expiresAt: null,
        daysUntilExpiry: null,
        bannerLevel: 'none' as const,
      };
      mockGetSubscription.execute.mockResolvedValue(sub);

      const result = await controller.subscriptionInfo(USER);

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
