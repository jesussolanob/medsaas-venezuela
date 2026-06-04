import { Inject, Injectable } from '@nestjs/common';
import {
  INVOICE_REPOSITORY,
  type IInvoiceRepository,
  type InvoiceListResult,
} from '../../../domain/repositories/invoice.repository';

export interface ListInvoicesInput {
  page?: number;
  limit?: number;
}

/**
 * Lists all invoices (admin use case — not scoped by doctor).
 */
@Injectable()
export class ListInvoicesUseCase {
  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly repo: IInvoiceRepository,
  ) {}

  async execute(input: ListInvoicesInput): Promise<InvoiceListResult> {
    return this.repo.list({
      page: Math.max(1, input.page ?? 1),
      limit: Math.min(100, Math.max(1, input.limit ?? 20)),
    });
  }
}
