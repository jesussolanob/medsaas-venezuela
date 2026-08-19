import { z } from 'zod';

/** POST /finances/income-concepts */
export const CreateIncomeConceptDtoSchema = z
  .object({
    name: z.string().min(1).max(200),
  })
  .strict();

export type CreateIncomeConceptDto = z.infer<typeof CreateIncomeConceptDtoSchema>;

/** PUT /finances/income-concepts/:id */
export const UpdateIncomeConceptDtoSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Debés enviar al menos un campo' });

export type UpdateIncomeConceptDto = z.infer<typeof UpdateIncomeConceptDtoSchema>;

/** PUT /finances/transactions/:id */
export const UpdateTransactionDtoSchema = z
  .object({
    description: z.string().min(1).max(500).optional(),
    amount: z.number().positive({ message: 'El monto debe ser mayor a cero' }).optional(),
    currency: z.enum(['USD', 'BS']).optional(),
    transactionDate: z.string().datetime({ offset: true }).optional(),
    /** Only applies to income transactions. Pass null to unlink. */
    conceptId: z.string().uuid().nullable().optional(),
    /**
     * Only applies to income transactions. Pass null to unlink.
     * The supplied value is validated against the doctor's own patients (anti-IDOR).
     */
    patientId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Debés enviar al menos un campo' });

export type UpdateTransactionDto = z.infer<typeof UpdateTransactionDtoSchema>;
