import { Inject, Injectable } from '@nestjs/common';
import type { UpdateStandaloneDocumentDto } from '@delta/shared-types';
import {
  STANDALONE_DOCUMENT_REPOSITORY,
  type IStandaloneDocumentRepository,
} from '../../domain/repositories/istandalone-document.repository';
import type { StandaloneDocument } from '../../domain/entities/standalone-document.entity';
import { StandaloneDocumentNotFoundError } from '../../domain/errors/standalone-document-not-found.error';
import { StandaloneDocumentNotDraftError } from '../../domain/errors/standalone-document-not-draft.error';

@Injectable()
export class UpdateStandaloneDocumentUseCase {
  constructor(
    @Inject(STANDALONE_DOCUMENT_REPOSITORY)
    private readonly repo: IStandaloneDocumentRepository,
  ) {}

  async execute(
    id: string,
    doctorId: string,
    dto: UpdateStandaloneDocumentDto,
  ): Promise<StandaloneDocument> {
    const doc = await this.repo.findById(id);
    if (!doc || !doc.canBeModifiedBy(doctorId)) {
      throw new StandaloneDocumentNotFoundError();
    }
    if (!doc.isInDraft()) {
      throw new StandaloneDocumentNotDraftError();
    }
    return this.repo.updateContent(id, dto.content as Record<string, unknown>);
  }
}
