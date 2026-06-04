import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BILLING_DOCUMENT_REPOSITORY,
  type IBillingDocumentRepository,
} from '../../../domain/repositories/billing-document.repository';
import type {
  BillingDocument,
  BillingDocumentItem,
} from '../../../domain/entities/billing-document.entity';

export interface CreateBillingDocumentInput {
  docType: string;
  doctorId: string;
  consultationId: string | null;
  paymentId: string | null;
  patientId: string | null;
  items: BillingDocumentItem[];
  subtotal: number | null;
  total: number;
  ivaAmount: number;
  igtfAmount: number;
  bcvRate: number | null;
  totalBs: number | null;
  notes: string | null;
  currency: string;
}

/**
 * Creates a new billing document (factura, nota de débito, recibo, etc.).
 *
 * Doc number is auto-generated as <TYPE>-YYYYMMDD-XXXX where XXXX is a
 * 4-digit zero-padded sequence based on the total count of existing docs of
 * the same type.
 */
@Injectable()
export class CreateBillingDocumentUseCase {
  constructor(
    @Inject(BILLING_DOCUMENT_REPOSITORY)
    private readonly repo: IBillingDocumentRepository,
  ) {}

  async execute(input: CreateBillingDocumentInput): Promise<BillingDocument> {
    const count = await this.repo.countByType(input.docType);
    const docNumber = this.buildDocNumber(input.docType, count + 1);

    return this.repo.save({
      id: randomUUID(),
      docNumber,
      docType: input.docType,
      doctorId: input.doctorId,
      consultationId: input.consultationId,
      paymentId: input.paymentId,
      patientId: input.patientId,
      items: input.items,
      subtotal: input.subtotal,
      total: input.total,
      ivaAmount: input.ivaAmount,
      igtfAmount: input.igtfAmount,
      bcvRate: input.bcvRate,
      totalBs: input.totalBs,
      notes: input.notes,
      currency: input.currency,
      status: 'issued',
    });
  }

  private buildDocNumber(docType: string, sequence: number): string {
    const prefix = docType
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const seq = String(sequence).padStart(4, '0');
    return `${prefix}-${yyyy}${mm}${dd}-${seq}`;
  }
}
