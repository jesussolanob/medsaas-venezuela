import { z } from 'zod';

/**
 * Input DTO for PUT /api/appointments/:id/reschedule.
 *
 * `scheduled_at` must be a valid ISO 8601 datetime string.
 * Both UTC strings (`2026-08-19T14:00:00Z`) and strings with a UTC offset
 * (`2026-08-19T10:00:00-04:00`) are accepted. The frontend sends the
 * Venezuela local time with the fixed Caracas offset (−04:00, no DST since
 * 2016). Node's `new Date(str)` handles both forms correctly when the
 * controller converts the string to a Date object.
 *
 * `id` and `actor_id` are injected by the controller from the path param and
 * the authenticated user — they are NOT expected in the request body.
 */
export const RescheduleAppointmentDtoSchema = z.object({
  scheduled_at: z.string().datetime({
    offset: true,
    message: 'scheduled_at must be a valid ISO 8601 datetime (UTC or with offset)',
  }),
});

export type RescheduleAppointmentDto = z.infer<typeof RescheduleAppointmentDtoSchema>;
