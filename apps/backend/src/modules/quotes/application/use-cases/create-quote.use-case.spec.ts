import { CreateQuoteUseCase } from './create-quote.use-case';
import type { IQuoteRepository } from '../../domain/repositories/iquote.repository';
import { Quote } from '../../domain/entities/quote.entity';
import { QuoteItem } from '../../domain/entities/quote-item.entity';
import { QuoteInvalidRecipientError } from '../../domain/errors/quote-invalid-recipient.error';
import { QuoteItemSourceNotFoundError } from '../../domain/errors/quote-item-source-not-found.error';
import type { CreateQuoteDto } from '@delta/shared-types';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const LEAD_ID = 'llllllll-0000-0000-0000-000000000001';
const PRODUCT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeItem(): QuoteItem {
  return QuoteItem.create({
    id: 'iiiiiiii-0000-0000-0000-000000000001',
    quoteId: 'qqqqqqqq-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    kind: 'product',
    sourceId: null,
    name: 'Crema A',
    description: '',
    quantity: 1,
    unitPriceUsd: 10,
    sortOrder: 0,
  });
}

function makeQuote(overrides: Partial<Parameters<typeof Quote.create>[0]> = {}): Quote {
  return Quote.create({
    id: 'qqqqqqqq-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    quoteNumber: 'COT-0001',
    patientId: PATIENT_ID,
    leadId: null,
    status: 'draft',
    validUntil: null,
    notes: '',
    subtotalUsd: 10,
    discountUsd: 0,
    totalUsd: 10,
    bcvRate: null,
    totalBs: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
    items: [makeItem()],
    ...overrides,
  });
}

function makeRepo(): jest.Mocked<IQuoteRepository> {
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn(),
    findShareLinkByToken: jest.fn(),
    findQuoteByValidToken: jest.fn(),
    validateItemSources: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(makeQuote()),
    update: jest.fn(),
    markAsSent: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    findItemsByQuoteId: jest.fn(),
  };
}

const validItemInput: CreateQuoteDto['items'][number] = {
  kind: 'product',
  source_id: null,
  name: 'Crema A',
  description: '',
  quantity: 1,
  unit_price_usd: 10,
  sort_order: 0,
};

// ─── §9-1: Recipient XOR constraint ────────────────────────────────────────

