import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { DoctorTemplate } from '../../../domain/entities/doctor-template.entity';
import type { IDoctorTemplateRepository } from '../../../domain/repositories/doctor-template.repository';
import type { TemplateTypeValue } from '../../../domain/value-objects/template-type.vo';
import { DoctorTemplateModel } from '../models/doctor-template.model';

/**
 * Sequelize implementation of IDoctorTemplateRepository.
 *
 * Converts between DoctorTemplateModel (infrastructure) and DoctorTemplate (domain).
 * The upsert uses Sequelize's findOne + update | create pattern to leverage the
 * UNIQUE(doctor_id, template_type) constraint safely.
 */
@Injectable()
export class SequelizeDoctorTemplateRepository implements IDoctorTemplateRepository {
  constructor(
    @InjectModel(DoctorTemplateModel)
    private readonly templateModel: typeof DoctorTemplateModel,
  ) {}

  async listByDoctor(doctorId: string): Promise<DoctorTemplate[]> {
    const rows = await this.templateModel.findAll({
      where: { doctorId } as WhereOptions,
      order: [['templateType', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findByDoctorAndType(
    doctorId: string,
    templateType: TemplateTypeValue,
  ): Promise<DoctorTemplate | null> {
    const row = await this.templateModel.findOne({
      where: { doctorId, templateType } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async upsert(template: DoctorTemplate): Promise<DoctorTemplate> {
    const existing = await this.templateModel.findOne({
      where: { doctorId: template.doctorId, templateType: template.templateType } as WhereOptions,
    });

    if (existing) {
      await existing.update({
        logoUrl: template.logoUrl,
        signatureUrl: template.signatureUrl,
        fontFamily: template.fontFamily,
        headerText: template.headerText,
        footerText: template.footerText,
        showLogo: template.showLogo,
        showSignature: template.showSignature,
        primaryColor: template.primaryColor,
      });
      // Reload to get DB-generated updatedAt
      await existing.reload();
      return this.toDomain(existing);
    }

    const row = await this.templateModel.create({
      id: template.id,
      doctorId: template.doctorId,
      templateType: template.templateType,
      logoUrl: template.logoUrl,
      signatureUrl: template.signatureUrl,
      fontFamily: template.fontFamily,
      headerText: template.headerText,
      footerText: template.footerText,
      showLogo: template.showLogo,
      showSignature: template.showSignature,
      primaryColor: template.primaryColor,
    });
    return this.toDomain(row);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: DoctorTemplateModel): DoctorTemplate {
    return DoctorTemplate.create({
      id: row.id,
      doctorId: row.doctorId,
      templateType: row.templateType,
      logoUrl: row.logoUrl ?? null,
      signatureUrl: row.signatureUrl ?? null,
      fontFamily: row.fontFamily ?? 'Inter',
      headerText: row.headerText ?? '',
      footerText: row.footerText ?? '',
      showLogo: row.showLogo,
      showSignature: row.showSignature,
      primaryColor: row.primaryColor ?? '#0891b2',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
