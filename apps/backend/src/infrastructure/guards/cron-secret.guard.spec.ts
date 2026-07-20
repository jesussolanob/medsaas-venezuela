import { ForbiddenException } from '@nestjs/common';
import { CronSecretGuard } from './cron-secret.guard';
import type { ExecutionContext } from '@nestjs/common';

function makeContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('CronSecretGuard', () => {
  const guard = new CronSecretGuard();
  const SECRET = 'super-secret-cron-key';

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  // ---------------------------------------------------------------------------
  // Passing cases
  // ---------------------------------------------------------------------------

  it('returns true when x-cron-secret matches CRON_SECRET', () => {
    const ctx = makeContext({ 'x-cron-secret': SECRET });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Failing cases — wrong header
  // ---------------------------------------------------------------------------

  it('throws ForbiddenException when x-cron-secret is wrong', () => {
    const ctx = makeContext({ 'x-cron-secret': 'wrong-value' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when x-cron-secret header is absent', () => {
    const ctx = makeContext({});
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when x-cron-secret is an empty string', () => {
    const ctx = makeContext({ 'x-cron-secret': '' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('is case-sensitive: rejects header with different casing', () => {
    const ctx = makeContext({ 'x-cron-secret': SECRET.toUpperCase() });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // ---------------------------------------------------------------------------
  // Fail-closed — CRON_SECRET not configured
  // ---------------------------------------------------------------------------

  it('throws ForbiddenException when CRON_SECRET env var is not set', () => {
    delete process.env.CRON_SECRET;
    // Even with the correct-looking header, guard rejects when env is absent
    const ctx = makeContext({ 'x-cron-secret': 'any-value' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when CRON_SECRET env var is empty string', () => {
    process.env.CRON_SECRET = '';
    const ctx = makeContext({ 'x-cron-secret': '' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
