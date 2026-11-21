import { RescheduleByTokenUseCase } from './reschedule-by-token.use-case';
import { AppointmentRescheduleTokenService } from '../../../infrastructure/services/appointment-reschedule-token.service';
import { AppointmentRescheduleInvalidTokenError } from '../../../domain/errors/appointment-reschedule-invalid-token.error';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentSlotUnavailableError } from '../../../domain/errors/appointment-slot-unavailable.error';
import { AppointmentNotReschedulableError } from '../../../domain/errors/appointment-not-reschedulable.error';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { ConfigService } from '@nestjs/config';
import type { GetAvailableSlotsUseCase } from '../../../../booking/application/use-cases/booking/get-available-slots.use-case';

const FUTURE = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h from now

// Fixed future date for slot-validation tests: 2026-12-15 10:00 Caracas = T14:00Z (UTC-4).
const SLOT_DATE = new Date('2026-12-15T14:00:00.000Z');
const SLOT_DATE_STR = '2026-12-15';
const SLOT_HHMM = '10:00'; // Caracas wall-clock representation of SLOT_DATE

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

/**
 * Permissive slots mock: returns every minute 00:00–23:59 as available.
 * Used as the default in tests that do NOT exercise slot validation logic.
 */
function makePermissiveSlotsMock(): jest.Mocked<GetAvailableSlotsUseCase> {
  const allSlots: Array<{ time: string; available: boolean }> = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m++) {
      allSlots.push({
        time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        available: true,
      });
    }
  }
  return {
    execute: jest
      .fn()
      .mockImplementation((_doctorId: string, dateStr: string) =>
        Promise.resolve({ date: dateStr, slots: allSlots }),
      ),
  } as unknown as jest.Mocked<GetAvailableSlotsUseCase>;
}

/** Slots mock with explicit slot list for slot-validation tests. */
function makeSlotsMock(
  slots: Array<{ time: string; available: boolean }>,
): jest.Mocked<GetAvailableSlotsUseCase> {
  return {
    execute: jest
      .fn()
      .mockImplementation((_doctorId: string, dateStr: string) =>
        Promise.resolve({ date: dateStr, slots }),
      ),
  } as unknown as jest.Mocked<GetAvailableSlotsUseCase>;
}

function makeSut(
  appointmentResult: Appointment | null,
  overrides: {
    hasOverlap?: boolean;
    updateScheduledAtResult?: Appointment | null;
    slotsUseCase?: jest.Mocked<GetAvailableSlotsUseCase>;
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
  const slotsUseCase = overrides.slotsUseCase ?? makePermissiveSlotsMock();

  const sut = new RescheduleByTokenUseCase(
    appointmentRepo as unknown as import('../../../domain/repositories/appointment.repository').IAppointmentRepository,
    doctorProfileRepo as unknown as import('../../../../doctor-settings/domain/repositories/doctor-profile.repository').IDoctorProfileRepository,
    tokenService,
    slotsUseCase,
    null, // syncConsultationDate optional
  );

  return { sut, tokenService, appointmentRepo, slotsUseCase };
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

  describe('execute — slot validation', () => {
    // All tests use SLOT_DATE (2026-12-15 10:00 Caracas = T14:00Z).
    // The token is always valid; only the slotsUseCase response varies.

    it('throws AppointmentSlotUnavailableError when date is outside schedule (no slots generated)', async () => {
      const appt = makeAppointment();
      const { sut, tokenService } = makeSut(appt, {
        slotsUseCase: makeSlotsMock([]), // empty → day has no schedule blocks
      });

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      await expect(sut.execute(token, SLOT_DATE)).rejects.toBeInstanceOf(
        AppointmentSlotUnavailableError,
      );
    });

    it('throws AppointmentSlotUnavailableError when time falls inside an availability block (available: false)', async () => {
      const appt = makeAppointment();
      const { sut, tokenService } = makeSut(appt, {
        slotsUseCase: makeSlotsMock([{ time: SLOT_HHMM, available: false }]),
      });

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      await expect(sut.execute(token, SLOT_DATE)).rejects.toBeInstanceOf(
        AppointmentSlotUnavailableError,
      );
    });

    it('throws AppointmentSlotUnavailableError when time is not aligned to the slot grid', async () => {
      const appt = makeAppointment();
      // Slot grid has 10:00 and 10:30 but NOT 10:15.
      const { sut, tokenService } = makeSut(appt, {
        slotsUseCase: makeSlotsMock([
          { time: '10:00', available: true },
          { time: '10:30', available: true },
        ]),
      });

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      // 2026-12-15 10:15 Caracas = T14:15:00Z
      const offGridDate = new Date('2026-12-15T14:15:00.000Z');
      await expect(sut.execute(token, offGridDate)).rejects.toBeInstanceOf(
        AppointmentSlotUnavailableError,
      );
    });

    it('proceeds and reschedules when slot is available (available: true)', async () => {
      const appt = makeAppointment();
      const updatedAppt = makeAppointment({ scheduledAt: SLOT_DATE });
      const slotsMock = makeSlotsMock([{ time: SLOT_HHMM, available: true }]);
      const { sut, tokenService, appointmentRepo } = makeSut(appt, {
        hasOverlap: false,
        updateScheduledAtResult: updatedAppt,
        slotsUseCase: slotsMock,
      });

      const token = tokenService.generate({
        appointmentId: appt.id,
        satMs: appt.scheduledAt.getTime(),
      });

      const result = await sut.execute(token, SLOT_DATE);

      // Slot validator was called with the correct doctorId and Caracas date.
      expect(slotsMock.execute).toHaveBeenCalledWith('doc-001', SLOT_DATE_STR);
      // Appointment was rescheduled.
      expect(appointmentRepo.updateScheduledAt).toHaveBeenCalledWith(appt.id, SLOT_DATE);
      expect(result.currentScheduledAt).toBe(SLOT_DATE.toISOString());
    });
  });
});
