import { z } from 'zod';
import { UserRoleSchema } from './enums';

// Columns from CLAUDE.md (profiles table):
// id, full_name, email, role, specialty, professional_title, clinic_id,
// clinic_role, payment_methods, payment_details, avatar_url, allows_online,
// office_address, city, state
// Additional columns observed in register/actions.ts: created_at, updated_at

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1),
  email: z.string().email(),
  role: UserRoleSchema,
  specialty: z.string().nullable().optional(),
  professional_title: z.string().nullable().optional(),
  clinic_id: z.string().uuid().nullable().optional(),
  clinic_role: z.string().nullable().optional(),
  // payment_methods is an array of method keys (e.g. ['pago_movil', 'zelle'])
  payment_methods: z.array(z.string()).nullable().optional(),
  // payment_details is a freeform JSON blob keyed by method
  payment_details: z.record(z.string(), z.unknown()).nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  allows_online: z.boolean().nullable().optional(),
  office_address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const CreateProfileSchema = ProfileSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type CreateProfile = z.infer<typeof CreateProfileSchema>;
