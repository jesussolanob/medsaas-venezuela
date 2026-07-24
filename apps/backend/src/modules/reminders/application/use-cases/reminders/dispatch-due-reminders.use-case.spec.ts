import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DispatchDueRemindersUseCase } from './dispatch-due-reminders.use-case';
import { REMINDERS_QUEUE_REPOSITORY } from '../../../domain/repositories/reminders-queue.repository';
import { DOCTOR_PROFILE_REPOSITORY } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';
import { AppointmentConfirmTokenService } from '../../../../appointments/infrastructure/services/appointment-confirm-token.service';
import type { AppointmentDueRow } from '../../../domain/repositories/reminders-queue.repository';

function makeDueRow(
  overrides: Partial<AppointmentDueRow> & { patientName?: string | null } = {},
): AppointmentDueRow {
  return {
    appointmentId: overrides.appointmentId ?? 'appt-id-001',
    doctorId: overrides.doctorId ?? 'doctor-id-001',
    patientId: overrides.patientId ?? 'patient-id-001',
    patientEmail: overrides.patientEmail ?? 'patient@example.com',
    // Use 'patientName' in overrides explicitly — do NOT use ?? so that
    // passing null (to test the nullish fallback in the use-case) works correctly.
    patientName: 'patientName' in overrides ? (overrides.patientName ?? null) : 'Juan Pérez',
    scheduledAt: overrides.scheduledAt ?? new Date('2026-08-01T14:00:00.000Z'),
    appointmentMode: overrides.appointmentMode ?? 'in_person',
  };
}

