import { z } from 'zod';

// ---------------------------------------------------------------------------
// Doctor-side: create a new patient request
// ---------------------------------------------------------------------------

export const CreatePatientRequestDtoSchema = z.object({
  patientId: z.string().uuid('El ID del paciente debe ser un UUID válido'),
  title: z
    .string()
    .trim()
    .min(1, 'El título es requerido')
    .max(200, 'El título no puede superar los 200 caracteres'),
  description: z
    .string()
    .trim()
    .max(1000, 'La descripción no puede superar los 1000 caracteres')
    .nullable()
    .optional()
    .default(null),
});

export type CreatePatientRequestDto = z.infer<typeof CreatePatientRequestDtoSchema>;

// ---------------------------------------------------------------------------
// Public: verify code + cédula → session token
// ---------------------------------------------------------------------------

export const VerifyPatientRequestCodeDtoSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, 'El código debe tener exactamente 6 dígitos')
    .regex(/^\d{6}$/, 'El código debe contener solo dígitos'),
  cedula: z
    .string()
    .trim()
    .min(5, 'La cédula debe tener al menos 5 caracteres')
    .max(30, 'La cédula no puede superar los 30 caracteres'),
});

export type VerifyPatientRequestCodeDto = z.infer<typeof VerifyPatientRequestCodeDtoSchema>;

// ---------------------------------------------------------------------------
// Public: submit response (mark as fulfilled)
//
// NOTE: sessionToken is intentionally NOT in this DTO — it is transmitted via
// the `X-Session-Token` header to prevent it from appearing in request-body
// access logs.
// ---------------------------------------------------------------------------

export const SubmitPatientRequestDtoSchema = z.object({
  responseText: z
    .string()
    .trim()
    .max(5000, 'La respuesta no puede superar los 5000 caracteres')
    .nullable()
    .optional()
    .default(null),
});

export type SubmitPatientRequestDto = z.infer<typeof SubmitPatientRequestDtoSchema>;
