import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  INVOICE_REPOSITORY,
  type IInvoiceRepository,
} from '../../../domain/repositories/invoice.repository';
import {
  PROFILE_LOOKUP_REPOSITORY,
  type IProfileLookupRepository,
} from '../../../domain/repositories/profile-lookup.repository';
import { EMAIL_PORT } from '../../../../email/application/ports/email.port';
import type { IEmailPort } from '../../../../email/application/ports/email.port';
import { InvoiceNotFoundError } from '../../../domain/errors/invoice-not-found.error';
import type { Invoice } from '../../../domain/entities/invoice.entity';

export interface SendInvoiceEmailInput {
  invoiceId: string;
}

export interface SendInvoiceEmailOutput {
  invoice: Invoice;
  /** True if the email was dispatched without error; false if suppressed or failed. */
  emailSent: boolean;
}

/**
 * Marks an invoice as 'sent' and dispatches it by email to the doctor.
 *
 * IMPORTANT DESIGN DECISIONS:
 * - Email failure is intentionally non-fatal. If the email adapter throws,
 *   the invoice is still marked 'sent' and the operation returns successfully.
 *   A warning is logged (without PII) so the operator can retry.
 * - We never log the HTML body, the recipient address, or any invoice amounts
 *   that could indirectly identify a patient.
 * - Doctor email is admin-only PII — it must never appear in application logs.
 */
@Injectable()
export class SendInvoiceEmailUseCase {
  private readonly logger = new Logger(SendInvoiceEmailUseCase.name);

  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(PROFILE_LOOKUP_REPOSITORY)
    private readonly profileRepo: IProfileLookupRepository,
    @Inject(EMAIL_PORT)
    private readonly emailPort: IEmailPort,
  ) {}

  async execute(input: SendInvoiceEmailInput): Promise<SendInvoiceEmailOutput> {
    // 1. Validate invoice exists
    const invoice = await this.invoiceRepo.findById(input.invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError(input.invoiceId);
    }

    // 2. Mark as sent in the database
    const sentInvoice = await this.invoiceRepo.markSent(input.invoiceId);

    // 3. Resolve doctor email (admin-only PII — never log)
    let emailSent = false;
    const doctorProfile = await this.profileRepo.findById(invoice.doctorId);

    if (!doctorProfile) {
      this.logger.warn(
        `[send-invoice] Doctor profile not found for invoice ${input.invoiceId} — email skipped`,
      );
      return { invoice: sentInvoice, emailSent };
    }

    // 4. Build and send email — failure must not roll back the sent status
    try {
      const html = this.buildInvoiceHtml({
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        currency: invoice.currency,
        description: invoice.description,
        issuedAt: invoice.issuedAt,
        doctorName: doctorProfile.fullName,
      });

      await this.emailPort.send({
        to: doctorProfile.email,
        subject: `Factura Delta Medical ${invoice.invoiceNumber}`,
        html,
      });

      emailSent = true;
    } catch (err: unknown) {
      // Log warning without PII (no recipient, no amount, no doctor name)
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(
        `[send-invoice] Email delivery failed for invoice ${input.invoiceId}: ${message}`,
      );
    }

    return { invoice: sentInvoice, emailSent };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildInvoiceHtml(params: {
    invoiceNumber: string;
    amount: number;
    currency: string;
    description: string | null;
    issuedAt: Date | null;
    doctorName: string;
  }): string {
    const issuedDate = params.issuedAt
      ? params.issuedAt.toLocaleDateString('es-VE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : new Date().toLocaleDateString('es-VE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

    const amountFormatted = `${params.currency} ${params.amount.toFixed(2)}`;
    const description = params.description ?? 'Suscripción mensual Delta Medical';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Factura ${params.invoiceNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1a1a2e; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; }
    .header { background: #1a73e8; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .invoice-table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    .invoice-table th, .invoice-table td { text-align: left; padding: 10px 12px; font-size: 14px; }
    .invoice-table th { background: #f0f4ff; color: #1a73e8; font-weight: 600; }
    .invoice-table td { border-bottom: 1px solid #eee; }
    .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #1a73e8; border-bottom: none; }
    .footer { padding: 20px 32px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Factura de Suscripción</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>${params.doctorName}</strong>,</p>
      <p>Adjuntamos el detalle de su factura correspondiente al servicio de plataforma Delta Medical.</p>

      <table class="invoice-table">
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Número de factura</td>
            <td>${params.invoiceNumber}</td>
          </tr>
          <tr>
            <td>Fecha de emisión</td>
            <td>${issuedDate}</td>
          </tr>
          <tr>
            <td>Descripción</td>
            <td>${description}</td>
          </tr>
          <tr class="total-row">
            <td>Total a pagar</td>
            <td>${amountFormatted}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top: 24px; font-size: 13px; color: #555;">
        Para cualquier consulta sobre esta factura, comuníquese con el equipo de soporte Delta Medical.
      </p>
    </div>
    <div class="footer">
      Delta Medical CRM &mdash; Sistema de Gestión Médica
    </div>
  </div>
</body>
</html>`;
  }
}
