import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { CapabilitiesGuard } from './capabilities.guard';
import { ResolveCapabilitiesUseCase } from '../../application/use-cases/capabilities/resolve-capabilities.use-case';
import { CapabilityDeniedError } from '../../domain/errors/capability-denied.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const makeUser = (role: CurrentUserPayload['role'] = 'doctor'): CurrentUserPayload => ({
  sub: 'user-1',
  role,
  email: 'doctor@dev.local',
});

const makeContext = (user: CurrentUserPayload | null = makeUser()): ExecutionContext => {
  const request = { user };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
};

const makeResolveUseCase = (modules: Record<string, Record<string, boolean>> = {}) => ({
  execute: jest.fn().mockResolvedValue({ role: 'doctor', modules }),
});

describe('CapabilitiesGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let resolveUseCase: ReturnType<typeof makeResolveUseCase>;

  const makeGuard = () =>
    new CapabilitiesGuard(reflector, resolveUseCase as unknown as ResolveCapabilitiesUseCase);

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    resolveUseCase = makeResolveUseCase({
      agenda: { view: true, create: false, edit: false, delete: false },
      finances: { view: false, create: false, edit: false, delete: false },
    });
  });

  it('allows access when no @RequireCapability() decorator is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const guard = makeGuard();

    const result = await guard.canActivate(makeContext());

    expect(result).toBe(true);
  });

  it('allows access when user has the required capability', async () => {
    reflector.getAllAndOverride.mockReturnValue({ moduleKey: 'agenda', action: 'view' });
    const guard = makeGuard();

    const result = await guard.canActivate(makeContext(makeUser('doctor')));

    expect(result).toBe(true);
  });

  it('throws CapabilityDeniedError when capability is not allowed', async () => {
    reflector.getAllAndOverride.mockReturnValue({ moduleKey: 'finances', action: 'view' });
    const guard = makeGuard();

    await expect(guard.canActivate(makeContext(makeUser('doctor')))).rejects.toThrow(
      CapabilityDeniedError,
    );
  });

  it('throws CapabilityDeniedError when module is not in the map', async () => {
    reflector.getAllAndOverride.mockReturnValue({ moduleKey: 'unknown_module', action: 'view' });
    const guard = makeGuard();

    await expect(guard.canActivate(makeContext(makeUser('doctor')))).rejects.toThrow(
      CapabilityDeniedError,
    );
  });

  it('throws CapabilityDeniedError when user is not authenticated', async () => {
    reflector.getAllAndOverride.mockReturnValue({ moduleKey: 'agenda', action: 'view' });
    const guard = makeGuard();

    await expect(guard.canActivate(makeContext(null))).rejects.toThrow(CapabilityDeniedError);
  });

  it('denies access (fail-closed) when resolveCapabilities throws', async () => {
    reflector.getAllAndOverride.mockReturnValue({ moduleKey: 'agenda', action: 'view' });
    resolveUseCase.execute.mockRejectedValue(new Error('DB down'));
    const guard = makeGuard();

    await expect(guard.canActivate(makeContext())).rejects.toThrow(CapabilityDeniedError);
  });

  it('calls resolveCapabilities with the correct role', async () => {
    reflector.getAllAndOverride.mockReturnValue({ moduleKey: 'agenda', action: 'view' });
    const guard = makeGuard();

    await guard.canActivate(makeContext(makeUser('doctor')));

    expect(resolveUseCase.execute).toHaveBeenCalledWith('doctor');
  });
});
