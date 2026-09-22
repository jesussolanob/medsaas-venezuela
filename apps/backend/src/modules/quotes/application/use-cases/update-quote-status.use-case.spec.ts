import { UpdateQuoteStatusUseCase } from './update-quote-status.use-case';
import type { IQuoteRepository } from '../../domain/repositories/iquote.repository';
import type { IPaymentRepository } from '../../../finances/domain/repositories/payment.repository';
import { Quote } from '../../domain/entities/quote.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';
import { QuoteInvalidStatusTransitionError } from '../../domain/errors/quote-invalid-status-transition.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const LEAD_ID = 'llllllll-0000-0000-0000-000000000001';
const QUOTE_ID = 'qqqqqqqq-0000-0000-0000-000000000001';
const now = new Date('2026-09-08T00:00:00Z');

function makeQuote(overrides: Partial<Parameters<typeof Quote.create>[0]> = {}): Quote {
  return Quote.create({
    id: QUOTE_ID,
    doctorId: DOCTOR_ID,
    quoteNumber: 'PRE-0001',
    patientId: PATIENT_ID,
    leadId: null,
    status: 'sent',
    validUntil: null,
    notes: '',
    subtotalUsd: 120,
    discountType: 'amount',
    discountValue: 0,
    discountUsd: 0,
    totalUsd: 120,
    bcvRate: 36.5,
    totalBs: 4380,
    sentAt: now,
    createdAt: now,
    updatedAt: now,
    items: [],
    ...overrides,
  });
}

function makeRepo(quote: Quote | null): jest.Mocked<IQuoteRepository> {
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn().mockResolvedValue(quote),
    findShareLinkByToken: jest.fn(),
    findQuoteByValidToken: jest.fn(),
    validateItemSources: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    markAsSent: jest.fn(),
    updateStatus: jest
      .fn()
      .mockImplementation((_id, doctorId, status) =>
        Promise.resolve(Quote.create({ ...quote!, doctorId, status })),
      ),
    delete: jest.fn(),
    findItemsByQuoteId: jest.fn(),
    findQuotesNearingExpiry: jest.fn(),
    markExpiryReminderSent: jest.fn(),
    acceptWithPayment: jest
      .fn()
      .mockImplementation((_id, doctorId) =>
        Promise.resolve(Quote.create({ ...quote!, doctorId, status: 'accepted' })),
      ),
  };
}

function makePaymentRepo(): jest.Mocked<IPaymentRepository> {
  return {
    listForDoctor: jest.fn(),
    totalsForDoctor: jest.fn(),
    findByIdForDoctor: jest.fn(),
    updateStatus: jest.fn(),
    addItem: jest.fn(),
    removeItem: jest.fn(),
    listItems: jest.fn(),
    attachReceiptUrl: jest.fn(),
    updateDetails: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<IPaymentRepository>;
}

function makeUseCase(
  repo: jest.Mocked<IQuoteRepository>,
  paymentRepo: jest.Mocked<IPaymentRepository> = makePaymentRepo(),
): UpdateQuoteStatusUseCase {
  return new UpdateQuoteStatusUseCase(repo, paymentRepo);
}

describe('UpdateQuoteStatusUseCase', () => {
  describe('not found / anti-IDOR', () => {
    it('throws QuoteNotFoundError when quote does not exist', async () => {
      const repo = makeRepo(null);
      const uc = makeUseCase(repo);

      await expect(uc.execute(QUOTE_ID, DOCTOR_ID, { status: 'accepted' })).rejects.toThrow(
        QuoteNotFoundError,
      );
    });
  });

  describe('state machine', () => {
    it('rejects an invalid transition', async () => {
      const repo = makeRepo(makeQuote({ status: 'draft' }));
      const uc = makeUseCase(repo);

      await expect(uc.execute(QUOTE_ID, DOCTOR_ID, { status: 'accepted' })).rejects.toThrow(
        QuoteInvalidStatusTransitionError,
      );
    });
  });

  describe('acceptance — patient quote', () => {
    it('calls acceptWithPayment (not updateStatus) with patientId and amountUsd', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent', patientId: PATIENT_ID }));
      const uc = makeUseCase(repo);

      const result = await uc.execute(QUOTE_ID, DOCTOR_ID, { status: 'accepted' });

      expect(result.status).toBe('accepted');
      // ADR-058: atomic path through acceptWithPayment.
      expect(repo.acceptWithPayment).toHaveBeenCalledWith(
        QUOTE_ID,
        DOCTOR_ID,
        expect.objectContaining({ patientId: PATIENT_ID, amountUsd: 120 }),
      );
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('passes a fresh UUID as paymentId (idempotency key)', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent', patientId: PATIENT_ID }));
      const uc = makeUseCase(repo);

      await uc.execute(QUOTE_ID, DOCTOR_ID, { status: 'accepted' });

      const call = (repo.acceptWithPayment as jest.Mock).mock.calls[0][2] as {
        paymentId: string;
      };
      // UUID v4 pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(call.paymentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('does not call acceptWithPayment a second time when the repo signals an already-accepted state', async () => {
      // Simulates the concurrent double-accept: the second call finds payment_id IS NOT NULL
      // and the repo implementation throws QuoteInvalidStatusTransitionError.
      const repo = makeRepo(makeQuote({ status: 'sent', patientId: PATIENT_ID }));
      repo.acceptWithPayment.mockRejectedValueOnce(
        new QuoteInvalidStatusTransitionError('accepted', 'accepted'),
      );
      const uc = makeUseCase(repo);

      await expect(uc.execute(QUOTE_ID, DOCTOR_ID, { status: 'accepted' })).rejects.toThrow(
        QuoteInvalidStatusTransitionError,
      );
      // acceptWithPayment was called exactly once (no retry attempt).
      expect(repo.acceptWithPayment).toHaveBeenCalledTimes(1);
    });
  });

  describe('acceptance — lead quote (no payment)', () => {
    it('uses updateStatus (not acceptWithPayment) when patientId is null', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent', patientId: null, leadId: LEAD_ID }));
      const uc = makeUseCase(repo);

      const result = await uc.execute(QUOTE_ID, DOCTOR_ID, { status: 'accepted' });

      expect(result.status).toBe('accepted');
      expect(repo.updateStatus).toHaveBeenCalledWith(QUOTE_ID, DOCTOR_ID, 'accepted', 'sent');
      expect(repo.acceptWithPayment).not.toHaveBeenCalled();
    });
  });

  describe('non-acceptance transitions', () => {
    it('uses updateStatus for rejected', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent' }));
      const uc = makeUseCase(repo);

      const result = await uc.execute(QUOTE_ID, DOCTOR_ID, { status: 'rejected' });

      expect(result.status).toBe('rejected');
      expect(repo.updateStatus).toHaveBeenCalledWith(QUOTE_ID, DOCTOR_ID, 'rejected', 'sent');
      expect(repo.acceptWithPayment).not.toHaveBeenCalled();
    });

    it('uses updateStatus for expired', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent' }));
      const uc = makeUseCase(repo);

      const result = await uc.execute(QUOTE_ID, DOCTOR_ID, { status: 'expired' });

      expect(result.status).toBe('expired');
      expect(repo.updateStatus).toHaveBeenCalledWith(QUOTE_ID, DOCTOR_ID, 'expired', 'sent');
    });
  });
});
