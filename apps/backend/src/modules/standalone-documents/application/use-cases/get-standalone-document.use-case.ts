import { Inject, Injectable } from '@nestjs/common';
import {
  STANDALONE_DOCUMENT_REPOSITORY,
  type IStandaloneDocumentRepository,
  type StandaloneDocumentDetail,
} from '../../domain/repositories/istandalone-document.repository';
import { StandaloneDocumentNotFoundError } from '../../domain/errors/standalone-document-not-found.error';

@Injectable()
export class GetStandaloneDocumentUseCase {
  constructor(
    @Inject(STANDALONE_DOCUMENT_REPOSITORY)
    private readonly repo: IStandaloneDocumentRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<StandaloneDocumentDetail> {
    const detail = await this.repo.findByIdWithPatient(id, doctorId);
    if (!detail) {
      throw new StandaloneDocumentNotFoundError();
    }
    return detail;
  }
}
