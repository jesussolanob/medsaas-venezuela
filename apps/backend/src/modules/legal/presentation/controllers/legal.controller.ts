import { Controller, Get } from '@nestjs/common';
import {
  GetCurrentTermsUseCase,
  type LegalDocumentOutput,
} from '../../application/use-cases/get-current-terms.use-case';

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
 *   Response: { success: true, data: { type, version, contentHtml, updatedAt } }
 */
@Controller('legal')
export class LegalController {
  constructor(private readonly getCurrentTerms: GetCurrentTermsUseCase) {}

  @Get('terms')
  async getTerms(): Promise<SuccessResponse<LegalDocumentOutput>> {
    const data = await this.getCurrentTerms.execute();
    return { success: true, data };
  }
}
