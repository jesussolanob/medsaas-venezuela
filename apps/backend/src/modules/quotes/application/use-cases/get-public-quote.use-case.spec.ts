import { GetPublicQuoteUseCase } from './get-public-quote.use-case';
import type { IQuoteRepository } from '../../domain/repositories/iquote.repository';
import type { IDoctorProfileRepository } from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { IDoctorTemplateRepository } from '../../../doctor-templates/domain/repositories/doctor-template.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { ILeadRepository } from '../../../leads/domain/repositories/lead.repository';
import type { Patient } from '../../../patients/domain/entities/patient.entity';
import type { Lead } from '../../../leads/domain/entities/lead.entity';
import { Quote } from '../../domain/entities/quote.entity';
import { QuoteLinkExpiredError } from '../../domain/errors/quote-link-expired.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const LEAD_ID = 'llllllll-0000-0000-0000-000000000001';
const QUOTE_ID = 'qqqqqqqq-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeQuote(overrides: Partial<Parameters<typeof Quote.create>[0]> = {}): Quote {
  return Quote.create({
    id: QUOTE_ID,
    doctorId: DOCTOR_ID,
    quoteNumber: 'COT-0001',
    patientId: PATIENT_ID,
    leadId: null,
    status: 'sent',
    validUntil: null,
    notes: 'Nota',
    subtotalUsd: 100,
    discountUsd: 0,
    totalUsd: 100,
    bcvRate: 36.5,
    totalBs: 3650,
    sentAt: now,
    createdAt: now,
    updatedAt: now,
    items: [],
    ...overrides,
  });
}

/**
 * The repository's findQuoteByValidToken already checks link existence, expiry,
 * and revocation. When any of those conditions fail, it returns null. The use
 * case maps null → QuoteLinkExpiredError (same error for all failure modes to
 * prevent enumeration).
 */
function makeRepo(quote: Quote | null): jest.Mocked<IQuoteRepository> {
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn(),
    findShareLinkByToken: jest.fn(),
    findQuoteByValidToken: jest.fn().mockResolvedValue(quote),
    validateItemSources: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    markAsSent: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
    findItemsByQuoteId: jest.fn(),
  };
}

