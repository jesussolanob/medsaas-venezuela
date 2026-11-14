import { z } from 'zod';
import { cedulaSchema } from '../common';

/**
 * DTOs for the seller specialist-invitation endpoint.
 *
 * POST /api/seller/specialist-invitations
 *
 * A seller pre-registers a specialist on their behalf. The specialist receives
 * an invitation email with login instructions. When they first log in via Auth0,
 * the resolve-identity service finds the pre-created profile and skips the
 * profile-creation step (onboarding resumes at the office step).
 *
 * Business rules enforced by the use case (not by Zod):
 *   - email uniqueness → 409 SpecialistEmailConflictError
 *   - cédula uniqueness → 409 SpecialistCedulaConflictError (requires cedula)
 *   - sold_by comes from the authenticated session, never from the body
 *   - plan is always free_trial — sellers cannot assign paid plans
 *
 * SECURITY: all fields are PII — NEVER log this body or the validated DTO.
 */
export const InviteSellerSpecialistBodySchema = z
  .object({
    /**
     * First name of the specialist being invited.
     * Required so the invitation email can address them by name.
     */
    first_name: z.string().min(1, 'El nombre es requerido').max(150),

    /**
     * Last name of the specialist being invited.
     */
    last_name: z.string().min(1, 'El apellido es requerido').max(150),

    /**
     * Venezuelan cédula in V/E/P-<value> format (e.g. V-12345678).
     * Required to detect duplicates before the INSERT; there is no DB
     * unique constraint on cedula.
     */
    cedula: cedulaSchema,

    /**
     * WhatsApp-compatible phone number.
     * Required so the seller can follow up after the invitation.
     * SECURITY: PII — do NOT log.
     */
    phone: z.string().min(7, 'El teléfono es requerido').max(50),

    /**
     * Email address the specialist will use to log in via Auth0.
     * Required: the entire point of an invitation is to send this person login
     * instructions. A specialist without an email can never match an Auth0
     * identity, so the profile would become permanently orphaned.
     * SECURITY: PII — do NOT log.
     */
    email: z.string().email('El correo debe ser una dirección válida').max(320),

    /**
     * Medical specialty (free text). Optional.
     * Examples: "Cardiología", "Medicina Interna", "Odontología".
     */
    specialty: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();

export type InviteSellerSpecialistBody = z.infer<typeof InviteSellerSpecialistBodySchema>;
