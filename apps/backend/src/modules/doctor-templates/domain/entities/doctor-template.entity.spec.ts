import { DoctorTemplate, type DoctorTemplateCreateParams } from './doctor-template.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const TEMPLATE_ID = 'tttttttt-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeParams(overrides: Partial<DoctorTemplateCreateParams> = {}): DoctorTemplateCreateParams {
  return {
    id: TEMPLATE_ID,
    doctorId: DOCTOR_ID,
    templateType: 'informe',
    logoUrl: null,
    signatureUrl: null,
    fontFamily: 'Inter',
    headerText: '',
    footerText: '',
    showLogo: true,
    showSignature: true,
    primaryColor: '#0891b2',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('DoctorTemplate entity', () => {
  describe('create (factory)', () => {
    it('creates an entity with the given params', () => {
      const template = DoctorTemplate.create(makeParams());

      expect(template.id).toBe(TEMPLATE_ID);
      expect(template.doctorId).toBe(DOCTOR_ID);
      expect(template.templateType).toBe('informe');
      expect(template.logoUrl).toBeNull();
      expect(template.fontFamily).toBe('Inter');
      expect(template.showLogo).toBe(true);
      expect(template.primaryColor).toBe('#0891b2');
    });

    it('accepts optional logoUrl and signatureUrl as strings', () => {
      const template = DoctorTemplate.create(
        makeParams({ logoUrl: 'https://storage/logo.png', signatureUrl: 'https://storage/sig.png' }),
      );
      expect(template.logoUrl).toBe('https://storage/logo.png');
      expect(template.signatureUrl).toBe('https://storage/sig.png');
    });
  });

  describe('isOwnedBy', () => {
    it('returns true for the owning doctor', () => {
      const template = DoctorTemplate.create(makeParams());
      expect(template.isOwnedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false for a different doctor (anti-IDOR)', () => {
      const template = DoctorTemplate.create(makeParams());
      expect(template.isOwnedBy(OTHER_ID)).toBe(false);
    });
  });

  describe('withUpdates', () => {
    it('returns a new entity with the updated fields', () => {
      const original = DoctorTemplate.create(makeParams());
      const updated = original.withUpdates({ fontFamily: 'Roboto', primaryColor: '#ff0000' });

      expect(updated.fontFamily).toBe('Roboto');
      expect(updated.primaryColor).toBe('#ff0000');
      // unchanged fields
      expect(updated.id).toBe(original.id);
      expect(updated.doctorId).toBe(original.doctorId);
      expect(updated.templateType).toBe(original.templateType);
    });

    it('does not mutate the original entity (immutability)', () => {
      const original = DoctorTemplate.create(makeParams());
      original.withUpdates({ fontFamily: 'Roboto' });

      expect(original.fontFamily).toBe('Inter');
    });

    it('preserves null logoUrl when not specified', () => {
      const original = DoctorTemplate.create(makeParams({ logoUrl: null }));
      const updated = original.withUpdates({ fontFamily: 'Roboto' });

      expect(updated.logoUrl).toBeNull();
    });

    it('updates logoUrl to null when explicitly passed', () => {
      const original = DoctorTemplate.create(makeParams({ logoUrl: 'https://old-url.com' }));
      const updated = original.withUpdates({ logoUrl: null });

      expect(updated.logoUrl).toBeNull();
    });

    it('updates updatedAt to a newer timestamp', () => {
      const original = DoctorTemplate.create(makeParams());
      const updated = original.withUpdates({ headerText: 'Hello' });

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime());
    });

    it('preserves createdAt from the original', () => {
      const original = DoctorTemplate.create(makeParams());
      const updated = original.withUpdates({ headerText: 'Hello' });

      expect(updated.createdAt).toBe(original.createdAt);
    });
  });
});
