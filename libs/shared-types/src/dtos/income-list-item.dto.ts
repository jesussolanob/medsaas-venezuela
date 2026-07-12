import { z } from 'zod';

/**
 * Shape of each item returned by GET /api/finances/income (unified paginated list).
 *
 * source='consultation' → originates from the `payments` table (approved/pending payment).
 * source='manual'       → originates from `financial_transactions` (type='income').
 *
 * patient_name is the decrypted full name resolved owner-scoped (doctor_id gate on the
 * JOIN). Null when no patient is linked or when decryption fails.
 */
export const IncomeListItemSchema = z.object({
  id: z.string(),
  date: z.coerce.date(),
  amount_usd: z.number(),
  source: z.enum(['consultation', 'manual']),
  /** 'pending' | 'approved' — only present for consultation rows. */
  status: z.enum(['pending', 'approved']).nullable(),
  /** Concept label — only present for manual rows. */
  concept: z.string().nullable(),
  patient_id: z.string().uuid().nullable(),
  /** Decrypted patient full name — owner-scoped. Null when not linked or decryption fails. */
  patient_name: z.string().nullable(),
  /** Payment/consultation reference code — only for consultation rows. */
  reference: z.string().nullable(),
});

export type IncomeListItem = z.infer<typeof IncomeListItemSchema>;
