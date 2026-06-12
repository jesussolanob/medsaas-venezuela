import {
  DoctorProfileNotFoundError,
  NoActiveVerifierError,
  VerificationPortalError,
  CredentialVerificationNotFoundError,
} from './credential-verification.errors';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('credential-verification domain errors', () => {
  describe('DoctorProfileNotFoundError', () => {
    it('extends DomainError', () => {
      expect(new DoctorProfileNotFoundError()).toBeInstanceOf(DomainError);
    });

    it('has correct code and httpStatus', () => {
      const err = new DoctorProfileNotFoundError();
      expect(err.code).toBe('DOCTOR_PROFILE_NOT_FOUND');
      expect(err.httpStatus).toBe(404);
    });
  });

  describe('NoActiveVerifierError', () => {
    it('extends DomainError', () => {
      expect(new NoActiveVerifierError('mpps')).toBeInstanceOf(DomainError);
    });

    it('has correct code and includes credential type in message', () => {
      const err = new NoActiveVerifierError('mpps');
      expect(err.code).toBe('NO_ACTIVE_VERIFIER');
      expect(err.message).toContain('mpps');
    });
  });

  describe('VerificationPortalError', () => {
    it('extends DomainError', () => {
      expect(new VerificationPortalError('SACS')).toBeInstanceOf(DomainError);
    });

    it('has correct code and httpStatus', () => {
      const err = new VerificationPortalError('SACS');
      expect(err.code).toBe('VERIFICATION_PORTAL_ERROR');
      expect(err.httpStatus).toBe(502);
      expect(err.message).toContain('SACS');
    });
  });

  describe('CredentialVerificationNotFoundError', () => {
    it('extends DomainError', () => {
      expect(new CredentialVerificationNotFoundError()).toBeInstanceOf(DomainError);
    });

    it('has correct code and httpStatus', () => {
      const err = new CredentialVerificationNotFoundError();
      expect(err.code).toBe('CREDENTIAL_VERIFICATION_NOT_FOUND');
      expect(err.httpStatus).toBe(404);
    });
  });
});
