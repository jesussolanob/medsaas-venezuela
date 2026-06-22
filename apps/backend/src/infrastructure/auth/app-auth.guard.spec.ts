import { type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppAuthGuard } from './app-auth.guard';
import { DevAuthGuard } from './dev-auth.guard';
import { Auth0Guard } from './auth0.guard';
import type { IAccountStatusPort } from './account-status.port';
import { AccountBlockedError } from './errors/account-blocked.error';

// We mock Auth0Guard entirely — its own spec covers the JWT logic
jest.mock('./auth0.guard');
jest.mock('./dev-auth.guard');

function makeConfigService(authMode: string | undefined): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'AUTH_MODE') return authMode;
      return undefined;
    }),
  } as unknown as ConfigService;
}

function makeContext(user?: { sub: string; role: string }): ExecutionContext {
  const request: { headers: Record<string, string>; user?: { sub: string; role: string } } = {
    headers: {},
    user,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeAccountStatusPort(active = true): jest.Mocked<IAccountStatusPort> {
  return {
    isActive: jest.fn().mockResolvedValue(active),
  };
}

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

  // -------------------------------------------------------------------------
  // Dispatch to DevAuthGuard
  // -------------------------------------------------------------------------

  it('delegates to DevAuthGuard when AUTH_MODE=dev', async () => {
    const port = makeAccountStatusPort(true);
    // underlying guard does NOT set request.user — simulate no user on context
    const ctx = makeContext(undefined);
    devAuthGuard.canActivate.mockReturnValue(true);

    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard, port);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to DevAuthGuard when AUTH_MODE is undefined (default)', async () => {
    const port = makeAccountStatusPort(true);
    const ctx = makeContext(undefined);

    const guard = new AppAuthGuard(makeConfigService(undefined), devAuthGuard, auth0Guard, port);
    await guard.canActivate(ctx);

    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to DevAuthGuard when AUTH_MODE is an empty string', async () => {
    const port = makeAccountStatusPort(true);
    const ctx = makeContext(undefined);

    const guard = new AppAuthGuard(makeConfigService(''), devAuthGuard, auth0Guard, port);
    await guard.canActivate(ctx);

    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Dispatch to Auth0Guard
  // -------------------------------------------------------------------------

  it('delegates to Auth0Guard when AUTH_MODE=auth0', async () => {
    const port = makeAccountStatusPort(true);
    const ctx = makeContext(undefined);

    const guard = new AppAuthGuard(makeConfigService('auth0'), devAuthGuard, auth0Guard, port);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(auth0Guard.canActivate).toHaveBeenCalledWith(ctx);
    expect(devAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it('propagates rejection from DevAuthGuard when dev mode', async () => {
    const port = makeAccountStatusPort(true);
    devAuthGuard.canActivate.mockImplementation(() => {
      throw new Error('DevAuth failed');
    });
    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard, port);

    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow('DevAuth failed');
  });

  it('propagates rejection from Auth0Guard when auth0 mode', async () => {
    const port = makeAccountStatusPort(true);
    auth0Guard.canActivate.mockRejectedValue(new Error('Token expired'));
    const guard = new AppAuthGuard(makeConfigService('auth0'), devAuthGuard, auth0Guard, port);

    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Token expired');
  });

  it('returns false when DevAuthGuard returns false', async () => {
    const port = makeAccountStatusPort(true);
    devAuthGuard.canActivate.mockReturnValue(false);
    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard, port);

    const ctx = makeContext(undefined);
    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Account block enforcement
  // -------------------------------------------------------------------------

  it('allows a doctor with is_active=true to pass', async () => {
    const port = makeAccountStatusPort(true);
    const ctx = makeContext({ sub: 'doctor-1', role: 'doctor' });

    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard, port);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(port.isActive).toHaveBeenCalledWith('doctor-1');
  });

  it('throws AccountBlockedError (403) when a doctor has is_active=false', async () => {
    const port = makeAccountStatusPort(false);
    const ctx = makeContext({ sub: 'blocked-doc', role: 'doctor' });

    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard, port);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AccountBlockedError);
    expect(port.isActive).toHaveBeenCalledWith('blocked-doc');
  });

  it('verifies AccountBlockedError has code ACCOUNT_BLOCKED and httpStatus 403', async () => {
    const port = makeAccountStatusPort(false);
    const ctx = makeContext({ sub: 'blocked-doc', role: 'doctor' });

    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard, port);

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

    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard, port);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    // Port must NOT be called for super_admin
    expect(port.isActive).not.toHaveBeenCalled();
  });

  it('skips block check when request.user is not set (underlying guard not setting user)', async () => {
    const port = makeAccountStatusPort(false);
    const ctx = makeContext(undefined);

    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard, port);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(port.isActive).not.toHaveBeenCalled();
  });
});
