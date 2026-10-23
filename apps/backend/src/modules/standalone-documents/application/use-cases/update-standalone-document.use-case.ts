import { Inject, Injectable } from '@nestjs/common';
import type { UpdateStandaloneDocumentDto } from '@delta/shared-types';
import {
  RecipeContentSchema,
  ParaclinicalContentSchema,
  ReposoDocumentContentSchema,
} from '@delta/shared-types';
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
import { InvalidDocumentContentError } from '../../domain/errors/invalid-document-content.error';
import type { ZodSchema } from 'zod';

/** Maps each document type to its authoritative content schema. */
const CONTENT_SCHEMA_BY_TYPE: Record<StandaloneDocumentType, ZodSchema> = {
  recipe: RecipeContentSchema,
  paraclinical: ParaclinicalContentSchema,
  reposo: ReposoDocumentContentSchema,
};

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

    // Validate content against the STORED document type, not just the DTO union.
    const schema = CONTENT_SCHEMA_BY_TYPE[doc.type];
    const parsed = schema.safeParse(dto.content);
    if (!parsed.success) {
      throw new InvalidDocumentContentError(doc.type);
    }

    return this.repo.updateContent(id, parsed.data as Record<string, unknown>);
  }
}
