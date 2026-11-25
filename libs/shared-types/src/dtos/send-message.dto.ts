import { z } from 'zod';

export const SendMessageDtoSchema = z.object({
  patient_id: z.string().uuid('El paciente indicado no es válido'),
  body: z
    .string()
    .min(1, 'El mensaje no puede estar vacío')
    .max(4000, 'El mensaje no puede superar 4000 caracteres'),
});

export type SendMessageDto = z.infer<typeof SendMessageDtoSchema>;
