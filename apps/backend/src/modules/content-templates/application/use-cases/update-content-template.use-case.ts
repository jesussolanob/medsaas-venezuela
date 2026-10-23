import { Inject, Injectable } from '@nestjs/common';
import type { UpdateContentTemplateDto } from '@delta/shared-types';
import {
  CONTENT_TEMPLATE_REPOSITORY,
  type IContentTemplateRepository,
} from '../../domain/repositories/icontent-template.repository';
import type { ContentTemplate } from '../../domain/entities/content-template.entity';
import { ContentTemplateNotFoundError } from '../../domain/errors/content-template-not-found.error';

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
    return this.repo.update(id, {
      name: dto.name !== undefined ? dto.name.trim() : undefined,
      content: dto.content !== undefined ? (dto.content as Record<string, unknown>) : undefined,
    });
  }
}
