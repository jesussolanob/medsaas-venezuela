import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { NotificationModel } from './infrastructure/persistence/models/notification.model';
import { SequelizeNotificationRepository } from './infrastructure/persistence/repositories/sequelize-notification.repository';
import { NOTIFICATION_REPOSITORY } from './domain/repositories/inotification.repository';

import { CreateNotificationUseCase } from './application/use-cases/create-notification.use-case';
import { ListNotificationsUseCase } from './application/use-cases/list-notifications.use-case';
import { MarkAsReadUseCase } from './application/use-cases/mark-as-read.use-case';
import { MarkAllAsReadUseCase } from './application/use-cases/mark-all-as-read.use-case';

import { NotificationsController } from './presentation/controllers/notifications.controller';

/**
 * NotificationsModule — in-app bell notifications for doctors.
 *
 * MVP scope: quote_accepted | quote_rejected events only.
 *
 * CreateNotificationUseCase is exported so other modules (e.g. QuotesModule)
 * can inject it as a best-effort side effect without circular imports.
 *
 * IMPORTANT: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Only register the feature model (NotificationModel) here —
 * never re-declare the Sequelize provider in this module's providers array.
 */
@Module({
  imports: [SequelizeModule.forFeature([NotificationModel])],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: SequelizeNotificationRepository,
    },
    CreateNotificationUseCase,
    ListNotificationsUseCase,
    MarkAsReadUseCase,
    MarkAllAsReadUseCase,
  ],
  exports: [CreateNotificationUseCase],
})
export class NotificationsModule {}