describe('DispatchDueRemindersUseCase', () => {
  let useCase: DispatchDueRemindersUseCase;
  let mockQueueRepo: {
    findDueForReminder: jest.Mock;
    insertPending: jest.Mock;
    markSent: jest.Mock;
    markFailed: jest.Mock;
  };
  let mockDoctorProfileRepo: { findByDoctorId: jest.Mock };
  let mockMailer: { sendTemplate: jest.Mock };
  let mockTokenService: { generate: jest.Mock };
  let mockConfig: { get: jest.Mock };

  beforeEach(async () => {
    mockQueueRepo = {
      findDueForReminder: jest.fn().mockResolvedValue([]),
      insertPending: jest.fn().mockResolvedValue('queue-row-id-001'),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };

    mockDoctorProfileRepo = {
      findByDoctorId: jest.fn().mockResolvedValue({ fullName: 'Dr. Sofía Ramos' }),
    };

    mockMailer = {
      sendTemplate: jest.fn().mockResolvedValue({ id: 'msg-001' }),
    };

    mockTokenService = {
      generate: jest.fn().mockReturnValue('mocked-token'),
    };

    mockConfig = {
      get: jest.fn().mockReturnValue('https://app.deltasalud.app'),
    };

    const module = await Test.createTestingModule({
      providers: [
        DispatchDueRemindersUseCase,
        { provide: REMINDERS_QUEUE_REPOSITORY, useValue: mockQueueRepo },
        { provide: DOCTOR_PROFILE_REPOSITORY, useValue: mockDoctorProfileRepo },
        { provide: MailerService, useValue: mockMailer },
        { provide: AppointmentConfirmTokenService, useValue: mockTokenService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    useCase = module.get(DispatchDueRemindersUseCase);
  });

  // ---------------------------------------------------------------------------
  // Empty queues
  // ---------------------------------------------------------------------------

  it('returns zeroed counts when no appointments are due', async () => {
    const result = await useCase.execute();
    expect(result).toEqual({ sent24h: 0, failed24h: 0, sent1h: 0, failed1h: 0 });
  });

  // ---------------------------------------------------------------------------
  // 24h reminder — sends email and marks sent
  // ---------------------------------------------------------------------------

  it('sends 24h reminder, marks sent, and increments sent24h count', async () => {
    const row = makeDueRow();
    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '24h' ? [row] : []);
    });

    const result = await useCase.execute();

    expect(mockQueueRepo.insertPending).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: row.appointmentId, offsetType: '24h' }),
    );
    expect(mockTokenService.generate).toHaveBeenCalledWith(row.appointmentId);
    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'reminder_confirm_24h',
      row.patientEmail,
      expect.objectContaining({
        patient_name: row.patientName,
        doctor_name: 'Dr. Sofía Ramos',
        confirm_url: expect.stringContaining('mocked-token'),
      }),
      expect.anything(),
    );
    expect(mockQueueRepo.markSent).toHaveBeenCalledWith('queue-row-id-001');
    expect(result.sent24h).toBe(1);
    expect(result.failed24h).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 1h reminder — sends email and marks sent
  // ---------------------------------------------------------------------------

  it('sends 1h reminder, marks sent, and increments sent1h count', async () => {
    const row = makeDueRow({ appointmentId: 'appt-1h-001' });
    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '1h' ? [row] : []);
    });

    const result = await useCase.execute();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'reminder_1h',
      row.patientEmail,
      expect.objectContaining({
        patient_name: row.patientName,
        doctor_name: 'Dr. Sofía Ramos',
      }),
      expect.anything(),
    );
    expect(mockQueueRepo.markSent).toHaveBeenCalled();
    expect(result.sent1h).toBe(1);
    expect(result.failed1h).toBe(0);
    // 1h reminder does NOT generate a confirm token
    expect(mockTokenService.generate).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Idempotency — already in queue (insertPending returns null)
  // ---------------------------------------------------------------------------

  it('skips sending when insertPending returns null (already queued)', async () => {
    const row = makeDueRow();
    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '24h' ? [row] : []);
    });
    mockQueueRepo.insertPending.mockResolvedValue(null);

    const result = await useCase.execute();

    expect(mockMailer.sendTemplate).not.toHaveBeenCalled();
    expect(mockQueueRepo.markSent).not.toHaveBeenCalled();
    // insertPending returned null → treated as already-processed, not as a send
    expect(result.sent24h).toBe(0);
    expect(result.failed24h).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Settings: disabled channel
  // ---------------------------------------------------------------------------

  it('respects per-doctor settings — no rows returned by repo means none sent', async () => {
    // Repository is responsible for filtering by settings. If repo returns [],
    // the use case must not send anything.
    mockQueueRepo.findDueForReminder.mockResolvedValue([]);

    const result = await useCase.execute();
    expect(mockMailer.sendTemplate).not.toHaveBeenCalled();
    expect(result.sent24h).toBe(0);
    expect(result.sent1h).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Single failure does not abort the batch
  // ---------------------------------------------------------------------------

  it('continues processing remaining appointments when one mailer call fails', async () => {
    const row1 = makeDueRow({ appointmentId: 'appt-fail', patientEmail: 'fail@example.com' });
    const row2 = makeDueRow({ appointmentId: 'appt-ok', patientEmail: 'ok@example.com' });

    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '24h' ? [row1, row2] : []);
    });

    let callCount = 0;
    mockQueueRepo.insertPending.mockImplementation(() => {
      callCount++;
      return Promise.resolve(`row-id-${callCount}`);
    });

    mockMailer.sendTemplate.mockImplementation((_template: string, to: string) => {
      if (to === 'fail@example.com') {
        return Promise.reject(new Error('Resend rate limit'));
      }
      return Promise.resolve({ id: 'msg-ok' });
    });

    const result = await useCase.execute();

    // markFailed called for row1, markSent for row2
    expect(mockQueueRepo.markFailed).toHaveBeenCalledWith('row-id-1', 'Resend rate limit');
    expect(mockQueueRepo.markSent).toHaveBeenCalledWith('row-id-2');
    expect(result.sent24h).toBe(1);
    expect(result.failed24h).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Failed send → marks queue row as failed
  // ---------------------------------------------------------------------------

  it('marks queue row as failed when mailer throws', async () => {
    const row = makeDueRow();
    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '24h' ? [row] : []);
    });
    mockMailer.sendTemplate.mockRejectedValue(new Error('SMTP timeout'));

    const result = await useCase.execute();

    expect(mockQueueRepo.markFailed).toHaveBeenCalledWith('queue-row-id-001', 'SMTP timeout');
    expect(mockQueueRepo.markSent).not.toHaveBeenCalled();
    expect(result.sent24h).toBe(0);
    expect(result.failed24h).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Confirm URL construction
  // ---------------------------------------------------------------------------

  it('builds confirm URL using APP_BASE_URL and token from AppointmentConfirmTokenService', async () => {
    const row = makeDueRow({ appointmentId: 'appt-url-test' });
    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '24h' ? [row] : []);
    });
    mockTokenService.generate.mockReturnValue('generated-token-xyz');
    mockConfig.get.mockReturnValue('https://example.com');

    await useCase.execute();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'reminder_confirm_24h',
      row.patientEmail,
      expect.objectContaining({
        confirm_url: 'https://example.com/cita/confirmar/generated-token-xyz',
      }),
      expect.anything(),
    );
  });

  // ---------------------------------------------------------------------------
  // Fallback patient name
  // ---------------------------------------------------------------------------

  it('uses "Paciente" when patientName is null', async () => {
    const row = makeDueRow({ patientName: null });
    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '24h' ? [row] : []);
    });

    await useCase.execute();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'reminder_confirm_24h',
      row.patientEmail,
      expect.objectContaining({ patient_name: 'Paciente' }),
      expect.anything(),
    );
  });

  // ---------------------------------------------------------------------------
  // Fallback doctor name
  // ---------------------------------------------------------------------------

  it('uses "Su especialista" when doctor profile is not found', async () => {
    const row = makeDueRow();
    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '24h' ? [row] : []);
    });
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue(null);

    await useCase.execute();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'reminder_confirm_24h',
      row.patientEmail,
      expect.objectContaining({ doctor_name: 'Su especialista' }),
      expect.anything(),
    );
  });

  // ---------------------------------------------------------------------------
  // N+1 deduplication — doctor name resolved once per unique doctorId
  // ---------------------------------------------------------------------------

  it('resolves doctor name only once when multiple appointments share the same doctor', async () => {
    const DOCTOR_ID = 'shared-doctor-id';
    const row1 = makeDueRow({ appointmentId: 'appt-A', doctorId: DOCTOR_ID });
    const row2 = makeDueRow({ appointmentId: 'appt-B', doctorId: DOCTOR_ID });
    const row3 = makeDueRow({ appointmentId: 'appt-C', doctorId: DOCTOR_ID });

    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '24h' ? [row1, row2, row3] : []);
    });

    let queueRowCounter = 0;
    mockQueueRepo.insertPending.mockImplementation(() => {
      queueRowCounter++;
      return Promise.resolve(`row-id-${queueRowCounter}`);
    });

    await useCase.execute();

    // findByDoctorId must be called exactly once (for 24h batch) even though
    // there are 3 appointments. The 1h batch returns [] so no extra call.
    expect(mockDoctorProfileRepo.findByDoctorId).toHaveBeenCalledTimes(1);
    expect(mockDoctorProfileRepo.findByDoctorId).toHaveBeenCalledWith(DOCTOR_ID);
    expect(mockQueueRepo.markSent).toHaveBeenCalledTimes(3);
  });

  it('resolves each distinct doctorId exactly once', async () => {
    const row1 = makeDueRow({ appointmentId: 'appt-D1', doctorId: 'doctor-001' });
    const row2 = makeDueRow({ appointmentId: 'appt-D2', doctorId: 'doctor-002' });
    const row3 = makeDueRow({ appointmentId: 'appt-D3', doctorId: 'doctor-001' }); // same as row1

    mockQueueRepo.findDueForReminder.mockImplementation((offsetType: string) => {
      return Promise.resolve(offsetType === '24h' ? [row1, row2, row3] : []);
    });

    let counter = 0;
    mockQueueRepo.insertPending.mockImplementation(() => {
      counter++;
      return Promise.resolve(`row-id-${counter}`);
    });

    await useCase.execute();

    // Two distinct doctors → exactly 2 profile lookups
    expect(mockDoctorProfileRepo.findByDoctorId).toHaveBeenCalledTimes(2);
    expect(mockDoctorProfileRepo.findByDoctorId).toHaveBeenCalledWith('doctor-001');
    expect(mockDoctorProfileRepo.findByDoctorId).toHaveBeenCalledWith('doctor-002');
  });
});
