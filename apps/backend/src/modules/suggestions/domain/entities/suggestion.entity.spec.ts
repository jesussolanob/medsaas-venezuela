import { Suggestion, type SuggestionCreateParams } from './suggestion.entity';
import { SuggestionInvalidStatusError } from '../errors/suggestion-invalid-status.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeParams(overrides: Partial<SuggestionCreateParams> = {}): SuggestionCreateParams {
  return {
    id: 'ssssssss-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    subject: 'Improve scheduling',
    message: 'The scheduling UI is confusing',
    category: 'general',
    status: 'pending',
    adminResponse: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Suggestion entity', () => {
  describe('create', () => {
    it('creates a suggestion with required fields', () => {
      const suggestion = Suggestion.create(makeParams());

      expect(suggestion.id).toBe('ssssssss-0000-0000-0000-000000000001');
      expect(suggestion.doctorId).toBe(DOCTOR_ID);
      expect(suggestion.subject).toBe('Improve scheduling');
      expect(suggestion.message).toBe('The scheduling UI is confusing');
      expect(suggestion.category).toBe('general');
      expect(suggestion.status).toBe('pending');
      expect(suggestion.adminResponse).toBeNull();
    });

    it('sets adminResponse to null by default when not provided', () => {
      const suggestion = Suggestion.create(makeParams({ adminResponse: null }));
      expect(suggestion.adminResponse).toBeNull();
    });

    it('stores provided adminResponse', () => {
      const suggestion = Suggestion.create(makeParams({ adminResponse: 'Thank you!' }));
      expect(suggestion.adminResponse).toBe('Thank you!');
    });
  });

  describe('isOwnedBy', () => {
    it('returns true when the doctorId matches', () => {
      const suggestion = Suggestion.create(makeParams());
      expect(suggestion.isOwnedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false when the doctorId does not match', () => {
      const suggestion = Suggestion.create(makeParams());
      expect(suggestion.isOwnedBy('another-doctor-id')).toBe(false);
    });
  });

  describe('respond', () => {
    it('returns a new Suggestion with updated status', () => {
      const suggestion = Suggestion.create(makeParams());

      const responded = suggestion.respond('reviewed', null);

      expect(responded).toBeInstanceOf(Suggestion);
      expect(responded.status).toBe('reviewed');
      expect(responded.id).toBe(suggestion.id);
    });

    it('updates adminResponse when provided', () => {
      const suggestion = Suggestion.create(makeParams());

      const responded = suggestion.respond('done', 'We implemented this!');

      expect(responded.adminResponse).toBe('We implemented this!');
    });

    it('preserves existing adminResponse when null is passed', () => {
      const suggestion = Suggestion.create(makeParams({ adminResponse: 'Previous response' }));

      const responded = suggestion.respond('planned', null);

      expect(responded.adminResponse).toBe('Previous response');
    });

    it('returns an immutable new instance (does not mutate original)', () => {
      const suggestion = Suggestion.create(makeParams());

      const responded = suggestion.respond('reviewed', 'Noted');

      expect(suggestion.status).toBe('pending');
      expect(responded.status).toBe('reviewed');
    });

    it('throws SuggestionInvalidStatusError for an invalid status', () => {
      const suggestion = Suggestion.create(makeParams());

      expect(() => suggestion.respond('invalid_status', null)).toThrow(
        SuggestionInvalidStatusError,
      );
    });

    it('accepts all valid statuses', () => {
      const suggestion = Suggestion.create(makeParams());
      const validStatuses = ['pending', 'reviewed', 'planned', 'done', 'rejected'] as const;

      for (const status of validStatuses) {
        expect(() => suggestion.respond(status, null)).not.toThrow();
      }
    });

    it('updates updatedAt to a newer timestamp', () => {
      const suggestion = Suggestion.create(makeParams());

      const before = suggestion.updatedAt;
      const responded = suggestion.respond('done', null);

      // updatedAt on the new instance should be >= the original
      expect(responded.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('isValidStatus', () => {
    it('returns true for all valid statuses', () => {
      expect(Suggestion.isValidStatus('pending')).toBe(true);
      expect(Suggestion.isValidStatus('reviewed')).toBe(true);
      expect(Suggestion.isValidStatus('planned')).toBe(true);
      expect(Suggestion.isValidStatus('done')).toBe(true);
      expect(Suggestion.isValidStatus('rejected')).toBe(true);
    });

    it('returns false for invalid status', () => {
      expect(Suggestion.isValidStatus('open')).toBe(false);
      expect(Suggestion.isValidStatus('')).toBe(false);
    });
  });
});
