import { GetQuoteUseCase } from './get-quote.use-case';
import type { IQuoteRepository } from '../../domain/repositories/iquote.repository';
import { Quote } from '../../domain/entities/quote.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'eeeeeeee-0000-0000-0000-000000000002';
const QUOTE_ID = 'qqqqqqqq-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeQuote(): Quote {
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
    updateStatus: jest.fn(),
    delete: jest.fn(),
    findItemsByQuoteId: jest.fn(),
  };
}

describe('GetQuoteUseCase', () => {
  it('returns the quote when found', async () => {
    const uc = new GetQuoteUseCase(makeRepo(makeQuote()));
    const result = await uc.execute(QUOTE_ID, DOCTOR_ID);
    expect(result.id).toBe(QUOTE_ID);
    expect(result.quoteNumber).toBe('COT-0001');
  });

  it('throws QuoteNotFoundError when quote does not exist', async () => {
    const uc = new GetQuoteUseCase(makeRepo(null));
    await expect(uc.execute('missing-id', DOCTOR_ID)).rejects.toThrow(QuoteNotFoundError);
  });

  /**
   * §9-5 anti-IDOR: another doctor's quote returns the SAME error as a
   * non-existent quote (repository scopes by doctorId and returns null).
   */
  it('§9-5 anti-IDOR: foreign doctor quote returns QuoteNotFoundError', async () => {
    const repo = makeRepo(null); // repo returns null for wrong doctorId
    const uc = new GetQuoteUseCase(repo);
    await expect(uc.execute(QUOTE_ID, OTHER_DOCTOR)).rejects.toThrow(QuoteNotFoundError);
    // The repository was called with the OTHER doctor's ID — anti-IDOR works
    expect(repo.findByIdForDoctor).toHaveBeenCalledWith(QUOTE_ID, OTHER_DOCTOR);
  });
});
