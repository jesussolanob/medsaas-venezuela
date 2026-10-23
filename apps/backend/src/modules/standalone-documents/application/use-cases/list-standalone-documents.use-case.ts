import { Inject, Injectable } from '@nestjs/common';
import type { ListStandaloneDocumentsQuery } from '@delta/shared-types';
import {
  STANDALONE_DOCUMENT_REPOSITORY,
  type IStandaloneDocumentRepository,
  type StandaloneDocumentSummary,
} from '../../domain/repositories/istandalone-document.repository';

@Injectable()
export class ListStandaloneDocumentsUseCase {
  constructor(
    @Inject(STANDALONE_DOCUMENT_REPOSITORY)
    private readonly repo: IStandaloneDocumentRepository,
  ) {}

  async execute(
    doctorId: string,
    query: ListStandaloneDocumentsQuery,
  ): Promise<StandaloneDocumentSummary[]> {
    return this.repo.list({
      doctorId,
      patientId: query.patient_id,
      type: query.type,
      status: query.status,
    });
  }
}
