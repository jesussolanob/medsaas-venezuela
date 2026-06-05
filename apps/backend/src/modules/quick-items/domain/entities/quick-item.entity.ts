/**
 * QuickItem domain entity.
 *
 * Represents a doctor's shortcut item (quick exam or quick medication)
 * used during consultations to speed up data entry.
 *
 * Invariants:
 *   - isOwnedBy() enforces doctor ownership — used for anti-IDOR checks.
 *   - No imports from NestJS, Sequelize, or any external library.
 */

export type QuickItemType = 'exam' | 'medication';

export interface QuickItemCreateParams {
  id: string;
  doctorId: string;
  itemType: QuickItemType;
  name: string;
  category: string | null;
  details: string | null;
  createdAt: Date;
}

export class QuickItem {
  readonly id: string;
  readonly doctorId: string;
  readonly itemType: QuickItemType;
  readonly name: string;
  readonly category: string | null;
  readonly details: string | null;
  readonly createdAt: Date;

  constructor(params: QuickItemCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.itemType = params.itemType;
    this.name = params.name;
    this.category = params.category;
    this.details = params.details;
    this.createdAt = params.createdAt;
  }

  /** Returns true when the given doctorId owns this quick item. Anti-IDOR guard. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /** Factory — creates a QuickItem from raw params. Does not persist. */
  static create(params: QuickItemCreateParams): QuickItem {
    return new QuickItem(params);
  }
}
