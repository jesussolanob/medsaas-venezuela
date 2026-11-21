import { RescheduleByTokenUseCase } from './reschedule-by-token.use-case';
import { AppointmentRescheduleTokenService } from '../../../infrastructure/services/appointment-reschedule-token.service';
import { AppointmentRescheduleInvalidTokenError } from '../../../domain/errors/appointment-reschedule-invalid-token.error';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentNotReschedulableError } from '../../../domain/errors/appointment-not-reschedulable.error';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { ConfigService } from '@nestjs/config';

const FUTURE = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h from now

function makeAppointment(
  overrides: Partial<{
    id: string;
    status: string;
    scheduledAt: Date;
    patientName: string;
    appointmentMode: string;
  }> = {},
): Appointment {
  return Appointment.create({
    id: overrides.id ?? 'appt-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    patientName: overrides.patientName ?? 'María González',
    patientPhone: null,
    scheduledAt: overrides.scheduledAt ?? FUTURE,
    status: (overrides.status ?? 'scheduled') as import('@delta/shared-types').AppointmentStatus,
    appointmentMode: (overrides.appointmentMode ??
      'presencial') as import('@delta/shared-types').AppointmentMode,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeTokenService(): AppointmentRescheduleTokenService {
  const config = {
    get: (k: string) =>
      k === 'APPOINTMENT_ACTION_SECRET' ? 'test-secret-32-bytes-padding!!' : null,
  } as unknown as ConfigService;
  return new AppointmentRescheduleTokenService(config);
}

function makeSut(
  appointmentResult: Appointment | null,
  overrides: {
    hasOverlap?: boolean;
    updateScheduledAtResult?: Appointment | null;
  } = {},
) {
  const appt = appointmentResult;

  const appointmentRepo = {
    findById: jest.fn().mockResolvedValue(appt),
    hasOverlap: jest.fn().mockResolvedValue(overrides.hasOverlap ?? false),
    updateScheduledAt: jest.fn().mockResolvedValue(overrides.updateScheduledAtResult ?? appt),
    logStatusChange: jest.fn().mockResolvedValue(undefined),
  };

  const doctorProfileRepo = {
    findByDoctorId: jest.fn().mockResolvedValue({
      fullName: 'García',
      professionalTitle: 'Dra.',
    }),
  };

  const tokenService = makeTokenService();

  const sut = new RescheduleByTokenUseCase(
    appointmentRepo as unknown as import('../../../domain/repositories/appointment.repository').IAppointmentRepository,
    doctorProfileRepo as unknown as import('../../../../doctor-settings/domain/repositories/doctor-profile.repository').IDoctorProfileRepository,
    tokenService,
    null, // syncConsultationDate optional
  );

  return { sut, tokenService, appointmentRepo };
}

describe('RescheduleByTokenUseCase', () => {
  describe('getInfo', () => {
    it('returns appointment info for valid token', async () => {
      const appt = makeAppointment();
      const { sut, tokenService } = makeSut(appt);

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      const info = await sut.getInfo(token);

      expect(info.patientFirstName).toBe('María');
      expect(info.doctorName).toContain('García');
      expect(info.status).toBe('scheduled');
      expect(info.currentScheduledAt).toBe(appt.scheduledAt.toISOString());
    });

    it('throws 404 on invalid token', async () => {
      const { sut } = makeSut(makeAppointment());
      await expect(sut.getInfo('invalid.token.here')).rejects.toBeInstanceOf(
        AppointmentRescheduleInvalidTokenError,
      );
    });

    it('throws 404 when appointment not found', async () => {
      const appt = makeAppointment();
      const { sut, tokenService } = makeSut(null);

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      await expect(sut.getInfo(token)).rejects.toBeInstanceOf(
        AppointmentRescheduleInvalidTokenError,
      );
    });

    it('throws 404 when satMs does not match scheduledAt (stale token)', async () => {
      const appt = makeAppointment({ scheduledAt: FUTURE });
      const { sut, tokenService } = makeSut(appt);

      // Generate token with a different satMs (simulating old scheduledAt)
      const staleSatMs = FUTURE.getTime() - 60 * 60 * 1000; // 1h earlier
      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: staleSatMs,
      });

      await expect(sut.getInfo(token)).rejects.toBeInstanceOf(
        AppointmentRescheduleInvalidTokenError,
      );
    });

    it('throws AppointmentNotReschedulableError for cancelled appointment', async () => {
      const appt = makeAppointment({ status: 'cancelled' });
      const { sut, tokenService } = makeSut(appt);

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      await expect(sut.getInfo(token)).rejects.toBeInstanceOf(AppointmentNotReschedulableError);
    });

    it('throws AppointmentNotReschedulableError for completed appointment', async () => {
      const appt = makeAppointment({ status: 'completed' });
      const { sut, tokenService } = makeSut(appt);

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      await expect(sut.getInfo(token)).rejects.toBeInstanceOf(AppointmentNotReschedulableError);
    });

    it('extracts first name only from patient name', async () => {
      const appt = makeAppointment({ patientName: 'Ana María Rodríguez López' });
      const { sut, tokenService } = makeSut(appt);

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      const info = await sut.getInfo(token);
      expect(info.patientFirstName).toBe('Ana');
    });
  });

  describe('execute', () => {
    it('reschedules appointment and returns updated info', async () => {
      const appt = makeAppointment();
      const newDate = new Date(FUTURE.getTime() + 2 * 60 * 60 * 1000);
      const updatedAppt = makeAppointment({ scheduledAt: newDate });

      const { sut, tokenService, appointmentRepo } = makeSut(appt, {
        hasOverlap: false,
        updateScheduledAtResult: updatedAppt,
      });

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      const result = await sut.execute(token, newDate);

      expect(appointmentRepo.updateScheduledAt).toHaveBeenCalledWith(appt.id, newDate);
      expect(result.currentScheduledAt).toBe(newDate.toISOString());
    });

    it('throws AppointmentConflictError when new slot has overlap', async () => {
      const appt = makeAppointment();
      const { sut, tokenService } = makeSut(appt, { hasOverlap: true });

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      const newDate = new Date(FUTURE.getTime() + 2 * 60 * 60 * 1000);
      await expect(sut.execute(token, newDate)).rejects.toBeInstanceOf(AppointmentConflictError);
    });

    it('does not persist when token is invalid', async () => {
      const { sut, appointmentRepo } = makeSut(makeAppointment());

      await expect(sut.execute('bad.token', new Date())).rejects.toBeInstanceOf(
        AppointmentRescheduleInvalidTokenError,
      );

      expect(appointmentRepo.updateScheduledAt).not.toHaveBeenCalled();
    });

    it('throws 404 when satMs is stale (appointment was already rescheduled)', async () => {
      const appt = makeAppointment({ scheduledAt: FUTURE });
      const { sut, tokenService } = makeSut(appt);

      // Simulate: token was generated with the OLD scheduledAt
      const oldSatMs = FUTURE.getTime() - 3600_000;
      const token = tokenService.generate({ appointmentId: appt.id, satMs: oldSatMs });

      await expect(sut.execute(token, new Date())).rejects.toBeInstanceOf(
        AppointmentRescheduleInvalidTokenError,
      );
    });
  });
});
