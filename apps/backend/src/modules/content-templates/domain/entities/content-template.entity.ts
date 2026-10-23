/**
 * ContentTemplate domain entity.
 *
 * A doctor-private content template for recipe / paraclinical / reposo /
 * presupuesto documents.
 *
 * Invariants:
 *   - canBeModifiedBy() enforces anti-IDOR — same 404 for missing and foreign.
 *   - type is immutable after creation.
 *   - name is trimmed and 1–120 chars (enforced at DTO level).
 *   - content shape is validated at DTO level per type.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export type ContentTemplateType = 'recipe' | 'paraclinical' | 'reposo' | 'presupuesto';

export interface ContentTemplateCreateParams {
  id: string;
  doctorId: string;
  type: ContentTemplateType;
  name: string;
  /** Raw JSONB content — shape validated by Zod at the DTO boundary. */
  content: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class ContentTemplate {
  readonly id: string;
  readonly doctorId: string;
  readonly type: ContentTemplateType;
  readonly name: string;
  readonly content: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: ContentTemplateCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.type = params.type;
    this.name = params.name;
    this.content = params.content;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /**
   * Anti-IDOR guard: returns false for foreign doctor IDs.
   * Use-cases call this before any read/write operation.
   */
  canBeModifiedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }

  static create(params: ContentTemplateCreateParams): ContentTemplate {
    return new ContentTemplate(params);
  }
}
