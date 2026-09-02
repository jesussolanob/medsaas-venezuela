import { ListQuotesUseCase } from './list-quotes.use-case';
import type {
  IQuoteRepository,
  QuoteListFilters,
  QuoteListResult,
} from '../../domain/repositories/iquote.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import { Quote } from '../../domain/entities/quote.entity';
import type { Patient } from '../../../patients/domain/entities/patient.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
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

function makeEmptyResult(page = 1, limit = 20): QuoteListResult {
  return { items: [], total: 0, page, limit };
}

function makeQuoteRepo(
  listResult: QuoteListResult = makeEmptyResult(),
): jest.Mocked<IQuoteRepository> {
  return {
    list: jest.fn().mockResolvedValue(listResult),
    findByIdForDoctor: jest.fn(),
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

/** Creates a minimal Patient-like stub. The use case only reads .id and .fullName. */
function makePatient(id: string, fullName: string): Patient {
  return { id, fullName } as unknown as Patient;
}

function makePatientRepo(patients: Patient[] = []): jest.Mocked<IPatientRepository> {
  return {
    findAllByDoctor: jest.fn().mockResolvedValue(patients),
    findByCedulaHash: jest.fn(),
    findByIdForDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    search: jest.fn(),
  } as unknown as jest.Mocked<IPatientRepository>;
}

function makeUseCase(
  quoteRepo: jest.Mocked<IQuoteRepository>,
  patientRepo: jest.Mocked<IPatientRepository>,
): ListQuotesUseCase {
  const uc = new ListQuotesUseCase(
    quoteRepo as unknown as IQuoteRepository,
    patientRepo as unknown as IPatientRepository,
  );
  return uc;
}

// ---------------------------------------------------------------------------
// Helpers for query input
// ---------------------------------------------------------------------------

function makeQuery(
  overrides: Record<string, unknown> = {},
): Parameters<ListQuotesUseCase['execute']>[1] {
  return {
    page: 1,
    limit: 20,
    ...overrides,
  } as Parameters<ListQuotesUseCase['execute']>[1];
}

// ===========================================================================
// Tests
// ===========================================================================

describe('ListQuotesUseCase', () => {
  describe('basic listing', () => {
    it('calls repo.list with doctorId and pagination', async () => {
      const quoteRepo = makeQuoteRepo({ items: [makeQuote()], total: 1, page: 1, limit: 20 });
      const patientRepo = makePatientRepo();
      const uc = makeUseCase(quoteRepo, patientRepo);

      const result = await uc.execute(DOCTOR_ID, makeQuery());

      expect(quoteRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, page: 1, limit: 20 }),
      );
      expect(result.total).toBe(1);
    });

    it('passes status filter to the repo', async () => {
      const quoteRepo = makeQuoteRepo();
      const patientRepo = makePatientRepo();
      const uc = makeUseCase(quoteRepo, patientRepo);

      await uc.execute(DOCTOR_ID, makeQuery({ status: 'sent' }));

      expect(quoteRepo.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
    });
  });

  // ---------------------------------------------------------------------------
  // supplier filter
  // ---------------------------------------------------------------------------

  describe('supplier filter', () => {
    it('passes supplier to repo when provided', async () => {
      const quoteRepo = makeQuoteRepo({ items: [makeQuote()], total: 1, page: 1, limit: 20 });
      const patientRepo = makePatientRepo();
      const uc = makeUseCase(quoteRepo, patientRepo);

      const result = await uc.execute(DOCTOR_ID, makeQuery({ supplier: 'Laboratorio Delta' }));

      expect(quoteRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ supplier: 'Laboratorio Delta', doctorId: DOCTOR_ID }),
      );
      expect(result.total).toBe(1);
    });

    it('returns an empty page when no products match the supplier (not the full list)', async () => {
      // The repo short-circuits and returns an empty result when supplier matches nothing.
      const quoteRepo = makeQuoteRepo(makeEmptyResult());
      const patientRepo = makePatientRepo();
      const uc = makeUseCase(quoteRepo, patientRepo);

      const result = await uc.execute(DOCTOR_ID, makeQuery({ supplier: 'Proveedor Inexistente' }));

      expect(quoteRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ supplier: 'Proveedor Inexistente' }),
      );
      // Must be an empty page, never the full quote list.
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('does NOT pass another doctor supplier results (doctorId always scoped)', async () => {
      const quoteRepo = makeQuoteRepo();
      const patientRepo = makePatientRepo();
      const uc = makeUseCase(quoteRepo, patientRepo);

      await uc.execute(OTHER_DOCTOR_ID, makeQuery({ supplier: 'Laboratorio Delta' }));

      // doctorId must match the requesting doctor, never DOCTOR_ID
      const callArg = (quoteRepo.list as jest.Mock).mock.calls[0][0] as QuoteListFilters;
      expect(callArg.doctorId).toBe(OTHER_DOCTOR_ID);
      expect(callArg.doctorId).not.toBe(DOCTOR_ID);
    });

    it('does not pass supplier to repo when absent', async () => {
      const quoteRepo = makeQuoteRepo();
      const patientRepo = makePatientRepo();
      const uc = makeUseCase(quoteRepo, patientRepo);

      await uc.execute(DOCTOR_ID, makeQuery());

      const callArg = (quoteRepo.list as jest.Mock).mock.calls[0][0] as QuoteListFilters;
      expect(callArg.supplier).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // patient_name filter (encrypted — two-phase lookup)
  // ---------------------------------------------------------------------------

  describe('patient_name filter', () => {
    it('resolves matching patient IDs in-memory and passes them to the repo', async () => {
      const quoteRepo = makeQuoteRepo({ items: [makeQuote()], total: 1, page: 1, limit: 20 });
      const patientRepo = makePatientRepo([
        makePatient(PATIENT_ID, 'Torres García'),
        makePatient('pppppppp-0000-0000-0000-000000000002', 'Rodríguez López'),
      ]);
      const uc = makeUseCase(quoteRepo, patientRepo);

      await uc.execute(DOCTOR_ID, makeQuery({ patient_name: 'Torres' }));

      expect(patientRepo.findAllByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
      expect(quoteRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ patientIds: [PATIENT_ID] }),
      );
    });

    it('returns an empty page (not the full list) when no patients match the name', async () => {
      const quoteRepo = makeQuoteRepo({ items: [makeQuote()], total: 1, page: 1, limit: 20 });
      const patientRepo = makePatientRepo([makePatient(PATIENT_ID, 'Torres García')]);
      const uc = makeUseCase(quoteRepo, patientRepo);

      // The use case short-circuits: patientIds=[] → repo receives empty array
      // and the repo's list() is still called but gets an empty IDs list.
      // We simulate what the repo would do: return empty result for empty patientIds.
      quoteRepo.list.mockResolvedValue(makeEmptyResult());

      const result = await uc.execute(DOCTOR_ID, makeQuery({ patient_name: 'Inexistente' }));

      const callArg = (quoteRepo.list as jest.Mock).mock.calls[0][0] as QuoteListFilters;
      expect(callArg.patientIds).toEqual([]);
      expect(result.items).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // product_name filter
  // ---------------------------------------------------------------------------

  describe('product_name filter', () => {
    it('passes product_name to repo as productName', async () => {
      const quoteRepo = makeQuoteRepo();
      const patientRepo = makePatientRepo();
      const uc = makeUseCase(quoteRepo, patientRepo);

      await uc.execute(DOCTOR_ID, makeQuery({ product_name: 'Crema' }));

      expect(quoteRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ productName: 'Crema' }),
      );
    });
  });
});
