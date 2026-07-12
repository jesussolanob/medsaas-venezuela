import { z } from 'zod';

/**
 * DaySchedule schema for a single day in an office schedule.
 * day: 0=Monday … 6=Sunday (offices schema, NOT JS getDay() 0=Sunday).
 */
export const DayScheduleSchema = z.object({
  day: z.number().int().min(0).max(6),
  enabled: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'start must be in HH:MM format'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'end must be in HH:MM format'),
});
export type DayScheduleDto = z.infer<typeof DayScheduleSchema>;

export const OfficeMODALITY_VALUES = ['in_person', 'online', 'both'] as const;
export type OfficeModalityValue = (typeof OfficeMODALITY_VALUES)[number];

export const OfficeModalitySchema = z.enum(OfficeMODALITY_VALUES);

/**
 * Validates that a map URL uses only http: or https: scheme.
 * Rejects javascript:, data:, etc. (defence in depth for HTML email injection).
 */
const safeUrlSchema = z
  .string()
  .trim()
  .url('URL inválida')
  .max(500, 'URL debe tener máximo 500 caracteres')
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Solo se permiten URLs con esquema http o https' },
  );

export const CreateOfficeDtoSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  address: z.string().max(500).optional().default(''),
  city: z.string().max(200).optional().default(''),
  phone: z.string().max(50).optional().default(''),
  schedule: z.array(DayScheduleSchema).optional().default([]),
  slot_duration: z
    .number()
    .int()
    .min(5, 'slot_duration must be at least 5 minutes')
    .max(240, 'slot_duration must be at most 240 minutes')
    .optional()
    .default(30),
  buffer_minutes: z
    .number()
    .int()
    .min(0, 'buffer_minutes cannot be negative')
    .max(120, 'buffer_minutes must be at most 120 minutes')
    .optional()
    .default(10),
  /** Modality of appointments accepted by this office. Default: 'in_person'. */
  modality: OfficeModalitySchema.optional().default('in_person'),
  /**
   * Optional Google Maps (or any http/https) URL for this office location.
   * Empty string is normalised to undefined (treated as absent).
   * Only http/https schemes are accepted — javascript: etc. are rejected.
   */
  map_url: z
    .union([safeUrlSchema, z.literal('')])
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
});
export type CreateOfficeDto = z.infer<typeof CreateOfficeDtoSchema>;

export const UpdateOfficeDtoSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  schedule: z.array(DayScheduleSchema).optional(),
  slot_duration: z.number().int().min(5).max(240).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
  modality: OfficeModalitySchema.optional(),
  /**
   * Optional map URL update. Empty string clears the field (sets to null).
   * Only http/https schemes are accepted.
   */
  map_url: z
    .union([safeUrlSchema, z.literal('')])
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
});
export type UpdateOfficeDto = z.infer<typeof UpdateOfficeDtoSchema>;
