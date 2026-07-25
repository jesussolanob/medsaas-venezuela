import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/nestjs';
import { ResolveIdentityUseCase } from './resolve-identity.use-case';
import type { IIdentityRepository } from '../../domain/repositories/identity.repository';
import { Identity } from '../../domain/entities/identity.entity';
import {
  ResolveSecretNotConfiguredError,
  ResolveSecretInvalidError,
} from '../../domain/errors/identity-resolve.error';
import type { ResolveIdentityDto } from '../dtos/resolve-identity.dto';

jest.mock('@sentry/nestjs', () => ({
  withScope: jest.fn(),
  captureException: jest.fn(),
}));

const VALID_SECRET = 'dev-resolve-secret';
const PROFILE_ID = randomUUID();

function makeIdentity(
  overrides: Partial<ConstructorParameters<typeof Identity>[0]> = {},
): Identity {
  return Identity.create({
    id: PROFILE_ID,
    email: 'doc@example.com',
    fullName: 'Dr. Existing',
    role: 'doctor',
    auth0Sub: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

function makeConfigService(secret: string | undefined): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'AUTH_RESOLVE_SECRET') return secret;
      return undefined;
    }),
  } as unknown as ConfigService;
}

describe('ResolveIdentityUseCase', () => {
  let repo: jest.Mocked<IIdentityRepository>;
  let useCase: ResolveIdentityUseCase;
  let config: ConfigService;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    repo = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      updateAuth0Sub: jest.fn(),
    } as jest.Mocked<IIdentityRepository>;

    config = makeConfigService(VALID_SECRET);
    useCase = new ResolveIdentityUseCase(repo, config);

    // Silence logger output in tests and allow assertions on it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logSpy = jest.spyOn((useCase as any).logger, 'log').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorSpy = jest.spyOn((useCase as any).logger, 'error').mockImplementation(() => undefined);

    // Clear Sentry mocks between tests.
    jest.mocked(Sentry.withScope).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env['SENTRY_ENABLED'];
  });

  // --- Security: secret validation ---

  it('throws ResolveSecretNotConfiguredError (503) when AUTH_RESOLVE_SECRET is not set', async () => {
    useCase = new ResolveIdentityUseCase(repo, makeConfigService(undefined));
    const dto: ResolveIdentityDto = { email: 'doc@example.com' };
    await expect(useCase.execute(dto, VALID_SECRET)).rejects.toBeInstanceOf(
      ResolveSecretNotConfiguredError,
    );
    expect(repo.findByEmail).not.toHaveBeenCalled();
  });

  it('throws ResolveSecretNotConfiguredError (503) when AUTH_RESOLVE_SECRET is empty string', async () => {
    useCase = new ResolveIdentityUseCase(repo, makeConfigService(''));
    const dto: ResolveIdentityDto = { email: 'doc@example.com' };
    await expect(useCase.execute(dto, VALID_SECRET)).rejects.toBeInstanceOf(
      ResolveSecretNotConfiguredError,
    );
  });

  it('throws ResolveSecretInvalidError (401) when caller provides no secret', async () => {
    const dto: ResolveIdentityDto = { email: 'doc@example.com' };
    await expect(useCase.execute(dto, undefined)).rejects.toBeInstanceOf(ResolveSecretInvalidError);
    expect(repo.findByEmail).not.toHaveBeenCalled();
  });

  it('throws ResolveSecretInvalidError (401) when caller provides wrong secret', async () => {
    const dto: ResolveIdentityDto = { email: 'doc@example.com' };
    await expect(useCase.execute(dto, 'wrong-secret')).rejects.toBeInstanceOf(
      ResolveSecretInvalidError,
    );
    expect(repo.findByEmail).not.toHaveBeenCalled();
  });

  // --- Existing profile ---

  it('returns existing profile without modifying its role', async () => {
    const existing = makeIdentity({ role: 'doctor' });
    repo.findByEmail.mockResolvedValue(existing);

    const dto = { email: 'DOC@EXAMPLE.COM', role: 'super_admin' } as unknown as ResolveIdentityDto;
    const result = await useCase.execute(dto, VALID_SECRET);

    expect(result.created).toBe(false);
    expect(result.id).toBe(PROFILE_ID);
    expect(result.role).toBe('doctor'); // existing role is kept
    expect(result.email).toBe('doc@example.com');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('normalises email to lowercase before lookup', async () => {
    repo.findByEmail.mockResolvedValue(makeIdentity());
    const dto: ResolveIdentityDto = { email: '  Doc@Example.COM  ' };
    await useCase.execute(dto, VALID_SECRET);
    expect(repo.findByEmail).toHaveBeenCalledWith('doc@example.com');
  });

  it('updates auth0Sub when existing profile has none and sub is provided', async () => {
    repo.findByEmail.mockResolvedValue(makeIdentity({ auth0Sub: null }));
    repo.updateAuth0Sub.mockResolvedValue(undefined);

    const dto: ResolveIdentityDto = { email: 'doc@example.com', sub: 'auth0|newSub' };
    await useCase.execute(dto, VALID_SECRET);

    expect(repo.updateAuth0Sub).toHaveBeenCalledWith(PROFILE_ID, 'auth0|newSub');
  });

  it('does NOT update auth0Sub when existing profile already has one', async () => {
    repo.findByEmail.mockResolvedValue(makeIdentity({ auth0Sub: 'auth0|existing' }));

    const dto: ResolveIdentityDto = { email: 'doc@example.com', sub: 'auth0|newSub' };
    await useCase.execute(dto, VALID_SECRET);

    expect(repo.updateAuth0Sub).not.toHaveBeenCalled();
  });

  // --- New profile creation ---

  it('creates a new profile when email not found', async () => {
    repo.findByEmail.mockResolvedValue(null);
    const newIdentity = makeIdentity({
      id: 'new-uuid',
      email: 'new@example.com',
      role: 'doctor',
      created: undefined,
    } as Parameters<typeof makeIdentity>[0]);
    repo.create.mockResolvedValue(newIdentity);

    const dto: ResolveIdentityDto = {
      email: 'new@example.com',
      role: 'doctor',
      fullName: 'New Doc',
    };
    const result = await useCase.execute(dto, VALID_SECRET);

    expect(result.created).toBe(true);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        fullName: 'New Doc',
        role: 'doctor',
      }),
    );
  });

  it('assigns default role "doctor" when no role is provided', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(makeIdentity({ role: 'doctor' }));

    const dto: ResolveIdentityDto = { email: 'newdoc@example.com' };
    await useCase.execute(dto, VALID_SECRET);

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'doctor' }));
  });

  it('demotes super_admin role to doctor when creating a new profile', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(makeIdentity({ role: 'doctor' }));

    const dto = {
      email: 'hacker@example.com',
      role: 'super_admin',
    } as unknown as ResolveIdentityDto;
    await useCase.execute(dto, VALID_SECRET);

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'doctor' }));
  });

  it('demotes admin role to doctor when creating a new profile', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(makeIdentity({ role: 'doctor' }));

    const dto = { email: 'admin2@example.com', role: 'admin' } as unknown as ResolveIdentityDto;
    await useCase.execute(dto, VALID_SECRET);

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'doctor' }));
  });

  it('uses email as fullName fallback when fullName is not provided', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(
      makeIdentity({ email: 'nofull@example.com', fullName: 'nofull@example.com' }),
    );

    const dto: ResolveIdentityDto = { email: 'nofull@example.com' };
    await useCase.execute(dto, VALID_SECRET);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'nofull@example.com' }),
    );
  });

  it('stores auth0Sub when creating new profile with sub present', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(makeIdentity({ auth0Sub: 'auth0|xyz' }));

    const dto: ResolveIdentityDto = { email: 'sub@example.com', sub: 'auth0|xyz' };
    await useCase.execute(dto, VALID_SECRET);

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ auth0Sub: 'auth0|xyz' }));
  });

  // --- Structured logging ---

  // KEY REGRESSION: existing users must generate ZERO attempt logs.
  // resolve-identity is called once per request; without this guard a doctor with
  // 100 page loads would flood logs and incorrectly show 100 "attempts".
  it('does NOT emit [signup] attempt log for an existing user', async () => {
    repo.findByEmail.mockResolvedValue(makeIdentity());

    const dto: ResolveIdentityDto = { email: 'existing@example.com', fullName: 'Dr. Existing' };
    await useCase.execute(dto, VALID_SECRET);

    // No attempt log on the per-request hot path
    const calls = logSpy.mock.calls as string[][];
    const attemptCall = calls.find(([msg]) => msg?.includes('attempt'));
    expect(attemptCall).toBeUndefined();
  });

  it('emits a [signup] attempt log with email and name for a NEW doctor', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(makeIdentity({ email: 'new@example.com', fullName: 'Dr. New' }));

    const dto: ResolveIdentityDto = { email: 'new@example.com', fullName: 'Dr. New' };
    await useCase.execute(dto, VALID_SECRET);

    const attemptCall = (logSpy.mock.calls as string[][]).find(([msg]) => msg?.includes('attempt'));
    expect(attemptCall).toBeDefined();
    expect(attemptCall?.[0]).toContain('[signup]');
    expect(attemptCall?.[0]).toContain('new@example.com');
    expect(attemptCall?.[0]).toContain('Dr. New');
  });

  it('uses email as name fallback in attempt log when fullName is absent', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(
      makeIdentity({ email: 'nofull@example.com', fullName: 'nofull@example.com' }),
    );

    const dto: ResolveIdentityDto = { email: 'nofull@example.com' };
    await useCase.execute(dto, VALID_SECRET);

    const attemptCall = (logSpy.mock.calls as string[][]).find(([msg]) => msg?.includes('attempt'));
    expect(attemptCall?.[0]).toContain('nofull@example.com');
  });

  it('emits a [signup] created log line with profileId on successful registration', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(
      makeIdentity({ id: 'created-uuid', email: 'new@example.com', fullName: 'New Doc' }),
    );

    const dto: ResolveIdentityDto = { email: 'new@example.com', fullName: 'New Doc' };
    await useCase.execute(dto, VALID_SECRET);

    const createdCall = (logSpy.mock.calls as string[][]).find(([msg]) => msg?.includes('created'));
    expect(createdCall).toBeDefined();
    expect(createdCall?.[0]).toContain('[signup]');
    expect(createdCall?.[0]).toContain('new@example.com');
    expect(createdCall?.[0]).toContain('profileId=');
  });

  it('emits a [signup] failed error log with email when registration throws', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockRejectedValue(new Error('DB constraint failed'));

    const dto: ResolveIdentityDto = { email: 'fail@example.com', fullName: 'Dr. Fail' };
    await expect(useCase.execute(dto, VALID_SECRET)).rejects.toThrow('DB constraint failed');

    const failCall = (errorSpy.mock.calls as string[][]).find(([msg]) => msg?.includes('failed'));
    expect(failCall).toBeDefined();
    expect(failCall?.[0]).toContain('[signup]');
    expect(failCall?.[0]).toContain('fail@example.com');
    expect(failCall?.[0]).toContain('Dr. Fail');
    expect(failCall?.[0]).toContain('DB constraint failed');
  });

  // --- Sentry reporting ---

  it('does NOT call Sentry when SENTRY_ENABLED is not "true"', async () => {
    delete process.env['SENTRY_ENABLED'];
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockRejectedValue(new Error('boom'));

    const dto: ResolveIdentityDto = { email: 'silent@example.com' };
    await expect(useCase.execute(dto, VALID_SECRET)).rejects.toThrow('boom');

    expect(Sentry.withScope).not.toHaveBeenCalled();
  });

  it('calls Sentry.withScope with email/tag/extra when registration fails and SENTRY_ENABLED=true', async () => {
    process.env['SENTRY_ENABLED'] = 'true';
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockRejectedValue(new Error('tx rollback'));

    const capturedScope = {
      setUser: jest.fn(),
      setTag: jest.fn(),
      setExtra: jest.fn(),
      captureException: jest.fn(),
    };
    jest.mocked(Sentry.withScope).mockImplementation((cb) => {
      (cb as unknown as (scope: unknown) => void)(capturedScope);
      return undefined as never;
    });

    const dto: ResolveIdentityDto = { email: 'sentry@example.com', fullName: 'Dr. Sentry' };
    await expect(useCase.execute(dto, VALID_SECRET)).rejects.toThrow('tx rollback');

    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    expect(capturedScope.setUser).toHaveBeenCalledWith({ email: 'sentry@example.com' });
    expect(capturedScope.setTag).toHaveBeenCalledWith('signup_failure', 'true');
    expect(capturedScope.setExtra).toHaveBeenCalledWith('signup_email', 'sentry@example.com');
    expect(capturedScope.setExtra).toHaveBeenCalledWith('signup_name', 'Dr. Sentry');
    expect(capturedScope.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('re-throws the original error even when Sentry.withScope itself throws', async () => {
    process.env['SENTRY_ENABLED'] = 'true';
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockRejectedValue(new Error('original'));
    jest.mocked(Sentry.withScope).mockImplementation(() => {
      throw new Error('sentry internal error');
    });

    const dto: ResolveIdentityDto = { email: 'robust@example.com' };
    // Should re-throw the original error, not the Sentry error.
    await expect(useCase.execute(dto, VALID_SECRET)).rejects.toThrow('original');
  });
});
