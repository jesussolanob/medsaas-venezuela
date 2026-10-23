import { Inject, Injectable } from '@nestjs/common';
import type { ListContentTemplatesQuery } from '@delta/shared-types';
import {
  CONTENT_TEMPLATE_REPOSITORY,
  type IContentTemplateRepository,
} from '../../domain/repositories/icontent-template.repository';
import type { ContentTemplate } from '../../domain/entities/content-template.entity';

/** Hard upper bound on content-template list results to prevent unbounded queries. */
const MAX_TEMPLATES_PER_LIST = 500;

@Injectable()
export class ListContentTemplatesUseCase {
  constructor(
    @Inject(CONTENT_TEMPLATE_REPOSITORY)
    private readonly repo: IContentTemplateRepository,
  ) {}

  async execute(doctorId: string, query: ListContentTemplatesQuery): Promise<ContentTemplate[]> {
    const results = await this.repo.list({ doctorId, type: query.type });
    // Enforce hard cap — the repo may return more if the DB grows beyond this limit.
    return results.slice(0, MAX_TEMPLATES_PER_LIST);
  }
}
