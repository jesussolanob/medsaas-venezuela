import type { Lead } from '../../domain/entities/lead.entity';

/**
 * Maps a Lead domain entity to the API response shape.
 *
 * SECURITY: phone is prospect contact data — not encrypted, but NEVER logged.
 *   Ownership is enforced upstream in use case + repository layers.
 */
export function toLeadResponse(lead: Lead): Record<string, unknown> {
  return {
    id: lead.id,
    doctor_id: lead.doctorId,
    name: lead.name,
    phone: lead.phone,
    channel: lead.channel,
    stage: lead.stage,
    message: lead.message,
    source: lead.source,
    status: lead.status,
    last_activity: lead.lastActivity?.toISOString() ?? null,
    created_at: lead.createdAt.toISOString(),
    updated_at: lead.updatedAt.toISOString(),
  };
}
