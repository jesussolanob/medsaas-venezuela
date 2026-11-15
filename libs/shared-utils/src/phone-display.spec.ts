import { formatPhoneInternational, phoneTelUri } from './phone-display';

describe('formatPhoneInternational', () => {
  it('formats a Venezuelan canonical number with the plus sign', () => {
    expect(formatPhoneInternational('584141234567')).toBe('+58 414-1234567');
  });

  it('prefixes other countries with the plus sign', () => {
    expect(formatPhoneInternational('5696710686')).toBe('+5696710686');
  });

  it('ignores formatting characters already present', () => {
    expect(formatPhoneInternational('+58 414-1234567')).toBe('+58 414-1234567');
  });

  it('returns empty for values that are not phone numbers', () => {
    expect(formatPhoneInternational(null)).toBe('');
    expect(formatPhoneInternational('1234')).toBe('');
    expect(formatPhoneInternational('No especificado')).toBe('');
  });
});

describe('phoneTelUri', () => {
  it('returns the E.164 value used by tel: links', () => {
    expect(phoneTelUri('584141234567')).toBe('+584141234567');
  });

  it('returns empty for values that are not phone numbers', () => {
    expect(phoneTelUri(undefined)).toBe('');
    expect(phoneTelUri('12')).toBe('');
  });
});
