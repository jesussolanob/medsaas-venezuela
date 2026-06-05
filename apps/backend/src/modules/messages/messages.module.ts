import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { MessageModel } from './infrastructure/database/models/message.model';
import { PatientModel } from '../patients/infrastructure/database/models/patient.model';
// CryptoService is global (provided by CryptoModule in AppModule) — no local import needed.
import { SequelizeMessageRepository } from './infrastructure/database/repositories/sequelize-message.repository';
import { MESSAGE_REPOSITORY } from './domain/repositories/message.repository';
import { PatientsModule } from '../patients/patients.module';

import { ListThreadsUseCase } from './application/use-cases/messages/list-threads.use-case';
import { GetThreadUseCase } from './application/use-cases/messages/get-thread.use-case';
import { SendMessageUseCase } from './application/use-cases/messages/send-message.use-case';

import { MessagesController } from './presentation/controllers/messages.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([MessageModel, PatientModel]),
    // Import PatientsModule to get access to PATIENT_REPOSITORY token for
    // ownership verification (anti-IDOR). Pattern established by billing/booking modules.
    PatientsModule,
  ],
  controllers: [MessagesController],
  providers: [
    // CryptoService is global — injected from CryptoModule, not listed here.

    // Repository binding: domain interface → Sequelize implementation
    {
      provide: MESSAGE_REPOSITORY,
      useClass: SequelizeMessageRepository,
    },

    // PATIENT_REPOSITORY is exported by PatientsModule — available via DI without
    // re-declaring it here. Use cases inject it via @Inject(PATIENT_REPOSITORY).

    // Use cases
    ListThreadsUseCase,
    GetThreadUseCase,
    SendMessageUseCase,
  ],
})
export class MessagesModule {}
