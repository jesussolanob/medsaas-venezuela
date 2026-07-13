import { z } from 'zod';

/**
 * Six fixed expense categories for breakdown reporting.
 * Null / absent = uncategorised (surfaced as 'other' in summary breakdowns).
 */
export const EXPENSE_CONCEPTS = [
  'rent',
  'staff',
  'supplies',
  'services',
  'taxes',
  'other',
] as const;
export type ExpenseConceptValue = (typeof EXPENSE_CONCEPTS)[number];

/**
 * DTO for POST /finances/income and POST /finances/expense.
 * doctor_id is NOT included — always taken from authenticated user (anti-IDOR).
 */
export const RecordFinanceEntryDtoSchema = z
  .object({
    amount: z.number().positive({ message: 'Amount must be greater than zero' }),
    currency: z.enum(['USD', 'BS']).default('USD'),
    description: z.string().min(1).max(500),
    related_consultation_id: z.string().uuid().nullable().optional(),
    /** ISO date string for the transaction date. Defaults to now if omitted. */
    date: z.string().datetime({ offset: true }).optional(),
    /** Optional link to an income_concept (only for income entries). */
    conceptId: z.string().uuid().nullable().optional(),
    /**
     * Optional patient link (income entries only).
     * When related_consultation_id is present, this value is ignored and the
     * patient is derived from the consultation (anti-IDOR).
     * When absent, the doctor may supply a patientId manually.
     */
    patientId: z.string().uuid().nullable().optional(),
    /**
     * Expense category (expense entries only). Validated against the fixed enum.
     * Income entries must not set this field.
     */
    concept: z.enum(EXPENSE_CONCEPTS).nullable().optional(),
  })
  .strict();

export type RecordFinanceEntryDto = z.infer<typeof RecordFinanceEntryDtoSchema>;

/** DTO for POST /admin/settings/usdt-rate */
export const UpdateUsdtRateDtoSchema = z
  .object({
    rate: z.number().positive({ message: 'Rate must be greater than zero' }),
  })
  .strict();

export type UpdateUsdtRateDto = z.infer<typeof UpdateUsdtRateDtoSchema>;
