/**
 * Domain entity for an income concept (doctor-scoped editable label).
 *
 * No external dependencies — pure domain logic only.
 */
export class IncomeConcept {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly name: string,
    public readonly isActive: boolean,
    public readonly sortOrder: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(params: {
    id: string;
    doctorId: string;
    name: string;
    isActive?: boolean;
    sortOrder?: number;
    createdAt: Date;
    updatedAt: Date;
  }): IncomeConcept {
    return new IncomeConcept(
      params.id,
      params.doctorId,
      params.name,
      params.isActive ?? true,
      params.sortOrder ?? 0,
      params.createdAt,
      params.updatedAt,
    );
  }

  /** Returns true when this concept belongs to the given doctor. */
  isOwnedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }

  /** Returns a new entity with the given fields patched (immutable). */
  patch(fields: { name?: string; isActive?: boolean; sortOrder?: number }): IncomeConcept {
    return new IncomeConcept(
      this.id,
      this.doctorId,
      fields.name ?? this.name,
      fields.isActive ?? this.isActive,
      fields.sortOrder ?? this.sortOrder,
      this.createdAt,
      new Date(),
    );
  }
}
