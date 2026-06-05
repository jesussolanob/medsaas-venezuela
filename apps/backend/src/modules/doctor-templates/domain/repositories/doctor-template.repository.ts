import type { DoctorTemplate } from '../entities/doctor-template.entity';
import type { TemplateTypeValue } from '../value-objects/template-type.vo';

export const DOCTOR_TEMPLATE_REPOSITORY = 'DOCTOR_TEMPLATE_REPOSITORY';

/**
 * Contract for doctor template persistence.
 *
 * The application layer depends only on this interface, never on the Sequelize
 * implementation, keeping the domain layer infrastructure-free.
 */
export interface IDoctorTemplateRepository {
  /**
   * Returns all templates for a given doctorId.
   * Sorted by template_type ASC (consistent ordering for UI).
   */
  listByDoctor(doctorId: string): Promise<DoctorTemplate[]>;

  /**
   * Finds a template by (doctorId, templateType).
   * Returns null when the combination does not exist.
   */
  findByDoctorAndType(
    doctorId: string,
    templateType: TemplateTypeValue,
  ): Promise<DoctorTemplate | null>;

  /**
   * Upserts a template: inserts when (doctor_id, template_type) does not exist,
   * updates when it does. Always scoped to the given doctorId (anti-IDOR).
   * Returns the saved entity.
   */
  upsert(template: DoctorTemplate): Promise<DoctorTemplate>;
}
