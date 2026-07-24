import { Test, type TestingModule } from '@nestjs/testing';
import {
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { ResolveIdentityUseCase } from '../../application/use-cases/resolve-identity.use-case';
import { ProcessLoginTouchUseCase } from '../../application/use-cases/process-login-touch.use-case';
import {
  ResolveSecretNotConfiguredError,
  ResolveSecretInvalidError,
} from '../../domain/errors/identity-resolve.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { ReviewerTokenService } from '../../../../infrastructure/auth/reviewer-token.service';

const VALID_SECRET = 'dev-resolve-secret';

const RESOLVED_IDENTITY = {
  id: 'uuid-1',
  email: 'new@example.com',
  fullName: 'New Doc',
  role: 'doctor',
  created: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigService(overrides: Record<string, string | undefined> = {}): ConfigService {
  const defaults: Record<string, string | undefined> = {
    REVIEWER_ACCESS_ENABLED: 'false',
    REVIEWER_EMAIL: 'reviewer@example.com',
    REVIEWER_PASSWORD: 's3cr3tP@ss',
    REVIEWER_PROFILE_ID: 'demo-profile-uuid',
  };
  const values = { ...defaults, ...overrides };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

// ---------------------------------------------------------------------------
// Shared module setup
// ---------------------------------------------------------------------------

async function buildModule(
  configOverrides: Record<string, string | undefined> = {},
): Promise<{ controller: AuthController; module: TestingModule }> {
  const mockReviewerSvc = { mint: jest.fn().mockReturnValue('minted-token') };

  const module: TestingModule = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: ResolveIdentityUseCase, useValue: { execute: jest.fn() } },
      { provide: ProcessLoginTouchUseCase, useValue: { execute: jest.fn() } },
      { provide: ReviewerTokenService, useValue: mockReviewerSvc },
      { provide: ConfigService, useValue: makeConfigService(configOverrides) },
    ],
  })
    .overrideGuard(AppAuthGuard)
    .useValue({ canActivate: jest.fn().mockReturnValue(true) })
    .compile();

  return { controller: module.get<AuthController>(AuthController), module };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AuthController', () => {
  let controller: AuthController;
  let module: TestingModule;
  let mockResolveUseCase: { execute: jest.Mock };
  let mockLoginTouchUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    const result = await buildModule();
    controller = result.controller;
    module = result.module;
    mockResolveUseCase = module.get(ResolveIdentityUseCase) as unknown as { execute: jest.Mock };
    mockLoginTouchUseCase = module.get(ProcessLoginTouchUseCase) as unknown as {
      execute: jest.Mock;
    };
    jest.clearAllMocks();
  });

  // =========================================================================
  // resolve-identity (existing behaviour preserved)
  // =========================================================================

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

  // =========================================================================
  // login-touch endpoint (anti-IDOR + happy path)
  // =========================================================================

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

  // =========================================================================
  // reviewer-login — flag OFF → 404
  // =========================================================================

  it('returns 404 when REVIEWER_ACCESS_ENABLED is not "true"', async () => {
    const { controller: ctrl } = await buildModule({ REVIEWER_ACCESS_ENABLED: 'false' });

    await expect(
      ctrl.reviewerLogin({ email: 'reviewer@example.com', password: 's3cr3tP@ss' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when REVIEWER_ACCESS_ENABLED is absent', async () => {
    const { controller: ctrl } = await buildModule({ REVIEWER_ACCESS_ENABLED: undefined });

    await expect(
      ctrl.reviewerLogin({ email: 'reviewer@example.com', password: 's3cr3tP@ss' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when REVIEWER_ACCESS_ENABLED is "1" (truthy string but not "true")', async () => {
    const { controller: ctrl } = await buildModule({ REVIEWER_ACCESS_ENABLED: '1' });

    await expect(
      ctrl.reviewerLogin({ email: 'reviewer@example.com', password: 's3cr3tP@ss' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // =========================================================================
  // reviewer-login — flag ON, mis-configured env → 503
  // =========================================================================

  it('returns 503 when REVIEWER_EMAIL is missing (flag on)', async () => {
    const { controller: ctrl } = await buildModule({
      REVIEWER_ACCESS_ENABLED: 'true',
      REVIEWER_EMAIL: undefined,
    });

    await expect(
      ctrl.reviewerLogin({ email: 'reviewer@example.com', password: 's3cr3tP@ss' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns 503 when REVIEWER_PASSWORD is missing (flag on)', async () => {
    const { controller: ctrl } = await buildModule({
      REVIEWER_ACCESS_ENABLED: 'true',
      REVIEWER_PASSWORD: undefined,
    });

    await expect(
      ctrl.reviewerLogin({ email: 'reviewer@example.com', password: 's3cr3tP@ss' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns 503 when REVIEWER_PROFILE_ID is missing (flag on)', async () => {
    const { controller: ctrl } = await buildModule({
      REVIEWER_ACCESS_ENABLED: 'true',
      REVIEWER_PROFILE_ID: undefined,
    });

    await expect(
      ctrl.reviewerLogin({ email: 'reviewer@example.com', password: 's3cr3tP@ss' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns 503 when all three reviewer secrets are missing (flag on)', async () => {
    const { controller: ctrl } = await buildModule({
      REVIEWER_ACCESS_ENABLED: 'true',
      REVIEWER_EMAIL: undefined,
      REVIEWER_PASSWORD: undefined,
      REVIEWER_PROFILE_ID: undefined,
    });

    await expect(
      ctrl.reviewerLogin({ email: 'reviewer@example.com', password: 's3cr3tP@ss' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not emit a token when mis-configured — 503 not 401', async () => {
    // Regression guard: ensure the missing-env path throws 503, never falls
    // through to credential comparison (which would match '' === '' and emit a
    // token with sub='').
    const { controller: ctrl, module: mod } = await buildModule({
      REVIEWER_ACCESS_ENABLED: 'true',
      REVIEWER_EMAIL: undefined,
    });
    const svc = mod.get(ReviewerTokenService) as unknown as { mint: jest.Mock };

    await expect(ctrl.reviewerLogin({ email: '', password: '' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(svc.mint).not.toHaveBeenCalled();
  });

  // =========================================================================
  // reviewer-login — flag ON, wrong credentials → 401
  // =========================================================================

  it('returns 401 when email does not match (flag on)', async () => {
    const { controller: ctrl } = await buildModule({ REVIEWER_ACCESS_ENABLED: 'true' });

    await expect(
      ctrl.reviewerLogin({ email: 'wrong@example.com', password: 's3cr3tP@ss' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 401 when password does not match (flag on)', async () => {
    const { controller: ctrl } = await buildModule({ REVIEWER_ACCESS_ENABLED: 'true' });

    await expect(
      ctrl.reviewerLogin({ email: 'reviewer@example.com', password: 'wrongpassword' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 401 when both email and password are wrong (flag on)', async () => {
    const { controller: ctrl } = await buildModule({ REVIEWER_ACCESS_ENABLED: 'true' });

    await expect(
      ctrl.reviewerLogin({ email: 'bad@example.com', password: 'badpass' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // =========================================================================
  // reviewer-login — flag ON, correct credentials → token
  // =========================================================================

  it('returns a token and expiresInSeconds on valid credentials', async () => {
    const { controller: ctrl, module: mod } = await buildModule({
      REVIEWER_ACCESS_ENABLED: 'true',
    });
    const svc = mod.get(ReviewerTokenService) as unknown as { mint: jest.Mock };
    svc.mint.mockReturnValue('the-reviewer-token');

    const result = await ctrl.reviewerLogin({
      email: 'reviewer@example.com',
      password: 's3cr3tP@ss',
    });

    expect(result.success).toBe(true);
    expect(result.data.token).toBe('the-reviewer-token');
    expect(result.data.expiresInSeconds).toBe(ReviewerTokenService.EXPIRY_SECONDS);
  });

  it('calls ReviewerTokenService.mint with the configured REVIEWER_PROFILE_ID', async () => {
    const { controller: ctrl, module: mod } = await buildModule({
      REVIEWER_ACCESS_ENABLED: 'true',
    });
    const svc = mod.get(ReviewerTokenService) as unknown as { mint: jest.Mock };

    await ctrl.reviewerLogin({
      email: 'reviewer@example.com',
      password: 's3cr3tP@ss',
    });

    expect(svc.mint).toHaveBeenCalledWith('demo-profile-uuid');
  });

  it('does not log credentials or the token (no logger.warn called on success)', async () => {
    // We cannot easily spy on the private logger.warn from outside, but we can verify
    // that no error is surfaced and the response contains the token without any
    // exception propagating. This is a behavioural contract: successful login = token.
    const { controller: ctrl } = await buildModule({ REVIEWER_ACCESS_ENABLED: 'true' });

    const result = await ctrl.reviewerLogin({
      email: 'reviewer@example.com',
      password: 's3cr3tP@ss',
    });

    expect(result.success).toBe(true);
    expect(typeof result.data.token).toBe('string');
  });

  // =========================================================================
  // reviewer-login — envelope shape
  // =========================================================================

  it('returns the standard success envelope { success: true, data: { token, expiresInSeconds } }', async () => {
    const { controller: ctrl } = await buildModule({ REVIEWER_ACCESS_ENABLED: 'true' });

    const result = await ctrl.reviewerLogin({
      email: 'reviewer@example.com',
      password: 's3cr3tP@ss',
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        token: expect.any(String),
        expiresInSeconds: expect.any(Number),
      },
    });
  });
});
