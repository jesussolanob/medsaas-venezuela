import { z } from 'zod';

/**
 * DTOs for the team-meetings module (Phase 3 — retention plan).
 */

/**
 * Reason stored on the availability block a team meeting creates in the doctor's
 * agenda. Shared so the agenda can recognize (and style) it: the backend wrote
 * "Reunión de equipo Delta" while the agenda looked for this text (QA, 30/10).
 */
export const TEAM_MEETING_BLOCK_REASON = 'Reunión con el equipo Delta';

// ---------------------------------------------------------------------------
// Doctor DTOs
// ---------------------------------------------------------------------------

/**
 * Query params for GET /api/doctor/team-meetings/slots
 */
export const GetMeetingSlotsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(14),
});
export type GetMeetingSlotsQuery = z.infer<typeof GetMeetingSlotsQuerySchema>;

/**
 * Input DTO for POST /api/doctor/team-meetings
 * and POST /api/doctor/team-meetings/:id/reschedule
 */
export const BookTeamMeetingDtoSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe estar en formato YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'La hora debe estar en formato HH:MM'),
});
export type BookTeamMeetingDto = z.infer<typeof BookTeamMeetingDtoSchema>;

// ---------------------------------------------------------------------------
// Admin DTOs
// ---------------------------------------------------------------------------

export const TeamMeetingStatusSchema = z.enum(['scheduled', 'done', 'no_show', 'cancelled']);
export type TeamMeetingStatus = z.infer<typeof TeamMeetingStatusSchema>;

export const TeamMeetingSourceSchema = z.enum(['email', 'modal']);
export type TeamMeetingSource = z.infer<typeof TeamMeetingSourceSchema>;

/**
 * Query params for GET /api/admin/team-meetings
 */
export const AdminListTeamMeetingsQuerySchema = z.object({
  status: TeamMeetingStatusSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AdminListTeamMeetingsQuery = z.infer<typeof AdminListTeamMeetingsQuerySchema>;

/**
 * Input DTO for PATCH /api/admin/team-meetings/:id
 */
export const AdminUpdateTeamMeetingDtoSchema = z
  .object({
    status: z.enum(['done', 'no_show', 'cancelled']).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.notes !== undefined, {
    message: 'Se requiere al menos un campo (status o notes)',
  });
export type AdminUpdateTeamMeetingDto = z.infer<typeof AdminUpdateTeamMeetingDtoSchema>;

/**
 * Input DTO for PUT /api/admin/team-meetings/host
 */
export const AdminUpdateTeamMeetingHostDtoSchema = z.object({
  profileId: z.string().uuid('El profileId debe ser un UUID válido'),
});
export type AdminUpdateTeamMeetingHostDto = z.infer<typeof AdminUpdateTeamMeetingHostDtoSchema>;
