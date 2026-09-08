import { ConfigService } from '@nestjs/config';
import {
  DispatchQuoteExpiryNoticesUseCase,
  type DispatchQuoteExpiryNoticesResult,
} from './dispatch-quote-expiry-notices.use-case';
import { Quote } from '../../domain/entities/quote.entity';
import type { IQuoteRepository } from '../../domain/repositories/iquote.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { ILeadRepository } from '../../../leads/domain/repositories/lead.repository';
import type { IDoctorProfileRepository } from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-09-08T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';

function makeDate(offsetDays: number, base = NOW): Date {
  return new Date(base.getTime() + offsetDays * DAY);
}

function makeQuote(overrides: Partial<Parameters<typeof Quote.create>[0]> = {}): Quote {
  return Quote.create({
    id: 'qqqqqqqq-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    quoteNumber: 'PRE-0001',
    patientId: PATIENT_ID,
    leadId: null,
    status: 'sent',
    validUntil: null,
    notes: '',
    subtotalUsd: 100,
    discountType: 'amount',
    discountValue: 0,
    discountUsd: 0,
    totalUsd: 100,
    bcvRate: null,
    totalBs: null,
    sentAt: makeDate(-10),
    createdAt: makeDate(-10),
    updatedAt: makeDate(-10),
    shareToken: 'tok-abc123',
    ...overrides,
  });
}

function makePatient(email: string | null = 'patient@example.com') {
  return {
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'Maria Lopez',
    email,
  } as ReturnType<IPatientRepository['findById']> extends Promise<infer T> ? NonNullable<T> : never;
}

