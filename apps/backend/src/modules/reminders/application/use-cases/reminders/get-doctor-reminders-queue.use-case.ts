import { Inject, Injectable } from '@nestjs/common';
import {
  IRemindersQueueRepository,
  REMINDERS_QUEUE_REPOSITORY,
} from '../../../domain/repositories/reminders-queue.repository';
import type { ReminderQueueItem } from '../../../domain/entities/reminder-queue-item.entity';

@Injectable()
export class GetDoctorRemindersQueueUseCase {
  constructor(
    @Inject(REMINDERS_QUEUE_REPOSITORY)
    private readonly queueRepo: IRemindersQueueRepository,
  ) {}

  /**
   * Returns all queue items for the authenticated doctor, ordered by scheduled_for ASC.
   * Returns [] when no items exist (normal in Etapa 1).
   */
  async execute(doctorId: string): Promise<ReminderQueueItem[]> {
    return this.queueRepo.listByDoctorId(doctorId);
  }
}
