import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  IInvoiceRepository,
  CreateInvoiceParams,
  InvoiceListFilters,
  InvoiceListResult,
} from '../../../domain/repositories/invoice.repository';
import { Invoice } from '../../../domain/entities/invoice.entity';
import { InvoiceModel } from '../models/invoice.model';

/**
 * Sequelize implementation of IInvoiceRepository.
 */
@Injectable()
export class SequelizeInvoiceRepository implements IInvoiceRepository {
  constructor(
    @InjectModel(InvoiceModel)
    private readonly model: typeof InvoiceModel,
  ) {}

  async countAll(): Promise<number> {
    return this.model.count();
  }

  async list(filters: InvoiceListFilters): Promise<InvoiceListResult> {
    const offset = (filters.page - 1) * filters.limit;

    const { count, rows } = await this.model.findAndCountAll({
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

  async findById(id: string): Promise<Invoice | null> {
    const row = await this.model.findByPk(id);
    return row ? this.rowToDomain(row) : null;
  }

  async save(params: CreateInvoiceParams): Promise<Invoice> {
    const now = new Date();
    const row = await this.model.create({
      id: params.id,
      doctorId: params.doctorId,
      invoiceNumber: params.invoiceNumber,
      amount: params.amount,
      currency: params.currency,
      description: params.description,
      status: 'issued',
      issuedAt: now,
      sentAt: null,
      paidAt: null,
      createdBy: params.createdBy,
    });
    return this.rowToDomain(row);
  }

  async markPaid(id: string): Promise<Invoice> {
    const now = new Date();
    await this.model.update(
      {
        status: 'paid',
        paidAt: now,
        updatedAt: now,
      },
      { where: { id } },
    );

    const updated = await this.model.findByPk(id);
    // The caller validated existence before calling markPaid, so this is safe.
    return this.rowToDomain(updated!);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private rowToDomain(row: InvoiceModel): Invoice {
    return Invoice.create({
      id: row.id,
      doctorId: row.doctorId,
      invoiceNumber: row.invoiceNumber,
      amount: Number(row.amount),
      currency: row.currency,
      description: row.description,
      status: row.status,
      issuedAt: row.issuedAt,
      sentAt: row.sentAt,
      paidAt: row.paidAt,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
