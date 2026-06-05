/**
 * TemplateType value object.
 *
 * Represents the type of a doctor's PDF template.
 * Only the four known values are valid — this prevents any arbitrary string
 * from being stored in the template_type column.
 *
 * No external imports — pure domain logic.
 */

export const TEMPLATE_TYPES = ['informe', 'recipe', 'prescripciones', 'reposo'] as const;

export type TemplateTypeValue = (typeof TEMPLATE_TYPES)[number];

export class TemplateType {
  private constructor(readonly value: TemplateTypeValue) {}

  /** Returns a TemplateType or null when the given value is not recognised. */
  static fromString(raw: string): TemplateType | null {
    if ((TEMPLATE_TYPES as readonly string[]).includes(raw)) {
      return new TemplateType(raw as TemplateTypeValue);
    }
    return null;
  }

  /** Factory — creates a TemplateType. Throws if the value is invalid. */
  static create(value: TemplateTypeValue): TemplateType {
    return new TemplateType(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: TemplateType): boolean {
    return this.value === other.value;
  }
}
