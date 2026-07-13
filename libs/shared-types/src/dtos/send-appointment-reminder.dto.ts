import { z } from 'zod';

/**
 * DTO for POST /api/doctor/reminders/send-email
 *
 * The caller must supply exactly one identifier so the use-case can resolve
 * the appointment (and through it, the patient and scheduling data).
 *
 * appointment_id is preferred because it is the most direct path:
 *   appointment → patient_id / patientEmail / scheduledAt / planName / appointmentCode
 *
 * At least one of appointment_id or consultation_id must be present;
 * both may be supplied simultaneously (appointment_id takes precedence).
 */
export const SendAppointmentReminderDtoSchema = z
  .object({
    /** UUID of the appointment whose patient should receive the reminder. */
    appointment_id: z.string().uuid().optional(),
    /**
     * UUID of the consultation linked to the appointment.
     * Used as a fallback when appointment_id is not known by the UI layer.
     */
    consultation_id: z.string().uuid().optional(),
  })
  .refine((v) => v.appointment_id !== undefined || v.consultation_id !== undefined, {
    message: 'Se requiere appointment_id o consultation_id',
  });

export type SendAppointmentReminderDto = z.infer<typeof SendAppointmentReminderDtoSchema>;
