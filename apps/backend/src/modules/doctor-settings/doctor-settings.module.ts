import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models
import { DoctorProfileModel } from './infrastructure/database/models/doctor-profile.model';
import { DoctorScheduleModel } from './infrastructure/database/models/doctor-schedule.model';
import { SubscriptionModel } from './infrastructure/database/models/subscription.model';
import { PlanFeaturesModel } from './infrastructure/database/models/plan-features.model';

// Repository bindings: domain symbols → concrete implementations
import { DOCTOR_PROFILE_REPOSITORY } from './domain/repositories/doctor-profile.repository';
import { DOCTOR_SCHEDULE_REPOSITORY } from './domain/repositories/doctor-schedule.repository';
import { SUBSCRIPTION_REPOSITORY } from './domain/repositories/subscription.repository';
import { PLAN_FEATURES_REPOSITORY } from './domain/repositories/plan-features.repository';
import { SequelizeDoctorProfileRepository } from './infrastructure/database/repositories/sequelize-doctor-profile.repository';
import { SequelizeDoctorScheduleRepository } from './infrastructure/database/repositories/sequelize-doctor-schedule.repository';
import { SequelizeSubscriptionRepository } from './infrastructure/database/repositories/sequelize-subscription.repository';
import { SequelizePlanFeaturesRepository } from './infrastructure/database/repositories/sequelize-plan-features.repository';

// Reuse the pricing-plan repo from PackagesModule (add CRUD methods there)
import { PRICING_PLAN_REPOSITORY } from '../packages/domain/repositories/pricing-plan.repository';
import { PricingPlanModel } from '../packages/infrastructure/database/models/pricing-plan.model';
import { SequelizePricingPlanRepository } from '../packages/infrastructure/database/repositories/sequelize-pricing-plan.repository';

// Use cases
import { GetDoctorProfileUseCase } from './application/use-cases/doctor-settings/get-doctor-profile.use-case';
import { UpdateDoctorProfileUseCase } from './application/use-cases/doctor-settings/update-doctor-profile.use-case';
import { GetDoctorScheduleUseCase } from './application/use-cases/doctor-settings/get-doctor-schedule.use-case';
import { UpdateDoctorScheduleUseCase } from './application/use-cases/doctor-settings/update-doctor-schedule.use-case';
import { GetDoctorFeaturesUseCase } from './application/use-cases/doctor-settings/get-doctor-features.use-case';
import { GetSubscriptionInfoUseCase } from './application/use-cases/doctor-settings/get-subscription-info.use-case';
import { GetServicesUseCase } from './application/use-cases/doctor-settings/get-services.use-case';
import { CreateServiceUseCase } from './application/use-cases/doctor-settings/create-service.use-case';
import { UpdateServiceUseCase } from './application/use-cases/doctor-settings/update-service.use-case';
import { DeleteServiceUseCase } from './application/use-cases/doctor-settings/delete-service.use-case';

// Controller
import { DoctorController } from './presentation/controllers/doctor.controller';

/**
 * DoctorSettingsModule
 *
 * Owns all read/write operations for the authenticated doctor's own settings:
 * profile (with payment_details), schedule, feature gating, subscription info,
 * and service (pricing plan) CRUD.
 *
 * NOTE: Sequelize providers are NOT injected directly — they're registered via
 * SequelizeModule.forFeature and injected via @InjectModel in the repository classes.
 * This avoids the "Sequelize in providers causes crash in dist" footgun.
 *
 * Redis (REDIS_CLIENT) is global via RedisModule — no re-import needed.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      DoctorProfileModel,
      DoctorScheduleModel,
      SubscriptionModel,
      PlanFeaturesModel,
      PricingPlanModel,
    ]),
  ],
  controllers: [DoctorController],
  providers: [
    // Repositories
    {
      provide: DOCTOR_PROFILE_REPOSITORY,
      useClass: SequelizeDoctorProfileRepository,
    },
    {
      provide: DOCTOR_SCHEDULE_REPOSITORY,
      useClass: SequelizeDoctorScheduleRepository,
    },
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: SequelizeSubscriptionRepository,
    },
    {
      provide: PLAN_FEATURES_REPOSITORY,
      useClass: SequelizePlanFeaturesRepository,
    },
    {
      // Pricing plan repo registered locally — CRUD methods not exported by PackagesModule.
      // The PackagesModule's exported PRICING_PLAN_REPOSITORY is read-only from the booking
      // surface perspective; here we need the full write-capable instance.
      provide: PRICING_PLAN_REPOSITORY,
      useClass: SequelizePricingPlanRepository,
    },

    // Use cases
    GetDoctorProfileUseCase,
    UpdateDoctorProfileUseCase,
    GetDoctorScheduleUseCase,
    UpdateDoctorScheduleUseCase,
    GetDoctorFeaturesUseCase,
    GetSubscriptionInfoUseCase,
    GetServicesUseCase,
    CreateServiceUseCase,
    UpdateServiceUseCase,
    DeleteServiceUseCase,
  ],
})
export class DoctorSettingsModule {}
