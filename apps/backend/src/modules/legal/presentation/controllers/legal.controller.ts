import { Controller, Get } from '@nestjs/common';
import {
  GetCurrentTermsUseCase,
  type LegalDocumentOutput,
} from '../../application/use-cases/get-current-terms.use-case';
import { GetCurrentPrivacyUseCase } from '../../application/use-cases/get-current-privacy.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * LegalController — public endpoints for legal documents.
 *
 * No auth required — these endpoints are publicly accessible.
 *
 * GET /api/legal/terms
 *   Returns the current Terms & Conditions document.
 * GET /api/legal/privacy
 *   Returns the current Privacy Policy document.
 *   Response: { success: true, data: { type, version, contentHtml, updatedAt } }
 */
@Controller('legal')
export class LegalController {
  constructor(
    private readonly getCurrentTerms: GetCurrentTermsUseCase,
    private readonly getCurrentPrivacy: GetCurrentPrivacyUseCase,
  ) {}

  @Get('terms')
  async getTerms(): Promise<SuccessResponse<LegalDocumentOutput>> {
    const data = await this.getCurrentTerms.execute();
    return { success: true, data };
  }

  @Get('privacy')
  async getPrivacy(): Promise<SuccessResponse<LegalDocumentOutput>> {
    const data = await this.getCurrentPrivacy.execute();
    return { success: true, data };
  }
}
