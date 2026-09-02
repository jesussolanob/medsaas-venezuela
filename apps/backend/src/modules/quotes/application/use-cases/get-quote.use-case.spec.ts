import { GetQuoteUseCase } from './get-quote.use-case';
import type { IQuoteRepository } from '../../domain/repositories/iquote.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { ILeadRepository } from '../../../leads/domain/repositories/lead.repository';
import { Quote } from '../../domain/entities/quote.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';

const PATIENT_NAME = 'Ana Pérez';

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

function makePatientRepo(fullName: string | null = PATIENT_NAME): jest.Mocked<IPatientRepository> {
  return {
    findById: jest.fn().mockResolvedValue(fullName === null ? null : { fullName }),
  } as unknown as jest.Mocked<IPatientRepository>;
}

function makeLeadRepo(lead: { name: string; lastName: string | null } | null = null) {
  return {
    findByIdForDoctor: jest.fn().mockResolvedValue(lead),
  } as unknown as jest.Mocked<ILeadRepository>;
}

describe('GetQuoteUseCase', () => {
  it('returns the quote when found', async () => {
    const uc = new GetQuoteUseCase(makeRepo(makeQuote()), makePatientRepo(), makeLeadRepo());
    const { quote } = await uc.execute(QUOTE_ID, DOCTOR_ID);
    expect(quote.id).toBe(QUOTE_ID);
    expect(quote.quoteNumber).toBe('COT-0001');
  });

  it('throws QuoteNotFoundError when quote does not exist', async () => {
    const uc = new GetQuoteUseCase(makeRepo(null), makePatientRepo(), makeLeadRepo());
    await expect(uc.execute('missing-id', DOCTOR_ID)).rejects.toThrow(QuoteNotFoundError);
  });

  /**
   * §9-5 anti-IDOR: another doctor's quote returns the SAME error as a
   * non-existent quote (repository scopes by doctorId and returns null).
   */
  it('§9-5 anti-IDOR: foreign doctor quote returns QuoteNotFoundError', async () => {
    const repo = makeRepo(null); // repo returns null for wrong doctorId
    const uc = new GetQuoteUseCase(repo, makePatientRepo(), makeLeadRepo());
    await expect(uc.execute(QUOTE_ID, OTHER_DOCTOR)).rejects.toThrow(QuoteNotFoundError);
    // The repository was called with the OTHER doctor's ID — anti-IDOR works
    expect(repo.findByIdForDoctor).toHaveBeenCalledWith(QUOTE_ID, OTHER_DOCTOR);
  });

  // ─── Nombre del destinatario ───────────────────────────────────────────────
  // La pantalla y el PDF mostraban la CATEGORÍA ("Paciente"/"Prospecto") en vez
  // de a quién iba dirigido el presupuesto.

  it('resolves the recipient name from the patient', async () => {
    const patientRepo = makePatientRepo();
    const uc = new GetQuoteUseCase(makeRepo(makeQuote()), patientRepo, makeLeadRepo());

    const { recipientName } = await uc.execute(QUOTE_ID, DOCTOR_ID);

    expect(recipientName).toBe(PATIENT_NAME);
    // Scoped por doctorId: un paciente de otro especialista nunca se resuelve.
    expect(patientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
  });

  it('resolves the recipient name from the lead, joining first and last name', async () => {
    const quote = Quote.create({ ...makeQuote(), patientId: null, leadId: 'lead-1' });
    const leadRepo = makeLeadRepo({ name: 'Marco', lastName: 'Villegas' });
    const uc = new GetQuoteUseCase(makeRepo(quote), makePatientRepo(), leadRepo);

    const { recipientName } = await uc.execute(QUOTE_ID, DOCTOR_ID);

    expect(recipientName).toBe('Marco Villegas');
    expect(leadRepo.findByIdForDoctor).toHaveBeenCalledWith('lead-1', DOCTOR_ID);
  });

  it('omits a missing last name instead of leaving a trailing space', async () => {
    const quote = Quote.create({ ...makeQuote(), patientId: null, leadId: 'lead-1' });
    const uc = new GetQuoteUseCase(
      makeRepo(quote),
      makePatientRepo(),
      makeLeadRepo({ name: 'Marco', lastName: null }),
    );

    const { recipientName } = await uc.execute(QUOTE_ID, DOCTOR_ID);

    expect(recipientName).toBe('Marco');
  });

  it('returns the quote with a null name when the recipient was deleted', async () => {
    // Un fallo resolviendo una etiqueta NO puede tumbar el detalle entero.
    const uc = new GetQuoteUseCase(makeRepo(makeQuote()), makePatientRepo(null), makeLeadRepo());

    const { quote, recipientName } = await uc.execute(QUOTE_ID, DOCTOR_ID);

    expect(quote.id).toBe(QUOTE_ID);
    expect(recipientName).toBeNull();
  });

  it('still returns the quote when the name lookup throws', async () => {
    const patientRepo = {
      findById: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as jest.Mocked<IPatientRepository>;
    const uc = new GetQuoteUseCase(makeRepo(makeQuote()), patientRepo, makeLeadRepo());

    const { quote, recipientName } = await uc.execute(QUOTE_ID, DOCTOR_ID);

    expect(quote.id).toBe(QUOTE_ID);
    expect(recipientName).toBeNull();
  });
});
