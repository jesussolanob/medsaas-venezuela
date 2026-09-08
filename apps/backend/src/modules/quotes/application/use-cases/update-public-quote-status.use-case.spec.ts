import { UpdatePublicQuoteStatusUseCase } from './update-public-quote-status.use-case';
import type { IQuoteRepository } from '../../domain/repositories/iquote.repository';
import type { IDoctorProfileRepository } from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { DoctorProfile } from '../../../doctor-settings/domain/entities/doctor-profile.entity';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { Patient } from '../../../patients/domain/entities/patient.entity';
import type { ILeadRepository } from '../../../leads/domain/repositories/lead.repository';
import type { Lead } from '../../../leads/domain/entities/lead.entity';
import type { MailerService } from '../../../email/application/services/mailer.service';
import { Quote } from '../../domain/entities/quote.entity';
import { QuoteLinkExpiredError } from '../../domain/errors/quote-link-expired.error';
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
    subtotalUsd: 100,
    discountType: 'amount',
    discountValue: 0,
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
    // Only ever called after a successful findQuoteByValidToken, so `quote` is non-null here.
    updateStatus: jest
      .fn()
      .mockImplementation((_id, doctorId, status) =>
        Promise.resolve(Quote.create({ ...quote!, doctorId, status })),
      ),
    delete: jest.fn(),
    findItemsByQuoteId: jest.fn(),
  };
}

function makeDoctorProfileRepo(
  email: string | null = 'doctor@example.com',
): jest.Mocked<IDoctorProfileRepository> {
  const profile = email ? ({ fullName: 'Dr. García', email } as unknown as DoctorProfile) : null;
  return {
    findByDoctorId: jest.fn().mockResolvedValue(profile),
    update: jest.fn(),
    updateExchangeRate: jest.fn(),
    markOnboardingCompleted: jest.fn(),
    updateBlocksLayout: jest.fn(),
    countUpcomingAppointments: jest.fn(),
    deactivateOwnAccount: jest.fn(),
    findPlanSnapshot: jest.fn(),
    scheduleOwnAccountDeactivation: jest.fn(),
    applyExpiredScheduledDeactivations: jest.fn(),
  } as unknown as jest.Mocked<IDoctorProfileRepository>;
}

function makePatientRepo(patient: Partial<Patient> | null = null): jest.Mocked<IPatientRepository> {
  return {
    findById: jest.fn().mockResolvedValue(patient),
    findByCedulaHash: jest.fn(),
    findByEmailHash: jest.fn(),
    list: jest.fn(),
    findAllByDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    logReveal: jest.fn(),
  };
}

function makeLeadRepo(lead: Partial<Lead> | null = null): jest.Mocked<ILeadRepository> {
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn().mockResolvedValue(lead),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
}

function makeMailer(): jest.Mocked<MailerService> {
  return {
    sendTemplate: jest.fn().mockResolvedValue({ id: 'msg-id' }),
  } as unknown as jest.Mocked<MailerService>;
}

function makeUseCase(
  repo: jest.Mocked<IQuoteRepository>,
  doctorProfileRepo = makeDoctorProfileRepo(),
  patientRepo = makePatientRepo(),
  leadRepo = makeLeadRepo(),
  mailer = makeMailer(),
): UpdatePublicQuoteStatusUseCase {
  return new UpdatePublicQuoteStatusUseCase(repo, doctorProfileRepo, patientRepo, leadRepo, mailer);
}

