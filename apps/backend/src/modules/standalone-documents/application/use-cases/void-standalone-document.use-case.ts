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
    const result = await this.repo.persistVoided(id, dto.reason ?? null, voidedAt);
    // Revoke active shared links so the patient-facing viewer immediately blocks access.
    // Fire-and-forget: the render-data endpoint also rejects voided docs as a safety net.
    void this.repo.revokeActiveLinksForDocument(id);
    return result;
  }
}
