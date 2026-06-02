import { BadRequestException } from '@nestjs/common';
import { AppointmentStatusSchema, CreatePatientSchema } from '@delta/shared-types';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * These tests double as the validation that the `@delta/shared-types` path
 * alias resolves from inside the backend (Fase 3 scaffold acceptance).
 */
describe('ZodValidationPipe with @delta/shared-types schemas', () => {
  it('resolves the @delta/shared-types alias and exposes enum values', () => {
    expect(AppointmentStatusSchema.parse('scheduled')).toBe('scheduled');
    expect(() => AppointmentStatusSchema.parse('not_a_status')).toThrow();
  });

  it('returns parsed data when input matches a shared schema', () => {
    const pipe = new ZodValidationPipe(CreatePatientSchema);
    const input = {
      doctor_id: '11111111-1111-4111-8111-111111111111',
      full_name: 'Ana Pérez',
    };

    const result = pipe.transform(input) as { full_name: string };

    expect(result.full_name).toBe('Ana Pérez');
  });

  it('throws BadRequestException with field errors on invalid input', () => {
    const pipe = new ZodValidationPipe(CreatePatientSchema);

    // Missing required doctor_id + empty full_name.
    expect(() => pipe.transform({ full_name: '' })).toThrow(BadRequestException);
  });
});
