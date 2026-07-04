import { PatientRequest } from './patient-request.entity';

const makeRequest = (
  overrides: Partial<{
    status: 'pending' | 'fulfilled' | 'revoked';
    failedAttempts: number;
    lastCodeRequestedAt: Date | null;
    doctorId: string;
  }> = {},
): PatientRequest =>
  PatientRequest.create({
    id: 'req-1',
    doctorId: overrides.doctorId ?? 'doctor-1',
    patientId: 'patient-1',
    token: 'some-token',
    title: 'Análisis de sangre',
    description: null,
    responseText: null,
    status: overrides.status ?? 'pending',
    failedAttempts: overrides.failedAttempts ?? 0,
    lastCodeRequestedAt: overrides.lastCodeRequestedAt ?? null,
    fulfilledAt: null,
    createdAt: new Date(),
  });

describe('PatientRequest entity', () => {
  describe('isPending()', () => {
    it('returns true when status is pending', () => {
      expect(makeRequest({ status: 'pending' }).isPending()).toBe(true);
    });

    it('returns false when status is fulfilled', () => {
      expect(makeRequest({ status: 'fulfilled' }).isPending()).toBe(false);
    });

    it('returns false when status is revoked', () => {
      expect(makeRequest({ status: 'revoked' }).isPending()).toBe(false);
    });
  });

  describe('canBeAccessedBy()', () => {
    it('returns true when doctorId matches', () => {
      expect(makeRequest({ doctorId: 'doctor-1' }).canBeAccessedBy('doctor-1')).toBe(true);
    });

    it('returns false when doctorId does not match', () => {
      expect(makeRequest({ doctorId: 'doctor-1' }).canBeAccessedBy('doctor-2')).toBe(false);
    });
  });

  describe('isLinkBruteforceBlocked()', () => {
    it('returns false when failed attempts is below threshold', () => {
      expect(makeRequest({ failedAttempts: 9 }).isLinkBruteforceBlocked()).toBe(false);
    });

    it('returns true when failed attempts equals threshold (10)', () => {
      expect(makeRequest({ failedAttempts: 10 }).isLinkBruteforceBlocked()).toBe(true);
    });

    it('returns true when failed attempts exceeds threshold', () => {
      expect(makeRequest({ failedAttempts: 15 }).isLinkBruteforceBlocked()).toBe(true);
    });
  });

  describe('isCodeRequestOnCooldown()', () => {
    it('returns false when lastCodeRequestedAt is null', () => {
      const now = new Date();
      expect(makeRequest({ lastCodeRequestedAt: null }).isCodeRequestOnCooldown(now)).toBe(false);
    });

    it('returns true when last request was within 60 seconds', () => {
      const now = new Date();
      const recentRequest = new Date(now.getTime() - 30_000); // 30s ago
      expect(makeRequest({ lastCodeRequestedAt: recentRequest }).isCodeRequestOnCooldown(now)).toBe(
        true,
      );
    });

    it('returns false when last request was more than 60 seconds ago', () => {
      const now = new Date();
      const oldRequest = new Date(now.getTime() - 61_000); // 61s ago
      expect(makeRequest({ lastCodeRequestedAt: oldRequest }).isCodeRequestOnCooldown(now)).toBe(
        false,
      );
    });

    it('returns false when exactly 60 seconds have elapsed', () => {
      const now = new Date();
      const exactRequest = new Date(now.getTime() - 60_000);
      expect(makeRequest({ lastCodeRequestedAt: exactRequest }).isCodeRequestOnCooldown(now)).toBe(
        false,
      );
    });
  });
});
