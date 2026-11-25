import { z } from 'zod';

export const TELEMETRY_SESSION_EVENT_MAX = 500;
export const TELEMETRY_SESSION_JOURNEY_MAX = 5000;

/**
 * Schema for a single journey step submitted inside a session upsert.
 *
 * Structural validation only — PII screening happens server-side (PiiGuard).
 */
export const JourneyStepInputSchema = z
  .object({
    action: z
      .string()
      .min(1, { message: 'La acción no puede estar vacía' })
      .max(100, { message: 'La acción no puede superar 100 caracteres' }),
    resource_type: z.string().max(100).nullable().optional(),
    resource_id: z.string().max(512).nullable().optional(),
    occurred_at: z.string().datetime({
      message: 'La fecha del evento no es válida',
    }),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export type JourneyStepInput = z.infer<typeof JourneyStepInputSchema>;

/**
 * Schema for the session upsert endpoint body.
 *
 * POST /api/telemetry/session
 *
 * - session_id: opaque client-generated identifier (max 100 chars)
 * - events: journey steps to append (max 500 per request)
 * - ended: when true the server will stamp ended_at
 */
export const UpsertTelemetrySessionDtoSchema = z
  .object({
    session_id: z
      .string()
      .min(1, { message: 'El ID de sesión no puede estar vacío' })
      .max(100, { message: 'El ID de sesión no puede superar 100 caracteres' }),
    events: z.array(JourneyStepInputSchema).max(TELEMETRY_SESSION_EVENT_MAX, {
      message: `El lote supera el máximo de ${TELEMETRY_SESSION_EVENT_MAX} eventos por solicitud`,
    }),
    ended: z.boolean().optional(),
  })
  .strict();

export type UpsertTelemetrySessionDto = z.infer<typeof UpsertTelemetrySessionDtoSchema>;

/**
 * Schema for the admin session list endpoint query params.
 *
 * GET /api/telemetry/sessions
 */
export const QueryTelemetrySessionsDtoSchema = z
  .object({
    doctorId: z.string().uuid({ message: 'El ID del especialista no es válido' }).optional(),
    from: z.string().datetime({ message: 'La fecha de inicio no es válida' }).optional(),
    to: z.string().datetime({ message: 'La fecha de fin no es válida' }).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type QueryTelemetrySessionsDto = z.infer<typeof QueryTelemetrySessionsDtoSchema>;
