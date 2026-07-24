import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppAuthGuard } from './app-auth.guard';
import { DevAuthGuard } from './dev-auth.guard';
import { Auth0Guard } from './auth0.guard';
import type { IAccountStatusPort } from './account-status.port';
import { AccountBlockedError } from './errors/account-blocked.error';
import type { ReviewerTokenService, ReviewerPayload } from './reviewer-token.service';

// We mock Auth0Guard entirely — its own spec covers the JWT logic
jest.mock('./auth0.guard');
jest.mock('./dev-auth.guard');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigService(
  authMode: string | undefined,
  reviewerEnabled = false,
  reviewerProfileId = 'reviewer-profile-uuid',
): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'AUTH_MODE') return authMode;
      if (key === 'REVIEWER_ACCESS_ENABLED') return reviewerEnabled ? 'true' : 'false';
      if (key === 'REVIEWER_PROFILE_ID') return reviewerProfileId;
      return undefined;
    }),
  } as unknown as ConfigService;
}

function makeContext(
  user?: { sub: string; role: string },
  headers: Record<string, string> = {},
): ExecutionContext {
  const request: {
    headers: Record<string, string>;
    user?: { sub: string; role: string };
  } = { headers, user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeAccountStatusPort(active = true): jest.Mocked<IAccountStatusPort> {
  return { isActive: jest.fn().mockResolvedValue(active) };
}

function makeReviewerTokenService(
  verifyResult: ReviewerPayload | null = null,
): jest.Mocked<ReviewerTokenService> {
  return {
    verify: jest.fn().mockReturnValue(verifyResult),
  } as unknown as jest.Mocked<ReviewerTokenService>;
}

function makeGuard(
  config: ConfigService,
  devAuthGuard: jest.Mocked<DevAuthGuard>,
  auth0Guard: jest.Mocked<Auth0Guard>,
  port: jest.Mocked<IAccountStatusPort>,
  reviewerTokenService: jest.Mocked<ReviewerTokenService>,
): AppAuthGuard {
  return new AppAuthGuard(config, devAuthGuard, auth0Guard, port, reviewerTokenService);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('AppAuthGuard', () => {
  let devAuthGuard: jest.Mocked<DevAuthGuard>;
  let auth0Guard: jest.Mocked<Auth0Guard>;

  beforeEach(() => {
    jest.clearAllMocks();
    devAuthGuard = {
      canActivate: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<DevAuthGuard>;

    auth0Guard = {
      canActivate: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Auth0Guard>;
  });

  // =========================================================================
  // Dispatch to DevAuthGuard
  // =========================================================================

  it('delegates to DevAuthGuard when AUTH_MODE=dev', async () => {
    const port = makeAccountStatusPort(true);
    const ctx = makeContext(undefined);
    devAuthGuard.canActivate.mockReturnValue(true);

    const guard = makeGuard(
      makeConfigService('dev'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to DevAuthGuard when AUTH_MODE is undefined (default)', async () => {
    const port = makeAccountStatusPort(true);
    const ctx = makeContext(undefined);

    const guard = makeGuard(
      makeConfigService(undefined),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );
    await guard.canActivate(ctx);

    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to DevAuthGuard when AUTH_MODE is an empty string', async () => {
    const port = makeAccountStatusPort(true);
    const ctx = makeContext(undefined);

    const guard = makeGuard(
      makeConfigService(''),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );
    await guard.canActivate(ctx);

    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Dispatch to Auth0Guard
  // =========================================================================

  it('delegates to Auth0Guard when AUTH_MODE=auth0', async () => {
    const port = makeAccountStatusPort(true);
    const ctx = makeContext(undefined);

    const guard = makeGuard(
      makeConfigService('auth0'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(auth0Guard.canActivate).toHaveBeenCalledWith(ctx);
    expect(devAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Error propagation
  // =========================================================================

  it('propagates rejection from DevAuthGuard when dev mode', async () => {
    const port = makeAccountStatusPort(true);
    devAuthGuard.canActivate.mockImplementation(() => {
      throw new Error('DevAuth failed');
    });
    const guard = makeGuard(
      makeConfigService('dev'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );

    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow('DevAuth failed');
  });

  it('propagates rejection from Auth0Guard when auth0 mode', async () => {
    const port = makeAccountStatusPort(true);
    auth0Guard.canActivate.mockRejectedValue(new Error('Token expired'));
    const guard = makeGuard(
      makeConfigService('auth0'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );

    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Token expired');
  });

  it('returns false when DevAuthGuard returns false', async () => {
    const port = makeAccountStatusPort(true);
    devAuthGuard.canActivate.mockReturnValue(false);
    const guard = makeGuard(
      makeConfigService('dev'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );

    const ctx = makeContext(undefined);
    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  // =========================================================================
  // Account block enforcement
  // =========================================================================

  it('allows a doctor with is_active=true to pass', async () => {
    const port = makeAccountStatusPort(true);
    const ctx = makeContext({ sub: 'doctor-1', role: 'doctor' });

    const guard = makeGuard(
      makeConfigService('dev'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(port.isActive).toHaveBeenCalledWith('doctor-1');
  });

  it('throws AccountBlockedError (403) when a doctor has is_active=false', async () => {
    const port = makeAccountStatusPort(false);
    const ctx = makeContext({ sub: 'blocked-doc', role: 'doctor' });

    const guard = makeGuard(
      makeConfigService('dev'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AccountBlockedError);
    expect(port.isActive).toHaveBeenCalledWith('blocked-doc');
  });

  it('verifies AccountBlockedError has code ACCOUNT_BLOCKED and httpStatus 403', async () => {
    const port = makeAccountStatusPort(false);
    const ctx = makeContext({ sub: 'blocked-doc', role: 'doctor' });

    const guard = makeGuard(
      makeConfigService('dev'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );

    try {
      await guard.canActivate(ctx);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AccountBlockedError);
      expect((err as AccountBlockedError).code).toBe('ACCOUNT_BLOCKED');
      expect((err as AccountBlockedError).httpStatus).toBe(403);
    }
  });

  it('skips block check for super_admin even when is_active=false', async () => {
    const port = makeAccountStatusPort(false);
    const ctx = makeContext({ sub: 'admin-1', role: 'super_admin' });

    const guard = makeGuard(
      makeConfigService('dev'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    // Port must NOT be called for super_admin
    expect(port.isActive).not.toHaveBeenCalled();
  });

  it('skips block check when request.user is not set (underlying guard not setting user)', async () => {
    const port = makeAccountStatusPort(false);
    const ctx = makeContext(undefined);

    const guard = makeGuard(
      makeConfigService('dev'),
      devAuthGuard,
      auth0Guard,
      port,
      makeReviewerTokenService(),
    );
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(port.isActive).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Reviewer path — flag OFF
  // =========================================================================

  it('ignores x-reviewer-token header and falls through to dev path when flag is off', async () => {
    const port = makeAccountStatusPort(true);
    const reviewerSvc = makeReviewerTokenService({ sub: 'demo-id', exp: 9999999999 });

    const ctx = makeContext(undefined, { 'x-reviewer-token': 'some-token-value' });

    const guard = makeGuard(
      makeConfigService('dev', false), // flag off
      devAuthGuard,
      auth0Guard,
      port,
      reviewerSvc,
    );
    await guard.canActivate(ctx);

    // Must fall through to DevAuthGuard, never call reviewerTokenService.verify
    expect(reviewerSvc.verify).not.toHaveBeenCalled();
    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
  });

  it('falls through to auth0 path (not reviewer) when flag is off, even with header', async () => {
    const port = makeAccountStatusPort(true);
    const reviewerSvc = makeReviewerTokenService({ sub: 'demo-id', exp: 9999999999 });

    const ctx = makeContext(undefined, { 'x-reviewer-token': 'any-token' });

    const guard = makeGuard(
      makeConfigService('auth0', false), // flag off, auth0 mode
      devAuthGuard,
      auth0Guard,
      port,
      reviewerSvc,
    );
    await guard.canActivate(ctx);

    expect(reviewerSvc.verify).not.toHaveBeenCalled();
    expect(auth0Guard.canActivate).toHaveBeenCalledWith(ctx);
    expect(devAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Reviewer path — flag ON, valid token
  // =========================================================================

  it('accepts a valid reviewer token and sets request.user to demo doctor', async () => {
    const port = makeAccountStatusPort(true);
    const DEMO_SUB = 'demo-doctor-profile-uuid';
    const reviewerSvc = makeReviewerTokenService({ sub: DEMO_SUB, exp: 9999999999 });

    const requestObj: { headers: Record<string, string>; user?: { sub: string; role: string } } = {
      headers: { 'x-reviewer-token': 'valid-token-here' },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => requestObj }),
    } as unknown as ExecutionContext;

    const guard = makeGuard(
      makeConfigService('auth0', true), // flag on; mode irrelevant for reviewer path
      devAuthGuard,
      auth0Guard,
      port,
      reviewerSvc,
    );

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(requestObj.user).toEqual({ sub: DEMO_SUB, role: 'doctor' });
    // Must NOT dispatch to auth0 or dev guard
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
    expect(devAuthGuard.canActivate).not.toHaveBeenCalled();
    // Ban check must run on the reviewer profile
    expect(port.isActive).toHaveBeenCalledWith(DEMO_SUB);
  });

  it('reviewer user is blocked when demo profile has is_active=false', async () => {
    const port = makeAccountStatusPort(false);
    const DEMO_SUB = 'demo-doctor-profile-uuid';
    const reviewerSvc = makeReviewerTokenService({ sub: DEMO_SUB, exp: 9999999999 });

    const ctx = makeContext(undefined, { 'x-reviewer-token': 'valid-token-here' });

    const guard = makeGuard(
      makeConfigService('dev', true),
      devAuthGuard,
      auth0Guard,
      port,
      reviewerSvc,
    );

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AccountBlockedError);
    expect(port.isActive).toHaveBeenCalledWith(DEMO_SUB);
  });

  it('reviewer role is always doctor — never super_admin', async () => {
    const port = makeAccountStatusPort(true);
    const reviewerSvc = makeReviewerTokenService({ sub: 'demo-id', exp: 9999999999 });

    const requestObj: { headers: Record<string, string>; user?: { sub: string; role: string } } = {
      headers: { 'x-reviewer-token': 'valid-token' },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => requestObj }),
    } as unknown as ExecutionContext;

    const guard = makeGuard(
      makeConfigService('dev', true),
      devAuthGuard,
      auth0Guard,
      port,
      reviewerSvc,
    );

    await guard.canActivate(ctx);

    expect(requestObj.user?.role).toBe('doctor');
    // Ban check IS called — we did not skip it (as we would for super_admin)
    expect(port.isActive).toHaveBeenCalled();
  });

  // =========================================================================
  // Reviewer path — flag ON, invalid/expired token
  // =========================================================================

  it('throws 401 when reviewer flag is on but token is invalid (verify returns null)', async () => {
    const port = makeAccountStatusPort(true);
    const reviewerSvc = makeReviewerTokenService(null); // verify returns null

    const ctx = makeContext(undefined, { 'x-reviewer-token': 'bad-or-expired-token' });

    const guard = makeGuard(
      makeConfigService('dev', true),
      devAuthGuard,
      auth0Guard,
      port,
      reviewerSvc,
    );

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    // Must NOT fall through to dev/auth0
    expect(devAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  it('rejects with 401 for an empty x-reviewer-token when flag is on', async () => {
    // An empty string header is treated as "no header" — falls through to normal dispatch.
    // This test verifies that an empty string does NOT trigger the reviewer path.
    const port = makeAccountStatusPort(true);
    const reviewerSvc = makeReviewerTokenService(null);

    const ctx = makeContext(undefined, { 'x-reviewer-token': '' });

    const guard = makeGuard(
      makeConfigService('dev', true),
      devAuthGuard,
      auth0Guard,
      port,
      reviewerSvc,
    );

    // Empty string → fall through to DevAuthGuard (header treated as absent)
    await guard.canActivate(ctx);
    expect(reviewerSvc.verify).not.toHaveBeenCalled();
    expect(devAuthGuard.canActivate).toHaveBeenCalled();
  });

  it('does not call dev/auth0 guard after invalid reviewer token (no fallback)', async () => {
    const port = makeAccountStatusPort(true);
    const reviewerSvc = makeReviewerTokenService(null);

    const ctx = makeContext(undefined, { 'x-reviewer-token': 'forged.token' });

    const guard = makeGuard(
      makeConfigService('auth0', true),
      devAuthGuard,
      auth0Guard,
      port,
      reviewerSvc,
    );

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
    expect(devAuthGuard.canActivate).not.toHaveBeenCalled();
  });
});
