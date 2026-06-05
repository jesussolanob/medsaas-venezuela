import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  DOCTOR_TEMPLATE_REPOSITORY,
  IDoctorTemplateRepository,
} from '../../../domain/repositories/doctor-template.repository';
import { DoctorTemplate } from '../../../domain/entities/doctor-template.entity';
import { TemplateType } from '../../../domain/value-objects/template-type.vo';
import { InvalidTemplateTypeError } from '../../../domain/errors/invalid-template-type.error';
import type { UpsertDoctorTemplateDto } from '@delta/shared-types';

@Injectable()
export class UpsertDoctorTemplateUseCase {
  constructor(
    @Inject(DOCTOR_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IDoctorTemplateRepository,
  ) {}

  async execute(
    templateTypeRaw: string,
    dto: UpsertDoctorTemplateDto,
    doctorId: string,
  ): Promise<DoctorTemplate> {
    // 1. Validate template type
    const templateType = TemplateType.fromString(templateTypeRaw);
    if (!templateType) {
      throw new InvalidTemplateTypeError(templateTypeRaw);
    }

    // 2. Look up existing record
    const existing = await this.templateRepo.findByDoctorAndType(doctorId, templateType.value);

    // 3. Build entity — if exists, merge; otherwise create with defaults
    const now = new Date();
    let template: DoctorTemplate;

    if (existing) {
      template = existing.withUpdates({
        logoUrl: dto.logo_url !== undefined ? dto.logo_url ?? null : undefined,
        signatureUrl: dto.signature_url !== undefined ? dto.signature_url ?? null : undefined,
        fontFamily: dto.font_family,
        headerText: dto.header_text,
        footerText: dto.footer_text,
        showLogo: dto.show_logo,
        showSignature: dto.show_signature,
        primaryColor: dto.primary_color,
      });
    } else {
      template = DoctorTemplate.create({
        id: randomUUID(),
        doctorId,
        templateType: templateType.value,
        logoUrl: dto.logo_url ?? null,
        signatureUrl: dto.signature_url ?? null,
        fontFamily: dto.font_family ?? 'Inter',
        headerText: dto.header_text ?? '',
        footerText: dto.footer_text ?? '',
        showLogo: dto.show_logo ?? true,
        showSignature: dto.show_signature ?? true,
        primaryColor: dto.primary_color ?? '#0891b2',
        createdAt: now,
        updatedAt: now,
      });
    }

    // 4. Persist via upsert (doctorId always from authenticated user — anti-IDOR)
    return this.templateRepo.upsert(template);
  }
}
