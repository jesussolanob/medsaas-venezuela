import { Lead } from './lead.entity';
import { LeadInvalidStageError } from '../errors/lead-invalid-stage.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'eeeeeeee-0000-0000-0000-000000000002';
const now = new Date('2026-06-01T00:00:00Z');

function makeLead(overrides: Partial<ConstructorParameters<typeof Lead>[0]> = {}): Lead {
  return Lead.create({
    id: 'llllllll-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    name: 'Maria Fernandez',
    phone: '+58 412 123 4567',
    channel: 'whatsapp',
    stage: 'new',
    message: 'Hola, quisiera agendar consulta',
    source: null,
    status: null,
    lastActivity: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('Lead entity', () => {
  describe('isOwnedBy', () => {
    it('returns true when doctorId matches', () => {
      const lead = makeLead();
      expect(lead.isOwnedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false when doctorId does not match', () => {
      const lead = makeLead();
      expect(lead.isOwnedBy(OTHER_DOCTOR_ID)).toBe(false);
    });
  });

  describe('moveToStage', () => {
    it('returns a new Lead with the updated stage', () => {
      const lead = makeLead({ stage: 'new' });
      const updated = lead.moveToStage('contacted');
      expect(updated.stage).toBe('contacted');
      expect(lead.stage).toBe('new'); // original is unchanged (immutable)
    });

    it.each(['new', 'contacted', 'qualified', 'appointment', 'converted', 'lost'])(
      'accepts valid stage "%s"',
      (stage) => {
        const lead = makeLead();
        const updated = lead.moveToStage(stage);
        expect(updated.stage).toBe(stage);
      },
    );

    it('throws LeadInvalidStageError for an unrecognised stage', () => {
      const lead = makeLead();
      expect(() => lead.moveToStage('invalid_stage')).toThrow(LeadInvalidStageError);
    });

    it('throws LeadInvalidStageError for empty string', () => {
      const lead = makeLead();
      expect(() => lead.moveToStage('')).toThrow(LeadInvalidStageError);
    });

    it('updates updatedAt on the returned lead', () => {
      const lead = makeLead({ updatedAt: new Date('2026-01-01T00:00:00Z') });
      const before = Date.now();
      const updated = lead.moveToStage('contacted');
      const after = Date.now();
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(updated.updatedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('static isValidStage', () => {
    it('returns true for valid stages', () => {
      expect(Lead.isValidStage('new')).toBe(true);
      expect(Lead.isValidStage('converted')).toBe(true);
    });

    it('returns false for invalid stages', () => {
      expect(Lead.isValidStage('unknown')).toBe(false);
      expect(Lead.isValidStage('')).toBe(false);
    });
  });

  describe('constructor defaults', () => {
    it('defaults optional fields to null when not provided', () => {
      const lead = makeLead({
        phone: null,
        channel: null,
        message: null,
        source: null,
        status: null,
        lastActivity: null,
      });
      expect(lead.phone).toBeNull();
      expect(lead.channel).toBeNull();
      expect(lead.message).toBeNull();
      expect(lead.source).toBeNull();
      expect(lead.status).toBeNull();
      expect(lead.lastActivity).toBeNull();
    });

    it('preserves provided optional fields', () => {
      const lastActivity = new Date('2026-06-02T12:00:00Z');
      const lead = makeLead({ lastActivity, channel: 'instagram', source: 'manual' });
      expect(lead.lastActivity).toEqual(lastActivity);
      expect(lead.channel).toBe('instagram');
      expect(lead.source).toBe('manual');
    });
  });

  describe('static create', () => {
    it('returns a Lead instance', () => {
      const lead = makeLead();
      expect(lead).toBeInstanceOf(Lead);
    });
  });
});
