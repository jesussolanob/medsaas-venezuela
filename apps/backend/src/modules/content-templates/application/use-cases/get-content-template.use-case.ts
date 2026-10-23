import { Inject, Injectable } from '@nestjs/common';
import {
  CONTENT_TEMPLATE_REPOSITORY,
  type IContentTemplateRepository,
} from '../../domain/repositories/icontent-template.repository';
import type { ContentTemplate } from '../../domain/entities/content-template.entity';
import { ContentTemplateNotFoundError } from '../../domain/errors/content-template-not-found.error';

@Injectable()
export class GetContentTemplateUseCase {
  constructor(
    @Inject(CONTENT_TEMPLATE_REPOSITORY)
    private readonly repo: IContentTemplateRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<ContentTemplate> {
    const template = await this.repo.findById(id);
    if (!template || !template.canBeModifiedBy(doctorId)) {
      throw new ContentTemplateNotFoundError();
    }
    return template;
  }
}
