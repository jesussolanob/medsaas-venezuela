import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { ConsultationPaymentModel } from './infrastructure/database/models/consultation-payment.model';
import { ConsultationModel } from '../consultations/infrastructure/database/models/consultation.model';
import { SequelizeConsultationPaymentRepository } from './infrastructure/database/repositories/sequelize-consultation-payment.repository';
import { CONSULTATION_PAYMENT_REPOSITORY } from './domain/repositories/consultation-payment.repository';

// Cross-module: import the consultation repository token to allow
// RegisterConsultationPaymentUseCase to verify consultation ownership.
import { CONSULTATION_REPOSITORY } from '../consultations/domain/repositories/consultation.repository';
import { SequelizeConsultationRepository } from '../consultations/infrastructure/database/repositories/sequelize-consultation.repository';

import { ListConsultationPaymentsUseCase } from './application/use-cases/payments/list-consultation-payments.use-case';
import { RegisterConsultationPaymentUseCase } from './application/use-cases/payments/register-consultation-payment.use-case';
import { ApproveConsultationPaymentUseCase } from './application/use-cases/payments/approve-consultation-payment.use-case';
import { RejectConsultationPaymentUseCase } from './application/use-cases/payments/reject-consultation-payment.use-case';

import { PaymentsController } from './presentation/controllers/payments.controller';

// CryptoService is global (provided by CryptoModule in AppModule) — no import needed here.
// Sequelize is global (provided by SequelizeModule.forRootAsync in AppModule) — no import needed.

@Module({
  imports: [
    // Register both models: ConsultationPaymentModel (owned) + ConsultationModel
    // (borrowed for ownership verification and consultation status sync).
    SequelizeModule.forFeature([ConsultationPaymentModel, ConsultationModel]),
  ],
  controllers: [PaymentsController],
  providers: [
    // Repository binding: payments domain interface → Sequelize implementation
    {
      provide: CONSULTATION_PAYMENT_REPOSITORY,
      useClass: SequelizeConsultationPaymentRepository,
    },

    // Repository binding: consultation domain interface → Sequelize implementation
    // Required by RegisterConsultationPaymentUseCase for ownership verification.
    // NOTE: Sequelize, CryptoService are global; SequelizeConsultationRepository
    // receives them via DI without declaring them in providers here.
    {
      provide: CONSULTATION_REPOSITORY,
      useClass: SequelizeConsultationRepository,
    },

    // Use cases
    ListConsultationPaymentsUseCase,
    RegisterConsultationPaymentUseCase,
    ApproveConsultationPaymentUseCase,
    RejectConsultationPaymentUseCase,
  ],
})
export class PaymentsModule {}
