import { ageFromBirthDate } from './age-from-birth-date';

// 2026-11-24 15:00 UTC = 11:00 in Caracas.
const NOW = new Date('2026-11-24T15:00:00Z');

describe('ageFromBirthDate', () => {
  it('counts completed years', () => {
    expect(ageFromBirthDate('1990-05-10', NOW)).toBe(36);
  });

  it('does not count the year until the birthday arrives', () => {
    expect(ageFromBirthDate('1990-11-25', NOW)).toBe(35);
    expect(ageFromBirthDate('1990-11-24', NOW)).toBe(36);
  });

  it('uses the Caracas date, not the UTC date', () => {
    // 2026-11-25 02:00 UTC is still 2026-11-24 in Caracas.
    expect(ageFromBirthDate('1990-11-25', new Date('2026-11-25T02:00:00Z'))).toBe(35);
  });

  it('accepts a timestamp string or a Date', () => {
    expect(ageFromBirthDate('1990-05-10T00:00:00.000Z', NOW)).toBe(36);
    expect(ageFromBirthDate(new Date('1990-05-10T00:00:00Z'), NOW)).toBe(36);
  });

  it('returns null for missing, malformed, future or implausible dates', () => {
    expect(ageFromBirthDate(null, NOW)).toBeNull();
    expect(ageFromBirthDate('', NOW)).toBeNull();
    expect(ageFromBirthDate('10/05/1990', NOW)).toBeNull();
    expect(ageFromBirthDate('2027-01-01', NOW)).toBeNull();
    expect(ageFromBirthDate('1800-01-01', NOW)).toBeNull();
  });
});
