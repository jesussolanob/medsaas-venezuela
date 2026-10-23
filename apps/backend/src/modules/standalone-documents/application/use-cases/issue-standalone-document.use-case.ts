import { Inject, Injectable } from '@nestjs/common';
import {
  STANDALONE_DOCUMENT_REPOSITORY,
  type IStandaloneDocumentRepository,
} from '../../domain/repositories/istandalone-document.repository';
import type {
  StandaloneDocument,
  StandaloneDocumentType,
} from '../../domain/entities/standalone-document.entity';
import { StandaloneDocumentNotFoundError } from '../../domain/errors/standalone-document-not-found.error';
import { StandaloneDocumentNotDraftError } from '../../domain/errors/standalone-document-not-draft.error';
import { StandaloneDocumentCodeConflictError } from '../../domain/errors/standalone-document-code-conflict.error';
import { StandaloneDocumentCodeExhaustedError } from '../../domain/errors/standalone-document-code-exhausted.error';
import {
  StandaloneDocumentCode,
  type StandaloneDocumentCodePrefix,
} from '../../domain/value-objects/standalone-document-code.vo';

const TYPE_TO_PREFIX: Record<StandaloneDocumentType, StandaloneDocumentCodePrefix> = {
  recipe: 'REC',
  paraclinical: 'PAR',
  reposo: 'REP',
};

/**
 * IssueStandaloneDocumentUseCase — transitions draft → issued, assigning a code.
 *
 * Code generation strategy (race-condition safe, mirrors CreateConsultationUseCase):
 *   1. Get the max existing sequence for this doctor + prefix + month.
 *   2. Attempt to UPDATE the row to issued + code. If the DB UNIQUE constraint
 *      fires (two concurrent requests collide), the repository translates
 *      UniqueConstraintError → StandaloneDocumentCodeConflictError.
 *   3. On conflict, increment sequence and retry — up to MAX_RETRIES times.
 *   4. If all attempts exhausted, throw StandaloneDocumentCodeExhaustedError.
 */
@Injectable()
export class IssueStandaloneDocumentUseCase {
  constructor(
    @Inject(STANDALONE_DOCUMENT_REPOSITORY)
    private readonly repo: IStandaloneDocumentRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<StandaloneDocument> {
    const doc = await this.repo.findById(id);
    if (!doc || !doc.canBeModifiedBy(doctorId)) {
      throw new StandaloneDocumentNotFoundError();
    }
    if (!doc.isInDraft()) {
      throw new StandaloneDocumentNotDraftError();
    }

    const issuedAt = new Date();
    const prefix = TYPE_TO_PREFIX[doc.type];
    const yearMonth = StandaloneDocumentCode.toCaracasYearMonth(issuedAt);

    const maxSequence = await this.repo.getMaxSequenceForMonth(doctorId, prefix, yearMonth);
    let sequence = maxSequence + 1;

    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const codeVo = StandaloneDocumentCode.generate(prefix, issuedAt, sequence);
      try {
        return await this.repo.persistIssued(id, codeVo.value, issuedAt);
      } catch (err) {
        if (err instanceof StandaloneDocumentCodeConflictError) {
          sequence += 1;
          continue;
        }
        throw err;
      }
    }

    throw new StandaloneDocumentCodeExhaustedError(yearMonth);
  }
}
