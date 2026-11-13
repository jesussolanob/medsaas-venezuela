import { DoctorPrompt, type DoctorPromptProps } from './doctor-prompt.entity';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const FUTURE = new Date('2026-10-31T12:00:00.000Z');
const PAST = new Date('2026-10-29T12:00:00.000Z');

function makePrompt(overrides: Partial<DoctorPromptProps> = {}): DoctorPrompt {
  return DoctorPrompt.create({
    id: 'pppppppp-0000-0000-0000-000000000001',
    doctorId: 'dddddddd-0000-0000-0000-000000000001',
    promptKey: 'meeting_modal',
    shownCount: 0,
    firstShownAt: null,
    lastShownAt: null,
    actedAt: null,
    snoozedUntil: null,
    dismissedAt: null,
    metadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

describe('DoctorPrompt entity', () => {
  describe('isDismissed()', () => {
    it('returns false when dismissedAt is null', () => {
      expect(makePrompt().isDismissed()).toBe(false);
    });

    it('returns true when dismissedAt is set', () => {
      expect(makePrompt({ dismissedAt: PAST }).isDismissed()).toBe(true);
    });
  });

  describe('isSnoozed()', () => {
    it('returns false when snoozedUntil is null', () => {
      expect(makePrompt().isSnoozed(NOW)).toBe(false);
    });

    it('returns true when snoozedUntil is in the future', () => {
      expect(makePrompt({ snoozedUntil: FUTURE }).isSnoozed(NOW)).toBe(true);
    });

    it('returns false when snoozedUntil is in the past', () => {
      expect(makePrompt({ snoozedUntil: PAST }).isSnoozed(NOW)).toBe(false);
    });

    it('returns false when snoozedUntil equals now exactly', () => {
      expect(makePrompt({ snoozedUntil: NOW }).isSnoozed(NOW)).toBe(false);
    });
  });

  describe('hasActed()', () => {
    it('returns false when actedAt is null', () => {
      expect(makePrompt().hasActed()).toBe(false);
    });

    it('returns true when actedAt is set', () => {
      expect(makePrompt({ actedAt: PAST }).hasActed()).toBe(true);
    });
  });

  describe('hasExceededMaxShows()', () => {
    it('returns false when shownCount < maxShows', () => {
      expect(makePrompt({ shownCount: 2 }).hasExceededMaxShows(3)).toBe(false);
    });

    it('returns true when shownCount equals maxShows', () => {
      expect(makePrompt({ shownCount: 3 }).hasExceededMaxShows(3)).toBe(true);
    });

    it('returns true when shownCount exceeds maxShows', () => {
      expect(makePrompt({ shownCount: 5 }).hasExceededMaxShows(3)).toBe(true);
    });

    it('returns false when shownCount is 0', () => {
      expect(makePrompt({ shownCount: 0 }).hasExceededMaxShows(3)).toBe(false);
    });
  });
});
