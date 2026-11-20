import { parseAdminExtraEmails } from './parse-admin-extra-emails.util';

describe('parseAdminExtraEmails', () => {
  // ---------------------------------------------------------------------------
  // Falsy / empty input
  // ---------------------------------------------------------------------------

  it('returns empty array for null', () => {
    expect(parseAdminExtraEmails(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseAdminExtraEmails(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseAdminExtraEmails('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseAdminExtraEmails('   ')).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Single valid address
  // ---------------------------------------------------------------------------

  it('returns a single valid email', () => {
    expect(parseAdminExtraEmails('seller@example.com')).toEqual(['seller@example.com']);
  });

  it('lowercases a single email', () => {
    expect(parseAdminExtraEmails('Seller@Example.COM')).toEqual(['seller@example.com']);
  });

  it('trims surrounding whitespace from a single email', () => {
    expect(parseAdminExtraEmails('  seller@example.com  ')).toEqual(['seller@example.com']);
  });

  // ---------------------------------------------------------------------------
  // Separators
  // ---------------------------------------------------------------------------

  it('splits on comma', () => {
    expect(parseAdminExtraEmails('a@x.com,b@x.com')).toEqual(['a@x.com', 'b@x.com']);
  });

  it('splits on semicolon', () => {
    expect(parseAdminExtraEmails('a@x.com;b@x.com')).toEqual(['a@x.com', 'b@x.com']);
  });

  it('splits on newline', () => {
    expect(parseAdminExtraEmails('a@x.com\nb@x.com')).toEqual(['a@x.com', 'b@x.com']);
  });

  it('splits on mixed separators (comma + semicolon + newline)', () => {
    const raw = 'a@x.com,b@x.com;c@x.com\nd@x.com';
    expect(parseAdminExtraEmails(raw)).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
  });

  it('handles extra whitespace around separators', () => {
    const raw = '  a@x.com , b@x.com ;  c@x.com  ';
    expect(parseAdminExtraEmails(raw)).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('ignores empty tokens produced by consecutive separators', () => {
    expect(parseAdminExtraEmails('a@x.com,,b@x.com')).toEqual(['a@x.com', 'b@x.com']);
  });

  // ---------------------------------------------------------------------------
  // Case normalisation
  // ---------------------------------------------------------------------------

  it('lowercases all emails in a list', () => {
    expect(parseAdminExtraEmails('A@X.COM,B@Y.ORG')).toEqual(['a@x.com', 'b@y.org']);
  });

  // ---------------------------------------------------------------------------
  // Invalid addresses are dropped
  // ---------------------------------------------------------------------------

  it('drops tokens without an @ sign', () => {
    expect(parseAdminExtraEmails('notanemail,valid@x.com')).toEqual(['valid@x.com']);
  });

  it('drops tokens without a domain part after @', () => {
    expect(parseAdminExtraEmails('user@,valid@x.com')).toEqual(['valid@x.com']);
  });

  it('drops tokens without a TLD after the dot', () => {
    expect(parseAdminExtraEmails('user@domain,valid@x.com')).toEqual(['valid@x.com']);
  });

  it('drops tokens containing spaces in the local part', () => {
    expect(parseAdminExtraEmails('bad email@x.com,valid@x.com')).toEqual(['valid@x.com']);
  });

  it('returns empty array when all tokens are invalid', () => {
    expect(parseAdminExtraEmails('notanemail;alsoinvalid')).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------------------

  it('deduplicates the same address appearing twice', () => {
    expect(parseAdminExtraEmails('a@x.com,a@x.com')).toEqual(['a@x.com']);
  });

  it('deduplicates the same address with different casing', () => {
    expect(parseAdminExtraEmails('A@X.COM,a@x.com')).toEqual(['a@x.com']);
  });

  it('keeps distinct valid addresses', () => {
    expect(parseAdminExtraEmails('a@x.com,b@x.com,c@x.com')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ]);
  });

  // ---------------------------------------------------------------------------
  // Real-world examples
  // ---------------------------------------------------------------------------

  it('parses a realistic multi-line config value', () => {
    const raw = `
      laura.deltasalud@gmail.com
      support@deltasalud.app
      ADMIN@DELTASALUD.APP
    `;
    expect(parseAdminExtraEmails(raw)).toEqual([
      'laura.deltasalud@gmail.com',
      'support@deltasalud.app',
      'admin@deltasalud.app',
    ]);
  });
});
