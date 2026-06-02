import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models
import { ProfileAdminModel } from './infrastructure/database/models/profile.model';
import { AdminSubscriptionModel } from './infrastructure/database/models/subscription.model';
import { PlanConfigModel } from './infrastructure/database/models/plan-config.model';
import { PlanFeatureModel } from './infrastructure/database/models/plan-feature.model';

// Repository
import { SequelizeAdminRepository } from './infrastructure/database/repositories/sequelize-admin.repository';
import { ADMIN_REPOSITORY } from './domain/repositories/admin.repository';

// Use cases
import { GetAdminDashboardUseCase } from './application/use-cases/admin/get-admin-dashboard.use-case';
import { GetDoctorsListUseCase } from './application/use-cases/admin/get-doctors-list.use-case';
import { GetDoctorDetailUseCase } from './application/use-cases/admin/get-doctor-detail.use-case';
import { UpdateDoctorSubscriptionUseCase } from './application/use-cases/admin/update-doctor-subscription.use-case';
import { GetSubscriptionsUseCase } from './application/use-cases/admin/get-subscriptions.use-case';
import { GetPlansUseCase } from './application/use-cases/admin/get-plans.use-case';
import { TogglePlanUseCase } from './application/use-cases/admin/toggle-plan.use-case';
import { GetPlanFeaturesUseCase } from './application/use-cases/admin/get-plan-features.use-case';
import { TogglePlanFeatureUseCase } from './application/use-cases/admin/toggle-plan-feature.use-case';
import { GetPatientsStatsUseCase } from './application/use-cases/admin/get-patients-stats.use-case';
import { GetSettingsUseCase } from './application/use-cases/admin/get-settings.use-case';

// Guards
import { RolesGuard } from '../../presentation/guards/roles.guard';

// Controller
import { AdminController } from './presentation/controllers/admin.controller';

/**
 * AdminModule — manages the admin panel for super_admin users.
 *
 * All endpoints exposed by AdminController require the super_admin role.
 * Redis (REDIS_CLIENT) is injected globally via RedisModule.
 *
 * The Sequelize instance is also global (SequelizeModule.forRootAsync in AppModule),
 * so only the models needed by this module are declared here via forFeature().
 *
 * IMPORTANT: Sequelize is NOT added to the providers array — it is already
 * registered globally and injecting it a second time causes a crash in the dist build.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      ProfileAdminModel,
      AdminSubscriptionModel,
      PlanConfigModel,
      PlanFeatureModel,
    ]),
  ],
  controllers: [AdminController],
  providers: [
    // Repository binding: domain interface → Sequelize implementation
    {
      provide: ADMIN_REPOSITORY,
      useClass: SequelizeAdminRepository,
    },

    // Guards
    RolesGuard,

    // Use cases
    GetAdminDashboardUseCase,
    GetDoctorsListUseCase,
    GetDoctorDetailUseCase,
    UpdateDoctorSubscriptionUseCase,
    GetSubscriptionsUseCase,
    GetPlansUseCase,
    TogglePlanUseCase,
    GetPlanFeaturesUseCase,
    TogglePlanFeatureUseCase,
    GetPatientsStatsUseCase,
    GetSettingsUseCase,
  ],
})
export class AdminModule {}
