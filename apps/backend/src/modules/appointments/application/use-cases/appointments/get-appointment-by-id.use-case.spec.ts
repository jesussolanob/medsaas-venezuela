import { GetAppointmentByIdUseCase } from './get-appointment-by-id.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../domain/entities/appointment.entity';

const DOCTOR_ID = 'doctor-uuid-1';
const APPT_ID = 'appt-uuid-1';
const now = new Date('2026-06-10T10:00:00Z');

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  return Appointment.create({
    id: APPT_ID,
    doctorId: DOCTOR_ID,
    patientId: 'patient-1',
    authUserId: null,
    consultationId: null,
    patientName: 'Juan P.',
    patientPhone: null,
    patientEmail: null,
    patientCedula: null,
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

function makeRepo(scopedResult: Appointment | null): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn(),
    findByIdForDoctor: jest.fn(),
    // New anti-IDOR method: enforces ownership at the SQL WHERE level.
    findByIdScopedEnriched: jest.fn().mockResolvedValue(scopedResult),
    list: jest.fn(),
    save: jest.fn(),
    updateStatus: jest.fn(),
    updateScheduledAt: jest.fn(),
    hasOverlap: jest.fn(),
    hasPatientOverlap: jest.fn(),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn(),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
    updateMeetLink: jest.fn().mockResolvedValue(undefined),
    updateGoogleEventId: jest.fn().mockResolvedValue(undefined),
    updateConsultationId: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn().mockResolvedValue(undefined),
    findFirstCompletedByPaymentId: jest.fn().mockResolvedValue(null),
    findUpcomingWithoutCalendarEvent: jest.fn().mockResolvedValue([]),
  } as jest.Mocked<IAppointmentRepository>;
}

describe('GetAppointmentByIdUseCase', () => {
  it('returns the appointment when found and actor is the owner', async () => {
    const appt = makeAppointment();
    const repo = makeRepo(appt);
    const useCase = new GetAppointmentByIdUseCase(repo);

    const result = await useCase.execute({ appointmentId: APPT_ID, doctorId: DOCTOR_ID });

    expect(result).toBe(appt);
    // The anti-IDOR path uses findByIdScopedEnriched (filters by doctorId in SQL WHERE).
    expect(repo.findByIdScopedEnriched).toHaveBeenCalledWith(APPT_ID, DOCTOR_ID);
  });

  it('throws AppointmentNotFoundError when appointment does not exist', async () => {
    const repo = makeRepo(null);
    const useCase = new GetAppointmentByIdUseCase(repo);

    await expect(
      useCase.execute({ appointmentId: 'non-existent', doctorId: DOCTOR_ID }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);
  });

  it('throws AppointmentNotFoundError (anti-enumeration) when actor is not the owning doctor', async () => {
    // When another doctor queries an appointment they don't own, findByIdScopedEnriched
    // returns null (SQL WHERE a.doctor_id = :doctorId excludes cross-doctor results).
    const repo = makeRepo(null);
    const useCase = new GetAppointmentByIdUseCase(repo);

    await expect(
      useCase.execute({ appointmentId: APPT_ID, doctorId: 'another-doctor' }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);
    expect(repo.findByIdScopedEnriched).toHaveBeenCalledWith(APPT_ID, 'another-doctor');
  });
});
