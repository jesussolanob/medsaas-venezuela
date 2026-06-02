import { PatientPackage, type PatientPackageCreateParams } from './patient-package.entity';

const BASE: PatientPackageCreateParams = {
  id: 'pkg-001',
  doctorId: 'doc-001',
  patientId: 'pat-001',
  planName: 'Paquete 10 sesiones',
  totalSessions: 10,
  usedSessions: 0,
  status: 'active',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('PatientPackage', () => {
  describe('remainingSessions', () => {
    it('calculates remaining sessions correctly when none used', () => {
      const pkg = PatientPackage.create(BASE);
      expect(pkg.remainingSessions).toBe(10);
    });

    it('calculates remaining sessions correctly when some used', () => {
      const pkg = PatientPackage.create({ ...BASE, usedSessions: 7 });
      expect(pkg.remainingSessions).toBe(3);
    });

    it('returns 0 when all sessions used', () => {
      const pkg = PatientPackage.create({ ...BASE, usedSessions: 10, status: 'completed' });
      expect(pkg.remainingSessions).toBe(0);
    });
  });

  describe('isAvailableFor', () => {
    it('returns true when doctor matches, status is active, and sessions remain', () => {
      const pkg = PatientPackage.create({ ...BASE, usedSessions: 5 });
      expect(pkg.isAvailableFor('doc-001')).toBe(true);
    });

    it('returns false when exhausted (used == total)', () => {
      const pkg = PatientPackage.create({ ...BASE, usedSessions: 10, status: 'completed' });
      expect(pkg.isAvailableFor('doc-001')).toBe(false);
    });

    it('returns false for a different doctor', () => {
      const pkg = PatientPackage.create({ ...BASE, usedSessions: 5 });
      expect(pkg.isAvailableFor('doc-999')).toBe(false);
    });

    it('returns false when status is completed', () => {
      const pkg = PatientPackage.create({ ...BASE, usedSessions: 10, status: 'completed' });
      expect(pkg.isAvailableFor('doc-001')).toBe(false);
    });

    it('returns false when remaining sessions is 0 and status is still active (edge case)', () => {
      // usedSessions == totalSessions but status not yet updated — domain still guards correctly
      const pkg = PatientPackage.create({ ...BASE, usedSessions: 10, status: 'active' });
      expect(pkg.isAvailableFor('doc-001')).toBe(false);
    });
  });

  describe('wouldCompleteAfterUse', () => {
    it('returns true when using the last session would exhaust the package', () => {
      const pkg = PatientPackage.create({ ...BASE, usedSessions: 9 });
      expect(pkg.wouldCompleteAfterUse()).toBe(true);
    });

    it('returns false when multiple sessions still remain after use', () => {
      const pkg = PatientPackage.create({ ...BASE, usedSessions: 7 });
      expect(pkg.wouldCompleteAfterUse()).toBe(false);
    });

    it('returns true on last session (exact boundary)', () => {
      // 1 session total, 0 used → consuming 1 completes it
      const pkg = PatientPackage.create({ ...BASE, totalSessions: 1, usedSessions: 0 });
      expect(pkg.wouldCompleteAfterUse()).toBe(true);
    });
  });

  describe('factory', () => {
    it('stores optional fields with defaults when not supplied', () => {
      const pkg = PatientPackage.create(BASE);
      expect(pkg.authUserId).toBeNull();
      expect(pkg.packageTemplateId).toBeNull();
      expect(pkg.specialty).toBeNull();
      expect(pkg.purchasedAmountUsd).toBeNull();
      expect(pkg.notifiedOneLeft).toBe(false);
    });
  });
});
