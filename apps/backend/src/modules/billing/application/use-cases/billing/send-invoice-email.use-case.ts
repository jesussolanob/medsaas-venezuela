import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  INVOICE_REPOSITORY,
  type IInvoiceRepository,
} from '../../../domain/repositories/invoice.repository';
import {
  PROFILE_LOOKUP_REPOSITORY,
  type IProfileLookupRepository,
} from '../../../domain/repositories/profile-lookup.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';
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
 * - Template is resolved from the database via MailerService ('invoice' template).
 *   If the template is missing, the error is treated as non-fatal (same as
 *   adapter failure) so invoice marking is not rolled back.
 */
@Injectable()
export class SendInvoiceEmailUseCase {
  private readonly logger = new Logger(SendInvoiceEmailUseCase.name);

  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(PROFILE_LOOKUP_REPOSITORY)
    private readonly profileRepo: IProfileLookupRepository,
    private readonly mailerService: MailerService,
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

    // 4. Send email via MailerService — failure must not roll back the sent status
    try {
      const issuedDate = (invoice.issuedAt ?? new Date()).toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const amountFormatted = `${invoice.currency} ${invoice.amount.toFixed(2)}`;
      const description = invoice.description ?? 'Suscripción mensual Delta Medical';

      await this.mailerService.sendTemplate('invoice', doctorProfile.email, {
        invoiceNumber: invoice.invoiceNumber,
        amount: amountFormatted,
        description,
        date: issuedDate,
        doctorName: doctorProfile.fullName,
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
}
