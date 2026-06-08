import { z } from 'zod';

/**
 * Input DTO for POST /api/auth/resolve-identity.
 *
 * Validated via ZodValidationPipe before reaching the use case.
 * Email is normalised (trim + lowercase) by the use case, not here.
 */
export const ResolveIdentityDtoSchema = z.object({
  email: z.string().trim().email({ message: 'email must be a valid email address' }),
  sub: z.string().optional(),
  role: z.enum(['doctor', 'patient']).optional(),
  fullName: z.string().optional(),
});

export type ResolveIdentityDto = z.infer<typeof ResolveIdentityDtoSchema>;

/**
 * Output shape returned by POST /api/auth/resolve-identity.
 */
export interface ResolveIdentityOutputDto {
  id: string;
  email: string;
  fullName: string;
  role: string;
  created: boolean;
}