/** Minimal branding dependency stubs — not the subject of these tests. */
function makeBrandingDeps(): {
  doctorProfileRepo: jest.Mocked<IDoctorProfileRepository>;
  doctorTemplateRepo: jest.Mocked<IDoctorTemplateRepository>;
  storage: jest.Mocked<IStoragePort>;
} {
  const doctorProfileRepo = {
    findByDoctorId: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    findPlanSnapshot: jest.fn(),
    updateExchangeRate: jest.fn(),
    findByAuth0Id: jest.fn(),
  } as unknown as jest.Mocked<IDoctorProfileRepository>;

  const doctorTemplateRepo = {
    findByDoctorAndType: jest.fn().mockResolvedValue(null),
    listByDoctor: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<IDoctorTemplateRepository>;

  const storage = {
    getSignedUrl: jest.fn().mockResolvedValue('https://signed.example.com/logo'),
    upload: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<IStoragePort>;

  return { doctorProfileRepo, doctorTemplateRepo, storage };
}

function makePatientRepo(patient: Partial<Patient> | null = null): jest.Mocked<IPatientRepository> {
  return {
    findById: jest.fn().mockResolvedValue(patient),
    findAllByDoctor: jest.fn(),
    findByCedulaHash: jest.fn(),
    findByIdForDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    search: jest.fn(),
  } as unknown as jest.Mocked<IPatientRepository>;
}

function makeLeadRepo(lead: Partial<Lead> | null = null): jest.Mocked<ILeadRepository> {
  return {
    findByIdForDoctor: jest.fn().mockResolvedValue(lead),
    findAll: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<ILeadRepository>;
}

function makeUseCase(
  repo: jest.Mocked<IQuoteRepository>,
  patientRepo: jest.Mocked<IPatientRepository> = makePatientRepo(),
  leadRepo: jest.Mocked<ILeadRepository> = makeLeadRepo(),
): GetPublicQuoteUseCase {
  const { doctorProfileRepo, doctorTemplateRepo, storage } = makeBrandingDeps();
  return new GetPublicQuoteUseCase(
    repo,
    doctorProfileRepo,
    doctorTemplateRepo,
    storage,
    patientRepo,
    leadRepo,
  );
}

// ===========================================================================
// Tests
// ===========================================================================

describe('GetPublicQuoteUseCase', () => {
  describe('basic public render', () => {
    it('returns quote + doctor branding for a valid non-expired token', async () => {
      const repo = makeRepo(makeQuote());
      const uc = makeUseCase(repo);

      const result = await uc.execute('validtoken123');
      expect(result.quote.id).toBe(QUOTE_ID);
      expect(result.quote.quoteNumber).toBe('COT-0001');
      expect(result.doctor).toBeDefined();
      expect(result.doctor.fullName).toBe('Dr./Dra.'); // fallback when profile is null
      expect(result.templateConfig).toBeNull();
    });

    it('calls findQuoteByValidToken exactly once — no separate link check', async () => {
      const repo = makeRepo(makeQuote());
      const uc = makeUseCase(repo);

      await uc.execute('validtoken123');

      expect(repo.findQuoteByValidToken).toHaveBeenCalledTimes(1);
      expect(repo.findShareLinkByToken).not.toHaveBeenCalled();
    });
  });

  describe('token validation', () => {
    /**
     * §9-4: expired / revoked / missing token must return 404, not the document.
     *
     * The repository returns null for all three cases. The use case maps null to
     * QuoteLinkExpiredError regardless of the reason (anti-enumeration).
     */
    it('§9-4 throws QuoteLinkExpiredError for an expired token (repo returns null)', async () => {
      const repo = makeRepo(null);
      const uc = makeUseCase(repo);
      await expect(uc.execute('expiredtoken')).rejects.toThrow(QuoteLinkExpiredError);
    });

    it('throws QuoteLinkExpiredError for a revoked token (repo returns null)', async () => {
      const repo = makeRepo(null);
      const uc = makeUseCase(repo);
      await expect(uc.execute('revokedtoken')).rejects.toThrow(QuoteLinkExpiredError);
    });

    it('throws QuoteLinkExpiredError when token does not exist (repo returns null)', async () => {
      const repo = makeRepo(null);
      const uc = makeUseCase(repo);
      await expect(uc.execute('unknowntoken')).rejects.toThrow(QuoteLinkExpiredError);
    });
  });

  describe('recipient_name — patient quote', () => {
    it('returns decrypted patient fullName when quote has a patientId', async () => {
      const repo = makeRepo(makeQuote({ patientId: PATIENT_ID, leadId: null }));
      const patientRepo = makePatientRepo({ id: PATIENT_ID, fullName: 'María Torres' } as Patient);
      const uc = makeUseCase(repo, patientRepo);

      const result = await uc.execute('validtoken123');

      expect(patientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
      expect(result.recipientName).toBe('María Torres');
    });

    it('returns null when patient record is not found', async () => {
      const repo = makeRepo(makeQuote({ patientId: PATIENT_ID, leadId: null }));
      const patientRepo = makePatientRepo(null); // patient deleted
      const uc = makeUseCase(repo, patientRepo);

      const result = await uc.execute('validtoken123');

      expect(result.recipientName).toBeNull();
    });
  });

  describe('recipient_name — lead quote', () => {
    it('returns lead name + lastName when quote has a leadId', async () => {
      const repo = makeRepo(makeQuote({ patientId: null, leadId: LEAD_ID }));
      const leadRepo = makeLeadRepo({
        id: LEAD_ID,
        name: 'Carlos',
        lastName: 'Rodríguez',
      } as Lead);
      const uc = makeUseCase(repo, makePatientRepo(), leadRepo);

      const result = await uc.execute('validtoken123');

      expect(leadRepo.findByIdForDoctor).toHaveBeenCalledWith(LEAD_ID, DOCTOR_ID);
      expect(result.recipientName).toBe('Carlos Rodríguez');
    });

    it('returns only first name when lead lastName is absent', async () => {
      const repo = makeRepo(makeQuote({ patientId: null, leadId: LEAD_ID }));
      const leadRepo = makeLeadRepo({
        id: LEAD_ID,
        name: 'Ana',
        lastName: null,
      } as Lead);
      const uc = makeUseCase(repo, makePatientRepo(), leadRepo);

      const result = await uc.execute('validtoken123');

      expect(result.recipientName).toBe('Ana');
    });

    it('returns null when lead record is not found', async () => {
      const repo = makeRepo(makeQuote({ patientId: null, leadId: LEAD_ID }));
      const leadRepo = makeLeadRepo(null);
      const uc = makeUseCase(repo, makePatientRepo(), leadRepo);

      const result = await uc.execute('validtoken123');

      expect(result.recipientName).toBeNull();
    });
  });
});
