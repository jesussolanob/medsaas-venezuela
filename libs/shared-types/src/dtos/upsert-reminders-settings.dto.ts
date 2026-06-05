import { z } from 'zod';

const REMINDER_CHANNEL_VALUES = ['whatsapp', 'email', 'both'] as const;

export const UpsertRemindersSettingsDtoSchema = z.object({
  enabled: z.boolean().optional(),
  channel: z.enum(REMINDER_CHANNEL_VALUES).optional(),
  reminder_7d_enabled: z.boolean().optional(),
  reminder_24h_enabled: z.boolean().optional(),
  reminder_3h_enabled: z.boolean().optional(),
  reminder_1h_enabled: z.boolean().optional(),
  template_7d_whatsapp: z.string().min(1).max(1000).optional(),
  template_24h_whatsapp: z.string().min(1).max(1000).optional(),
  template_3h_whatsapp: z.string().min(1).max(1000).optional(),
  quiet_hours_start: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'quiet_hours_start must be HH:MM or HH:MM:SS')
    .optional(),
  quiet_hours_end: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'quiet_hours_end must be HH:MM or HH:MM:SS')
    .optional(),
});

export type UpsertRemindersSettingsDto = z.infer<typeof UpsertRemindersSettingsDtoSchema>;
