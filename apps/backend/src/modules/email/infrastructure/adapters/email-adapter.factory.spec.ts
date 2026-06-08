import { createEmailAdapter } from './email-adapter.factory';
import { ResendEmailAdapter } from './resend-email.adapter';
import { NoopEmailAdapter } from './noop-email.adapter';
import type { ConfigService } from '@nestjs/config';

function makeConfig(driver: string, apiKey = 'test-key'): ConfigService {
  return {
    get: (key: string, defaultValue?: string): string => {
      if (key === 'EMAIL_DRIVER') return driver;
      if (key === 'RESEND_API_KEY') return apiKey;
      if (key === 'EMAIL_FROM') return 'test@example.com';
      return defaultValue ?? '';
    },
  } as unknown as ConfigService;
}

describe('createEmailAdapter', () => {
  it('returns ResendEmailAdapter when driver is "resend"', () => {
    const adapter = createEmailAdapter(makeConfig('resend'));
    expect(adapter).toBeInstanceOf(ResendEmailAdapter);
  });

  it('returns NoopEmailAdapter when driver is "noop"', () => {
    const adapter = createEmailAdapter(makeConfig('noop'));
    expect(adapter).toBeInstanceOf(NoopEmailAdapter);
  });

  it('defaults to NoopEmailAdapter when driver is not set (empty string)', () => {
    const adapter = createEmailAdapter(makeConfig(''));
    expect(adapter).toBeInstanceOf(NoopEmailAdapter);
  });

  it('defaults to NoopEmailAdapter when driver is an unrecognized value', () => {
    const adapter = createEmailAdapter(makeConfig('sendgrid'));
    expect(adapter).toBeInstanceOf(NoopEmailAdapter);
  });
});
