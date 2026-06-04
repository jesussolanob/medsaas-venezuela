import { z } from 'zod';
import { UserRoleSchema } from '@delta/shared-types';

/**
 * DTO for the PUT /api/admin/role-capabilities endpoint.
 *
 * Validates that:
 *   - role is one of the known UserRole values.
 *   - module_key is a non-empty string.
 *   - action is one of the four capability actions.
 *   - allowed is a boolean.
 */
export const SetCapabilityDtoSchema = z.object({
  role: UserRoleSchema,
  module_key: z.string().min(1),
  action: z.enum(['view', 'create', 'edit', 'delete']),
  allowed: z.boolean(),
});

export type SetCapabilityDto = z.infer<typeof SetCapabilityDtoSchema>;
