import { Inject, Injectable } from '@nestjs/common';
import type { CreateContentTemplateDto } from '@delta/shared-types';
import {
  CONTENT_TEMPLATE_REPOSITORY,
  type IContentTemplateRepository,
} from '../../domain/repositories/icontent-template.repository';
import type { ContentTemplate } from '../../domain/entities/content-template.entity';

@Injectable()
export class CreateContentTemplateUseCase {
  constructor(
    @Inject(CONTENT_TEMPLATE_REPOSITORY)
    private readonly repo: IContentTemplateRepository,
  ) {}

  async execute(dto: CreateContentTemplateDto, doctorId: string): Promise<ContentTemplate> {
    return this.repo.create({
      doctorId,
      type: dto.type,
      name: dto.name.trim(),
      content: dto.content as Record<string, unknown>,
    });
  }
}
