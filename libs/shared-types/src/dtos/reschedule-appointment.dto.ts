import { z } from 'zod';

/**
 * Input DTO for PUT /api/appointments/:id/reschedule.
 *
 * `scheduled_at` must be a valid ISO 8601 datetime string.
 * `id` and `actor_id` are injected by the controller from the path param and
 * the authenticated user — they are NOT expected in the request body.
 */
export const RescheduleAppointmentDtoSchema = z.object({
  scheduled_at: z.string().datetime({ message: 'scheduled_at must be a valid ISO 8601 datetime' }),
});

export type RescheduleAppointmentDto = z.infer<typeof RescheduleAppointmentDtoSchema>;
