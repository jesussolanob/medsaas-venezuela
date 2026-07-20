import { z } from 'zod';

/**
 * DTO for POST /api/public/appointments/confirm
 *
 * Stateless HMAC token that encodes appointmentId + signature.
 * Validated server-side in AppointmentConfirmTokenService.verify().
 */
export const ConfirmAppointmentSchema = z.object({
  token: z.string().min(1, 'token is required'),
});

export type ConfirmAppointmentDto = z.infer<typeof ConfirmAppointmentSchema>;

/**
 * DTO for GET /api/public/appointments/confirm-info?token=...
 *
 * Same token — used to fetch appointment info without confirming.
 */
export const ConfirmAppointmentInfoQuerySchema = z.object({
  token: z.string().min(1, 'token is required'),
});

export type ConfirmAppointmentInfoQueryDto = z.infer<typeof ConfirmAppointmentInfoQuerySchema>;
