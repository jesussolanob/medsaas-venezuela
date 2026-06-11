import { OfficeModalityMismatchError } from './office-modality-mismatch.error';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('OfficeModalityMismatchError', () => {
  it('extends DomainError', () => {
    const err = new OfficeModalityMismatchError('online', 'in_person');
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has the correct code', () => {
    const err = new OfficeModalityMismatchError('online', 'in_person');
    expect(err.code).toBe('OFFICE_MODALITY_MISMATCH');
  });

  it('includes requested and office modality in the message', () => {
    const err = new OfficeModalityMismatchError('online', 'in_person');
    expect(err.message).toContain('online');
    expect(err.message).toContain('in_person');
  });
});
