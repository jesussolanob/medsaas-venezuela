import { GetPatientAppointmentsUseCase } from './get-patient-appointments.use-case';
import type { IPatientPortalRepository } from '../../../domain/repositories/patient-portal.repository';
import { Appointment } from '../../../../appointments/domain/entities/appointment.entity';

function makeAppointment(id: string): Appointment {
  return Appointment.create({
    id,
    doctorId: 'doctor-1',
    patientId: null,
    authUserId: 'patient-auth-1',
    consultationId: null,
    scheduledAt: new Date('2030-06-01T10:00:00Z'),
    status: 'scheduled',
    appointmentMode: 'presencial',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('GetPatientAppointmentsUseCase', () => {
  let useCase: GetPatientAppointmentsUseCase;
  let mockRepo: jest.Mocked<IPatientPortalRepository>;

  beforeEach(() => {
    mockRepo = {
      findPatientIdsByAuthUserId: jest.fn(),
      findPatientsByAuthUserId: jest.fn(),
      findPatientByIdAndAuthUserId: jest.fn(),
      updatePatient: jest.fn(),
      findNextAppointment: jest.fn(),
      countAppointments: jest.fn(),
      listAppointments: jest.fn(),
      findActivePackages: jest.fn(),
      listPackages: jest.fn(),
      listPrescriptions: jest.fn(),
      listMessages: jest.fn(),
      insertMessage: jest.fn(),
      findPatientIdForDoctorRelationship: jest.fn(),
    } as jest.Mocked<IPatientPortalRepository>;

    useCase = new GetPatientAppointmentsUseCase(mockRepo);
  });

  it('returns appointments for the authenticated patient', async () => {
    const appts = [makeAppointment('appt-1'), makeAppointment('appt-2')];
    mockRepo.listAppointments.mockResolvedValue({
      items: appts,
      total: 2,
      page: 1,
      limit: 20,
    });

    const result = await useCase.execute({ authUserId: 'patient-auth-1', page: 1, limit: 20 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('passes pagination parameters to the repository', async () => {
    mockRepo.listAppointments.mockResolvedValue({ items: [], total: 0, page: 2, limit: 10 });

    await useCase.execute({ authUserId: 'patient-auth-1', page: 2, limit: 10 });

    expect(mockRepo.listAppointments).toHaveBeenCalledWith('patient-auth-1', 2, 10);
  });

  it('returns empty list when patient has no appointments', async () => {
    mockRepo.listAppointments.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    const result = await useCase.execute({ authUserId: 'patient-auth-1', page: 1, limit: 20 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
