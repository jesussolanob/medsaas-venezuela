import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  INVOICE_REPOSITORY,
  type IInvoiceRepository,
} from '../../../domain/repositories/invoice.repository';
import type { Invoice } from '../../../domain/entities/invoice.entity';

export interface CreateInvoiceInput {
  doctorId: string;
  amount: number;
  currency?: string;
  description?: string | null;
  createdBy: string | null;
}

/**
 * Creates a new invoice for a doctor.
 *
 * Invoice number is auto-generated as FAC-YYYYMMDD-XXXX where XXXX is a
 * 4-digit zero-padded sequence based on the total count of existing invoices.
 */
@Injectable()
export class CreateInvoiceUseCase {
  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly repo: IInvoiceRepository,
  ) {}

  async execute(input: CreateInvoiceInput): Promise<Invoice> {
    const count = await this.repo.countAll();
    const invoiceNumber = this.buildInvoiceNumber(count + 1);

    return this.repo.save({
      id: randomUUID(),
      doctorId: input.doctorId,
      invoiceNumber,
      amount: input.amount,
      currency: input.currency ?? 'USD',
      description: input.description ?? null,
      createdBy: input.createdBy,
    });
  }

  private buildInvoiceNumber(sequence: number): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const seq = String(sequence).padStart(4, '0');
    return `FAC-${yyyy}${mm}${dd}-${seq}`;
  }
}
