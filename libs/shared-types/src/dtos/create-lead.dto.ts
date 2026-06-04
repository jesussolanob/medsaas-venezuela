import { z } from 'zod';

export const LeadStageSchema = z.enum([
  'new',
  'contacted',
  'qualified',
  'appointment',
  'converted',
  'lost',
]);
export type LeadStageType = z.infer<typeof LeadStageSchema>;

export const LeadChannelSchema = z.enum([
  'whatsapp',
  'instagram',
  'facebook',
  'web',
  'llamada',
  'referido',
]);
export type LeadChannelType = z.infer<typeof LeadChannelSchema>;

export const CreateLeadDtoSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  phone: z.string().max(50).nullable().optional(),
  channel: LeadChannelSchema.nullable().optional(),
  stage: LeadStageSchema.optional().default('new'),
  message: z.string().max(2000).nullable().optional(),
  source: z.string().max(100).nullable().optional(),
});
export type CreateLeadDto = z.infer<typeof CreateLeadDtoSchema>;

export const UpdateLeadDtoSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).nullable().optional(),
  channel: LeadChannelSchema.nullable().optional(),
  message: z.string().max(2000).nullable().optional(),
});
export type UpdateLeadDto = z.infer<typeof UpdateLeadDtoSchema>;

export const UpdateLeadStageDtoSchema = z.object({
  stage: LeadStageSchema,
});
export type UpdateLeadStageDto = z.infer<typeof UpdateLeadStageDtoSchema>;
