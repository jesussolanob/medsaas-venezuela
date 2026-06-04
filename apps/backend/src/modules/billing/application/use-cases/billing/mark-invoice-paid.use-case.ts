import { Inject, Injectable } from '@nestjs/common';
import {
  INVOICE_REPOSITORY,
  type IInvoiceRepository,
} from '../../../domain/repositories/invoice.repository';
import { InvoiceNotFoundError } from '../../../domain/errors/invoice-not-found.error';
import type { Invoice } from '../../../domain/entities/invoice.entity';

export interface MarkInvoicePaidInput {
  invoiceId: string;
}

/**
 * Marks an invoice as paid.
 * Validates existence before persisting the status change.
 */
@Injectable()
export class MarkInvoicePaidUseCase {
  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly repo: IInvoiceRepository,
  ) {}

  async execute(input: MarkInvoicePaidInput): Promise<Invoice> {
    const invoice = await this.repo.findById(input.invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError(input.invoiceId);
    }

    // Domain: markPaid is idempotent — returns new instance with paid state.
    invoice.markPaid();

    return this.repo.markPaid(input.invoiceId);
  }
}
