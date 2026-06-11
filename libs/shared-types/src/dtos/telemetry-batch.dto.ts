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
      .min(1, { message: 'action must not be empty' })
      .max(200, { message: 'action max length is 200' }),
    resource_type: z.string().max(100).nullable().optional(),
    resource_id: z.string().max(512).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    occurred_at: z.string().datetime({
      message: 'occurred_at must be a valid ISO 8601 datetime',
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
      .min(1, { message: 'events array must not be empty' })
      .max(TELEMETRY_BATCH_MAX, {
        message: `Batch exceeds maximum of ${TELEMETRY_BATCH_MAX} events`,
      }),
  })
  .strict();

export type IngestTelemetryBatchDto = z.infer<typeof IngestTelemetryBatchDtoSchema>;

/**
 * Schema for the admin query endpoint query params.
 */
export const QueryDoctorEventsDtoSchema = z
  .object({
    doctorId: z.string().uuid({ message: 'doctorId must be a valid UUID' }),
    from: z.string().datetime({ message: 'from must be a valid ISO 8601 datetime' }).optional(),
    to: z.string().datetime({ message: 'to must be a valid ISO 8601 datetime' }).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type QueryDoctorEventsDto = z.infer<typeof QueryDoctorEventsDtoSchema>;
