import { SendQuoteUseCase } from './send-quote.use-case';
import type { IQuoteRepository } from '../../domain/repositories/iquote.repository';
import type { IDoctorProfileRepository } from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { DoctorProfile } from '../../../doctor-settings/domain/entities/doctor-profile.entity';
import { Quote } from '../../domain/entities/quote.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';
import { QuoteAlreadySentError } from '../../domain/errors/quote-already-sent.error';
import type { MailerService } from '../../../email/application/services/mailer.service';
import type { IUsdtRateStore } from '../../../finances/domain/repositories/usdt-rate.store';
import type { ConfigService } from '@nestjs/config';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const QUOTE_ID = 'qqqqqqqq-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeQuote(overrides: Partial<Parameters<typeof Quote.create>[0]> = {}): Quote {
  return Quote.create({
    id: QUOTE_ID,
    doctorId: DOCTOR_ID,
    quoteNumber: 'COT-0001',
    patientId: PATIENT_ID,
    leadId: null,
    status: 'draft',
    validUntil: null,
    notes: '',
    subtotalUsd: 100,
    discountUsd: 0,
    totalUsd: 100,
    bcvRate: null,
    totalBs: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
    items: [],
    ...overrides,
  });
}

function makeRepo(quote: Quote | null = makeQuote()): jest.Mocked<IQuoteRepository> {
  const sentQuote = quote
    ? Quote.create({ ...quote, status: 'sent', sentAt: now, bcvRate: 36.5, totalBs: 3650 })
    : null;
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn().mockResolvedValue(quote),
    findShareLinkByToken: jest.fn(),
    findQuoteByValidToken: jest.fn(),
    validateItemSources: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    markAsSent: jest.fn().mockResolvedValue(sentQuote ?? makeQuote({ status: 'sent' })),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    findItemsByQuoteId: jest.fn(),
  };
}

function makeDoctorProfileRepo(fullName = 'Dr. García'): jest.Mocked<IDoctorProfileRepository> {
  // Use a minimal plain object cast to DoctorProfile to avoid enumerating the
  // many required fields of DoctorProfileCreateParams. The use case only reads
  // `profile?.fullName`, so only that field matters here.
  const profile = { fullName } as unknown as DoctorProfile;
  return {
    findByDoctorId: jest.fn().mockResolvedValue(profile),
    save: jest.fn(),
    findPlanSnapshot: jest.fn(),
    updateExchangeRate: jest.fn(),
    findByAuth0Id: jest.fn(),
  } as unknown as jest.Mocked<IDoctorProfileRepository>;
}

function makeRateStore(rate: number | null = 36.5): jest.Mocked<IUsdtRateStore> {
  return {
    getRate: jest.fn().mockResolvedValue(rate),
    setRate: jest.fn(),
    setSource: jest.fn(),
    getRatesSummary: jest.fn(),
  };
}

function makeMailer(): jest.Mocked<MailerService> {
  return {
    sendTemplate: jest.fn().mockResolvedValue({ id: 'msg-id' }),
  } as unknown as jest.Mocked<MailerService>;
}

function makeConfig(): jest.Mocked<ConfigService> {
  return {
    get: jest.fn().mockReturnValue('https://app.deltasalud.app'),
  } as unknown as jest.Mocked<ConfigService>;
}

function makeUseCase(
  repo = makeRepo(),
  profileRepo = makeDoctorProfileRepo(),
  rateStore = makeRateStore(),
  mailer = makeMailer(),
  config = makeConfig(),
): SendQuoteUseCase {
  return new SendQuoteUseCase(repo, rateStore, profileRepo, mailer, config);
}

