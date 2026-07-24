import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../domain/repositories/pending-consultation.repository';

/** Max rows expired per invocation to bound cron job impact. */
const EXPIRE_BATCH_CAP = 500;

/**
 * ExpireDuePendingConsultationsUseCase
 *
 * Marks 'expired' all pending consultations whose expires_at has passed
 * and that are still in 'pending_scheduling' status.
 *
 * Intended to be called by the cron job (or manually by the lead for recovery).
 * Caps each run at EXPIRE_BATCH_CAP rows to avoid long DB transactions.
 *
 * Returns the number of rows expired.
 */
@Injectable()
export class ExpireDuePendingConsultationsUseCase {
  private readonly logger = new Logger(ExpireDuePendingConsultationsUseCase.name);

  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly repo: IPendingConsultationRepository,
  ) {}

  async execute(): Promise<number> {
    const due = await this.repo.findExpired(EXPIRE_BATCH_CAP);
    if (due.length === 0) return 0;

    const ids = due.map((pc) => pc.id);
    await this.repo.bulkExpire(ids);

    this.logger.log(`[expire-due] Expired ${ids.length} pending consultation(s)`);
    return ids.length;
  }
}
