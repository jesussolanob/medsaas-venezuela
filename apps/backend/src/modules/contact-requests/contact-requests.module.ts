import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

// Models
import { ContactRequestModel } from './infrastructure/persistence/models/contact-request.model';
import { ContactProfileModel } from './infrastructure/persistence/models/contact-profile.model';

// Repository binding
import { CONTACT_REQUEST_REPOSITORY } from './domain/repositories/icontact-request.repository';
import { SequelizeContactRequestRepository } from './infrastructure/persistence/repositories/sequelize-contact-request.repository';

// Use cases — doctor
import { GetSupportInfoUseCase } from './application/use-cases/get-support-info.use-case';
import { RequestContactUseCase } from './application/use-cases/request-contact.use-case';
import { GetCurrentContactRequestUseCase } from './application/use-cases/get-current-contact-request.use-case';

// Use cases — admin
import { ListContactRequestsUseCase } from './application/use-cases/list-contact-requests.use-case';
import { UpdateContactRequestUseCase } from './application/use-cases/update-contact-request.use-case';
import { CountPendingContactRequestsUseCase } from './application/use-cases/count-pending-contact-requests.use-case';

// Guards
import { RolesGuard } from '../../presentation/guards/roles.guard';

// Controllers
import { ContactRequestsController } from './presentation/controllers/contact-requests.controller';
import { AdminContactRequestsController } from './presentation/controllers/admin-contact-requests.controller';

// Email
import { EmailModule } from '../email/email.module';

/**
 * ContactRequestsModule — "Contáctame ya" feature (Fase 1 del plan de retención).
 *
 * Doctor endpoints:
 *   GET  /api/doctor/support-info               — support info + callNowAvailable
 *   POST /api/doctor/contact-requests           — create/update contact request
 *   GET  /api/doctor/contact-requests/current   — current pending request
 *
 * Admin endpoints (super_admin only):
 *   GET   /api/admin/contact-requests             — list with filters
 *   PATCH /api/admin/contact-requests/:id         — update status/notes
 *   GET   /api/admin/contact-requests/pending-count — badge count
 *
 * IMPORTANT: Sequelize is NOT added to the providers array — it is already
 * registered globally by SequelizeModule.forRootAsync in AppModule.
 * Adding it again here causes a crash in the dist build.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([ContactRequestModel, ContactProfileModel]),
    // EmailModule is imported to access MailerService for admin notifications.
    EmailModule,
  ],
  controllers: [ContactRequestsController, AdminContactRequestsController],
  providers: [
    {
      provide: CONTACT_REQUEST_REPOSITORY,
      useClass: SequelizeContactRequestRepository,
    },
    RolesGuard,
    GetSupportInfoUseCase,
    RequestContactUseCase,
    GetCurrentContactRequestUseCase,
    ListContactRequestsUseCase,
    UpdateContactRequestUseCase,
    CountPendingContactRequestsUseCase,
  ],
})
export class ContactRequestsModule {}
