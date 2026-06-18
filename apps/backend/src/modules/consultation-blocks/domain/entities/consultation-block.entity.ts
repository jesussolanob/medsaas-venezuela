/**
 * ConsultationBlock domain entity.
 *
 * Represents a single block entry as resolved for a doctor — the result of
 * the cascade merge (catalog → specialty defaults → doctor override).
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export type BlockContentType = 'rich_text' | 'list' | 'date' | 'file' | 'structured' | 'numeric';

export interface ConsultationBlockParams {
  key: string;
  label: string;
  contentType: BlockContentType;
  enabled: boolean;
  sortOrder: number;
  printable: boolean;
  sendToPatient: boolean;
  /**
   * Resolved description: customDescription ?? catalog.description.
   * Null when neither the doctor nor the catalog has a description.
   */
  description: string | null;
  /**
   * Raw doctor override for the description field.
   * Null when the doctor has not set a custom description.
   * Used by the frontend to pre-populate the description input.
   */
  customDescription: string | null;
}

export class ConsultationBlock {
  readonly key: string;
  readonly label: string;
  readonly contentType: BlockContentType;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly printable: boolean;
  readonly sendToPatient: boolean;
  readonly description: string | null;
  readonly customDescription: string | null;

  constructor(params: ConsultationBlockParams) {
    this.key = params.key;
    this.label = params.label;
    this.contentType = params.contentType;
    this.enabled = params.enabled;
    this.sortOrder = params.sortOrder;
    this.printable = params.printable;
    this.sendToPatient = params.sendToPatient;
    this.description = params.description;
    this.customDescription = params.customDescription;
  }
}
