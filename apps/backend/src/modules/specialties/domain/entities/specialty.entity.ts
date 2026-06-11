/**
 * Specialty — domain entity representing a medical specialty in the catalogue.
 *
 * No external dependencies (DDD domain rule).
 *
 * Invariants:
 *   - name must not be empty
 *   - sort_order must be a non-negative integer
 */

export interface SpecialtyProps {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Specialty {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: SpecialtyProps) {
    this.id = props.id;
    this.name = props.name;
    this.isActive = props.isActive;
    this.sortOrder = props.sortOrder;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Reconstitutes an entity from persistence — does not re-validate invariants. */
  static reconstitute(props: SpecialtyProps): Specialty {
    return new Specialty(props);
  }

  /** Returns a new Specialty with updated fields (immutable). */
  withUpdates(fields: { name?: string; isActive?: boolean; sortOrder?: number }): Specialty {
    return new Specialty({
      id: this.id,
      name: fields.name !== undefined ? fields.name : this.name,
      isActive: fields.isActive !== undefined ? fields.isActive : this.isActive,
      sortOrder: fields.sortOrder !== undefined ? fields.sortOrder : this.sortOrder,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }
}