describe('CreateQuoteUseCase — §9-1 recipient XOR', () => {
  let uc: CreateQuoteUseCase;
  let repo: jest.Mocked<IQuoteRepository>;

  beforeEach(() => {
    repo = makeRepo();
    uc = new CreateQuoteUseCase(repo);
  });

  it('§9-1a throws QuoteInvalidRecipientError when both patient_id and lead_id are provided', async () => {
    const dto: CreateQuoteDto = {
      patient_id: PATIENT_ID,
      lead_id: LEAD_ID,
      notes: '',
      discount_usd: 0,
      items: [validItemInput],
    };
    await expect(uc.execute(dto, DOCTOR_ID)).rejects.toThrow(QuoteInvalidRecipientError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('§9-1b throws QuoteInvalidRecipientError when neither patient_id nor lead_id is provided', async () => {
    const dto: CreateQuoteDto = {
      patient_id: null,
      lead_id: null,
      notes: '',
      discount_usd: 0,
      items: [validItemInput],
    };
    await expect(uc.execute(dto, DOCTOR_ID)).rejects.toThrow(QuoteInvalidRecipientError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('creates successfully with only patient_id', async () => {
    const dto: CreateQuoteDto = {
      patient_id: PATIENT_ID,
      lead_id: null,
      notes: '',
      discount_usd: 0,
      items: [validItemInput],
    };
    const result = await uc.execute(dto, DOCTOR_ID);
    expect(result.quoteNumber).toBe('COT-0001');
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('creates successfully with only lead_id', async () => {
    repo.create.mockResolvedValueOnce(makeQuote({ patientId: null, leadId: LEAD_ID }));
    const dto: CreateQuoteDto = {
      patient_id: null,
      lead_id: LEAD_ID,
      notes: '',
      discount_usd: 0,
      items: [validItemInput],
    };
    const result = await uc.execute(dto, DOCTOR_ID);
    expect(result.leadId).toBe(LEAD_ID);
  });
});

// ─── §9-2: Snapshot isolation ──────────────────────────────────────────────

describe('CreateQuoteUseCase — §9-2 item snapshot', () => {
  /**
   * §9-2: Changing the price of a product must NOT change an already-emitted quote.
   * The item stores its own name/description/price at creation — these are COPIES.
   * This test verifies the use case passes the item data through without mutation.
   */
  it('§9-2 passes item name and price as-is to the repository (snapshot, not reference)', async () => {
    const repo = makeRepo();
    const uc = new CreateQuoteUseCase(repo);

    const dto: CreateQuoteDto = {
      patient_id: PATIENT_ID,
      lead_id: null,
      notes: '',
      discount_usd: 0,
      items: [
        {
          kind: 'product',
          source_id: PRODUCT_ID,
          name: 'Crema A',
          description: 'Descripción inicial',
          quantity: 2,
          unit_price_usd: 15,
          sort_order: 0,
        },
      ],
    };

    await uc.execute(dto, DOCTOR_ID);

    const createCall = (repo.create as jest.Mock).mock.calls[0][0];
    const item = createCall.items[0];

    // The name and price passed to repo.create are COPIES from the DTO —
    // changing the source product afterward does not affect this.
    expect(item.name).toBe('Crema A');
    expect(item.unitPriceUsd).toBe(15);
    expect(item.sourceId).toBe(PRODUCT_ID);
  });
});

// ─── §9-3: Concurrency-safe quote number ────────────────────────────────────

describe('CreateQuoteUseCase — §9-3 atomic quote_number', () => {
  /**
   * §9-3: The use case does NOT generate the quote_number itself.
   * It delegates to repo.create() which uses an advisory lock in Postgres.
   * Concurrent calls therefore receive different numbers (each call → one repo.create).
   */
  it('§9-3 delegates quote_number generation to the repository (atomic, not use-case)', async () => {
    const repo = makeRepo();
    let callIndex = 0;
    const numbers = ['COT-0001', 'COT-0002'];
    (repo.create as jest.Mock).mockImplementation(async () =>
      makeQuote({ quoteNumber: numbers[callIndex++] }),
    );

    const uc = new CreateQuoteUseCase(repo);
    const dto: CreateQuoteDto = {
      patient_id: PATIENT_ID,
      lead_id: null,
      notes: '',
      discount_usd: 0,
      items: [validItemInput],
    };

    // Simulate concurrent creates
    const [q1, q2] = await Promise.all([uc.execute(dto, DOCTOR_ID), uc.execute(dto, DOCTOR_ID)]);

    // Each call produces a distinct quote_number (assigned by the repo, not computed here)
    expect(q1.quoteNumber).not.toBe(q2.quoteNumber);
    expect(q1.quoteNumber).toBe('COT-0001');
    expect(q2.quoteNumber).toBe('COT-0002');
    // repo.create was called twice — each call goes through the atomic lock
    expect(repo.create).toHaveBeenCalledTimes(2);
  });
});

// ─── §9-6: totalUsd computation ─────────────────────────────────────────────

describe('CreateQuoteUseCase — §9-6 totalUsd computation', () => {
  /**
   * §9-6: total_usd = Σ amount_usd − discount_usd.
   * The backend computes this; client values are ignored.
   * Here we verify the use case forwards the correct params to repo.create().
   */
  it('§9-6 passes correct discountUsd to repo so totalUsd = Σ(amountUsd) − discountUsd', async () => {
    const repo = makeRepo();
    const uc = new CreateQuoteUseCase(repo);

    const dto: CreateQuoteDto = {
      patient_id: PATIENT_ID,
      lead_id: null,
      notes: '',
      discount_usd: 15,
      items: [
        {
          kind: 'product',
          source_id: null,
          name: 'A',
          description: '',
          quantity: 2,
          unit_price_usd: 50,
          sort_order: 0,
        },
        {
          kind: 'service',
          source_id: null,
          name: 'B',
          description: '',
          quantity: 1,
          unit_price_usd: 30,
          sort_order: 1,
        },
      ],
    };

    await uc.execute(dto, DOCTOR_ID);

    const createCall = (repo.create as jest.Mock).mock.calls[0][0];
    // The repo receives discountUsd and items — it computes the totals internally
    expect(createCall.discountUsd).toBe(15);
    expect(createCall.items).toHaveLength(2);
    // Verify item data passed correctly
    expect(createCall.items[0].quantity).toBe(2);
    expect(createCall.items[0].unitPriceUsd).toBe(50);
  });
});

// ─── Source validation ────────────────────────────────────────────────────────

describe('CreateQuoteUseCase — source validation', () => {
  it('throws QuoteItemSourceNotFoundError when a product sourceId is invalid', async () => {
    const repo = makeRepo();
    (repo.validateItemSources as jest.Mock).mockRejectedValueOnce(
      new QuoteItemSourceNotFoundError('product', PRODUCT_ID),
    );
    const uc = new CreateQuoteUseCase(repo);

    const dto: CreateQuoteDto = {
      patient_id: PATIENT_ID,
      lead_id: null,
      notes: '',
      discount_usd: 0,
      items: [{ ...validItemInput, source_id: PRODUCT_ID }],
    };

    await expect(uc.execute(dto, DOCTOR_ID)).rejects.toThrow(QuoteItemSourceNotFoundError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('skips validation for items without sourceId', async () => {
    const repo = makeRepo();
    const uc = new CreateQuoteUseCase(repo);

    const dto: CreateQuoteDto = {
      patient_id: PATIENT_ID,
      lead_id: null,
      notes: '',
      discount_usd: 0,
      items: [validItemInput], // source_id: null
    };

    await uc.execute(dto, DOCTOR_ID);
    // validateItemSources was called (with null sourceId for the item)
    expect(repo.validateItemSources).toHaveBeenCalledWith(
      [{ kind: 'product', sourceId: null }],
      DOCTOR_ID,
    );
  });
});
