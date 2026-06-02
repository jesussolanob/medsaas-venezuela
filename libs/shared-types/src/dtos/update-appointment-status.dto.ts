import { z } from 'zod';
import { AppointmentStatusSchema } from '../enums';

// DTO for status transitions on an existing appointment.
// actor_id is the user performing the change (for audit log).
export const UpdateAppointmentStatusDtoSchema = z
  .object({
    id: z.string().uuid(),
    status: AppointmentStatusSchema,
    actor_id: z.string().uuid(),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();

export type UpdateAppointmentStatusDto = z.infer<typeof UpdateAppointmentStatusDtoSchema>;
