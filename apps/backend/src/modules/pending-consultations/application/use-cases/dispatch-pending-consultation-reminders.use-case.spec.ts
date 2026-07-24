import { ConfigService } from '@nestjs/config';
import {
  DispatchPendingConsultationRemindersUseCase,
  type DispatchPendingRemindersResult,
} from './dispatch-pending-consultation-reminders.use-case';
import { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import type { IPendingConsultationRepository } from '../../domain/repositories/pending-consultation.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { IDoctorProfileRepository } from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { IAppointmentRepository } from '../../../appointments/domain/repositories/appointment.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';
import type { PendingConsultationTokenService } from '../services/pending-consultation-token.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-07-23T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function makeDate(offsetDays: number, base = NOW): Date {
  return new Date(base.getTime() + offsetDays * DAY);
}

function makePending(
  overrides: Partial<{
    id: string;
    doctorId: string;
    patientId: string;
    paymentId: string | null;
    planName: string;
    sessionNumber: number;
    status: 'pending_scheduling' | 'scheduled' | 'expired' | 'cancelled';
    expiresAt: Date | null;
    reminderStage: number;
    lastReminderAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
): PendingConsultation {
  const now = new Date('2026-07-20T10:00:00Z');
  return PendingConsultation.create({
    id: overrides.id ?? 'pending-001',
    doctorId: overrides.doctorId ?? 'doc-001',
    patientId: overrides.patientId ?? 'pat-001',
    authUserId: null,
    packageId: null,
    paymentId: overrides.paymentId ?? null,
    planName: overrides.planName ?? 'Plan Basico',
    officeId: null,
    appointmentMode: null,
    sessionNumber: overrides.sessionNumber ?? 2,
    status: overrides.status ?? 'pending_scheduling',
    expiresAt: overrides.expiresAt ?? null,
    scheduledAppointmentId: null,
    consultationId: null,
    reminderStage: overrides.reminderStage ?? 0,
    lastReminderAt: overrides.lastReminderAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  });
}

function makePatient(email: string | null = 'patient@example.com') {
  return {
    id: 'pat-001',
    doctorId: 'doc-001',
    fullName: 'Maria Lopez',
    email,
    // other fields omitted (not needed for tests)
  } as ReturnType<IPatientRepository['findById']> extends Promise<infer T> ? NonNullable<T> : never;
}

function makeDoctorProfile(fullName = 'Dr. Carlos Perez') {
  return { fullName } as ReturnType<IDoctorProfileRepository['findByDoctorId']> extends Promise<
    infer T
  >
    ? NonNullable<T>
    : never;
}

function makeCompletedAppointment(updatedAt: Date) {
  return {
    id: 'appt-001',
    status: 'completed',
    paymentId: 'pay-001',
    updatedAt,
  } as ReturnType<IAppointmentRepository['findFirstCompletedByPaymentId']> extends Promise<infer T>
    ? NonNullable<T>
    : never;
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function buildMocks() {
  const pendingRepo: jest.Mocked<
    Pick<IPendingConsultationRepository, 'findDueForReminder' | 'updateReminderStage'>
  > = {
    findDueForReminder: jest.fn(),
    updateReminderStage: jest.fn().mockResolvedValue(undefined),
  };

  const patientRepo: jest.Mocked<Pick<IPatientRepository, 'findById'>> = {
    findById: jest.fn().mockResolvedValue(makePatient()),
  };

  const doctorProfileRepo: jest.Mocked<Pick<IDoctorProfileRepository, 'findByDoctorId'>> = {
    findByDoctorId: jest.fn().mockResolvedValue(makeDoctorProfile()),
  };

  const appointmentRepo: jest.Mocked<
    Pick<IAppointmentRepository, 'findFirstCompletedByPaymentId'>
  > = {
    findFirstCompletedByPaymentId: jest.fn(),
  };

  const mailer = {
    sendTemplate: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MailerService>;

  const tokenService = {
    sign: jest.fn().mockReturnValue('tok-abc123'),
  } as unknown as jest.Mocked<PendingConsultationTokenService>;

  const config = {
    get: jest.fn().mockReturnValue('https://app.deltasalud.app'),
  } as unknown as jest.Mocked<ConfigService>;

  const useCase = new DispatchPendingConsultationRemindersUseCase(
    pendingRepo as unknown as IPendingConsultationRepository,
    patientRepo as unknown as IPatientRepository,
    doctorProfileRepo as unknown as IDoctorProfileRepository,
    appointmentRepo as unknown as IAppointmentRepository,
    mailer,
    tokenService,
    config,
  );

  return {
    useCase,
    pendingRepo,
    patientRepo,
    doctorProfileRepo,
    appointmentRepo,
    mailer,
    tokenService,
    config,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DispatchPendingConsultationRemindersUseCase', () => {
  describe('execute() — aggregate stats', () => {
    it('returns sent=0 failed=0 when no pending consultations are due', async () => {
      const { useCase, pendingRepo } = buildMocks();
      pendingRepo.findDueForReminder.mockResolvedValue([]);

      const result: DispatchPendingRemindersResult = await useCase.execute(NOW);

      expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // Anchor resolution
  // -------------------------------------------------------------------------
  describe('anchor resolution — paymentId null', () => {
    it('stage 0: sends when now >= createdAt + 3 days (no paymentId)', async () => {
      const { useCase, mailer, pendingRepo, appointmentRepo } = buildMocks();

      const createdAt = makeDate(-4); // 4 days ago
      const pc = makePending({ paymentId: null, reminderStage: 0, createdAt });

      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(appointmentRepo.findFirstCompletedByPaymentId).not.toHaveBeenCalled();
      expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('stage 0: skips when now < createdAt + 3 days (no paymentId)', async () => {
      const { useCase, mailer, pendingRepo } = buildMocks();

      const createdAt = makeDate(-1); // only 1 day ago
      const pc = makePending({ paymentId: null, reminderStage: 0, createdAt });

      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Anchor resolution — paymentId set, session 1 completed
  // -------------------------------------------------------------------------
  describe('anchor resolution — paymentId set, session 1 completed', () => {
    it('stage 0: sends when now >= completedAt + 3 days', async () => {
      const { useCase, mailer, pendingRepo: pr, appointmentRepo } = buildMocks();

      const session1CompletedAt = makeDate(-4);
      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(
        makeCompletedAppointment(session1CompletedAt),
      );

      const pc = makePending({
        paymentId: 'pay-001',
        reminderStage: 0,
        createdAt: makeDate(-10),
      });
      pr.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(appointmentRepo.findFirstCompletedByPaymentId).toHaveBeenCalledWith('pay-001');
      expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
    });

    it('stage 0: skips when now < completedAt + 3 days', async () => {
      const { useCase, mailer, pendingRepo, appointmentRepo } = buildMocks();

      const session1CompletedAt = makeDate(-1); // completed yesterday
      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(
        makeCompletedAppointment(session1CompletedAt),
      );

      const pc = makePending({ paymentId: 'pay-001', reminderStage: 0 });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // SKIP when paymentId set but session 1 not completed
  // -------------------------------------------------------------------------
  describe('anchor resolution — paymentId set, session 1 NOT completed', () => {
    it('skips the pending consultation entirely', async () => {
      const { useCase, mailer, pendingRepo, appointmentRepo } = buildMocks();

      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(null);

      const pc = makePending({ paymentId: 'pay-001', reminderStage: 0, createdAt: makeDate(-10) });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Weekly follow-up (stage >= 1)
  // -------------------------------------------------------------------------
  describe('weekly follow-up — stage >= 1', () => {
    it('sends when now >= lastReminderAt + 7 days and increments stage', async () => {
      const { useCase, mailer, pendingRepo: pr, appointmentRepo } = buildMocks();

      const lastReminderAt = makeDate(-8); // 8 days ago
      const session1CompletedAt = makeDate(-30);
      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(
        makeCompletedAppointment(session1CompletedAt),
      );

      const pc = makePending({
        paymentId: 'pay-001',
        reminderStage: 1,
        lastReminderAt,
        createdAt: makeDate(-30),
      });
      pr.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
    });

    it('skips when now < lastReminderAt + 7 days', async () => {
      const { useCase, mailer, pendingRepo, appointmentRepo } = buildMocks();

      const lastReminderAt = makeDate(-3); // only 3 days ago
      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(
        makeCompletedAppointment(makeDate(-30)),
      );

      const pc = makePending({
        paymentId: 'pay-001',
        reminderStage: 1,
        lastReminderAt,
        createdAt: makeDate(-30),
      });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });

    it('sends on stage 2 after 7 more days and sets stage=3', async () => {
      const { useCase, mailer, pendingRepo, appointmentRepo, pendingRepo: pr } = buildMocks();

      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(
        makeCompletedAppointment(makeDate(-60)),
      );
      const lastReminderAt = makeDate(-8);

      const pc = makePending({
        paymentId: 'pay-001',
        reminderStage: 2,
        lastReminderAt,
        createdAt: makeDate(-60),
      });
      pr.findDueForReminder.mockResolvedValue([pc]);

      await useCase.execute(NOW);

      expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
      expect(pendingRepo.updateReminderStage).toHaveBeenCalledWith('pending-001', 3, NOW);
    });
  });

  // -------------------------------------------------------------------------
  // Final warning override
  // -------------------------------------------------------------------------
  describe('final warning override', () => {
    it('sends final warning when expires_at is within 3 days and stage < 1000', async () => {
      const { useCase, mailer, pendingRepo, appointmentRepo } = buildMocks();

      const expiresAt = makeDate(2); // expires in 2 days
      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(
        makeCompletedAppointment(makeDate(-30)),
      );

      const pc = makePending({
        paymentId: 'pay-001',
        reminderStage: 1,
        lastReminderAt: makeDate(-2), // recent — weekly wouldn't fire
        expiresAt,
        createdAt: makeDate(-30),
      });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
      expect(pendingRepo.updateReminderStage).toHaveBeenCalledWith('pending-001', 1000, NOW);
      expect(result.sent).toBe(1);
    });

    it('does NOT send final warning when stage is already 1000', async () => {
      const { useCase, mailer, pendingRepo, appointmentRepo } = buildMocks();

      const expiresAt = makeDate(1); // expires tomorrow
      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(
        makeCompletedAppointment(makeDate(-30)),
      );

      const pc = makePending({
        paymentId: 'pay-001',
        reminderStage: 1000,
        lastReminderAt: makeDate(-1),
        expiresAt,
        createdAt: makeDate(-30),
      });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });

    it('does NOT send final warning when expires_at is more than 3 days away', async () => {
      const { useCase, mailer, pendingRepo, appointmentRepo } = buildMocks();

      const expiresAt = makeDate(10); // 10 days out — no final warn yet
      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(
        makeCompletedAppointment(makeDate(-30)),
      );

      const pc = makePending({
        paymentId: 'pay-001',
        reminderStage: 1,
        lastReminderAt: makeDate(-2),
        expiresAt,
        createdAt: makeDate(-30),
      });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      await useCase.execute(NOW);

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------
  describe('idempotency', () => {
    it('does not re-send on stage 1 if lastReminderAt was just now', async () => {
      const { useCase, mailer, pendingRepo, appointmentRepo } = buildMocks();

      appointmentRepo.findFirstCompletedByPaymentId.mockResolvedValue(
        makeCompletedAppointment(makeDate(-30)),
      );

      const pc = makePending({
        paymentId: 'pay-001',
        reminderStage: 1,
        lastReminderAt: NOW, // set to exactly now — 7 days have NOT passed
        createdAt: makeDate(-30),
      });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Patient without email — skip silently, NOT counted as failed
  // -------------------------------------------------------------------------
  describe('patient without email', () => {
    it('skips silently and does NOT increment failed when patient has no email', async () => {
      const { useCase, mailer, pendingRepo, patientRepo } = buildMocks();

      patientRepo.findById.mockResolvedValue(makePatient(null));

      const pc = makePending({ paymentId: null, reminderStage: 0, createdAt: makeDate(-4) });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Email template variables
  // -------------------------------------------------------------------------
  describe('email template variables', () => {
    it('calls mailer.sendTemplate with correct template name and variables', async () => {
      const { useCase, mailer, pendingRepo } = buildMocks();

      const pc = makePending({
        id: 'pending-abc',
        paymentId: null,
        planName: 'Plan Premium',
        sessionNumber: 3,
        reminderStage: 0,
        createdAt: makeDate(-4),
        expiresAt: makeDate(30),
      });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      await useCase.execute(NOW);

      const [templateName, email, vars] = (mailer.sendTemplate as jest.Mock).mock.calls[0] as [
        string,
        string,
        Record<string, string>,
        unknown,
      ];

      expect(templateName).toBe('pending_consultation_reminder');
      expect(email).toBe('patient@example.com');
      expect(vars['planName']).toBe('Plan Premium');
      expect(vars['sessionNumber']).toBe('3');
      expect(vars['doctorName']).toBe('Dr. Carlos Perez');
      expect(vars['patientName']).toBe('Maria Lopez');
      expect(vars['scheduleUrl']).toContain('/agendar/');
      // Phrase built by use-case: "Válido hasta el <fecha>" when expiresAt is set
      expect(vars['expiresAtLabel']).toMatch(/^Válido hasta el/);
    });

    it('sets expiresAtLabel to empty string when no expiresAt', async () => {
      const { useCase, mailer, pendingRepo } = buildMocks();

      const pc = makePending({
        paymentId: null,
        reminderStage: 0,
        createdAt: makeDate(-4),
        expiresAt: null,
      });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      await useCase.execute(NOW);

      const vars = (mailer.sendTemplate as jest.Mock).mock.calls[0]?.[2] as Record<string, string>;
      expect(vars?.['expiresAtLabel']).toBe('');
    });

    it('builds scheduleUrl from APP_BASE_URL and token', async () => {
      const { useCase, mailer, pendingRepo, tokenService, config } = buildMocks();

      (config.get as jest.Mock).mockReturnValue('https://staging.deltasalud.app');
      (tokenService.sign as jest.Mock).mockReturnValue('tok-xyz');

      const pc = makePending({ paymentId: null, reminderStage: 0, createdAt: makeDate(-4) });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      await useCase.execute(NOW);

      const vars = (mailer.sendTemplate as jest.Mock).mock.calls[0]?.[2] as Record<string, string>;
      expect(vars?.['scheduleUrl']).toBe('https://staging.deltasalud.app/agendar/tok-xyz');
    });
  });

  // -------------------------------------------------------------------------
  // updateReminderStage called with correct args
  // -------------------------------------------------------------------------
  describe('updateReminderStage', () => {
    it('persists stage=1 and lastReminderAt=now after first send', async () => {
      const { useCase, pendingRepo } = buildMocks();

      const pc = makePending({ paymentId: null, reminderStage: 0, createdAt: makeDate(-4) });
      pendingRepo.findDueForReminder.mockResolvedValue([pc]);

      await useCase.execute(NOW);

      expect(pendingRepo.updateReminderStage).toHaveBeenCalledWith('pending-001', 1, NOW);
    });
  });
});
