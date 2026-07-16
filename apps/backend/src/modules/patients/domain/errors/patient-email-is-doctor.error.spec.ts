import { PatientEmailIsDoctorError } from './patient-email-is-doctor.error';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('PatientEmailIsDoctorError', () => {
  it('is a DomainError', () => {
    const error = new PatientEmailIsDoctorError();
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(PatientEmailIsDoctorError);
  });

  it('has code PATIENT_EMAIL_IS_DOCTOR', () => {
    const error = new PatientEmailIsDoctorError();
    expect(error.code).toBe('PATIENT_EMAIL_IS_DOCTOR');
  });

  it('has httpStatus 409', () => {
    const error = new PatientEmailIsDoctorError();
    expect(error.httpStatus).toBe(409);
  });

  it('has a Spanish message', () => {
    const error = new PatientEmailIsDoctorError();
    expect(error.message).toContain('correo de especialista');
    expect(error.message).toContain('paciente');
  });

  it('is an instance of Error', () => {
    const error = new PatientEmailIsDoctorError();
    expect(error).toBeInstanceOf(Error);
  });
});