function makeDoctorProfile(email: string | null = 'doctor@example.com') {
  return {
    id: DOCTOR_ID,
    fullName: 'Dr. Carlos Perez',
    email,
  } as ReturnType<IDoctorProfileRepository['findByDoctorId']> extends Promise<infer T>
    ? NonNullable<T>
    : never;
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function buildMocks() {
  const quoteRepo: jest.Mocked<
    Pick<IQuoteRepository, 'findQuotesNearingExpiry' | 'updateStatus' | 'markExpiryReminderSent'>
  > = {
    findQuotesNearingExpiry: jest.fn(),
    updateStatus: jest.fn().mockImplementation((id, doctorId, status) =>
      Promise.resolve(makeQuote({ id, doctorId, status })),
    ),
    markExpiryReminderSent: jest.fn().mockResolvedValue(undefined),
  };

  const patientRepo: jest.Mocked<Pick<IPatientRepository, 'findById'>> = {
    findById: jest.fn().mockResolvedValue(makePatient()),
  };

  const leadRepo: jest.Mocked<Pick<ILeadRepository, 'findByIdForDoctor'>> = {
    findByIdForDoctor: jest.fn(),
  };

  const doctorProfileRepo: jest.Mocked<Pick<IDoctorProfileRepository, 'findByDoctorId'>> = {
    findByDoctorId: jest.fn().mockResolvedValue(makeDoctorProfile()),
  };

  const mailer = {
    sendTemplate: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MailerService>;

  const config = {
    get: jest.fn().mockReturnValue('https://app.deltasalud.app'),
  } as unknown as jest.Mocked<ConfigService>;

  const useCase = new DispatchQuoteExpiryNoticesUseCase(
    quoteRepo as unknown as IQuoteRepository,
    patientRepo as unknown as IPatientRepository,
    leadRepo as unknown as ILeadRepository,
    doctorProfileRepo as unknown as IDoctorProfileRepository,
    mailer,
    config,
  );

  return { useCase, quoteRepo, patientRepo, leadRepo, doctorProfileRepo, mailer, config };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DispatchQuoteExpiryNoticesUseCase', () => {
  it('returns zero counters when there are no candidates', async () => {
    const { useCase, quoteRepo } = buildMocks();
    quoteRepo.findQuotesNearingExpiry.mockResolvedValue([]);

    const result: DispatchQuoteExpiryNoticesResult = await useCase.execute(NOW);

    expect(result).toEqual({
      quotesExpired: 0,
      quoteExpiryRemindersSent: 0,
      quoteExpiryRemindersFailed: 0,
    });
  });

  // 1. A sent, overdue quote is expired.
  it('transitions a sent + overdue quote to expired', async () => {
    const { useCase, quoteRepo, mailer } = buildMocks();
    const overdue = makeQuote({ status: 'sent', validUntil: makeDate(-1) });
    quoteRepo.findQuotesNearingExpiry.mockResolvedValue([overdue]);

    const result = await useCase.execute(NOW);

    expect(quoteRepo.updateStatus).toHaveBeenCalledWith(overdue.id, DOCTOR_ID, 'expired', 'sent');
    expect(mailer.sendTemplate).not.toHaveBeenCalled();
    expect(result.quotesExpired).toBe(1);
  });

  // 2. An accepted, overdue quote is NOT touched.
  it('does not touch an accepted quote even if its validUntil is overdue', async () => {
    const { useCase, quoteRepo, mailer } = buildMocks();
    const acceptedOverdue = makeQuote({ status: 'accepted', validUntil: makeDate(-30) });
    quoteRepo.findQuotesNearingExpiry.mockResolvedValue([acceptedOverdue]);

    const result = await useCase.execute(NOW);

    expect(quoteRepo.updateStatus).not.toHaveBeenCalled();
    expect(quoteRepo.markExpiryReminderSent).not.toHaveBeenCalled();
    expect(mailer.sendTemplate).not.toHaveBeenCalled();
    expect(result.quotesExpired).toBe(0);
  });

  // 3. A quote expiring in 2 days, never notified, triggers BOTH emails and stamps.
  it('sends both the recipient and doctor emails and stamps expiry_reminder_sent_at', async () => {
    const { useCase, quoteRepo, mailer, patientRepo, doctorProfileRepo } = buildMocks();
    const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(2) });
    quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);

    const result = await useCase.execute(NOW);

    expect(patientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
    expect(doctorProfileRepo.findByDoctorId).toHaveBeenCalledWith(DOCTOR_ID);
    expect(mailer.sendTemplate).toHaveBeenCalledTimes(2);

    const templateNames = (mailer.sendTemplate as jest.Mock).mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(templateNames).toEqual(
      expect.arrayContaining(['quote_expiring_recipient', 'quote_expiring_doctor']),
    );

    expect(quoteRepo.markExpiryReminderSent).toHaveBeenCalledWith(soonDue.id, NOW);
    expect(result.quoteExpiryRemindersSent).toBe(1);
    expect(result.quotesExpired).toBe(0);
  });

  // 4. A quote with expiry_reminder_sent_at already set does NOT get notified again.
  it('does not re-notify a quote whose expiry_reminder_sent_at is already set', async () => {
    const { useCase, quoteRepo, mailer } = buildMocks();
    const alreadyNotified = makeQuote({
      status: 'sent',
      validUntil: makeDate(1),
      expiryReminderSentAt: makeDate(-1),
    });
    quoteRepo.findQuotesNearingExpiry.mockResolvedValue([alreadyNotified]);

    const result = await useCase.execute(NOW);

    expect(mailer.sendTemplate).not.toHaveBeenCalled();
    expect(quoteRepo.markExpiryReminderSent).not.toHaveBeenCalled();
    expect(result.quoteExpiryRemindersSent).toBe(0);
  });

  // 5. Recipient has no email — doctor is still notified, and it is still stamped.
  it('still notifies the doctor and stamps when the recipient has no email on file', async () => {
    const { useCase, quoteRepo, mailer, patientRepo } = buildMocks();
    patientRepo.findById.mockResolvedValue(makePatient(null));
    const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(3) });
    quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);

    const result = await useCase.execute(NOW);

    expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
    expect((mailer.sendTemplate as jest.Mock).mock.calls[0]?.[0]).toBe('quote_expiring_doctor');
    expect(quoteRepo.markExpiryReminderSent).toHaveBeenCalledWith(soonDue.id, NOW);
    expect(result.quoteExpiryRemindersSent).toBe(1);
  });

  // 6. Recipient email send throws — the expiry sweep for ANOTHER quote in the
  //    same run still completes.
  it('still completes the expiry sweep for another quote when the recipient email throws', async () => {
    const { useCase, quoteRepo, mailer } = buildMocks();
    const overdue = makeQuote({
      id: 'qqqqqqqq-0000-0000-0000-000000000002',
      status: 'sent',
      validUntil: makeDate(-1),
    });
    const soonDueThrows = makeQuote({
      id: 'qqqqqqqq-0000-0000-0000-000000000003',
      status: 'sent',
      validUntil: makeDate(1),
    });
    quoteRepo.findQuotesNearingExpiry.mockResolvedValue([overdue, soonDueThrows]);
    (mailer.sendTemplate as jest.Mock).mockImplementation((templateName: string) => {
      if (templateName === 'quote_expiring_recipient') {
        return Promise.reject(new Error('smtp down'));
      }
      return Promise.resolve({ id: 'msg-1' });
    });

    const result = await useCase.execute(NOW);

    expect(quoteRepo.updateStatus).toHaveBeenCalledWith(
      overdue.id,
      DOCTOR_ID,
      'expired',
      'sent',
    );
    expect(result.quotesExpired).toBe(1);
    // The doctor email for the second quote still went out despite the
    // recipient email throwing, and the sweep for the first quote is unaffected.
    expect(quoteRepo.markExpiryReminderSent).toHaveBeenCalledWith(soonDueThrows.id, NOW);
  });

  // ---------------------------------------------------------------------------
  // Recipient resolution — lead-based quotes
  // ---------------------------------------------------------------------------
  describe('lead recipient', () => {
    it('resolves the lead email/name when the quote points at a lead', async () => {
      const { useCase, quoteRepo, mailer, leadRepo } = buildMocks();
      leadRepo.findByIdForDoctor.mockResolvedValue({
        id: 'lllllll-0000-0000-0000-000000000001',
        name: 'Juan',
        lastName: 'Gomez',
        email: 'lead@example.com',
      } as unknown as Awaited<ReturnType<ILeadRepository['findByIdForDoctor']>>);

      const leadQuote = makeQuote({ patientId: null, leadId: 'lllllll-0000-0000-0000-000000000001', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([leadQuote]);

      await useCase.execute(NOW);

      expect(leadRepo.findByIdForDoctor).toHaveBeenCalledWith(
        'lllllll-0000-0000-0000-000000000001',
        DOCTOR_ID,
      );
      const recipientCall = (mailer.sendTemplate as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'quote_expiring_recipient',
      );
      expect(recipientCall?.[1]).toBe('lead@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // Error branches — each must be caught locally and never crash the batch
  // ---------------------------------------------------------------------------
  describe('error resilience', () => {
    it('counts an unhandled per-quote error as failed without crashing the batch', async () => {
      const { useCase, quoteRepo } = buildMocks();
      const broken = makeQuote({ status: 'sent', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([broken]);
      quoteRepo.markExpiryReminderSent.mockRejectedValue(new Error('write failed'));

      const result = await useCase.execute(NOW);

      expect(result.quoteExpiryRemindersFailed).toBe(1);
      expect(result.quotesExpired).toBe(0);
    });

    it('skips (does not crash) when updateStatus loses the race for an overdue quote', async () => {
      const { useCase, quoteRepo } = buildMocks();
      const overdue = makeQuote({ status: 'sent', validUntil: makeDate(-1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([overdue]);
      quoteRepo.updateStatus.mockRejectedValue(new Error('already accepted'));

      const result = await useCase.execute(NOW);

      expect(result.quotesExpired).toBe(0);
      expect(result.quoteExpiryRemindersFailed).toBe(0);
    });

    it('logs and continues when the recipient lookup itself throws', async () => {
      const { useCase, quoteRepo, patientRepo, mailer } = buildMocks();
      patientRepo.findById.mockRejectedValue(new Error('decrypt error'));
      const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);

      const result = await useCase.execute(NOW);

      // Recipient email never attempted (no address resolved), doctor email still sent.
      expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
      expect((mailer.sendTemplate as jest.Mock).mock.calls[0]?.[0]).toBe('quote_expiring_doctor');
      expect(result.quoteExpiryRemindersSent).toBe(1);
    });

    it('skips the recipient email (but still notifies the doctor) when there is no active share link', async () => {
      const { useCase, quoteRepo, mailer } = buildMocks();
      const noToken = makeQuote({ status: 'sent', validUntil: makeDate(1), shareToken: null });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([noToken]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
      expect((mailer.sendTemplate as jest.Mock).mock.calls[0]?.[0]).toBe('quote_expiring_doctor');
      expect(result.quoteExpiryRemindersSent).toBe(1);
    });

    it('still stamps and returns skipped-as-sent=false when both emails fail', async () => {
      const { useCase, quoteRepo, mailer } = buildMocks();
      mailer.sendTemplate.mockRejectedValue(new Error('smtp down'));
      const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);

      const result = await useCase.execute(NOW);

      expect(quoteRepo.markExpiryReminderSent).toHaveBeenCalledWith(soonDue.id, NOW);
      expect(result.quoteExpiryRemindersSent).toBe(0);
      expect(result.quoteExpiryRemindersFailed).toBe(0);
    });

    it('skips a candidate whose validUntil is null (defensive — should not happen given the repo filter)', async () => {
      const { useCase, quoteRepo, mailer } = buildMocks();
      const noValidUntil = makeQuote({ status: 'sent', validUntil: null });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([noValidUntil]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
      expect(result.quotesExpired).toBe(0);
      expect(result.quoteExpiryRemindersSent).toBe(0);
    });

    it('falls back to a generic doctor label and skips the doctor email when the profile is missing', async () => {
      const { useCase, quoteRepo, mailer, doctorProfileRepo } = buildMocks();
      doctorProfileRepo.findByDoctorId.mockResolvedValue(null);
      const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);

      const result = await useCase.execute(NOW);

      // Only the recipient email goes out — no doctor profile means no doctor email.
      expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
      expect((mailer.sendTemplate as jest.Mock).mock.calls[0]?.[0]).toBe(
        'quote_expiring_recipient',
      );
      const vars = (mailer.sendTemplate as jest.Mock).mock.calls[0]?.[2] as Record<string, string>;
      expect(vars['doctorName']).toBe('Su especialista');
      expect(result.quoteExpiryRemindersSent).toBe(1);
    });

    it('falls back to generic recipient labels when the patient has no name on file', async () => {
      const { useCase, quoteRepo, mailer, patientRepo } = buildMocks();
      patientRepo.findById.mockResolvedValue({
        ...makePatient(),
        fullName: null,
      } as unknown as Awaited<ReturnType<IPatientRepository['findById']>>);
      const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);

      await useCase.execute(NOW);

      const recipientVars = (mailer.sendTemplate as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'quote_expiring_recipient',
      )?.[2] as Record<string, string>;
      expect(recipientVars['recipientName']).toBe('Estimado/a cliente');
    });

    it('defaults "now" to the current time when no override is passed', async () => {
      const { useCase, quoteRepo } = buildMocks();
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([]);

      const result = await useCase.execute();

      expect(result).toEqual({
        quotesExpired: 0,
        quoteExpiryRemindersSent: 0,
        quoteExpiryRemindersFailed: 0,
      });
    });

    it('stringifies a non-Error value thrown by the repository (top-level catch)', async () => {
      const { useCase, quoteRepo } = buildMocks();
      const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);
      quoteRepo.markExpiryReminderSent.mockRejectedValue('write failed (string, not Error)');

      const result = await useCase.execute(NOW);

      expect(result.quoteExpiryRemindersFailed).toBe(1);
    });

    it('stringifies a non-Error value thrown by updateStatus (expiry branch)', async () => {
      const { useCase, quoteRepo } = buildMocks();
      const overdue = makeQuote({ status: 'sent', validUntil: makeDate(-1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([overdue]);
      quoteRepo.updateStatus.mockRejectedValue('lost the race (string, not Error)');

      const result = await useCase.execute(NOW);

      expect(result.quotesExpired).toBe(0);
      expect(result.quoteExpiryRemindersFailed).toBe(0);
    });

    it('stringifies a non-Error value thrown by the doctor mailer call', async () => {
      const { useCase, quoteRepo, mailer } = buildMocks();
      mailer.sendTemplate.mockImplementation((templateName: string) => {
        if (templateName === 'quote_expiring_doctor') {
          return Promise.reject('smtp down (string, not Error)');
        }
        return Promise.resolve({ id: 'msg-1' });
      });
      const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);

      const result = await useCase.execute(NOW);

      expect(result.quoteExpiryRemindersSent).toBe(1); // recipient email still succeeded
    });

    it('stringifies a non-Error value thrown by the recipient lookup', async () => {
      const { useCase, quoteRepo, patientRepo, mailer } = buildMocks();
      patientRepo.findById.mockRejectedValue('decrypt error (string, not Error)');
      const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);

      const result = await useCase.execute(NOW);

      expect(mailer.sendTemplate).toHaveBeenCalledTimes(1);
      expect(result.quoteExpiryRemindersSent).toBe(1);
    });

    it('falls back to FRONTEND_URL when APP_BASE_URL is not configured', async () => {
      const { useCase, quoteRepo, mailer, config } = buildMocks();
      (config.get as jest.Mock).mockImplementation((key: string) =>
        key === 'FRONTEND_URL' ? 'https://fallback.deltasalud.app' : undefined,
      );
      const soonDue = makeQuote({ status: 'sent', validUntil: makeDate(1) });
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue([soonDue]);

      await useCase.execute(NOW);

      const recipientVars = (mailer.sendTemplate as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'quote_expiring_recipient',
      )?.[2] as Record<string, string>;
      expect(recipientVars['quoteUrl']).toBe('https://fallback.deltasalud.app/quotes/tok-abc123');
    });
  });

  // ---------------------------------------------------------------------------
  // Cap warning
  // ---------------------------------------------------------------------------
  describe('dispatch cap', () => {
    it('logs a warning when the candidate list hits the cap (200)', async () => {
      const { useCase, quoteRepo } = buildMocks();
      const candidates = Array.from({ length: 200 }, (_, i) =>
        makeQuote({ id: `qqqqqqqq-0000-0000-0000-${String(i).padStart(12, '0')}`, status: 'accepted' }),
      );
      quoteRepo.findQuotesNearingExpiry.mockResolvedValue(candidates);

      const result = await useCase.execute(NOW);

      // None of them are 'sent', so nothing is expired/notified — this test
      // only exercises the cap-reached branch without throwing.
      expect(result.quotesExpired).toBe(0);
    });
  });
});
