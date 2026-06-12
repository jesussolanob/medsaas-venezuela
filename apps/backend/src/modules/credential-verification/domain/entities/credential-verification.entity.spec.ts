import { CredentialVerification } from './credential-verification.entity';

const baseProps = {
  id: '22222222-2222-2222-2222-222222222222',
  doctorId: '33333333-3333-3333-3333-333333333333',
  credentialType: 'mpps',
  declaredValue: 'MPPS-12345',
  verifierId: null,
  status: 'pending' as const,
  evidence: null,
  checkedAt: null,
  attempts: 0,
  lastError: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('CredentialVerification', () => {
  describe('create', () => {
    it('creates a verification with all props', () => {
      const v = CredentialVerification.create(baseProps);

      expect(v.id).toBe(baseProps.id);
      expect(v.doctorId).toBe(baseProps.doctorId);
      expect(v.status).toBe('pending');
      expect(v.attempts).toBe(0);
      expect(v.evidence).toBeNull();
    });
  });

  describe('isPending', () => {
    it('returns true when status is pending', () => {
      const v = CredentialVerification.create(baseProps);
      expect(v.isPending()).toBe(true);
    });

    it('returns false when status is verified', () => {
      const v = CredentialVerification.create({ ...baseProps, status: 'verified' });
      expect(v.isPending()).toBe(false);
    });
  });

  describe('isVerified', () => {
    it('returns true when status is verified', () => {
      const v = CredentialVerification.create({ ...baseProps, status: 'verified' });
      expect(v.isVerified()).toBe(true);
    });

    it('returns false when status is pending', () => {
      const v = CredentialVerification.create(baseProps);
      expect(v.isVerified()).toBe(false);
    });
  });

  describe('withVerified', () => {
    it('returns a new entity with verified status and increments attempts', () => {
      const original = CredentialVerification.create(baseProps);
      const verifierId = '44444444-4444-4444-4444-444444444444';
      const evidence = {
        fechaRegistro: '2020-01-01',
        profesion: 'MEDICO',
        matchedName: 'JOSE GARCIA',
      };
      const checkedAt = new Date('2024-06-01');

      const verified = original.withVerified(verifierId, evidence, checkedAt);

      expect(verified.status).toBe('verified');
      expect(verified.verifierId).toBe(verifierId);
      expect(verified.evidence).toEqual(evidence);
      expect(verified.checkedAt).toBe(checkedAt);
      expect(verified.attempts).toBe(1);
      expect(verified.lastError).toBeNull();
      // original is unchanged
      expect(original.status).toBe('pending');
      expect(original.attempts).toBe(0);
    });
  });

  describe('withFailure', () => {
    it('transitions to not_found and increments attempts', () => {
      const original = CredentialVerification.create(baseProps);
      const checkedAt = new Date('2024-06-01');

      const failed = original.withFailure('not_found', null, checkedAt, null);

      expect(failed.status).toBe('not_found');
      expect(failed.attempts).toBe(1);
      expect(failed.checkedAt).toBe(checkedAt);
      // original is unchanged
      expect(original.status).toBe('pending');
    });

    it('transitions to mismatch with last error', () => {
      const original = CredentialVerification.create(baseProps);
      const failed = original.withFailure('mismatch', null, new Date(), 'Name mismatch');
      expect(failed.status).toBe('mismatch');
      expect(failed.lastError).toBe('Name mismatch');
    });

    it('transitions to error with network error message', () => {
      const original = CredentialVerification.create(baseProps);
      const failed = original.withFailure('error', null, new Date(), 'SACS timeout');
      expect(failed.status).toBe('error');
      expect(failed.lastError).toBe('SACS timeout');
    });

    it('sets verifier_id from parameter when provided', () => {
      const verifierId = '55555555-5555-5555-5555-555555555555';
      const original = CredentialVerification.create(baseProps);
      const failed = original.withFailure('not_found', verifierId, new Date(), null);
      expect(failed.verifierId).toBe(verifierId);
    });
  });

  describe('immutability', () => {
    it('id stays equal to the original props id', () => {
      const v = CredentialVerification.create(baseProps);
      expect(v.id).toBe(baseProps.id);
    });

    it('withVerified returns a new instance (does not mutate original)', () => {
      const original = CredentialVerification.create(baseProps);
      const next = original.withVerified('v-id', {}, new Date());
      expect(next).not.toBe(original);
      expect(original.status).toBe('pending');
    });
  });
});
