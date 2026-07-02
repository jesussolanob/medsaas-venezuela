import { z } from 'zod';
import { AppointmentStatusSchema } from '../enums';

// Full DTO used internally by the use-case and for the audit log.
// id and actor_id are injected by the controller from @Param and @CurrentUser,
// so they are NOT part of what the frontend sends in the body.
export const UpdateAppointmentStatusDtoSchema = z
  .object({
    id: z.string().uuid(),
    status: AppointmentStatusSchema,
    actor_id: z.string().uuid(),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();

export type UpdateAppointmentStatusDto = z.infer<typeof UpdateAppointmentStatusDtoSchema>;

/**
 * Body-only schema for PUT /appointments/:id/status.
 *
 * The frontend sends only `status` (and optionally `reason`).
 * `id` comes from the URL path param and `actor_id` from the authenticated user —
 * both are injected by the controller after body validation.
 */
export const UpdateAppointmentStatusBodyDtoSchema = z
  .object({
    status: AppointmentStatusSchema,
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();

export type UpdateAppointmentStatusBodyDto = z.infer<typeof UpdateAppointmentStatusBodyDtoSchema>;
