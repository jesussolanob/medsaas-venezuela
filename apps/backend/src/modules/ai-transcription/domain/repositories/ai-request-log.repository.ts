import type { AiRequestLog } from '../entities/ai-request-log.entity';

export const AI_REQUEST_LOG_REPOSITORY = Symbol('IAiRequestLogRepository');

export interface IAiRequestLogRepository {
  /** Persists an audit log entry. NEVER stores PHI. */
  save(log: AiRequestLog): Promise<void>;
}
