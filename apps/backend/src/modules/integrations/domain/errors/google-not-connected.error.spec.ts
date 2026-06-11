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

  it('includes doctorId in message when provided', () => {
    const err = new GoogleNotConnectedError('doctor-abc');
    expect(err.message).toContain('doctor-abc');
  });

  it('returns a generic message when no doctorId is given', () => {
    const err = new GoogleNotConnectedError();
    expect(err.message).toContain('not configured');
  });
});
