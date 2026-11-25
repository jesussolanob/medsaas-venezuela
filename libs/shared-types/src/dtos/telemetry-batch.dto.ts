import { z } from 'zod';

export const TELEMETRY_BATCH_MAX = 200;

/**
 * Schema for a single telemetry event submitted by the frontend.
 *
 * All PII validation happens server-side in the domain layer (PiiGuard).
 * The DTO only enforces structural correctness.
 */
export const TelemetryEventInputSchema = z
  .object({
    action: z
      .string()
      .min(1, { message: 'La acción no puede estar vacía' })
      .max(200, { message: 'La acción no puede superar 200 caracteres' }),
    resource_type: z.string().max(100).nullable().optional(),
    resource_id: z.string().max(512).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    occurred_at: z.string().datetime({
      message: 'La fecha del evento no es válida',
    }),
    session_id: z.string().max(200).nullable().optional(),
  })
  .strict();

export type TelemetryEventInput = z.infer<typeof TelemetryEventInputSchema>;

/**
 * Schema for the batch ingestion endpoint body.
 *
 * Maximum 200 events per request (TELEMETRY_BATCH_MAX).
 */
export const IngestTelemetryBatchDtoSchema = z
  .object({
    events: z
      .array(TelemetryEventInputSchema)
      .min(1, { message: 'El arreglo de eventos no puede estar vacío' })
      .max(TELEMETRY_BATCH_MAX, {
        message: `El lote supera el máximo de ${TELEMETRY_BATCH_MAX} eventos`,
      }),
  })
  .strict();

export type IngestTelemetryBatchDto = z.infer<typeof IngestTelemetryBatchDtoSchema>;

/**
 * Schema for the admin query endpoint query params.
 */
export const QueryDoctorEventsDtoSchema = z
  .object({
    doctorId: z.string().uuid({ message: 'El ID del especialista no es válido' }),
    from: z.string().datetime({ message: 'La fecha de inicio no es válida' }).optional(),
    to: z.string().datetime({ message: 'La fecha de fin no es válida' }).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type QueryDoctorEventsDto = z.infer<typeof QueryDoctorEventsDtoSchema>;
