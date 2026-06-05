import { TemplateType, TEMPLATE_TYPES } from './template-type.vo';

describe('TemplateType', () => {
  describe('fromString', () => {
    it.each(TEMPLATE_TYPES)('returns a TemplateType for valid value "%s"', (value) => {
      const result = TemplateType.fromString(value);
      expect(result).not.toBeNull();
      expect(result?.value).toBe(value);
    });

    it('returns null for an unrecognised string', () => {
      expect(TemplateType.fromString('unknown')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(TemplateType.fromString('')).toBeNull();
    });

    it('is case-sensitive — uppercase not accepted', () => {
      expect(TemplateType.fromString('INFORME')).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a TemplateType from a valid value', () => {
      const tt = TemplateType.create('informe');
      expect(tt.value).toBe('informe');
    });
  });

  describe('toString', () => {
    it('returns the raw string value', () => {
      expect(TemplateType.create('recipe').toString()).toBe('recipe');
    });
  });

  describe('equals', () => {
    it('returns true for the same value', () => {
      const a = TemplateType.create('reposo');
      const b = TemplateType.create('reposo');
      expect(a.equals(b)).toBe(true);
    });

    it('returns false for different values', () => {
      const a = TemplateType.create('informe');
      const b = TemplateType.create('recipe');
      expect(a.equals(b)).toBe(false);
    });
  });
});
