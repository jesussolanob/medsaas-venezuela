import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  IBillingDocumentRepository,
  CreateBillingDocumentParams,
  BillingDocumentListFilters,
  BillingDocumentListResult,
} from '../../../domain/repositories/billing-document.repository';
import { BillingDocument } from '../../../domain/entities/billing-document.entity';
import { BillingDocumentModel } from '../models/billing-document.model';

/**
 * Sequelize implementation of IBillingDocumentRepository.
 */
@Injectable()
export class SequelizeBillingDocumentRepository implements IBillingDocumentRepository {
  constructor(
    @InjectModel(BillingDocumentModel)
    private readonly model: typeof BillingDocumentModel,
  ) {}

  async countByType(docType: string): Promise<number> {
    return this.model.count({ where: { docType } });
  }

  async listForDoctor(filters: BillingDocumentListFilters): Promise<BillingDocumentListResult> {
    const offset = (filters.page - 1) * filters.limit;

    const { count, rows } = await this.model.findAndCountAll({
      where: { doctorId: filters.doctorId },
      limit: filters.limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      items: rows.map((r) => this.rowToDomain(r)),
      total: typeof count === 'number' ? count : 0,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async save(params: CreateBillingDocumentParams): Promise<BillingDocument> {
    const row = await this.model.create({
      id: params.id,
      docNumber: params.docNumber,
      docType: params.docType,
      doctorId: params.doctorId,
      consultationId: params.consultationId,
      paymentId: params.paymentId,
      patientId: params.patientId,
      items: params.items,
      subtotal: params.subtotal,
      total: params.total,
      ivaAmount: params.ivaAmount,
      igtfAmount: params.igtfAmount,
      bcvRate: params.bcvRate,
      totalBs: params.totalBs,
      notes: params.notes,
      currency: params.currency,
      status: params.status,
    });
    return this.rowToDomain(row);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private rowToDomain(row: BillingDocumentModel): BillingDocument {
    return BillingDocument.create({
      id: row.id,
      docNumber: row.docNumber,
      docType: row.docType,
      doctorId: row.doctorId,
      consultationId: row.consultationId,
      paymentId: row.paymentId,
      patientId: row.patientId,
      items: Array.isArray(row.items) ? row.items : [],
      subtotal: row.subtotal !== null && row.subtotal !== undefined ? Number(row.subtotal) : null,
      total: Number(row.total),
      ivaAmount: Number(row.ivaAmount),
      igtfAmount: Number(row.igtfAmount),
      bcvRate: row.bcvRate !== null && row.bcvRate !== undefined ? Number(row.bcvRate) : null,
      totalBs: row.totalBs !== null && row.totalBs !== undefined ? Number(row.totalBs) : null,
      notes: row.notes,
      currency: row.currency,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
