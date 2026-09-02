import { Inject, Injectable } from '@nestjs/common';
import { normalizeForSearch } from '@delta/shared-crypto';
import type { ListQuotesQuery } from '@delta/shared-types';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
  type QuoteListResult,
} from '../../domain/repositories/iquote.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';

/**
 * Returns a paginated list of quotes for the authenticated doctor.
 *
 * Patient name filter:
 *   Patient names are AES-256-GCM encrypted — SQL LIKE is not possible.
 *   When `patient_name` is provided, we fetch all patients for the doctor,
 *   normalise + match in-memory (same algorithm as SearchPatientsUseCase),
 *   and pass the matching IDs to the repository.
 *   If no patients match the query, an empty page is returned immediately
 *   without hitting the quotes table.
 *
 * Product/item name filter works normally via SQL ILIKE on quote_items.name.
 */
@Injectable()
export class ListQuotesUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(doctorId: string, query: ListQuotesQuery): Promise<QuoteListResult> {
    // Patient name filter — two-phase lookup (decrypt in-memory, then SQL by IDs)
    let patientIds: string[] | undefined;
    if (query.patient_name) {
      const needle = normalizeForSearch(query.patient_name.trim());
      const allPatients = await this.patientRepo.findAllByDoctor(doctorId);
      patientIds = allPatients
        .filter((p) => normalizeForSearch(p.fullName).includes(needle))
        .map((p) => p.id);
      // patientIds=[] means "filter is active but no patients matched" — the
      // repository will short-circuit and return an empty page.
    }

    return this.quoteRepo.list({
      doctorId,
      status: query.status,
      productName: query.product_name,
      supplier: query.supplier,
      patientIds,
      page: query.page,
      limit: query.limit,
    });
  }
}
