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
    /**
     * When true the public booking form must collect a chief complaint
     * (motivo de consulta) before the patient can submit.
     * Default false (motivo is optional).
     */
    booking_require_reason: z.boolean().default(false).optional(),
    /**
     * Minimum number of calendar days in advance that a public booking can
     * be placed.  0 = no restriction.  Range 0–90.
     */
    booking_min_lead_days: z.number().int().min(0).max(90).default(0).optional(),
  })
  .strict();

export type UpdateDoctorScheduleDto = z.infer<typeof UpdateDoctorScheduleDtoSchema>;
