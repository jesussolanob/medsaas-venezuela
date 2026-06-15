import { randomUUID } from 'crypto';
import { IdentityResolverService } from './identity-resolver.service';
import type { IIdentityRepository } from '../../modules/auth/domain/repositories/identity.repository';
import { Identity } from '../../modules/auth/domain/entities/identity.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIdentity(
  overrides: Partial<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    auth0Sub: string | null;
    createdAt: Date;
  }> = {},
): Identity {
  return Identity.create({
    id: overrides.id ?? randomUUID(),
    email: overrides.email ?? 'doc@example.com',
    fullName: overrides.fullName ?? 'Dr. Existing',
    role: overrides.role ?? 'doctor',
    auth0Sub: overrides.auth0Sub ?? null,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IdentityResolverService', () => {
  let repo: jest.Mocked<IIdentityRepository>;
  let service: IdentityResolverService;

  beforeEach(() => {
    repo = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      updateAuth0Sub: jest.fn(),
    } as jest.Mocked<IIdentityRepository>;

    service = new IdentityResolverService(repo as never);
  });

  // -------------------------------------------------------------------------
  // Existing profile
  // -------------------------------------------------------------------------

  describe('when profile already exists', () => {
    it('returns the existing profile without creating a new one', async () => {
      const existing = makeIdentity({ email: 'doctor@example.com', role: 'doctor' });
      repo.findByEmail.mockResolvedValue(existing);

      const result = await service.resolve({ email: 'DOCTOR@EXAMPLE.COM' });

      expect(result.email).toBe('doctor@example.com');
      expect(result.role).toBe('doctor');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('normalises email to lowercase before lookup', async () => {
      const existing = makeIdentity({ email: 'test@example.com' });
      repo.findByEmail.mockResolvedValue(existing);

      await service.resolve({ email: '  TEST@EXAMPLE.COM  ' });

      expect(repo.findByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('backfills auth0Sub on an existing profile that has none', async () => {
      const existing = makeIdentity({ auth0Sub: null });
      repo.findByEmail.mockResolvedValue(existing);
      repo.updateAuth0Sub.mockResolvedValue(undefined);

      await service.resolve({ email: 'doc@example.com', auth0Sub: 'auth0|xyz' });

      expect(repo.updateAuth0Sub).toHaveBeenCalledWith(existing.id, 'auth0|xyz');
    });

    it('does not backfill auth0Sub when the profile already has one', async () => {
      const existing = makeIdentity({ auth0Sub: 'auth0|already-set' });
      repo.findByEmail.mockResolvedValue(existing);

      await service.resolve({ email: 'doc@example.com', auth0Sub: 'auth0|new' });

      expect(repo.updateAuth0Sub).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // New profile creation
  // -------------------------------------------------------------------------

  describe('when profile does not exist', () => {
    beforeEach(() => {
      repo.findByEmail.mockResolvedValue(null);
    });

    it('creates a new profile with the given role', async () => {
      const created = makeIdentity({ role: 'doctor' });
      repo.create.mockResolvedValue(created);

      await service.resolve({ email: 'new@example.com', roleHint: 'doctor' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'doctor' }));
    });

    it('defaults to doctor role when no roleHint is provided', async () => {
      const created = makeIdentity({ role: 'doctor' });
      repo.create.mockResolvedValue(created);

      await service.resolve({ email: 'new@example.com' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'doctor' }));
    });

    it('demotes super_admin roleHint to doctor (forbidden role elevation)', async () => {
      const created = makeIdentity({ role: 'doctor' });
      repo.create.mockResolvedValue(created);

      await service.resolve({ email: 'new@example.com', roleHint: 'super_admin' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'doctor' }));
    });

    it('demotes admin roleHint to doctor (forbidden role elevation)', async () => {
      const created = makeIdentity({ role: 'doctor' });
      repo.create.mockResolvedValue(created);

      await service.resolve({ email: 'new@example.com', roleHint: 'admin' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'doctor' }));
    });

    it('uses opts.name as fullName when provided (FIX 4)', async () => {
      const created = makeIdentity({ fullName: 'Dr. House' });
      repo.create.mockResolvedValue(created);

      await service.resolve({ email: 'new@example.com', name: 'Dr. House' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Dr. House' }));
    });

    it('falls back to "Pendiente" as fullName when name is absent (FIX 4 — no email in fullName)', async () => {
      const created = makeIdentity({ fullName: 'Pendiente' });
      repo.create.mockResolvedValue(created);

      await service.resolve({ email: 'no-name@example.com' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Pendiente' }));
      // Must NOT store the email as fullName
      const callArg = (repo.create.mock.calls[0] as [{ fullName: string }])[0];
      expect(callArg.fullName).not.toBe('no-name@example.com');
    });

    it('stores auth0Sub when provided', async () => {
      const created = makeIdentity({ auth0Sub: 'auth0|abc' });
      repo.create.mockResolvedValue(created);

      await service.resolve({ email: 'new@example.com', auth0Sub: 'auth0|abc' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ auth0Sub: 'auth0|abc' }));
    });

    it('stores null for auth0Sub when not provided', async () => {
      const created = makeIdentity({ auth0Sub: null });
      repo.create.mockResolvedValue(created);

      await service.resolve({ email: 'new@example.com' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ auth0Sub: null }));
    });

    it('returns the resolved identity with profileId, email, and role', async () => {
      const created = makeIdentity({
        id: 'uuid-new',
        email: 'new@example.com',
        role: 'doctor',
      });
      repo.create.mockResolvedValue(created);

      const result = await service.resolve({ email: 'new@example.com' });

      expect(result.profileId).toBe('uuid-new');
      expect(result.email).toBe('new@example.com');
      expect(result.role).toBe('doctor');
    });
  });
});
