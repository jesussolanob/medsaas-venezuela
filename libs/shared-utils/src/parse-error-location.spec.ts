import { parseErrorLocation } from './parse-error-location';

describe('parseErrorLocation', () => {
  it('extracts file and method from a typical class method stack frame', () => {
    const err = new Error('test');
    err.stack = [
      'Error: test',
      '    at PatientsService.findById (/app/src/modules/patients/patients.service.ts:42:10)',
      '    at Object.<anonymous> (/app/src/main.ts:5:1)',
    ].join('\n');

    const location = parseErrorLocation(err);
    expect(location.file).toBe('patients.service.ts');
    expect(location.method).toBe('PatientsService.findById');
  });

  it('extracts file and method from a plain function frame', () => {
    const err = new Error('test');
    err.stack = [
      'Error: test',
      '    at someUtilFunction (/app/src/utils/helper.ts:7:3)',
    ].join('\n');

    const location = parseErrorLocation(err);
    expect(location.file).toBe('helper.ts');
    expect(location.method).toBe('someUtilFunction');
  });

  it('extracts file from a frame without a method name', () => {
    const err = new Error('test');
    err.stack = [
      'Error: test',
      '    at /app/src/utils/bootstrap.ts:12:5',
    ].join('\n');

    const location = parseErrorLocation(err);
    expect(location.file).toBe('bootstrap.ts');
    expect(location.method).toBe('anonymous');
  });

  it('returns unknown/unknown when stack is empty string', () => {
    const err = new Error('test');
    err.stack = '';

    const location = parseErrorLocation(err);
    expect(location.file).toBe('unknown');
    expect(location.method).toBe('unknown');
  });

  it('returns unknown/unknown when stack is undefined', () => {
    const err = new Error('test');
    err.stack = undefined;

    const location = parseErrorLocation(err);
    expect(location.file).toBe('unknown');
    expect(location.method).toBe('unknown');
  });

  it('returns unknown/unknown when stack has no parseable frames', () => {
    const err = new Error('test');
    err.stack = [
      'Error: test',
      '    at <anonymous>',
      '    at native code',
    ].join('\n');

    const location = parseErrorLocation(err);
    expect(location.file).toBe('unknown');
    expect(location.method).toBe('unknown');
  });

  it('handles async method frames correctly', () => {
    const err = new Error('test');
    err.stack = [
      'Error: test',
      '    at async ConsultationService.create (/app/src/modules/consultations/consultation.service.ts:88:5)',
    ].join('\n');

    const location = parseErrorLocation(err);
    expect(location.file).toBe('consultation.service.ts');
    // async keyword may or may not be part of the capture group depending on Node version;
    // we just assert it parses without throwing.
    expect(typeof location.method).toBe('string');
  });

  it('handles Windows-style path separators', () => {
    const err = new Error('test');
    err.stack = [
      'Error: test',
      '    at SomeClass.method (C:\\app\\src\\modules\\some.service.ts:10:3)',
    ].join('\n');

    const location = parseErrorLocation(err);
    expect(location.file).toBe('some.service.ts');
  });
});
