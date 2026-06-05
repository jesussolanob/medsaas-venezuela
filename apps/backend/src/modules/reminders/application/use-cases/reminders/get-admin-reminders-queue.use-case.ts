import { Inject, Injectable } from '@nestjs/common';
import {
  IRemindersQueueRepository,
  REMINDERS_QUEUE_REPOSITORY,
} from '../../../domain/repositories/reminders-queue.repository';
import type { ReminderQueueItem } from '../../../domain/entities/reminder-queue-item.entity';

export interface AdminQueueRow {
  id: string;
  doctorId: string;
  doctorName: string;
  offsetType: string;
  channel: string;
  scheduledFor: Date;
  status: string;
}

/** Extended type used by the repository to carry the JOINed doctor name. */
type QueueItemWithDoctorName = ReminderQueueItem & { doctorName?: string };

const ADMIN_QUEUE_LIMIT = 50;

@Injectable()
export class GetAdminRemindersQueueUseCase {
  constructor(
    @Inject(REMINDERS_QUEUE_REPOSITORY)
    private readonly queueRepo: IRemindersQueueRepository,
  ) {}

  /**
   * Returns all queue items (up to 50) enriched with doctor name.
   * Used by the admin monitor. The repository handles the JOIN.
   */
  async execute(): Promise<AdminQueueRow[]> {
    const items = await this.queueRepo.listAll(ADMIN_QUEUE_LIMIT);
    return items.map((item) => {
      const extended = item as QueueItemWithDoctorName;
      return {
        id: extended.id,
        doctorId: extended.doctorId,
        doctorName: extended.doctorName ?? extended.doctorId,
        offsetType: extended.offsetType,
        channel: extended.channel,
        scheduledFor: extended.scheduledFor,
        status: extended.status,
      };
    });
  }
}
