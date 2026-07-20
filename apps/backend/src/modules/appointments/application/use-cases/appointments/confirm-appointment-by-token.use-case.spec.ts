import { Test } from '@nestjs/testing';
import { ConfirmAppointmentByTokenUseCase } from './confirm-appointment-by-token.use-case';
import { AppointmentConfirmTokenService } from '../../../infrastructure/services/appointment-confirm-token.service';
import { APPOINTMENT_REPOSITORY } from '../../../domain/repositories/appointment.repository';
import { DOCTOR_PROFILE_REPOSITORY } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { AppointmentConfirmInvalidTokenError } from '../../../domain/errors/appointment-confirm-invalid-token.error';
import { Appointment } from '../../../domain/entities/appointment.entity';

function makeAppointment(
  overrides: Partial<{
    id: string;
    doctorId: string;
    status: string;
    appointmentMode: string;
    scheduledAt: Date;
  }> = {},
): Appointment {
  return Appointment.create({
    id: overrides.id ?? 'appt-id-001',
    doctorId: overrides.doctorId ?? 'doctor-id-001',
    status: (overrides.status ?? 'scheduled') as import('@delta/shared-types').AppointmentStatus,
    appointmentMode: (overrides.appointmentMode ??
      'in_person') as import('@delta/shared-types').AppointmentMode,
    scheduledAt: overrides.scheduledAt ?? new Date('2026-08-01T14:00:00.000Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ConfirmAppointmentByTokenUseCase', () => {
  let useCase: ConfirmAppointmentByTokenUseCase;
  let mockTokenService: jest.Mocked<AppointmentConfirmTokenService>;
  let mockAppointmentRepo: {
    findById: jest.Mock;
    updateStatus: jest.Mock;
    logStatusChange: jest.Mock;
  };
  let mockDoctorProfileRepo: { findByDoctorId: jest.Mock };

  beforeEach(async () => {
    mockTokenService = {
      verify: jest.fn(),
      generate: jest.fn(),
    } as unknown as jest.Mocked<AppointmentConfirmTokenService>;

    mockAppointmentRepo = {
      findById: jest.fn(),
      updateStatus: jest.fn(),
      logStatusChange: jest.fn().mockResolvedValue(undefined),
    };

    mockDoctorProfileRepo = {
      findByDoctorId: jest.fn().mockResolvedValue({ fullName: 'Dr. Ana Torres' }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ConfirmAppointmentByTokenUseCase,
        { provide: AppointmentConfirmTokenService, useValue: mockTokenService },
        { provide: APPOINTMENT_REPOSITORY, useValue: mockAppointmentRepo },
        { provide: DOCTOR_PROFILE_REPOSITORY, useValue: mockDoctorProfileRepo },
      ],
    }).compile();

    useCase = module.get(ConfirmAppointmentByTokenUseCase);
  });

  // ---------------------------------------------------------------------------
  // Invalid token
  // ---------------------------------------------------------------------------

  it('throws AppointmentConfirmInvalidTokenError when token verify returns null', async () => {
    mockTokenService.verify.mockReturnValue(null);
    await expect(useCase.execute('bad-token')).rejects.toBeInstanceOf(
      AppointmentConfirmInvalidTokenError,
    );
    expect(mockAppointmentRepo.findById).not.toHaveBeenCalled();
  });

  it('throws AppointmentConfirmInvalidTokenError (404) on invalid token', async () => {
    mockTokenService.verify.mockReturnValue(null);
    let caught: AppointmentConfirmInvalidTokenError | null = null;
    try {
      await useCase.execute('invalid');
    } catch (e) {
      caught = e as AppointmentConfirmInvalidTokenError;
    }
    expect(caught?.httpStatus).toBe(404);
  });

  it('throws AppointmentConfirmInvalidTokenError when appointment is not found', async () => {
    mockTokenService.verify.mockReturnValue('appt-id-001');
    mockAppointmentRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute('valid-token')).rejects.toBeInstanceOf(
      AppointmentConfirmInvalidTokenError,
    );
  });

  // ---------------------------------------------------------------------------
  // Scheduled → Confirmed
  // ---------------------------------------------------------------------------

  it('transitions scheduled appointment to confirmed and returns public info', async () => {
    const appt = makeAppointment({ status: 'scheduled' });
    mockTokenService.verify.mockReturnValue(appt.id);
    mockAppointmentRepo.findById.mockResolvedValue(appt);
    mockAppointmentRepo.updateStatus.mockResolvedValue({ ...appt, status: 'confirmed' });

    const result = await useCase.execute('token');

    expect(mockAppointmentRepo.updateStatus).toHaveBeenCalledWith(appt.id, 'confirmed');
    expect(mockAppointmentRepo.logStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: appt.id,
        actorId: 'system',
        oldStatus: 'scheduled',
        newStatus: 'confirmed',
      }),
    );
    expect(result.status).toBe('confirmed');
    expect(result.doctorName).toBe('Dr. Ana Torres');
    expect(result.modality).toBe('in_person');
    expect(result.date).toBeTruthy();
    expect(result.time).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Idempotent — already confirmed
  // ---------------------------------------------------------------------------

  it('returns confirmed status without re-writing when already confirmed', async () => {
    const appt = makeAppointment({ status: 'confirmed' });
    mockTokenService.verify.mockReturnValue(appt.id);
    mockAppointmentRepo.findById.mockResolvedValue(appt);

    const result = await useCase.execute('token');

    expect(mockAppointmentRepo.updateStatus).not.toHaveBeenCalled();
    expect(mockAppointmentRepo.logStatusChange).not.toHaveBeenCalled();
    expect(result.status).toBe('confirmed');
  });

  // ---------------------------------------------------------------------------
  // Terminal statuses — non-error, returns current state
  // ---------------------------------------------------------------------------

  it.each(['cancelled', 'completed', 'no_show'])(
    'returns terminal status %s without updating',
    async (status) => {
      const appt = makeAppointment({ status });
      mockTokenService.verify.mockReturnValue(appt.id);
      mockAppointmentRepo.findById.mockResolvedValue(appt);

      const result = await useCase.execute('token');

      expect(mockAppointmentRepo.updateStatus).not.toHaveBeenCalled();
      expect(result.status).toBe(status);
    },
  );

  // ---------------------------------------------------------------------------
  // Fallback doctor name
  // ---------------------------------------------------------------------------

  it('uses fallback doctor name when profile is not found', async () => {
    const appt = makeAppointment({ status: 'scheduled' });
    mockTokenService.verify.mockReturnValue(appt.id);
    mockAppointmentRepo.findById.mockResolvedValue(appt);
    mockAppointmentRepo.updateStatus.mockResolvedValue(appt);
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue(null);

    const result = await useCase.execute('token');
    expect(result.doctorName).toBe('Su médico');
  });

  // ---------------------------------------------------------------------------
  // Audit log best-effort — failure must not surface as 500
  // ---------------------------------------------------------------------------

  it('resolves with confirmed status even when logStatusChange rejects', async () => {
    const appt = makeAppointment({ status: 'scheduled' });
    mockTokenService.verify.mockReturnValue(appt.id);
    mockAppointmentRepo.findById.mockResolvedValue(appt);
    mockAppointmentRepo.updateStatus.mockResolvedValue({ ...appt, status: 'confirmed' });
    mockAppointmentRepo.logStatusChange.mockRejectedValue(new Error('DB write failed'));

    // Must NOT throw — the appointment is already confirmed
    const result = await useCase.execute('token');

    expect(result.status).toBe('confirmed');
    expect(mockAppointmentRepo.updateStatus).toHaveBeenCalledWith(appt.id, 'confirmed');
  });
});