describe('SendQuoteUseCase', () => {
  it('transitions draft quote to sent status', async () => {
    const repo = makeRepo();
    const uc = makeUseCase(repo);

    const result = await uc.execute({ quoteId: QUOTE_ID, doctorId: DOCTOR_ID });

    expect(result.status).toBe('sent');
    expect(repo.markAsSent).toHaveBeenCalledTimes(1);
  });

  it('freezes bcvRate and totalBs at send time', async () => {
    const repo = makeRepo();
    const uc = makeUseCase(repo, makeDoctorProfileRepo(), makeRateStore(36.5));

    await uc.execute({ quoteId: QUOTE_ID, doctorId: DOCTOR_ID });

    const markCall = (repo.markAsSent as jest.Mock).mock.calls[0][2] as {
      bcvRate: number;
      totalBs: number;
    };
    expect(markCall.bcvRate).toBe(36.5);
    // totalBs = totalUsd (100) × bcvRate (36.5) = 3650
    expect(markCall.totalBs).toBeCloseTo(3650);
  });

  it('creates a 48-byte base64url share token', async () => {
    const repo = makeRepo();
    const uc = makeUseCase(repo);

    await uc.execute({ quoteId: QUOTE_ID, doctorId: DOCTOR_ID });

    const markCall = (repo.markAsSent as jest.Mock).mock.calls[0][2] as {
      shareLink: { token: string };
    };
    const { token } = markCall.shareLink;

    // base64url: 48 bytes → 64 chars (no padding)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 48 bytes base64url is at least 60 chars
    expect(token.length).toBeGreaterThanOrEqual(60);
  });

  it('resolves doctor name from profile, not from JWT email', async () => {
    const repo = makeRepo();
    const profileRepo = makeDoctorProfileRepo('Dr. Valentina Torres');
    const mailer = makeMailer();
    const uc = makeUseCase(repo, profileRepo, makeRateStore(), mailer);

    await uc.execute({
      quoteId: QUOTE_ID,
      doctorId: DOCTOR_ID,
      recipientEmail: 'paciente@example.com',
    });

    expect(mailer.sendTemplate).toHaveBeenCalledWith(
      'quote_sent',
      'paciente@example.com',
      expect.objectContaining({ doctorName: 'Dr. Valentina Torres' }),
      expect.any(Object),
    );
  });

  it('throws QuoteNotFoundError when quote does not exist', async () => {
    const repo = makeRepo(null);
    const uc = makeUseCase(repo);

    await expect(uc.execute({ quoteId: QUOTE_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      QuoteNotFoundError,
    );
  });

  it('throws QuoteAlreadySentError for a non-draft quote', async () => {
    const repo = makeRepo(makeQuote({ status: 'sent' }));
    const uc = makeUseCase(repo);

    await expect(uc.execute({ quoteId: QUOTE_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      QuoteAlreadySentError,
    );
    expect(repo.markAsSent).not.toHaveBeenCalled();
  });

  it('sends email when recipientEmail is provided', async () => {
    const repo = makeRepo();
    const mailer = makeMailer();
    const uc = makeUseCase(repo, makeDoctorProfileRepo('Dr. García'), makeRateStore(), mailer);

    await uc.execute({
      quoteId: QUOTE_ID,
      doctorId: DOCTOR_ID,
      recipientEmail: 'paciente@example.com',
      recipientName: 'María Torres',
    });

    expect(mailer.sendTemplate).toHaveBeenCalledWith(
      'quote_sent',
      'paciente@example.com',
      expect.objectContaining({ doctorName: 'Dr. García', quoteNumber: 'COT-0001' }),
      expect.any(Object),
    );
  });

  it('skips email and still marks as sent when no recipientEmail', async () => {
    const repo = makeRepo();
    const mailer = makeMailer();
    const uc = makeUseCase(repo, makeDoctorProfileRepo(), makeRateStore(), mailer);

    await uc.execute({ quoteId: QUOTE_ID, doctorId: DOCTOR_ID });

    expect(repo.markAsSent).toHaveBeenCalledTimes(1);
    expect(mailer.sendTemplate).not.toHaveBeenCalled();
  });

  it('does not re-throw when email delivery fails', async () => {
    const repo = makeRepo();
    const mailer = makeMailer();
    (mailer.sendTemplate as jest.Mock).mockRejectedValueOnce(new Error('SMTP error'));
    const uc = makeUseCase(repo, makeDoctorProfileRepo(), makeRateStore(), mailer);

    // Should not throw — the quote is still marked as sent
    const result = await uc.execute({
      quoteId: QUOTE_ID,
      doctorId: DOCTOR_ID,
      recipientEmail: 'x@x.com',
    });

    expect(result.status).toBe('sent');
  });
});
