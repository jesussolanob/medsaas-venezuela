import { z } from 'zod';

/** Validates an HH:MM time string (24-hour format). */
const TimeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  message: 'Must be a valid HH:MM time (24h)',
});

export const UpdateDoctorScheduleDtoSchema = z
  .object({
    work_days: z.array(z.number().int().min(0).max(6)).min(1),
    start_time: TimeStringSchema,
    end_time: TimeStringSchema,
    slot_duration_minutes: z.number().int().min(10).max(480).default(30),
    break_start: TimeStringSchema.nullable().optional(),
    break_end: TimeStringSchema.nullable().optional(),
    /** How many weeks ahead booking should show slots. Range 1–52, default 8. */
    booking_horizon_weeks: z.number().int().min(1).max(52).default(8).optional(),
  })
  .strict();

export type UpdateDoctorScheduleDto = z.infer<typeof UpdateDoctorScheduleDtoSchema>;
