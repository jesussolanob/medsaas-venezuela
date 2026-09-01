import { Controller, Get, Param } from '@nestjs/common';
import {
  GetPublicQuoteUseCase,
  type PublicDoctorProfile,
  type PublicTemplateConfig,
  type PublicQuoteRenderData,
} from '../../application/use-cases/get-public-quote.use-case';
import type { QuoteItem } from '../../domain/entities/quote-item.entity';

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
  constructor(private readonly getPublicQuote: GetPublicQuoteUseCase) {}

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
}
