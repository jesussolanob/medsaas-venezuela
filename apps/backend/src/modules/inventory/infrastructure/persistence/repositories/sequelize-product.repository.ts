import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, type WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Product, type PriceCurrency } from '../../../domain/entities/product.entity';
import {
  InventoryMovement,
  type MovementKind,
} from '../../../domain/entities/inventory-movement.entity';
import { ProductNotFoundError } from '../../../domain/errors/product-not-found.error';
import { MovementNotFoundError } from '../../../domain/errors/movement-not-found.error';
import { MovementAlreadyReversedError } from '../../../domain/errors/movement-already-reversed.error';
import type {
  IProductRepository,
  ProductListFilters,
  ProductListResult,
  ProductUpdateFields,
  MovementListResult,
} from '../../../domain/repositories/iproduct.repository';
import { ProductModel } from '../models/product.model';
import { InventoryMovementModel } from '../models/inventory-movement.model';

@Injectable()
export class SequelizeProductRepository implements IProductRepository {
  constructor(
    @InjectModel(ProductModel)
    private readonly productModel: typeof ProductModel,
    @InjectModel(InventoryMovementModel)
    private readonly movementModel: typeof InventoryMovementModel,
    private readonly sequelize: Sequelize,
  ) {}

  // --------------------------------------------------------------------------
  // Products
  // --------------------------------------------------------------------------

