import { z } from 'zod';

export const ContactChannelSchema = z.enum(['call_now', 'whatsapp', 'call', 'email']);
export type ContactChannelType = z.infer<typeof ContactChannelSchema>;

export const ContactRequestStatusSchema = z.enum(['pending', 'contacted', 'resolved']);
export type ContactRequestStatusType = z.infer<typeof ContactRequestStatusSchema>;

/**
 * Input DTO for creating a contact request.
 */
export const CreateContactRequestDtoSchema = z.object({
  channel: ContactChannelSchema,
  message: z.string().max(500, 'El mensaje no puede superar 500 caracteres').nullable().optional(),
});
export type CreateContactRequestDto = z.infer<typeof CreateContactRequestDtoSchema>;

/**
 * Input DTO for the admin to update a contact request.
 */
export const UpdateContactRequestAdminDtoSchema = z.object({
  status: ContactRequestStatusSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateContactRequestAdminDto = z.infer<typeof UpdateContactRequestAdminDtoSchema>;

/**
 * Query params DTO for listing contact requests (admin).
 */
export const ListContactRequestsQuerySchema = z.object({
  status: ContactRequestStatusSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListContactRequestsQuery = z.infer<typeof ListContactRequestsQuerySchema>;
