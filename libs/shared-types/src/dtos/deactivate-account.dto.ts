import { z } from 'zod';

/**
 * Body for POST /api/doctor/account/deactivate — a specialist switching their
 * own account off from Configuración.
 *
 * There is no id field on purpose: the target is always the authenticated
 * caller, taken from the token. Accepting an id here would turn a self-service
 * action into a way to switch off somebody else's account.
 */
export const DeactivateAccountDtoSchema = z
  .object({
    /** Optional free text: why they are leaving. Stored for support context. */
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();

export type DeactivateAccountDto = z.infer<typeof DeactivateAccountDtoSchema>;
