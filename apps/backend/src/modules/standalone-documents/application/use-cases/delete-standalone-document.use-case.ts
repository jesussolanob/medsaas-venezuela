import { Inject, Injectable } from '@nestjs/common';
import {
  STANDALONE_DOCUMENT_REPOSITORY,
  type IStandaloneDocumentRepository,
} from '../../domain/repositories/istandalone-document.repository';
import { StandaloneDocumentNotFoundError } from '../../domain/errors/standalone-document-not-found.error';
import { StandaloneDocumentNotDraftError } from '../../domain/errors/standalone-document-not-draft.error';

@Injectable()
export class DeleteStandaloneDocumentUseCase {
  constructor(
    @Inject(STANDALONE_DOCUMENT_REPOSITORY)
    private readonly repo: IStandaloneDocumentRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<void> {
    const doc = await this.repo.findById(id);
    if (!doc || !doc.canBeModifiedBy(doctorId)) {
      throw new StandaloneDocumentNotFoundError();
    }
    if (!doc.isInDraft()) {
      throw new StandaloneDocumentNotDraftError();
    }
    await this.repo.delete(id);
  }
}