describe('UpdatePublicQuoteStatusUseCase', () => {
  describe('token validation', () => {
    it('throws QuoteLinkExpiredError for a missing/expired/revoked token', async () => {
      const repo = makeRepo(null);
      const uc = makeUseCase(repo);

      await expect(uc.execute('badtoken', { status: 'accepted' })).rejects.toThrow(
        QuoteLinkExpiredError,
      );
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('state machine', () => {
    it('allows sent → accepted', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent' }));
      const uc = makeUseCase(repo);

      const result = await uc.execute('tok', { status: 'accepted' });

      expect(result.status).toBe('accepted');
      expect(repo.updateStatus).toHaveBeenCalledWith(QUOTE_ID, DOCTOR_ID, 'accepted', 'sent');
    });

    it('allows sent → rejected', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent' }));
      const uc = makeUseCase(repo);

      const result = await uc.execute('tok', { status: 'rejected' });

      expect(result.status).toBe('rejected');
    });

    it('rejects draft → accepted with QuoteInvalidStatusTransitionError', async () => {
      const repo = makeRepo(makeQuote({ status: 'draft' }));
      const uc = makeUseCase(repo);

      await expect(uc.execute('tok', { status: 'accepted' })).rejects.toThrow(
        QuoteInvalidStatusTransitionError,
      );
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects an already-accepted quote from being accepted again', async () => {
      const repo = makeRepo(makeQuote({ status: 'accepted' }));
      const uc = makeUseCase(repo);

      await expect(uc.execute('tok', { status: 'accepted' })).rejects.toThrow(
        QuoteInvalidStatusTransitionError,
      );
    });

    it('rejects an expired quote from being accepted', async () => {
      const repo = makeRepo(makeQuote({ status: 'expired' }));
      const uc = makeUseCase(repo);

      await expect(uc.execute('tok', { status: 'accepted' })).rejects.toThrow(
        QuoteInvalidStatusTransitionError,
      );
    });
  });

  describe('anti-IDOR: doctorId always comes from the token-resolved quote', () => {
    it('passes quote.doctorId to updateStatus, never anything from the request', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent', doctorId: 'foreign-doctor' }));
      const uc = makeUseCase(repo);

      await uc.execute('tok', { status: 'accepted' });

      expect(repo.updateStatus).toHaveBeenCalledWith(
        QUOTE_ID,
        'foreign-doctor',
        'accepted',
        'sent',
      );
    });
  });

  describe('doctor notification on acceptance', () => {
    it('emails the doctor with quoteNumber, recipient name, and total when accepted', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent', patientId: PATIENT_ID, leadId: null }));
      const doctorProfileRepo = makeDoctorProfileRepo('doctor@example.com');
      const patientRepo = makePatientRepo({ fullName: 'Juana Pérez' } as Patient);
      const mailer = makeMailer();
      const uc = makeUseCase(repo, doctorProfileRepo, patientRepo, makeLeadRepo(), mailer);

      await uc.execute('tok', { status: 'accepted' });

      expect(mailer.sendTemplate).toHaveBeenCalledWith(
        'quote_accepted_doctor',
        'doctor@example.com',
        expect.objectContaining({
          quoteNumber: 'PRE-0001',
          recipientName: 'Juana Pérez',
          totalUsd: '100.00',
        }),
        { type: 'doctor', id: DOCTOR_ID },
      );
    });

    it('resolves the lead name when the quote targets a lead', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent', patientId: null, leadId: LEAD_ID }));
      const leadRepo = makeLeadRepo({ name: 'Carlos', lastName: 'Mendoza' } as Lead);
      const mailer = makeMailer();
      const uc = makeUseCase(repo, makeDoctorProfileRepo(), makePatientRepo(), leadRepo, mailer);

      await uc.execute('tok', { status: 'accepted' });

      expect(mailer.sendTemplate).toHaveBeenCalledWith(
        'quote_accepted_doctor',
        expect.any(String),
        expect.objectContaining({ recipientName: 'Carlos Mendoza' }),
        expect.any(Object),
      );
    });

    it('does NOT notify the doctor when the quote is rejected', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent' }));
      const mailer = makeMailer();
      const uc = makeUseCase(
        repo,
        makeDoctorProfileRepo(),
        makePatientRepo(),
        makeLeadRepo(),
        mailer,
      );

      await uc.execute('tok', { status: 'rejected' });

      expect(mailer.sendTemplate).not.toHaveBeenCalled();
    });

    it('does not throw when the doctor has no email on file', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent' }));
      const doctorProfileRepo = makeDoctorProfileRepo(null);
      const mailer = makeMailer();
      const uc = makeUseCase(repo, doctorProfileRepo, makePatientRepo(), makeLeadRepo(), mailer);

      const result = await uc.execute('tok', { status: 'accepted' });

      expect(result.status).toBe('accepted');
      expect(mailer.sendTemplate).not.toHaveBeenCalled();
    });

    it('does not throw and still returns the accepted quote when the notification email fails', async () => {
      const repo = makeRepo(makeQuote({ status: 'sent' }));
      const mailer = makeMailer();
      (mailer.sendTemplate as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
      const uc = makeUseCase(
        repo,
        makeDoctorProfileRepo(),
        makePatientRepo(),
        makeLeadRepo(),
        mailer,
      );

      const result = await uc.execute('tok', { status: 'accepted' });

      expect(result.status).toBe('accepted');
    });
    /**
     * Dos respuestas casi simultáneas sobre el mismo enlace: el paciente con el
     * presupuesto abierto en dos pestañas, o el enlace reenviado a dos personas.
     *
     * La transición se valida en memoria sobre una lectura previa, así que ambas
     * pueden leer 'sent' y pasar el chequeo. Lo que cierra la carrera es que el
     * UPDATE lleve el estado esperado en el WHERE: la segunda afecta 0 filas.
     */
    describe('dos respuestas a la vez', () => {
      it('le pasa al repositorio el estado que leyó, para que el UPDATE lo verifique', async () => {
        const repo = makeRepo(makeQuote({ status: 'sent' }));
        const uc = makeUseCase(repo);

        await uc.execute('tok', { status: 'accepted' });

        // El 4º argumento es el estado esperado: sin él, la segunda respuesta
        // pisaría a la primera sin que nadie viera un error.
        expect(repo.updateStatus).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          'accepted',
          'sent',
        );
      });

      it('si el repositorio rechaza la transición, no le avisa al especialista', async () => {
        const repo = makeRepo(makeQuote({ status: 'sent' }));
        repo.updateStatus.mockRejectedValue(
          new QuoteInvalidStatusTransitionError('rejected', 'accepted'),
        );
        const mailer = makeMailer();
        const uc = makeUseCase(repo, undefined, undefined, undefined, mailer);

        await expect(uc.execute('tok', { status: 'accepted' })).rejects.toThrow(
          QuoteInvalidStatusTransitionError,
        );
        // Perdió la carrera: avisarle "te aceptaron" sería mentirle al especialista.
        expect(mailer.sendTemplate).not.toHaveBeenCalled();
      });
    });
  });
});
