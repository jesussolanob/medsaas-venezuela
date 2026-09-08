import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PublicQuoteStatusDtoSchema, type PublicQuoteStatusDto } from '@delta/shared-types';
import {
  GetPublicQuoteUseCase,
  type PublicDoctorProfile,
  type PublicTemplateConfig,
  type PublicQuoteRenderData,
} from '../../application/use-cases/get-public-quote.use-case';
import { UpdatePublicQuoteStatusUseCase } from '../../application/use-cases/update-public-quote-status.use-case';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import type { QuoteItem } from '../../domain/entities/quote-item.entity';
import type { QuoteStatus } from '../../domain/entities/quote.entity';

interface PublicQuoteItemResponse {
  kind: string;
  name: string;
  description: string;
  quantity: number;
  unitPriceUsd: number;
  amountUsd: number;
  sortOrder: number;
}

interface PublicQuoteResponse {
  success: true;
  data: {
    quoteNumber: string;
    status: string;
    validUntil: string | null;
    notes: string;
    subtotalUsd: number;
    discountType: string;
    discountValue: number;
    discountUsd: number;
    totalUsd: number;
    bcvRate: number | null;
    totalBs: number | null;
    sentAt: string | null;
    items: PublicQuoteItemResponse[];
    /** Doctor branding — name, specialty, MPPS, logo, signature. No contact PII. */
    doctor: PublicDoctorProfile;
    /** PDF template config (null when doctor has no template configured). */
    templateConfig: PublicTemplateConfig | null;
    /**
     * Full name of the recipient for the PDF "Destinatario" section.
     * Decrypted patient name or lead name. Null only when neither record is found.
     * Cédula, phone, email and clinical data are never included.
     */
    recipient_name: string | null;
  };
}

/**
 * PublicQuotesController — unauthenticated public view of a quote.
 *
 * SECURITY:
 *   - NO AppAuthGuard — this endpoint is intentionally public.
 *   - Access is controlled solely by the share-link token (48-byte CSPRNG).
 *   - Response excludes ALL patient PII (cedula, phone, email, diagnosis).
 *   - Doctor contact details (phone, email) are also excluded — only branding
 *     fields (name, specialty, MPPS, logo, signature) are returned.
 *   - Expired or revoked tokens return 404 (QuoteLinkExpiredError).
 *   - Logo / signature URLs are re-signed at read time — they won't be stale.
 *
 * Route: GET /api/quotes/:token
 * (controller prefix is 'quotes'; global prefix 'api' is set in main.ts)
 */
@Controller('quotes')
export class PublicQuotesController {
  constructor(
    private readonly getPublicQuote: GetPublicQuoteUseCase,
    private readonly updatePublicQuoteStatus: UpdatePublicQuoteStatusUseCase,
  ) {}

  /**
   * GET /api/quotes/:token
   *
   * Returns the quote, its line items, the doctor's branding block, and the
   * template configuration needed to render the PDF — all without authentication.
   *
   * The frontend uses this payload to:
   *   1. Display / render the quote document client-side.
   *   2. Download a PDF (optionally server-rendered in a future iteration).
   */
  @Get(':token')
  async show(@Param('token') token: string): Promise<PublicQuoteResponse> {
    const result: PublicQuoteRenderData = await this.getPublicQuote.execute(token);
    const { quote, doctor, templateConfig, recipientName } = result;

    const items: PublicQuoteItemResponse[] = quote.items
      .slice()
      .sort((a: QuoteItem, b: QuoteItem) => a.sortOrder - b.sortOrder)
      .map((it: QuoteItem) => ({
        kind: it.kind,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unitPriceUsd: it.unitPriceUsd,
        amountUsd: it.amountUsd,
        sortOrder: it.sortOrder,
      }));

    return {
      success: true,
      data: {
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        validUntil: quote.validUntil?.toISOString().split('T')[0] ?? null,
        notes: quote.notes,
        subtotalUsd: quote.subtotalUsd,
        discountType: quote.discountType,
        discountValue: quote.discountValue,
        discountUsd: quote.discountUsd,
        totalUsd: quote.totalUsd,
        bcvRate: quote.bcvRate,
        totalBs: quote.totalBs,
        sentAt: quote.sentAt?.toISOString() ?? null,
        items,
        doctor,
        templateConfig,
        recipient_name: recipientName,
      },
    };
  }

  /**
   * POST /api/quotes/:token/status
   *
   * Lets the recipient accept or reject the quote from the public share-link
   * view. No auth — the token is the sole credential, same as GET /:token.
   *
   * Only 'sent' → 'accepted' | 'rejected' is allowed; any other transition
   * (already-terminal quote, still a draft) throws QuoteInvalidStatusTransitionError
   * (422). An invalid/expired/revoked token throws QuoteLinkExpiredError (404).
   *
   * Does NOT create an appointment — see UpdatePublicQuoteStatusUseCase.
   */
  @Post(':token/status')
  async updateStatus(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(PublicQuoteStatusDtoSchema)) dto: PublicQuoteStatusDto,
  ): Promise<{ success: true; data: { status: QuoteStatus } }> {
    const quote = await this.updatePublicQuoteStatus.execute(token, dto);
    return { success: true, data: { status: quote.status } };
  }
}
