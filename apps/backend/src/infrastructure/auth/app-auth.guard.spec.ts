import { type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppAuthGuard } from './app-auth.guard';
import { DevAuthGuard } from './dev-auth.guard';
import { Auth0Guard } from './auth0.guard';

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

function makeContext(): ExecutionContext {
  const request = { headers: {}, user: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
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
    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard);

    const ctx = makeContext();
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to DevAuthGuard when AUTH_MODE is undefined (default)', async () => {
    const guard = new AppAuthGuard(makeConfigService(undefined), devAuthGuard, auth0Guard);

    const ctx = makeContext();
    await guard.canActivate(ctx);

    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to DevAuthGuard when AUTH_MODE is an empty string', async () => {
    const guard = new AppAuthGuard(makeConfigService(''), devAuthGuard, auth0Guard);

    const ctx = makeContext();
    await guard.canActivate(ctx);

    expect(devAuthGuard.canActivate).toHaveBeenCalledWith(ctx);
    expect(auth0Guard.canActivate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Dispatch to Auth0Guard
  // -------------------------------------------------------------------------

  it('delegates to Auth0Guard when AUTH_MODE=auth0', async () => {
    const guard = new AppAuthGuard(makeConfigService('auth0'), devAuthGuard, auth0Guard);

    const ctx = makeContext();
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(auth0Guard.canActivate).toHaveBeenCalledWith(ctx);
    expect(devAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it('propagates rejection from DevAuthGuard when dev mode', async () => {
    devAuthGuard.canActivate.mockImplementation(() => {
      throw new Error('DevAuth failed');
    });
    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard);

    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow('DevAuth failed');
  });

  it('propagates rejection from Auth0Guard when auth0 mode', async () => {
    auth0Guard.canActivate.mockRejectedValue(new Error('Token expired'));
    const guard = new AppAuthGuard(makeConfigService('auth0'), devAuthGuard, auth0Guard);

    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow('Token expired');
  });

  it('returns false when DevAuthGuard returns false', async () => {
    devAuthGuard.canActivate.mockReturnValue(false);
    const guard = new AppAuthGuard(makeConfigService('dev'), devAuthGuard, auth0Guard);

    const ctx = makeContext();
    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });
});
