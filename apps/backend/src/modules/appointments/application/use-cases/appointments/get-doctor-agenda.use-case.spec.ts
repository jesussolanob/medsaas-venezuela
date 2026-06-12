import { GetDoctorAgendaUseCase } from './get-doctor-agenda.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../domain/entities/appointment.entity';

const DOCTOR_ID = 'doctor-uuid-1';
const now = new Date('2026-06-10T10:00:00Z');

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  return Appointment.create({
    id: 'appt-1',
    doctorId: DOCTOR_ID,
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

function makeRepo(items: Appointment[]): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn(),
    findByIdForDoctor: jest.fn(),
    list: jest.fn().mockResolvedValue({ items, total: items.length, page: 1, limit: 20 }),
    save: jest.fn(),
    updateStatus: jest.fn(),
    updateScheduledAt: jest.fn(),
    hasSlotConflict: jest.fn(),
    hasDuplicate: jest.fn(),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn(),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
    findRescheduleChain: jest.fn().mockResolvedValue([]),
    findChangeLogs: jest.fn().mockResolvedValue([]),
    updateMeetLink: jest.fn().mockResolvedValue(undefined),
    updateGoogleEventId: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<IAppointmentRepository>;
}

describe('GetDoctorAgendaUseCase', () => {
  it('returns paginated list from the repository', async () => {
    const appt = makeAppointment();
    const repo = makeRepo([appt]);
    const useCase = new GetDoctorAgendaUseCase(repo);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, page: 1, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(repo.list).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      dateFrom: undefined,
      dateTo: undefined,
      status: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('parses date strings and forwards them to the repository', async () => {
    const repo = makeRepo([]);
    const useCase = new GetDoctorAgendaUseCase(repo);

    await useCase.execute({
      doctorId: DOCTOR_ID,
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      status: 'confirmed',
      page: 2,
      limit: 10,
    });

    expect(repo.list).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      dateFrom: new Date('2026-06-01'),
      dateTo: new Date('2026-06-30'),
      status: 'confirmed',
      page: 2,
      limit: 10,
    });
  });

  it('returns empty list when no appointments match', async () => {
    const repo = makeRepo([]);
    const useCase = new GetDoctorAgendaUseCase(repo);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, page: 1, limit: 20 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
