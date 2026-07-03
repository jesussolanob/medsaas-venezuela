import { maskAppointmentPii, toPlainAppointment } from './appointment.mapper';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../domain/entities/appointment.entity';

const now = new Date('2026-06-10T10:00:00Z');

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  return Appointment.create({
    id: 'appt-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    authUserId: null,
    consultationId: null,
    patientName: 'Juan Pérez García',
    patientPhone: '+58412345678',
    patientEmail: 'juan@example.com',
    patientCedula: 'V-12345678',
    scheduledAt: now,
    status: 'scheduled',
    appointmentMode: 'presencial',
    source: null,
    planName: 'Consulta',
    planPrice: 30,
    paymentMethod: null,
    paymentReference: null,
    paymentReceiptUrl: null,
    insuranceName: null,
    bcvRate: null,
    amountBs: null,
    packageId: null,
    sessionNumber: null,
    chiefComplaint: null,
    appointmentCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('toPlainAppointment', () => {
  it('returns a plain object (not an Appointment instance)', () => {
    const appt = makeAppointment();
    const plain = toPlainAppointment(appt);
    expect(plain).not.toBeInstanceOf(Object.getPrototypeOf(appt).constructor);
    expect(Object.getPrototypeOf(plain)).toBe(Object.prototype);
  });

  it('includes consultationId in the output (null when not linked)', () => {
    const plain = toPlainAppointment(makeAppointment({ consultationId: null }));
    expect(Object.prototype.hasOwnProperty.call(plain, 'consultationId')).toBe(true);
    expect(plain.consultationId).toBeNull();
  });

  it('includes consultationId when a consultation is linked', () => {
    const plain = toPlainAppointment(makeAppointment({ consultationId: 'cons-uuid-1' }));
    expect(plain.consultationId).toBe('cons-uuid-1');
  });

  it('includes all non-PII appointment fields', () => {
    const appt = makeAppointment();
    const plain = toPlainAppointment(appt);
    expect(plain.id).toBe(appt.id);
    expect(plain.doctorId).toBe(appt.doctorId);
    expect(plain.status).toBe(appt.status);
    expect(plain.scheduledAt).toBe(appt.scheduledAt);
    expect(plain.appointmentMode).toBe(appt.appointmentMode);
  });

  it('includes paymentStatus as null when no consultation is linked', () => {
    const plain = toPlainAppointment(makeAppointment({ paymentStatus: null }));
    expect(Object.prototype.hasOwnProperty.call(plain, 'paymentStatus')).toBe(true);
    expect(plain.paymentStatus).toBeNull();
  });

  it('includes paymentStatus from the linked consultation when available', () => {
    const plain = toPlainAppointment(makeAppointment({ paymentStatus: 'pending' }));
    expect(plain.paymentStatus).toBe('pending');
  });

  it('includes paymentStatus = approved when the linked consultation was paid', () => {
    const plain = toPlainAppointment(makeAppointment({ paymentStatus: 'approved' }));
    expect(plain.paymentStatus).toBe('approved');
  });
});

describe('maskAppointmentPii', () => {
  it('masks patient name to first name + last-name initial', () => {
    const masked = maskAppointmentPii(makeAppointment({ patientName: 'Juan Pérez García' }));
    expect(masked.patientName).toBe('Juan G.');
  });

  it('keeps single-word patient name without adding an initial', () => {
    const masked = maskAppointmentPii(makeAppointment({ patientName: 'Juan' }));
    expect(masked.patientName).toBe('Juan');
  });

  it('masks phone number keeping first 4 and last 3 chars', () => {
    const masked = maskAppointmentPii(makeAppointment({ patientPhone: '+58412345678' }));
    expect(masked.patientPhone).toBe('+584***678');
  });

  it('does not mask short phone numbers (≤6 chars)', () => {
    const masked = maskAppointmentPii(makeAppointment({ patientPhone: '12345' }));
    expect(masked.patientPhone).toBe('12345');
  });

  it('masks email address keeping first char + domain', () => {
    const masked = maskAppointmentPii(makeAppointment({ patientEmail: 'juan@example.com' }));
    expect(masked.patientEmail).toBe('j***@example.com');
  });

  it('returns email unchanged when it has no @ or empty local part', () => {
    const masked = maskAppointmentPii(makeAppointment({ patientEmail: 'not-an-email' }));
    expect(masked.patientEmail).toBe('not-an-email');
  });

  it('masks cedula keeping first 3 and last 2 chars', () => {
    const masked = maskAppointmentPii(makeAppointment({ patientCedula: 'V-12345678' }));
    expect(masked.patientCedula).toBe('V-1***78');
  });

  it('does not mask short cedula (≤5 chars)', () => {
    const masked = maskAppointmentPii(makeAppointment({ patientCedula: 'V-123' }));
    expect(masked.patientCedula).toBe('V-123');
  });

  it('keeps null PII fields as null', () => {
    const masked = maskAppointmentPii(
      makeAppointment({
        patientName: null,
        patientPhone: null,
        patientEmail: null,
        patientCedula: null,
      }),
    );
    expect(masked.patientName).toBeNull();
    expect(masked.patientPhone).toBeNull();
    expect(masked.patientEmail).toBeNull();
    expect(masked.patientCedula).toBeNull();
  });

  it('does not mutate the original appointment', () => {
    const appt = makeAppointment({ patientName: 'Juan Pérez García' });
    maskAppointmentPii(appt);
    expect(appt.patientName).toBe('Juan Pérez García');
  });

  it('preserves non-PII fields unchanged', () => {
    const appt = makeAppointment();
    const masked = maskAppointmentPii(appt);
    expect(masked.id).toBe(appt.id);
    expect(masked.doctorId).toBe(appt.doctorId);
    expect(masked.scheduledAt).toBe(appt.scheduledAt);
    expect(masked.status).toBe(appt.status);
  });
});
