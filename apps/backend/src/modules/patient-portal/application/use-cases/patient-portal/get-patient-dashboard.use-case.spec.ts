import { GetPatientDashboardUseCase } from './get-patient-dashboard.use-case';
import type { IPatientPortalRepository } from '../../../domain/repositories/patient-portal.repository';
import type {
  AppointmentSummary,
  PackageSummary,
} from '../../../domain/entities/patient-dashboard.entity';
import { PatientDashboard } from '../../../domain/entities/patient-dashboard.entity';

function makeAppointmentSummary(): AppointmentSummary {
  return {
    id: 'appt-1',
    scheduledAt: new Date('2030-06-01T10:00:00Z'),
    status: 'scheduled',
    appointmentMode: 'presencial',
    planName: 'Consulta General',
    doctorId: 'doctor-1',
    doctorName: 'Dr. García',
  };
}

function makePackageSummary(): PackageSummary {
  return {
    id: 'pkg-1',
    planName: 'Paquete Premium',
    totalSessions: 10,
    usedSessions: 3,
    remainingSessions: 7,
    status: 'active',
    doctorId: 'doctor-1',
    doctorName: 'Dr. García',
    doctorTitle: 'Psic.',
    doctorSpecialty: 'Psicología',
    bookingLink: '/book/token-abc',
  };
}

describe('GetPatientDashboardUseCase', () => {
  let useCase: GetPatientDashboardUseCase;
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

    useCase = new GetPatientDashboardUseCase(mockRepo);
  });

  it('returns next upcoming appointment', async () => {
    const appt = makeAppointmentSummary();
    mockRepo.findNextAppointment.mockResolvedValue(appt);
    mockRepo.findActivePackages.mockResolvedValue([]);
    mockRepo.countAppointments.mockResolvedValue(5);

    const result = await useCase.execute({ authUserId: 'patient-auth-1' });

    expect(result).toBeInstanceOf(PatientDashboard);
    expect(result.nextAppointment).toEqual(appt);
    expect(result.totalAppointments).toBe(5);
  });

  it('returns null when no upcoming appointments', async () => {
    mockRepo.findNextAppointment.mockResolvedValue(null);
    mockRepo.findActivePackages.mockResolvedValue([]);
    mockRepo.countAppointments.mockResolvedValue(0);

    const result = await useCase.execute({ authUserId: 'patient-auth-1' });

    expect(result.nextAppointment).toBeNull();
    expect(result.hasUpcomingAppointment()).toBe(false);
  });

  it('returns active packages with doctor info', async () => {
    const pkg = makePackageSummary();
    mockRepo.findNextAppointment.mockResolvedValue(null);
    mockRepo.findActivePackages.mockResolvedValue([pkg]);
    mockRepo.countAppointments.mockResolvedValue(3);

    const result = await useCase.execute({ authUserId: 'patient-auth-1' });

    expect(result.activePackages).toHaveLength(1);
    expect(result.activePackages[0]!.doctorName).toBe('Dr. García');
    expect(result.activePackages[0]!.bookingLink).toBe('/book/token-abc');
  });

  it('executes all queries in parallel (Promise.all pattern)', async () => {
    const callOrder: string[] = [];
    mockRepo.findNextAppointment.mockImplementation(async () => {
      callOrder.push('findNextAppointment');
      return null;
    });
    mockRepo.findActivePackages.mockImplementation(async () => {
      callOrder.push('findActivePackages');
      return [];
    });
    mockRepo.countAppointments.mockImplementation(async () => {
      callOrder.push('countAppointments');
      return 0;
    });

    await useCase.execute({ authUserId: 'patient-auth-1' });

    // All three were called
    expect(mockRepo.findNextAppointment).toHaveBeenCalledTimes(1);
    expect(mockRepo.findActivePackages).toHaveBeenCalledTimes(1);
    expect(mockRepo.countAppointments).toHaveBeenCalledTimes(1);
    // All were called with the correct authUserId
    expect(mockRepo.findNextAppointment).toHaveBeenCalledWith('patient-auth-1');
    expect(mockRepo.findActivePackages).toHaveBeenCalledWith('patient-auth-1');
    expect(mockRepo.countAppointments).toHaveBeenCalledWith('patient-auth-1');
  });
});
