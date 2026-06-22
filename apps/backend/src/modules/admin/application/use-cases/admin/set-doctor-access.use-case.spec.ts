import { SetDoctorAccessUseCase } from './set-doctor-access.use-case';
import type { IAdminRepository, AdminUserRow } from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import { CannotBlockSuperAdminError } from '../../../domain/errors/cannot-block-super-admin.error';
import { CannotBlockSelfError } from '../../../domain/errors/cannot-block-self.error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdminRow(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: 'target-1',
    fullName: 'Dr. Test',
    email: 'test@example.com',
    role: 'doctor',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeRepo(
  profileById: AdminUserRow | null = makeAdminRow(),
  setProfileActiveResult = true,
): jest.Mocked<Pick<IAdminRepository, 'findProfileById' | 'setProfileActive'>> {
  return {
    findProfileById: jest.fn().mockResolvedValue(profileById),
    setProfileActive: jest.fn().mockResolvedValue(setProfileActiveResult),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SetDoctorAccessUseCase', () => {
  // -------------------------------------------------------------------------
  // Success paths
  // -------------------------------------------------------------------------

  it('blocks a doctor account (is_active=false) and returns the updated state', async () => {
    const repo = makeRepo(makeAdminRow({ role: 'doctor' }), false);
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    const result = await uc.execute({
      targetId: 'target-1',
      actorId: 'admin-1',
      isActive: false,
      reason: 'fraud',
    });

    expect(result).toEqual({ id: 'target-1', isActive: false });
    expect(repo.setProfileActive).toHaveBeenCalledWith('target-1', false);
  });

  it('unblocks a doctor account (is_active=true) and returns the updated state', async () => {
    const repo = makeRepo(makeAdminRow({ role: 'doctor' }), true);
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    const result = await uc.execute({
      targetId: 'target-1',
      actorId: 'admin-1',
      isActive: true,
    });

    expect(result).toEqual({ id: 'target-1', isActive: true });
    expect(repo.setProfileActive).toHaveBeenCalledWith('target-1', true);
  });

  it('allows unblocking a super_admin (is_active=true is always safe)', async () => {
    const repo = makeRepo(makeAdminRow({ role: 'super_admin' }), true);
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    const result = await uc.execute({
      targetId: 'target-1',
      actorId: 'admin-1',
      isActive: true,
    });

    expect(result).toEqual({ id: 'target-1', isActive: true });
  });

  // -------------------------------------------------------------------------
  // Error: target not found
  // -------------------------------------------------------------------------

  it('throws DoctorNotFoundError when target profile does not exist', async () => {
    const repo = makeRepo(null);
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    await expect(
      uc.execute({ targetId: 'ghost-id', actorId: 'admin-1', isActive: false }),
    ).rejects.toBeInstanceOf(DoctorNotFoundError);

    expect(repo.setProfileActive).not.toHaveBeenCalled();
  });

  it('DoctorNotFoundError has code DOCTOR_NOT_FOUND', async () => {
    const repo = makeRepo(null);
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    try {
      await uc.execute({ targetId: 'ghost-id', actorId: 'admin-1', isActive: false });
      fail('should have thrown');
    } catch (err) {
      expect((err as DoctorNotFoundError).code).toBe('DOCTOR_NOT_FOUND');
    }
  });

  // -------------------------------------------------------------------------
  // Error: cannot block super_admin
  // -------------------------------------------------------------------------

  it('throws CannotBlockSuperAdminError when trying to block a super_admin', async () => {
    const repo = makeRepo(makeAdminRow({ role: 'super_admin' }));
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    await expect(
      uc.execute({ targetId: 'target-1', actorId: 'admin-1', isActive: false }),
    ).rejects.toBeInstanceOf(CannotBlockSuperAdminError);

    expect(repo.setProfileActive).not.toHaveBeenCalled();
  });

  it('CannotBlockSuperAdminError has code CANNOT_BLOCK_SUPER_ADMIN and httpStatus 422', async () => {
    const repo = makeRepo(makeAdminRow({ role: 'super_admin' }));
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    try {
      await uc.execute({ targetId: 'target-1', actorId: 'admin-1', isActive: false });
      fail('should have thrown');
    } catch (err) {
      expect((err as CannotBlockSuperAdminError).code).toBe('CANNOT_BLOCK_SUPER_ADMIN');
      expect((err as CannotBlockSuperAdminError).httpStatus).toBe(422);
    }
  });

  // -------------------------------------------------------------------------
  // Error: cannot block self
  // -------------------------------------------------------------------------

  it('throws CannotBlockSelfError when actor tries to block themselves', async () => {
    const repo = makeRepo(makeAdminRow({ id: 'admin-1', role: 'doctor' }));
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    await expect(
      uc.execute({ targetId: 'admin-1', actorId: 'admin-1', isActive: false }),
    ).rejects.toBeInstanceOf(CannotBlockSelfError);

    expect(repo.setProfileActive).not.toHaveBeenCalled();
  });

  it('CannotBlockSelfError has code CANNOT_BLOCK_SELF and httpStatus 422', async () => {
    const repo = makeRepo(makeAdminRow({ id: 'admin-1', role: 'doctor' }));
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    try {
      await uc.execute({ targetId: 'admin-1', actorId: 'admin-1', isActive: false });
      fail('should have thrown');
    } catch (err) {
      expect((err as CannotBlockSelfError).code).toBe('CANNOT_BLOCK_SELF');
      expect((err as CannotBlockSelfError).httpStatus).toBe(422);
    }
  });

  // -------------------------------------------------------------------------
  // Self-unblock is allowed
  // -------------------------------------------------------------------------

  it('does NOT throw CannotBlockSelfError when actor unblocks themselves (is_active=true)', async () => {
    const repo = makeRepo(makeAdminRow({ id: 'admin-1', role: 'doctor' }), true);
    const uc = new SetDoctorAccessUseCase(repo as unknown as IAdminRepository);

    // Unblocking self is allowed
    const result = await uc.execute({
      targetId: 'admin-1',
      actorId: 'admin-1',
      isActive: true,
    });

    expect(result).toEqual({ id: 'admin-1', isActive: true });
  });
});
