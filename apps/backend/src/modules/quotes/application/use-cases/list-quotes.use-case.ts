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
import type { Patient } from '../../../patients/domain/entities/patient.entity';
import {
  LEAD_REPOSITORY,
  type ILeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import type { Quote } from '../../domain/entities/quote.entity';

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
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
  ) {}

  async execute(doctorId: string, query: ListQuotesQuery): Promise<QuoteListResult> {
    // Patient name filter — two-phase lookup (decrypt in-memory, then SQL by IDs)
    let patientIds: string[] | undefined;
    let allPatients: Patient[] | null = null;
    if (query.patient_name) {
      const needle = normalizeForSearch(query.patient_name.trim());
      allPatients = await this.patientRepo.findAllByDoctor(doctorId);
      patientIds = allPatients
        .filter((p) => normalizeForSearch(p.fullName).includes(needle))
        .map((p) => p.id);
      // patientIds=[] means "filter is active but no patients matched" — the
      // repository will short-circuit and return an empty page.
    }

    const result = await this.quoteRepo.list({
      doctorId,
      status: query.status,
      productName: query.product_name,
      supplier: query.supplier,
      patientIds,
      page: query.page,
      limit: query.limit,
    });

    return { ...result, items: await this.withRecipientNames(doctorId, result.items, allPatients) };
  }

  /**
   * Resolves the display name of each quote's recipient.
   *
   * The list showed only the tag "Paciente"/"Prospecto", so every row looked
   * identical and there was no way to tell whose quote was whose.
   *
   * Both lookups are done ONCE per page, not per row: an N+1 over 20 quotes
   * would mean 20 round-trips, and patient names are AES-256-GCM encrypted so
   * they cannot be resolved with a SQL join anyway. When the patient_name filter
   * already loaded the patients, that list is reused instead of re-fetching.
   */
  private async withRecipientNames(
    doctorId: string,
    quotes: Quote[],
    alreadyLoadedPatients: Patient[] | null,
  ): Promise<Quote[]> {
    const needsPatient = quotes.some((q) => q.patientId !== null);
    const needsLead = quotes.some((q) => q.leadId !== null);
    if (!needsPatient && !needsLead) return quotes;

    const nameById = new Map<string, string>();

    if (needsPatient) {
      const patients = alreadyLoadedPatients ?? (await this.patientRepo.findAllByDoctor(doctorId));
      patients.forEach((p) => nameById.set(p.id, p.fullName));
    }

    if (needsLead) {
      // Leads are prospects, not patients: their names are NOT encrypted.
      const leads = await this.leadRepo.list({ doctorId });
      leads.forEach((l) =>
        nameById.set(l.id, [l.name, l.lastName].filter(Boolean).join(' ').trim()),
      );
    }

    return quotes.map((q) => {
      const key = q.patientId ?? q.leadId;
      // Null when the patient/lead was deleted — the UI falls back to the tag.
      return q.withRecipientName((key !== null ? nameById.get(key) : undefined) ?? null);
    });
  }
}
