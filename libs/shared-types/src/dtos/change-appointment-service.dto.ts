import { z } from 'zod';

/**
 * DTO para PATCH /appointments/:id/service — corregir el servicio contratado.
 *
 * Solo viaja el servicio nuevo: la cita sale de la URL y el actor de la sesión,
 * para que ninguno de los dos se pueda falsear desde el cuerpo.
 *
 * El backend exige que el servicio nuevo tenga el MISMO número de consultas que
 * el actual, y arrastra el cambio a todo el paquete.
 */
export const ChangeAppointmentServiceDtoSchema = z
  .object({
    plan_id: z.string().uuid(),
  })
  .strict();

export type ChangeAppointmentServiceDto = z.infer<typeof ChangeAppointmentServiceDtoSchema>;
