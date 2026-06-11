import type { ActionEvent } from '../../domain/entities/action-event.entity';

/**
 * AdminActionEventDto — output shape for the GET /api/telemetry/doctor endpoint.
 *
 * Intentionally excludes the `metadata` field: it may contain arbitrary JSONB
 * that is irrelevant for admin analytics and could complicate PII audits.
 * Admins who need raw metadata should query the database directly.
 */
export interface AdminActionEventDto {
  id: string;
  doctorId: string | null;
  sessionId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  occurredAt: Date;
  createdAt: Date;
}

export function toAdminActionEventDto(event: ActionEvent): AdminActionEventDto {
  return {
    id: event.id,
    doctorId: event.doctorId,
    sessionId: event.sessionId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    occurredAt: event.occurredAt,
    createdAt: event.createdAt,
  };
}
