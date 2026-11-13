import { TeamMeeting, MEETING_MODIFY_CUTOFF_HOURS } from './team-meeting.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-30T12:00:00.000Z');
// Meeting starts in 3 hours — modifiable (> 2h cutoff)
const STARTS_IN_3H = new Date(NOW.getTime() + 3 * 60 * 60 * 1000);
// Meeting starts in 1 hour — NOT modifiable (< 2h cutoff)
const STARTS_IN_1H = new Date(NOW.getTime() + 1 * 60 * 60 * 1000);
// Meeting starts in exactly 2 hours — NOT modifiable (cutoff is strict <)
const STARTS_IN_2H = new Date(NOW.getTime() + MEETING_MODIFY_CUTOFF_HOURS * 60 * 60 * 1000);

function makeMeeting(
  overrides: Partial<{
    status: TeamMeeting['status'];
    startsAt: Date;
    doctorId: string;
  }>,
): TeamMeeting {
  return TeamMeeting.create({
    id: 'mmmmmmmm-0000-0000-0000-000000000001',
    doctorId: overrides.doctorId ?? DOCTOR_ID,
    startsAt: overrides.startsAt ?? STARTS_IN_3H,
    endsAt: new Date((overrides.startsAt ?? STARTS_IN_3H).getTime() + 30 * 60 * 1000),
    status: overrides.status ?? 'scheduled',
    meetingUrl: null,
    externalEventId: null,
    availabilityBlockId: null,
    source: 'modal',
    notes: null,
    reminder24hSentAt: null,
    reminder1hSentAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('TeamMeeting entity', () => {
  describe('isScheduled()', () => {
    it('returns true for scheduled status', () => {
      expect(makeMeeting({ status: 'scheduled' }).isScheduled()).toBe(true);
    });

    it('returns false for done status', () => {
      expect(makeMeeting({ status: 'done' }).isScheduled()).toBe(false);
    });

    it('returns false for cancelled status', () => {
      expect(makeMeeting({ status: 'cancelled' }).isScheduled()).toBe(false);
    });
  });

  describe('isModifiable()', () => {
    it('returns true when more than 2h before the meeting', () => {
      expect(makeMeeting({ startsAt: STARTS_IN_3H }).isModifiable(NOW)).toBe(true);
    });

    it('returns false when exactly 2h before the meeting (cutoff is strict <)', () => {
      expect(makeMeeting({ startsAt: STARTS_IN_2H }).isModifiable(NOW)).toBe(false);
    });

    it('returns false when less than 2h before the meeting', () => {
      expect(makeMeeting({ startsAt: STARTS_IN_1H }).isModifiable(NOW)).toBe(false);
    });

    it('returns false for a cancelled meeting even if far in the future', () => {
      expect(makeMeeting({ status: 'cancelled', startsAt: STARTS_IN_3H }).isModifiable(NOW)).toBe(
        false,
      );
    });

    it('returns false for a done meeting', () => {
      expect(makeMeeting({ status: 'done', startsAt: STARTS_IN_3H }).isModifiable(NOW)).toBe(false);
    });
  });

  describe('isOwnedBy()', () => {
    it('returns true for the owner', () => {
      expect(makeMeeting({}).isOwnedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false for a different doctor', () => {
      expect(makeMeeting({}).isOwnedBy('other-doctor-id')).toBe(false);
    });
  });

  describe('Caracas day boundary', () => {
    it('meeting at 08:00 Caracas time is modifiable more than 2h before', () => {
      // 08:00 Caracas = 12:00 UTC
      const startsAt08Caracas = new Date('2026-10-31T12:00:00.000Z');
      // Now is 5h before (07:00 UTC = 03:00 Caracas the same day)
      const fiveHoursBefore = new Date(startsAt08Caracas.getTime() - 5 * 60 * 60 * 1000);
      expect(makeMeeting({ startsAt: startsAt08Caracas }).isModifiable(fiveHoursBefore)).toBe(true);
    });
  });
});
