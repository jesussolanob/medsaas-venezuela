import { computeActiveStatus } from './appointment-status.policy';

describe('computeActiveStatus', () => {
  it('returns confirmed for a slot 1 hour from now (well within 3 days)', () => {
    const nearFuture = new Date(Date.now() + 60 * 60 * 1000);
    expect(computeActiveStatus(nearFuture)).toBe('confirmed');
  });

  it('returns confirmed for a slot exactly 2 days from now (< 3 threshold)', () => {
    const twoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 - 1000);
    expect(computeActiveStatus(twoDays)).toBe('confirmed');
  });

  it('returns scheduled for a slot 5 days from now (>= 3 threshold)', () => {
    const farFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    expect(computeActiveStatus(farFuture)).toBe('scheduled');
  });

  it('returns scheduled for a slot exactly 3 days from now (meets threshold, not below)', () => {
    // 3 days out: daysUntil ≈ 3, not < 3 → scheduled
    const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 1000);
    expect(computeActiveStatus(threeDays)).toBe('scheduled');
  });

  it('returns confirmed for a slot in the past (daysUntil < 0 satisfies < 3 threshold)', () => {
    // Past dates fall through to 'confirmed' — callers that want 'completed'
    // must check scheduledAt < Date.now() before calling.
    const pastDate = new Date(Date.now() - 60 * 60 * 1000);
    expect(computeActiveStatus(pastDate)).toBe('confirmed');
  });
});
