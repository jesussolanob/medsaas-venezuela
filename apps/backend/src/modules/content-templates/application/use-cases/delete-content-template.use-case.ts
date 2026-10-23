import { Inject, Injectable } from '@nestjs/common';
import {
  CONTENT_TEMPLATE_REPOSITORY,
  type IContentTemplateRepository,
} from '../../domain/repositories/icontent-template.repository';
import { ContentTemplateNotFoundError } from '../../domain/errors/content-template-not-found.error';

@Injectable()
export class DeleteContentTemplateUseCase {
  constructor(
    @Inject(CONTENT_TEMPLATE_REPOSITORY)
    private readonly repo: IContentTemplateRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing || !existing.canBeModifiedBy(doctorId)) {
      throw new ContentTemplateNotFoundError();
    }
    await this.repo.delete(id);
  }
}
