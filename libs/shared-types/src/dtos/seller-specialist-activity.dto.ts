import { z } from 'zod';

/**
 * Follow-up status values for the seller commercial tracking workflow.
 *
 * 'sin_contactar' is the implicit default (returned when no status_change row
 * exists for a specialist). It is NEVER stored in the DB — only computed.
 *
 * All other values can be stored as `to_status` in seller_specialist_activities.
 */
export const FOLLOW_UP_STATUS_VALUES = [
  'sin_contactar',
  'primer_contacto',
  'no_atendio',
  'completar_onboarding',
  'induccion',
  'reactivar',
  'desistido',
] as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUS_VALUES)[number];

/** Spanish labels for each follow-up status (es-VE). */
export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  sin_contactar: 'Sin contactar',
  primer_contacto: 'Primer contacto realizado',
  no_atendio: 'No atendió',
  completar_onboarding: 'Completar onboarding',
  induccion: 'Inducción',
  reactivar: 'Reactivar',
  desistido: 'Desistido',
};

/**
 * Statuses that can actually be stored in the DB (all except 'sin_contactar',
 * which is implicit and never persisted).
 */
export const STORABLE_FOLLOW_UP_STATUSES = [
  'primer_contacto',
  'no_atendio',
  'completar_onboarding',
  'induccion',
  'reactivar',
  'desistido',
] as const satisfies ReadonlyArray<Exclude<FollowUpStatus, 'sin_contactar'>>;

export type StorableFollowUpStatus = (typeof STORABLE_FOLLOW_UP_STATUSES)[number];

/**
 * Body schema for POST /api/seller/specialists/:id/activities.
 *
 * Rules enforced by Zod:
 *   - At least one of `status` or `comment` must be present.
 *   - `comment` is trimmed at the application layer before validation; Zod
 *     enforces the max-2000 bound.
 *
 * Rules enforced by the use case (domain):
 *   - If status equals the current status AND no comment → 422 "El especialista
 *     ya está en ese estado".
 */
export const AddSpecialistActivityBodySchema = z
  .object({
    status: z.enum(STORABLE_FOLLOW_UP_STATUSES).optional(),
    comment: z
      .string()
      .min(1, 'El comentario no puede estar vacío.')
      .max(2000, 'El comentario no puede exceder 2000 caracteres.')
      .optional(),
  })
  .strict()
  .refine((b) => b.status !== undefined || b.comment !== undefined, {
    message: 'Se requiere al menos un estado o comentario.',
  });

export type AddSpecialistActivityBody = z.infer<typeof AddSpecialistActivityBodySchema>;
