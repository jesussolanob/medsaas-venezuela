import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ResolveIdentityUseCase } from './resolve-identity.use-case';
import type { IIdentityRepository } from '../../domain/repositories/identity.repository';
import { Identity } from '../../domain/entities/identity.entity';
import {
  ResolveSecretNotConfiguredError,
  ResolveSecretInvalidError,
} from '../../domain/errors/identity-resolve.error';
import type { ResolveIdentityDto } from '../dtos/resolve-identity.dto';

const VALID_SECRET = 'dev-resolve-secret';
const PROFILE_ID = randomUUID();

function makeIdentity(overrides: Partial<ConstructorParameters<typeof Identity>[0]> = {}): Identity {
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

  beforeEach(() => {
    repo = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      updateAuth0Sub: jest.fn(),
    } as jest.Mocked<IIdentityRepository>;

    config = makeConfigService(VALID_SECRET);
    useCase = new ResolveIdentityUseCase(repo, config);
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
    await expect(useCase.execute(dto, undefined)).rejects.toBeInstanceOf(
      ResolveSecretInvalidError,
    );
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

    const dto= { email: 'DOC@EXAMPLE.COM', role: 'super_admin' } as unknown as ResolveIdentityDto;
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
    const newIdentity = makeIdentity({ id: 'new-uuid', email: 'new@example.com', role: 'doctor', created: undefined } as Parameters<typeof makeIdentity>[0]);
    repo.create.mockResolvedValue(newIdentity);

    const dto: ResolveIdentityDto = { email: 'new@example.com', role: 'doctor', fullName: 'New Doc' };
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

    const dto= { email: 'hacker@example.com', role: 'super_admin' } as unknown as ResolveIdentityDto;
    await useCase.execute(dto, VALID_SECRET);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'doctor' }),
    );
  });

  it('demotes admin role to doctor when creating a new profile', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(makeIdentity({ role: 'doctor' }));

    const dto= { email: 'admin2@example.com', role: 'admin' } as unknown as ResolveIdentityDto;
    await useCase.execute(dto, VALID_SECRET);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'doctor' }),
    );
  });

  it('uses email as fullName fallback when fullName is not provided', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(makeIdentity({ email: 'nofull@example.com', fullName: 'nofull@example.com' }));

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

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ auth0Sub: 'auth0|xyz' }),
    );
  });
});
