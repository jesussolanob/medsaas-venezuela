import { GoogleNotConnectedError } from './google-not-connected.error';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('GoogleNotConnectedError', () => {
  it('extends DomainError', () => {
    const err = new GoogleNotConnectedError();
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has the correct code', () => {
    const err = new GoogleNotConnectedError();
    expect(err.code).toBe('GOOGLE_NOT_CONNECTED');
  });

  it('returns a generic message regardless of doctorId (no PII in client-facing message)', () => {
    const err = new GoogleNotConnectedError('doctor-abc');
    // doctorId must NOT appear in the message — it propagates to the client
    expect(err.message).not.toContain('doctor-abc');
    expect(err.message).toBe('Google integration not available');
  });

  it('returns the same generic message when no doctorId is given', () => {
    const err = new GoogleNotConnectedError();
    expect(err.message).toBe('Google integration not available');
  });
});
