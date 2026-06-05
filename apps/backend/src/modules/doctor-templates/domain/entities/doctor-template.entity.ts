import type { TemplateTypeValue } from '../value-objects/template-type.vo';

export interface DoctorTemplateCreateParams {
  id: string;
  doctorId: string;
  templateType: TemplateTypeValue;
  logoUrl: string | null;
  signatureUrl: string | null;
  fontFamily: string;
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showSignature: boolean;
  primaryColor: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DoctorTemplate domain entity.
 *
 * Represents the PDF template configuration for a specific template type
 * owned by a doctor.
 *
 * Invariants:
 *   - isOwnedBy() enforces doctor ownership — used for anti-IDOR checks.
 *   - One template per (doctor, templateType) pair — enforced at DB level via UNIQUE.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */
export class DoctorTemplate {
  readonly id: string;
  readonly doctorId: string;
  readonly templateType: TemplateTypeValue;
  readonly logoUrl: string | null;
  readonly signatureUrl: string | null;
  readonly fontFamily: string;
  readonly headerText: string;
  readonly footerText: string;
  readonly showLogo: boolean;
  readonly showSignature: boolean;
  readonly primaryColor: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: DoctorTemplateCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.templateType = params.templateType;
    this.logoUrl = params.logoUrl;
    this.signatureUrl = params.signatureUrl;
    this.fontFamily = params.fontFamily;
    this.headerText = params.headerText;
    this.footerText = params.footerText;
    this.showLogo = params.showLogo;
    this.showSignature = params.showSignature;
    this.primaryColor = params.primaryColor;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true when the given doctorId owns this template. Anti-IDOR guard. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Returns a new DoctorTemplate with the supplied fields merged in (immutable update).
   * Only the mutable presentation fields are accepted — doctorId and templateType are fixed.
   */
  withUpdates(
    fields: Partial<
      Pick<
        DoctorTemplateCreateParams,
        | 'logoUrl'
        | 'signatureUrl'
        | 'fontFamily'
        | 'headerText'
        | 'footerText'
        | 'showLogo'
        | 'showSignature'
        | 'primaryColor'
      >
    >,
  ): DoctorTemplate {
    return DoctorTemplate.create({
      id: this.id,
      doctorId: this.doctorId,
      templateType: this.templateType,
      logoUrl: fields.logoUrl !== undefined ? fields.logoUrl : this.logoUrl,
      signatureUrl: fields.signatureUrl !== undefined ? fields.signatureUrl : this.signatureUrl,
      fontFamily: fields.fontFamily ?? this.fontFamily,
      headerText: fields.headerText ?? this.headerText,
      footerText: fields.footerText ?? this.footerText,
      showLogo: fields.showLogo ?? this.showLogo,
      showSignature: fields.showSignature ?? this.showSignature,
      primaryColor: fields.primaryColor ?? this.primaryColor,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /** Factory — creates a DoctorTemplate from raw params. Does not persist. */
  static create(params: DoctorTemplateCreateParams): DoctorTemplate {
    return new DoctorTemplate(params);
  }
}
