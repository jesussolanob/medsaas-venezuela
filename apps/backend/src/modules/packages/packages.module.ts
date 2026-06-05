import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { PatientPackageModel } from './infrastructure/database/models/patient-package.model';
import { PricingPlanModel } from './infrastructure/database/models/pricing-plan.model';
import { SequelizePackageRepository } from './infrastructure/database/repositories/sequelize-package.repository';
import { SequelizePricingPlanRepository } from './infrastructure/database/repositories/sequelize-pricing-plan.repository';
import { PACKAGE_REPOSITORY } from './domain/repositories/package.repository';
import { PRICING_PLAN_REPOSITORY } from './domain/repositories/pricing-plan.repository';

import { CreatePackageUseCase } from './application/use-cases/packages/create-package.use-case';
import { GetPatientPackagesUseCase } from './application/use-cases/packages/get-patient-packages.use-case';
import { ConsumePackageSessionUseCase } from './application/use-cases/packages/consume-package-session.use-case';
import { GetDoctorPackagesUseCase } from './application/use-cases/packages/get-doctor-packages.use-case';

import { PackagesController } from './presentation/controllers/packages.controller';

// PatientModel is needed by SequelizePackageRepository for email-hash lookups.
import { PatientModel } from '../patients/infrastructure/database/models/patient.model';

@Module({
  imports: [SequelizeModule.forFeature([PatientPackageModel, PricingPlanModel, PatientModel])],
  controllers: [PackagesController],
  providers: [
    // Repository bindings
    {
      provide: PACKAGE_REPOSITORY,
      useClass: SequelizePackageRepository,
    },
    {
      provide: PRICING_PLAN_REPOSITORY,
      useClass: SequelizePricingPlanRepository,
    },

    // Use cases
    CreatePackageUseCase,
    GetPatientPackagesUseCase,
    ConsumePackageSessionUseCase,
    GetDoctorPackagesUseCase,
  ],
  // Exported so the BookingModule can inject the package repo and pricing plan repo
  // without duplicating model registrations.
  exports: [
    PACKAGE_REPOSITORY,
    PRICING_PLAN_REPOSITORY,
    ConsumePackageSessionUseCase,
    SequelizeModule,
  ],
})
export class PackagesModule {}
