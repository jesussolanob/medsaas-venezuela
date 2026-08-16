import { GetImmediateWindowUseCase } from './get-immediate-window.use-case';
import { APPOINTMENT_REPOSITORY } from '../../../../appointments/domain/repositories/appointment.repository';
import type { IAppointmentRepository } from '../../../../appointments/domain/repositories/appointment.repository';
import { Test } from '@nestjs/testing';
import type { Appointment } from '../../../../appointments/domain/entities/appointment.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAppointment(scheduledAt: Date): Appointment {
  return {
    id: 'appt-' + scheduledAt.getTime(),
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    scheduledAt,
    status: 'scheduled',
    durationMinutes: 30,
    source: 'booking',
    planName: 'Consulta',
    planPrice: 50,
  } as unknown as Appointment;
}

function makeRepoMock(appointments: Appointment[] = []): jest.Mocked<IAppointmentRepository> {
  return {
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue(appointments),
  } as unknown as jest.Mocked<IAppointmentRepository>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetImmediateWindowUseCase', () => {
  let useCase: GetImmediateWindowUseCase;
  let repoMock: jest.Mocked<IAppointmentRepository>;

  beforeEach(async () => {
    repoMock = makeRepoMock();

    const module = await Test.createTestingModule({
      providers: [
        GetImmediateWindowUseCase,
        { provide: APPOINTMENT_REPOSITORY, useValue: repoMock },
      ],
    }).compile();

    useCase = module.get(GetImmediateWindowUseCase);
  });

  describe('no upcoming appointment', () => {
    it('returns availableMinutes = durationMinutes and fits = true', async () => {
      repoMock.findActiveByDoctorAndDateRange.mockResolvedValueOnce([]);

      const result = await useCase.execute({
        doctorId: 'doctor-1',
        durationMinutes: 30,
      });

      expect(result.nextAppointmentAt).toBeNull();
      expect(result.availableMinutes).toBe(30);
      expect(result.effectiveDuration).toBe(30);
      expect(result.fits).toBe(true);
    });

    it('uses the full service duration (60 min) when calendar is empty', async () => {
      repoMock.findActiveByDoctorAndDateRange.mockResolvedValueOnce([]);

      const result = await useCase.execute({
        doctorId: 'doctor-1',
        durationMinutes: 60,
      });

      expect(result.effectiveDuration).toBe(60);
      expect(result.fits).toBe(true);
    });
  });

  describe('next appointment within window', () => {
    it('truncates effectiveDuration to availableMinutes when next appt is sooner', async () => {
      // Simulate a next appointment in ~23 minutes.
      const now = new Date();
      const nextAt = new Date(now.getTime() + 23 * 60_000 + 500); // 23 min 0.5s ahead
      repoMock.findActiveByDoctorAndDateRange.mockResolvedValueOnce([makeAppointment(nextAt)]);

      const result = await useCase.execute({
        doctorId: 'doctor-1',
        durationMinutes: 30,
      });

      expect(result.nextAppointmentAt).toEqual(nextAt);
      // availableMinutes = floor(23.something) = 23
      expect(result.availableMinutes).toBe(23);
      expect(result.effectiveDuration).toBe(23);
      expect(result.fits).toBe(false);
    });

    it('reports fits=true when appointment is far enough away', async () => {
      const now = new Date();
      const nextAt = new Date(now.getTime() + 45 * 60_000 + 500); // 45+ min ahead
      repoMock.findActiveByDoctorAndDateRange.mockResolvedValueOnce([makeAppointment(nextAt)]);

      const result = await useCase.execute({
        doctorId: 'doctor-1',
        durationMinutes: 30,
      });

      expect(result.availableMinutes).toBe(45);
      expect(result.effectiveDuration).toBe(30);
      expect(result.fits).toBe(true);
    });

    it('picks the NEAREST appointment when multiple exist', async () => {
      const now = new Date();
      const near = new Date(now.getTime() + 10 * 60_000 + 500);
      const far = new Date(now.getTime() + 60 * 60_000);
      repoMock.findActiveByDoctorAndDateRange.mockResolvedValueOnce([
        makeAppointment(far),
        makeAppointment(near),
      ]);

      const result = await useCase.execute({
        doctorId: 'doctor-1',
        durationMinutes: 30,
      });

      expect(result.nextAppointmentAt).toEqual(near);
      expect(result.availableMinutes).toBe(10);
    });

    it('queries a 24-hour horizon from now', async () => {
      repoMock.findActiveByDoctorAndDateRange.mockResolvedValueOnce([]);

      await useCase.execute({ doctorId: 'doctor-1', durationMinutes: 30 });

      const [, from, to] = repoMock.findActiveByDoctorAndDateRange.mock.calls[0]!;
      const diffMs = to.getTime() - from.getTime();
      // Should be ~24h ± a few ms for execution time.
      expect(diffMs).toBeGreaterThanOrEqual(24 * 60 * 60_000 - 1000);
      expect(diffMs).toBeLessThanOrEqual(24 * 60 * 60_000 + 1000);
    });
  });
});
