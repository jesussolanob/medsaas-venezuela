import { Inject, Injectable } from '@nestjs/common';
import type { ListContentTemplatesQuery } from '@delta/shared-types';
import {
  CONTENT_TEMPLATE_REPOSITORY,
  type IContentTemplateRepository,
} from '../../domain/repositories/icontent-template.repository';
import type { ContentTemplate } from '../../domain/entities/content-template.entity';

@Injectable()
export class ListContentTemplatesUseCase {
  constructor(
    @Inject(CONTENT_TEMPLATE_REPOSITORY)
    private readonly repo: IContentTemplateRepository,
  ) {}

  async execute(doctorId: string, query: ListContentTemplatesQuery): Promise<ContentTemplate[]> {
    return this.repo.list({ doctorId, type: query.type });
  }
}
