import type { IncomeConcept } from '../entities/income-concept.entity';

export const INCOME_CONCEPT_REPOSITORY = 'INCOME_CONCEPT_REPOSITORY';

export interface IIncomeConceptRepository {
  /** List active concepts for a doctor, ordered by sort_order ASC. */
  findActiveByDoctor(doctorId: string): Promise<IncomeConcept[]>;

  /** Find any concept by id (active or inactive). */
  findById(id: string): Promise<IncomeConcept | null>;

  /** Persist a new concept. */
  save(concept: IncomeConcept): Promise<IncomeConcept>;

  /** Persist changes to an existing concept. */
  update(concept: IncomeConcept): Promise<IncomeConcept>;
}
