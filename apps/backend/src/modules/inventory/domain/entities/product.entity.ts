/**
 * Product domain entity.
 *
 * Represents a sellable item in a doctor's office catalog (creams, lenses,
 * supplements, prostheses, etc.).
 *
 * Invariants:
 *   - isOwnedBy()  → anti-IDOR: returns false for foreign doctor IDs.
 *   - isLowStock() → true when stock_qty <= low_stock_threshold (if set).
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export type PriceCurrency = 'USD' | 'VES';

export interface ProductCreateParams {
  id: string;
  doctorId: string;
  name: string;
  description: string;
  supplier: string | null;
  photoPath: string | null;
  salePriceAmount: number;
  salePriceCurrency: PriceCurrency;
  stockQty: number;
  lowStockThreshold: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Product {
  readonly id: string;
  readonly doctorId: string;
  readonly name: string;
  readonly description: string;
  readonly supplier: string | null;
  readonly photoPath: string | null;
  readonly salePriceAmount: number;
  readonly salePriceCurrency: PriceCurrency;
  readonly stockQty: number;
  readonly lowStockThreshold: number | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: ProductCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.name = params.name;
    this.description = params.description;
    this.supplier = params.supplier;
    this.photoPath = params.photoPath;
    this.salePriceAmount = params.salePriceAmount;
    this.salePriceCurrency = params.salePriceCurrency;
    this.stockQty = params.stockQty;
    this.lowStockThreshold = params.lowStockThreshold;
    this.isActive = params.isActive;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true when the given doctorId owns this product. Anti-IDOR guard. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Returns true when stock is at or below the low-stock threshold.
   * Returns false when no threshold is configured.
   */
  isLowStock(): boolean {
    if (this.lowStockThreshold === null) return false;
    return this.stockQty <= this.lowStockThreshold;
  }

  /** Factory — creates a Product from raw params. Does not persist. */
  static create(params: ProductCreateParams): Product {
    return new Product(params);
  }
}
