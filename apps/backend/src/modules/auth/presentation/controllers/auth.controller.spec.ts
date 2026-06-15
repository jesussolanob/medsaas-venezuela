import { Test, type TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { ResolveIdentityUseCase } from '../../application/use-cases/resolve-identity.use-case';
import { ProcessLoginTouchUseCase } from '../../application/use-cases/process-login-touch.use-case';
import {
  ResolveSecretNotConfiguredError,
  ResolveSecretInvalidError,
} from '../../domain/errors/identity-resolve.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const VALID_SECRET = 'dev-resolve-secret';

const RESOLVED_IDENTITY = {
  id: 'uuid-1',
  email: 'new@example.com',
  fullName: 'New Doc',
  role: 'doctor',
  created: true,
};

describe('AuthController', () => {
  let controller: AuthController;

  const mockResolveUseCase = { execute: jest.fn() };
  const mockLoginTouchUseCase = { execute: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: ResolveIdentityUseCase, useValue: mockResolveUseCase },
        { provide: ProcessLoginTouchUseCase, useValue: mockLoginTouchUseCase },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
    mockResolveUseCase.execute.mockReset();
    mockLoginTouchUseCase.execute.mockReset();
  });

  // -------------------------------------------------------------------------
  // resolve-identity (existing behaviour preserved)
  // -------------------------------------------------------------------------

  it('returns success:true with created:true when use case creates identity', async () => {
    mockResolveUseCase.execute.mockResolvedValue(RESOLVED_IDENTITY);
    mockLoginTouchUseCase.execute.mockResolvedValue({ downgraded: false });

    const result = await controller.resolveIdentity(VALID_SECRET, {
      email: 'new@example.com',
    });

    expect(result).toEqual({
      success: true,
      data: RESOLVED_IDENTITY,
    });
  });

  it('returns success:true with created:false when use case finds existing identity', async () => {
    const existing = { ...RESOLVED_IDENTITY, id: 'uuid-existing', created: false };
    mockResolveUseCase.execute.mockResolvedValue(existing);
    mockLoginTouchUseCase.execute.mockResolvedValue({ downgraded: false });

    const result = await controller.resolveIdentity(VALID_SECRET, {
      email: 'old@example.com',
    });

    expect(result.data.created).toBe(false);
    expect(result.data.id).toBe('uuid-existing');
  });

  it('propagates ResolveSecretInvalidError (use case throws when secret wrong)', async () => {
    mockResolveUseCase.execute.mockRejectedValue(new ResolveSecretInvalidError());

    await expect(
      controller.resolveIdentity('bad-secret', { email: 'doc@example.com' }),
    ).rejects.toBeInstanceOf(ResolveSecretInvalidError);
  });

  it('propagates ResolveSecretNotConfiguredError (use case throws when secret missing)', async () => {
    mockResolveUseCase.execute.mockRejectedValue(new ResolveSecretNotConfiguredError());

    await expect(
      controller.resolveIdentity(undefined, { email: 'doc@example.com' }),
    ).rejects.toBeInstanceOf(ResolveSecretNotConfiguredError);
  });

  it('passes the caller secret and dto through to the use case', async () => {
    mockResolveUseCase.execute.mockResolvedValue(RESOLVED_IDENTITY);
    mockLoginTouchUseCase.execute.mockResolvedValue({ downgraded: false });

    const dto = { email: 'doc@example.com', sub: 'auth0|abc', fullName: 'Dr. Sub' };
    await controller.resolveIdentity(VALID_SECRET, dto);

    expect(mockResolveUseCase.execute).toHaveBeenCalledWith(dto, VALID_SECRET);
  });

  it('verifies httpStatus codes from domain errors', () => {
    const notConfigured = new ResolveSecretNotConfiguredError();
    expect(notConfigured.httpStatus).toBe(HttpStatus.SERVICE_UNAVAILABLE);

    const invalid = new ResolveSecretInvalidError();
    expect(invalid.httpStatus).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('fires login touch after successful identity resolution', async () => {
    mockResolveUseCase.execute.mockResolvedValue(RESOLVED_IDENTITY);
    mockLoginTouchUseCase.execute.mockResolvedValue({ downgraded: false });

    await controller.resolveIdentity(VALID_SECRET, { email: 'new@example.com' });

    expect(mockLoginTouchUseCase.execute).toHaveBeenCalledWith({
      profileId: RESOLVED_IDENTITY.id,
      role: RESOLVED_IDENTITY.role,
    });
  });

  it('still returns identity data even when login touch throws (best-effort)', async () => {
    mockResolveUseCase.execute.mockResolvedValue(RESOLVED_IDENTITY);
    mockLoginTouchUseCase.execute.mockRejectedValue(new Error('DB down'));

    // Must not throw — touch is best-effort
    const result = await controller.resolveIdentity(VALID_SECRET, { email: 'new@example.com' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(RESOLVED_IDENTITY);
  });

  // -------------------------------------------------------------------------
  // login-touch endpoint (anti-IDOR + happy path)
  // -------------------------------------------------------------------------

  it('login-touch uses user.sub from guard — not any body parameter', async () => {
    mockLoginTouchUseCase.execute.mockResolvedValue({ downgraded: false });

    const user: CurrentUserPayload = {
      sub: 'guard-provided-id',
      role: 'doctor',
      email: 'doc@dev.local',
    };

    const result = await controller.loginTouch(user);

    // The profileId must come from user.sub — body is not consulted.
    expect(mockLoginTouchUseCase.execute).toHaveBeenCalledWith({
      profileId: 'guard-provided-id',
      role: 'doctor',
    });
    expect(result).toEqual({ success: true, data: { downgraded: false } });
  });

  it('login-touch returns downgraded:true when use case downgrades the subscription', async () => {
    mockLoginTouchUseCase.execute.mockResolvedValue({ downgraded: true });

    const user: CurrentUserPayload = {
      sub: 'doctor-uuid',
      role: 'doctor',
      email: 'doc@dev.local',
    };

    const result = await controller.loginTouch(user);

    expect(result).toEqual({ success: true, data: { downgraded: true } });
  });

  it('login-touch propagates errors from the use case', async () => {
    mockLoginTouchUseCase.execute.mockRejectedValue(new Error('Unexpected'));

    const user: CurrentUserPayload = {
      sub: 'doctor-uuid',
      role: 'doctor',
      email: 'doc@dev.local',
    };

    await expect(controller.loginTouch(user)).rejects.toThrow('Unexpected');
  });
});
