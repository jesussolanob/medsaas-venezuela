import { Inject, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(VoidStandaloneDocumentUseCase.name);

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
    // Revoca los enlaces compartidos para que el visor del paciente bloquee el acceso.
    // Se ESPERA y se atrapa: un `void promesa` sin catch es un rechazo no manejado, y
    // en Node 22 eso tumba el proceso. Si falla, la anulación ya quedó hecha y el visor
    // igual rechaza documentos que no están emitidos (red de seguridad).
    try {
      await this.repo.revokeActiveLinksForDocument(id);
    } catch (err: unknown) {
      this.logger.warn(
        `[void-standalone] no se pudieron revocar los enlaces de ${id} (no fatal): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    return result;
  }
}
