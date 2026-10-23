import { formatShareExpiryCaracas } from './format-share-expiry-caracas';

/**
 * Venezuela is UTC-4 (no DST). UTC-4 means:
 *   UTC 04:00 → Caracas 00:00 (same calendar day)
 *   UTC 03:59 → Caracas 23:59 (PREVIOUS calendar day)
 */
describe('formatShareExpiryCaracas', () => {
  it('converts a UTC time to Caracas local time', () => {
    // UTC 2026-10-26 04:33 → Caracas 2026-10-26 00:33
    const utcDate = new Date('2026-10-26T04:33:00Z');
    const result = formatShareExpiryCaracas(utcDate);

    expect(result).toContain('26');
    expect(result).toContain('octubre');
    expect(result).toContain('2026');
    expect(result).toContain('00:33');
  });

  it('falls to the previous calendar day in Caracas when UTC time is before 04:00', () => {
    // UTC 2026-10-26 03:59 → Caracas 2026-10-25 23:59
    const utcDate = new Date('2026-10-26T03:59:00Z');
    const result = formatShareExpiryCaracas(utcDate);

    expect(result).toContain('25');
    expect(result).toContain('octubre');
    expect(result).toContain('2026');
    expect(result).toContain('23:59');
  });

  it('renders midnight UTC as 20:00 in Caracas', () => {
    // UTC 2026-10-26 00:00 → Caracas 2026-10-25 20:00
    const utcDate = new Date('2026-10-26T00:00:00Z');
    const result = formatShareExpiryCaracas(utcDate);

    expect(result).toContain('25');
    expect(result).toContain('octubre');
    expect(result).toContain('20:00');
  });

  it('uses 24-hour format — does NOT contain "a." or "p." (no am/pm suffix)', () => {
    // Any early-morning UTC time (which would be late evening in Caracas)
    const utcDate = new Date('2026-10-26T02:00:00Z'); // Caracas 22:00
    const result = formatShareExpiryCaracas(utcDate);

    expect(result).not.toMatch(/a\.\s*m\./i);
    expect(result).not.toMatch(/p\.\s*m\./i);
    expect(result).toContain('22:00');
  });

  it('formats the month in Spanish long form', () => {
    const utcDate = new Date('2026-01-15T10:00:00Z');
    const result = formatShareExpiryCaracas(utcDate);
    expect(result).toContain('enero');
  });

  it('returns a string', () => {
    expect(typeof formatShareExpiryCaracas(new Date())).toBe('string');
  });
});
