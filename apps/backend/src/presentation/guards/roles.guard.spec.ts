import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

function makeContext(
  user: CurrentUserPayload | undefined,
  roles?: CurrentUserPayload['role'][],
): ExecutionContext {
  const handler = jest.fn();
  const reflector = new Reflector();

  // Stub reflector so it returns the desired roles for ROLES_KEY
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === ROLES_KEY) return roles ?? undefined;
    return undefined;
  });

  const guard = new RolesGuard(reflector);

  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: () => 'http' as const,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;

  // Attach guard so the test can call it
  (context as unknown as { _guard: RolesGuard })._guard = guard;

  return context;
}

function getGuard(context: ExecutionContext): RolesGuard {
  return (context as unknown as { _guard: RolesGuard })._guard;
}

describe('RolesGuard', () => {
  it('grants access when no @Roles() metadata is set', () => {
    const context = makeContext({ sub: 'u1', role: 'doctor', email: 'x' }, undefined);
    expect(getGuard(context).canActivate(context)).toBe(true);
  });

  it('grants access when roles array is empty', () => {
    const context = makeContext({ sub: 'u1', role: 'doctor', email: 'x' }, []);
    expect(getGuard(context).canActivate(context)).toBe(true);
  });

  it('grants access when user role matches required role', () => {
    const context = makeContext({ sub: 'u1', role: 'super_admin', email: 'x' }, ['super_admin']);
    expect(getGuard(context).canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when user role does not match', () => {
    const context = makeContext({ sub: 'u1', role: 'doctor', email: 'x' }, ['super_admin']);
    expect(() => getGuard(context).canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user is undefined', () => {
    const context = makeContext(undefined, ['super_admin']);
    expect(() => getGuard(context).canActivate(context)).toThrow(ForbiddenException);
  });

  it('grants access when user role is in a list of allowed roles', () => {
    const context = makeContext({ sub: 'u1', role: 'doctor', email: 'x' }, [
      'doctor',
      'super_admin',
    ]);
    expect(getGuard(context).canActivate(context)).toBe(true);
  });
});
