import { Inject, Injectable } from '@nestjs/common';
import type { VoidStandaloneDocumentDto } from '@delta/shared-types';
import {
  STANDALONE_DOCUMENT_REPOSITORY,
  type IStandaloneDocumentRepository,
} from '../../domain/repositories/istandalone-document.repository';
import type { StandaloneDocument } from '../../domain/entities/standalone-document.entity';
import { StandaloneDocumentNotFoundError } from '../../domain/errors/standalone-document-not-found.error';
import { StandaloneDocumentNotIssuedError } from '../../domain/errors/standalone-document-not-issued.error';

@Injectable()
export class VoidStandaloneDocumentUseCase {
  constructor(
    @Inject(STANDALONE_DOCUMENT_REPOSITORY)
    private readonly repo: IStandaloneDocumentRepository,
  ) {}

  async execute(
    id: string,
    doctorId: string,
    dto: VoidStandaloneDocumentDto,
  ): Promise<StandaloneDocument> {
    const doc = await this.repo.findById(id);
    if (!doc || !doc.canBeModifiedBy(doctorId)) {
      throw new StandaloneDocumentNotFoundError();
    }
    if (!doc.isIssued()) {
      throw new StandaloneDocumentNotIssuedError();
    }
    const voidedAt = new Date();
    return this.repo.persistVoided(id, dto.reason ?? null, voidedAt);
  }
}
