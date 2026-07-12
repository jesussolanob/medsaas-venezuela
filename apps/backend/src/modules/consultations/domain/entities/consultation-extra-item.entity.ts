/**
 * Domain entity representing one additional service line item attached to a
 * consultation payment.
 *
 * Extra items are created atomically during payment approval (replace-all
 * semantics: all previous items for the consultation are deleted and the new
 * list is inserted inside the same transaction).
 *
 * Invariants enforced in the constructor:
 *   - description must be a non-empty string (UI validation layer mirrors this).
 *   - amountUsd must be a finite positive number.
 *
 * This entity is pure domain: no NestJS / Sequelize imports.
 */
export interface ConsultationExtraItemCreateParams {
  id: string;
  consultationId: string;
  doctorId: string;
  description: string;
  amountUsd: number;
  createdAt: Date;
}

export class ConsultationExtraItem {
  readonly id: string;
  readonly consultationId: string;
  readonly doctorId: string;
  readonly description: string;
  readonly amountUsd: number;
  readonly createdAt: Date;

  constructor(params: ConsultationExtraItemCreateParams) {
    if (!params.description || params.description.trim().length === 0) {
      throw new Error('ConsultationExtraItem: description must not be empty');
    }
    if (!Number.isFinite(params.amountUsd) || params.amountUsd <= 0) {
      throw new Error('ConsultationExtraItem: amountUsd must be a positive finite number');
    }

    this.id = params.id;
    this.consultationId = params.consultationId;
    this.doctorId = params.doctorId;
    this.description = params.description.trim();
    this.amountUsd = params.amountUsd;
    this.createdAt = params.createdAt;
  }

  static create(params: ConsultationExtraItemCreateParams): ConsultationExtraItem {
    return new ConsultationExtraItem(params);
  }
}
