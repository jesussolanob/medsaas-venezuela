import { Inject, Injectable } from '@nestjs/common';
import type { UpdateContentTemplateDto } from '@delta/shared-types';
import {
  RecipeContentSchema,
  ParaclinicalContentSchema,
  ReposoTemplateContentSchema,
  PresupuestoTemplateContentSchema,
} from '@delta/shared-types';
import {
  CONTENT_TEMPLATE_REPOSITORY,
  type IContentTemplateRepository,
} from '../../domain/repositories/icontent-template.repository';
import type {
  ContentTemplate,
  ContentTemplateType,
} from '../../domain/entities/content-template.entity';
import { ContentTemplateNotFoundError } from '../../domain/errors/content-template-not-found.error';
import { InvalidTemplateContentError } from '../../domain/errors/invalid-template-content.error';
import type { ZodSchema } from 'zod';

/** Maps each template type to its authoritative content schema. */
const CONTENT_SCHEMA_BY_TYPE: Record<ContentTemplateType, ZodSchema> = {
  recipe: RecipeContentSchema,
  paraclinical: ParaclinicalContentSchema,
  reposo: ReposoTemplateContentSchema,
  presupuesto: PresupuestoTemplateContentSchema,
};

@Injectable()
export class UpdateContentTemplateUseCase {
  constructor(
    @Inject(CONTENT_TEMPLATE_REPOSITORY)
    private readonly repo: IContentTemplateRepository,
  ) {}

  async execute(
    id: string,
    doctorId: string,
    dto: UpdateContentTemplateDto,
  ): Promise<ContentTemplate> {
    const existing = await this.repo.findById(id);
    if (!existing || !existing.canBeModifiedBy(doctorId)) {
      throw new ContentTemplateNotFoundError();
    }

    // When content is provided, validate it against the STORED template type.
    // The DTO accepts a loose union; this guard ensures cross-type writes are rejected (422).
    let validatedContent: Record<string, unknown> | undefined;
    if (dto.content !== undefined) {
      const schema = CONTENT_SCHEMA_BY_TYPE[existing.type];
      const parsed = schema.safeParse(dto.content);
      if (!parsed.success) {
        throw new InvalidTemplateContentError(existing.type);
      }
      validatedContent = parsed.data as Record<string, unknown>;
    }

    return this.repo.update(id, {
      name: dto.name !== undefined ? dto.name.trim() : undefined,
      content: validatedContent,
    });
  }
}
