import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Sibling modules
import { SellerCommissionsModule } from '../seller-commissions/seller-commissions.module';

// Model
import { SellerProfileModel } from './infrastructure/persistence/models/seller-profile.model';

// Repository binding
import { SELLER_REPOSITORY } from './domain/repositories/seller.repository';
import { SequelizeSellerRepository } from './infrastructure/persistence/repositories/sequelize-seller.repository';

// Use cases
import { CreateSellerUseCase } from './application/use-cases/create-seller.use-case';
import { ValidateSellerCodeUseCase } from './application/use-cases/validate-seller-code.use-case';
import { CreateSellerSpecialistUseCase } from './application/use-cases/create-seller-specialist.use-case';
import { ListSellerSpecialistsUseCase } from './application/use-cases/list-seller-specialists.use-case';
import { GetSellerSpecialistUseCase } from './application/use-cases/get-seller-specialist.use-case';
import { UpdateSellerSpecialistUseCase } from './application/use-cases/update-seller-specialist.use-case';
import { GetSellerProfileUseCase } from './application/use-cases/get-seller-profile.use-case';
import { ListSellersUseCase } from './application/use-cases/list-sellers.use-case';
import { GetSellerPaymentDetailsUseCase } from './application/use-cases/get-seller-payment-details.use-case';
import { UpdateSellerPaymentDetailsUseCase } from './application/use-cases/update-seller-payment-details.use-case';
import { GetAdminSellerPaymentDetailsUseCase } from './application/use-cases/get-admin-seller-payment-details.use-case';
import { GetSpecialistSellerAssignmentUseCase } from './application/use-cases/get-specialist-seller-assignment.use-case';
import { DeactivateSellerAccountUseCase } from './application/use-cases/deactivate-seller-account.use-case';

// Guards
import { RolesGuard } from '../../presentation/guards/roles.guard';

// Controllers
import {
  SellersController,
  SellersPublicController,
} from './presentation/controllers/sellers.controller';

/**
 * SellersModule
 *
 * Manages the seller role and the specialist-attribution flow:
 *
 *   Admin:
 *     POST /api/admin/sellers             — super_admin creates a seller account
 *
 *   Seller portal:
 *     GET  /api/seller/specialists        — list my attributed specialists
 *     GET  /api/seller/specialists/:id    — detail of one attributed specialist
 *     POST /api/seller/specialists        — create a specialist (sold_by from session)
 *
 *   Public (no auth):
 *     GET  /api/public/seller-code/:code  — validate a seller code during registration
 *
 * EXPORTS SELLER_REPOSITORY so DoctorRegistrationModule can inject it to resolve
 * seller_code → sold_by during the onboarding wizard.
 *
 * IMPORTANT: Sequelize is NOT added to providers — already registered globally
 * by SequelizeModule.forRootAsync in AppModule.
 */
@Module({
  imports: [SequelizeModule.forFeature([SellerProfileModel]), SellerCommissionsModule],
  controllers: [SellersController, SellersPublicController],
  providers: [
    {
      provide: SELLER_REPOSITORY,
      useClass: SequelizeSellerRepository,
    },
    RolesGuard,
    CreateSellerUseCase,
    ValidateSellerCodeUseCase,
    CreateSellerSpecialistUseCase,
    ListSellerSpecialistsUseCase,
    GetSellerSpecialistUseCase,
    UpdateSellerSpecialistUseCase,
    GetSellerProfileUseCase,
    ListSellersUseCase,
    GetSellerPaymentDetailsUseCase,
    UpdateSellerPaymentDetailsUseCase,
    GetAdminSellerPaymentDetailsUseCase,
    GetSpecialistSellerAssignmentUseCase,
    DeactivateSellerAccountUseCase,
  ],
  exports: [SELLER_REPOSITORY, ValidateSellerCodeUseCase],
})
export class SellersModule {}
