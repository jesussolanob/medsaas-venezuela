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
}

export class ConsultationBlock {
  readonly key: string;
  readonly label: string;
  readonly contentType: BlockContentType;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly printable: boolean;
  readonly sendToPatient: boolean;

  constructor(params: ConsultationBlockParams) {
    this.key = params.key;
    this.label = params.label;
    this.contentType = params.contentType;
    this.enabled = params.enabled;
    this.sortOrder = params.sortOrder;
    this.printable = params.printable;
    this.sendToPatient = params.sendToPatient;
  }
}
