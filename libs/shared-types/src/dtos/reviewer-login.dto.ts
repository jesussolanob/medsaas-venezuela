import { z } from 'zod';

/**
 * ReviewerLoginDtoSchema
 *
 * Strict body schema for POST /api/auth/reviewer-login.
 * Used server-side only (NestJS ZodValidationPipe) — never sent to the client.
 *
 * Both fields are required; no extra keys are allowed (strip unknown by default
 * via z.object, but explicit .strict() is added to reject unknown keys at parse
 * time rather than silently drop them).
 */
export const ReviewerLoginDtoSchema = z
  .object({
    email: z.string().email({ message: 'Email inválido' }),
    password: z.string().min(1, { message: 'Password requerido' }),
  })
  .strict();

export type ReviewerLoginDto = z.infer<typeof ReviewerLoginDtoSchema>;