  async list(filters: ProductListFilters): Promise<ProductListResult> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.active !== undefined) {
      where['isActive'] = filters.active;
    }
    if (filters.search) {
      where['name'] = { [Op.iLike]: `%${filters.search}%` };
    }

    const { count, rows } = await this.productModel.findAndCountAll({
      where: where as WhereOptions,
      order: [['createdAt', 'DESC']],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
    });

    return {
      items: rows.map((r) => this.toDomain(r)),
      total: count,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<Product | null> {
    const row = await this.productModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    return row ? this.toDomain(row) : null;
  }

  async save(product: Product): Promise<Product> {
    const row = await this.productModel.create({
      id: product.id,
      doctorId: product.doctorId,
      name: product.name,
      description: product.description,
      supplier: product.supplier,
      photoPath: product.photoPath,
      salePriceAmount: product.salePriceAmount,
      salePriceCurrency: product.salePriceCurrency,
      stockQty: product.stockQty,
      lowStockThreshold: product.lowStockThreshold,
      isActive: product.isActive,
    });
    return this.toDomain(row);
  }

  async update(id: string, doctorId: string, fields: ProductUpdateFields): Promise<Product> {
    const updateData: Record<string, unknown> = {};
    if (fields.name !== undefined) updateData['name'] = fields.name.trim();
    if (fields.description !== undefined) updateData['description'] = fields.description.trim();
    if (fields.supplier !== undefined) updateData['supplier'] = fields.supplier;
    if (fields.photoPath !== undefined) updateData['photoPath'] = fields.photoPath;
    if (fields.salePriceAmount !== undefined)
      updateData['salePriceAmount'] = fields.salePriceAmount;
    if (fields.salePriceCurrency !== undefined)
      updateData['salePriceCurrency'] = fields.salePriceCurrency;
    if (fields.lowStockThreshold !== undefined)
      updateData['lowStockThreshold'] = fields.lowStockThreshold;

    // L1: use returning:true to read the updated row atomically in one statement.
    // A separate findByPk after update would be a TOCTOU window (another writer
    // could deactivate the row between the two operations).
    const [affected, rows] = await this.productModel.update(updateData, {
      where: { id, doctorId } as WhereOptions,
      returning: true,
    });

    if (affected === 0 || !rows || rows.length === 0) {
      throw new ProductNotFoundError();
    }

    return this.toDomain(rows[0]!);
  }

  async deactivate(id: string, doctorId: string): Promise<void> {
    const [affected] = await this.productModel.update(
      { isActive: false },
      { where: { id, doctorId } as WhereOptions },
    );
    if (affected === 0) {
      throw new ProductNotFoundError();
    }
  }

  // --------------------------------------------------------------------------
  // Movements
  // --------------------------------------------------------------------------

  async listMovements(
    productId: string,
    doctorId: string,
    page: number,
    limit: number,
  ): Promise<MovementListResult> {
    const { count, rows } = await this.movementModel.findAndCountAll({
      where: { productId, doctorId } as WhereOptions,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return {
      items: rows.map((r) => this.toMovementDomain(r)),
      total: count,
      page,
      limit,
    };
  }

  async saveMovement(movement: InventoryMovement): Promise<InventoryMovement> {
    const row = await this.movementModel.create({
      id: movement.id,
      doctorId: movement.doctorId,
      productId: movement.productId,
      kind: movement.kind,
      qty: movement.qty,
      unitPriceUsd: movement.unitPriceUsd,
      rateUsed: movement.rateUsed,
      rateSource: movement.rateSource,
      consultationId: movement.consultationId,
      note: movement.note,
    });
    return this.toMovementDomain(row);
  }

  async applyMovement(movement: InventoryMovement): Promise<InventoryMovement> {
    return this.sequelize.transaction(async (t) => {
      const row = await this.movementModel.create(
        {
          id: movement.id,
          doctorId: movement.doctorId,
          productId: movement.productId,
          kind: movement.kind,
          qty: movement.qty,
          unitPriceUsd: movement.unitPriceUsd,
          rateUsed: movement.rateUsed,
          rateSource: movement.rateSource,
          consultationId: movement.consultationId,
          note: movement.note,
        },
        { transaction: t },
      );

      // Atomically update stock_qty. Stock may go negative — spec §decisions.
      await this.sequelize.query(
        `UPDATE products SET stock_qty = stock_qty + :qty, updated_at = NOW()
         WHERE id = :productId AND doctor_id = :doctorId`,
        {
          replacements: {
            qty: movement.qty,
            productId: movement.productId,
            doctorId: movement.doctorId,
          },
          type: QueryTypes.UPDATE,
          transaction: t,
        },
      );

      return this.toMovementDomain(row);
    });
  }

  async findSalesByConsultation(
    consultationId: string,
    doctorId: string,
  ): Promise<InventoryMovement[]> {
    const rows = await this.movementModel.findAll({
      where: { consultationId, doctorId, kind: 'sale' } as WhereOptions,
      order: [['createdAt', 'ASC']],
    });
    return rows.map((r) => this.toMovementDomain(r));
  }

  async revertSalesByConsultation(consultationId: string, doctorId: string): Promise<void> {
    return this.sequelize.transaction(async (t) => {
      // Restore stock for each product that had a sale movement in this consultation.
      await this.sequelize.query(
        `UPDATE products p
           SET stock_qty  = stock_qty + rev.qty_to_restore,
               updated_at = NOW()
           FROM (
             SELECT product_id, SUM(qty) * -1 AS qty_to_restore
               FROM inventory_movements
              WHERE consultation_id = :consultationId
                AND doctor_id       = :doctorId
                AND kind            = 'sale'
              GROUP BY product_id
           ) rev
         WHERE p.id = rev.product_id`,
        {
          replacements: { consultationId, doctorId },
          type: QueryTypes.UPDATE,
          transaction: t,
        },
      );

      // Delete the old sale movements.
      await this.sequelize.query(
        `DELETE FROM inventory_movements
          WHERE consultation_id = :consultationId
            AND doctor_id       = :doctorId
            AND kind            = 'sale'`,
        {
          replacements: { consultationId, doctorId },
          type: QueryTypes.DELETE,
          transaction: t,
        },
      );
    });
  }

  async findMovementByIdForDoctor(id: string, doctorId: string): Promise<InventoryMovement | null> {
    const row = await this.movementModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    return row ? this.toMovementDomain(row) : null;
  }

  async reverseMovement(
    originalId: string,
    doctorId: string,
    reversalId: string,
  ): Promise<InventoryMovement> {
    return this.sequelize.transaction(async (t) => {
      // Friendly check before hitting the unique partial index constraint.
      const alreadyReversed = await this.movementModel.findOne({
        where: { reversesMovementId: originalId } as WhereOptions,
        transaction: t,
      });
      if (alreadyReversed) {
        throw new MovementAlreadyReversedError();
      }

      // Re-read original inside the transaction for a consistent snapshot.
      const original = await this.movementModel.findOne({
        where: { id: originalId, doctorId } as WhereOptions,
        transaction: t,
      });
      if (!original) {
        throw new MovementNotFoundError();
      }

      const reversalQty = -Number(original.qty);
      const note = `Anulación del movimiento ${originalId}`;

      const row = await this.movementModel.create(
        {
          id: reversalId,
          doctorId: original.doctorId,
          productId: original.productId,
          kind: 'adjustment',
          qty: reversalQty,
          unitPriceUsd: null,
          rateUsed: null,
          rateSource: null,
          consultationId: null,
          note,
          reversesMovementId: originalId,
        },
        { transaction: t },
      );

      await this.sequelize.query(
        `UPDATE products SET stock_qty = stock_qty + :qty, updated_at = NOW()
         WHERE id = :productId AND doctor_id = :doctorId`,
        {
          replacements: {
            qty: reversalQty,
            productId: original.productId,
            doctorId: original.doctorId,
          },
          type: QueryTypes.UPDATE,
          transaction: t,
        },
      );

      return this.toMovementDomain(row);
    });
  }

  async findProductsByIdsForDoctor(ids: string[], doctorId: string): Promise<Product[]> {
    if (ids.length === 0) return [];
    // Use Op.in (generates IN (...)) — never = ANY(:ids) per ADR-059.
    const rows = await this.productModel.findAll({
      where: { id: { [Op.in]: ids }, doctorId } as WhereOptions,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async applyBulkMovements(movements: InventoryMovement[]): Promise<InventoryMovement[]> {
    return this.sequelize.transaction(async (t) => {
      const savedRows = await Promise.all(
        movements.map((movement) =>
          this.movementModel.create(
            {
              id: movement.id,
              doctorId: movement.doctorId,
              productId: movement.productId,
              kind: movement.kind,
              qty: movement.qty,
              unitPriceUsd: movement.unitPriceUsd,
              rateUsed: movement.rateUsed,
              rateSource: movement.rateSource,
              consultationId: movement.consultationId,
              note: movement.note,
              reversesMovementId: null,
            },
            { transaction: t },
          ),
        ),
      );

      // Atomically update stock for each product. Positive qty = stock entry.
      await Promise.all(
        movements.map((movement) =>
          this.sequelize.query(
            `UPDATE products SET stock_qty = stock_qty + :qty, updated_at = NOW()
             WHERE id = :productId AND doctor_id = :doctorId`,
            {
              replacements: {
                qty: movement.qty,
                productId: movement.productId,
                doctorId: movement.doctorId,
              },
              type: QueryTypes.UPDATE,
              transaction: t,
            },
          ),
        ),
      );

      return savedRows.map((r) => this.toMovementDomain(r));
    });
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private toDomain(row: ProductModel): Product {
    return Product.create({
      id: row.id,
      doctorId: row.doctorId,
      name: row.name,
      description: row.description,
      supplier: row.supplier ?? null,
      photoPath: row.photoPath ?? null,
      salePriceAmount: Number(row.salePriceAmount),
      salePriceCurrency: row.salePriceCurrency as PriceCurrency,
      stockQty: Number(row.stockQty),
      lowStockThreshold: row.lowStockThreshold !== null ? Number(row.lowStockThreshold) : null,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toMovementDomain(row: InventoryMovementModel): InventoryMovement {
    return InventoryMovement.create({
      id: row.id,
      doctorId: row.doctorId,
      productId: row.productId,
      kind: row.kind as MovementKind,
      qty: Number(row.qty),
      unitPriceUsd: row.unitPriceUsd !== null ? Number(row.unitPriceUsd) : null,
      rateUsed: row.rateUsed !== null ? Number(row.rateUsed) : null,
      rateSource: row.rateSource ?? null,
      consultationId: row.consultationId ?? null,
      note: row.note ?? null,
      createdAt: row.createdAt,
      reversesMovementId: row.reversesMovementId ?? null,
    });
  }
}
