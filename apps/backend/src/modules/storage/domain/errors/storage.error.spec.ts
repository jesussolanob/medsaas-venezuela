import { StorageUploadError, StorageValidationError } from './storage.error';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('StorageUploadError', () => {
  it('extends DomainError', () => {
    const err = new StorageUploadError();
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has code STORAGE_UPLOAD_FAILED', () => {
    const err = new StorageUploadError();
    expect(err.code).toBe('STORAGE_UPLOAD_FAILED');
  });

  it('has httpStatus 502', () => {
    const err = new StorageUploadError();
    expect(err.httpStatus).toBe(502);
  });

  it('includes cause in message when provided', () => {
    const err = new StorageUploadError('timeout');
    expect(err.message).toContain('timeout');
  });

  it('uses generic message when no cause provided', () => {
    const err = new StorageUploadError();
    expect(err.message).toBe('Storage upload failed');
  });
});

describe('StorageValidationError', () => {
  it('extends DomainError', () => {
    const err = new StorageValidationError('file too large');
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has code STORAGE_VALIDATION_FAILED', () => {
    const err = new StorageValidationError('invalid type');
    expect(err.code).toBe('STORAGE_VALIDATION_FAILED');
  });

  it('does not override httpStatus (defaults to 422)', () => {
    const err = new StorageValidationError('bad');
    expect(err.httpStatus).toBeUndefined();
  });

  it('includes reason in message', () => {
    const err = new StorageValidationError('file too large');
    expect(err.message).toBe('file too large');
  });
});
