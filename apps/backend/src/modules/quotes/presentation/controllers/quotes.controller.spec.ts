import { QuotesController } from './quotes.controller';
import type { ConfigService } from '@nestjs/config';
import type { ListQuotesUseCase } from '../../application/use-cases/list-quotes.use-case';
import type { GetQuoteUseCase } from '../../application/use-cases/get-quote.use-case';
import type { CreateQuoteUseCase } from '../../application/use-cases/create-quote.use-case';
import type { UpdateQuoteUseCase } from '../../application/use-cases/update-quote.use-case';
import type { DeleteQuoteUseCase } from '../../application/use-cases/delete-quote.use-case';
import type { SendQuoteUseCase } from '../../application/use-cases/send-quote.use-case';
import type { UpdateQuoteStatusUseCase } from '../../application/use-cases/update-quote-status.use-case';
import { Quote } from '../../domain/entities/quote.entity';
import type { QuoteListResult } from '../../domain/repositories/iquote.repository';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type {
  CreateQuoteDto,
  UpdateQuoteDto,
  UpdateQuoteStatusDto,
  SendQuoteDto,
  ListQuotesQuery,
} from '@delta/shared-types';

const APP_BASE_URL = 'https://app.test';
const SHARE_TOKEN = 'sharetoken0000000000000000000001';
const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const QUOTE_ID = 'qqqqqqqq-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-09-01T00:00:00Z');

function makeUser(sub = DOCTOR_ID): CurrentUserPayload {
  return { sub, email: 'doctor@test.com', role: 'doctor' };
}

function makeQuote(status: 'draft' | 'sent' = 'draft'): Quote {
  return Quote.create({
    id: QUOTE_ID,
    doctorId: DOCTOR_ID,
    quoteNumber: 'COT-0001',
    patientId: PATIENT_ID,
    leadId: null,
    status,
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

function makeController(): {
  controller: QuotesController;
  listUC: jest.Mocked<ListQuotesUseCase>;
  getUC: jest.Mocked<GetQuoteUseCase>;
  createUC: jest.Mocked<CreateQuoteUseCase>;
  updateUC: jest.Mocked<UpdateQuoteUseCase>;
  deleteUC: jest.Mocked<DeleteQuoteUseCase>;
  sendUC: jest.Mocked<SendQuoteUseCase>;
  statusUC: jest.Mocked<UpdateQuoteStatusUseCase>;
} {
  // Double-cast via unknown: NestJS use case classes carry injected private fields
  // that a plain { execute } stub can't satisfy without going through unknown.
  const listUC = { execute: jest.fn() } as unknown as jest.Mocked<ListQuotesUseCase>;
  const getUC = { execute: jest.fn() } as unknown as jest.Mocked<GetQuoteUseCase>;
  const createUC = { execute: jest.fn() } as unknown as jest.Mocked<CreateQuoteUseCase>;
  const updateUC = { execute: jest.fn() } as unknown as jest.Mocked<UpdateQuoteUseCase>;
  const deleteUC = { execute: jest.fn() } as unknown as jest.Mocked<DeleteQuoteUseCase>;
  const sendUC = { execute: jest.fn() } as unknown as jest.Mocked<SendQuoteUseCase>;
  const statusUC = { execute: jest.fn() } as unknown as jest.Mocked<UpdateQuoteStatusUseCase>;

  // The controller reads APP_BASE_URL (falling back to FRONTEND_URL) to build
  // share_url. A stub returning undefined would still pass every assertion below
  // while silently producing a link with no origin, so it resolves a real value.
  const config = {
    get: jest.fn((key: string) => (key === 'APP_BASE_URL' ? APP_BASE_URL : undefined)),
  } as unknown as jest.Mocked<ConfigService>;

  const controller = new QuotesController(
    listUC,
    getUC,
    createUC,
    updateUC,
    deleteUC,
    sendUC,
    statusUC,
    config,
  );

  return { controller, listUC, getUC, createUC, updateUC, deleteUC, sendUC, statusUC };
}

describe('QuotesController', () => {
  // ─── list ──────────────────────────────────────────────────────────────────
  describe('GET / (index)', () => {
    it('delegates to ListQuotesUseCase with doctorId from user.sub', async () => {
      const { controller, listUC } = makeController();

      const listResult: QuoteListResult = {
        items: [makeQuote()],
        total: 1,
        page: 1,
        limit: 20,
      };
      listUC.execute.mockResolvedValue(listResult);

      const query: ListQuotesQuery = { page: 1, limit: 20 };
      const result = await controller.index(query, makeUser());

      expect(listUC.execute).toHaveBeenCalledWith(DOCTOR_ID, query);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────
  describe('POST / (create)', () => {
    it('delegates to CreateQuoteUseCase and wraps result in envelope', async () => {
      const { controller, createUC } = makeController();
      const quote = makeQuote();
      createUC.execute.mockResolvedValue(quote);

      const dto: CreateQuoteDto = {
        patient_id: PATIENT_ID,
        lead_id: null,
        notes: '',
        discount_usd: 0,
        items: [
          {
            kind: 'product',
            source_id: null,
            name: 'A',
            description: '',
            quantity: 1,
            unit_price_usd: 100,
            sort_order: 0,
          },
        ],
      };

      const result = await controller.create(dto, makeUser());

      expect(createUC.execute).toHaveBeenCalledWith(dto, DOCTOR_ID);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(QUOTE_ID);
    });
  });

  // ─── show ──────────────────────────────────────────────────────────────────
  describe('GET /:id (show)', () => {
    it('delegates to GetQuoteUseCase with id and doctorId', async () => {
      const { controller, getUC } = makeController();
      const quote = makeQuote();
      getUC.execute.mockResolvedValue(quote);

      const result = await controller.show(QUOTE_ID, makeUser());

      expect(getUC.execute).toHaveBeenCalledWith(QUOTE_ID, DOCTOR_ID);
      expect(result.success).toBe(true);
      expect(result.data.quoteNumber).toBe('COT-0001');
    });

    it('builds share_url from the base URL when the quote has a share token', async () => {
      const { controller, getUC } = makeController();
      getUC.execute.mockResolvedValue(
        Quote.create({ ...makeQuote('sent'), shareToken: SHARE_TOKEN }),
      );

      const result = await controller.show(QUOTE_ID, makeUser());

      expect(result.data.share_token).toBe(SHARE_TOKEN);
      expect(result.data.share_url).toBe(`${APP_BASE_URL}/quotes/${SHARE_TOKEN}`);
    });

    it('leaves share_url null for a draft with no share token', async () => {
      // The frontend hides the "Copy link" button on null; returning a
      // token-less URL here would surface a link that 404s.
      const { controller, getUC } = makeController();
      getUC.execute.mockResolvedValue(makeQuote());

      const result = await controller.show(QUOTE_ID, makeUser());

      expect(result.data.share_token).toBeNull();
      expect(result.data.share_url).toBeNull();
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────
  describe('PUT /:id (update)', () => {
    it('delegates to UpdateQuoteUseCase', async () => {
      const { controller, updateUC } = makeController();
      const quote = makeQuote();
      updateUC.execute.mockResolvedValue(quote);

      const dto: UpdateQuoteDto = { notes: 'Updated' };
      const result = await controller.update(QUOTE_ID, dto, makeUser());

      expect(updateUC.execute).toHaveBeenCalledWith(QUOTE_ID, DOCTOR_ID, dto);
      expect(result.success).toBe(true);
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────
  describe('DELETE /:id (remove)', () => {
    it('delegates to DeleteQuoteUseCase and returns void', async () => {
      const { controller, deleteUC } = makeController();
      deleteUC.execute.mockResolvedValue(undefined);

      await expect(controller.remove(QUOTE_ID, makeUser())).resolves.toBeUndefined();
      expect(deleteUC.execute).toHaveBeenCalledWith(QUOTE_ID, DOCTOR_ID);
    });
  });

  // ─── send ──────────────────────────────────────────────────────────────────
  describe('POST /:id/send (send)', () => {
    it('delegates to SendQuoteUseCase with doctorId from user.sub', async () => {
      const { controller, sendUC } = makeController();
      const sentQuote = makeQuote('sent');
      sendUC.execute.mockResolvedValue(sentQuote);

      const dto: SendQuoteDto = {
        recipient_email: 'paciente@example.com',
        recipient_name: 'María Torres',
      };
      const result = await controller.send(QUOTE_ID, dto, makeUser());

      expect(sendUC.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteId: QUOTE_ID,
          doctorId: DOCTOR_ID,
          recipientEmail: 'paciente@example.com',
          recipientName: 'María Torres',
          // doctorName is NOT in the input — the use case fetches it from the profile
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('sent');
    });

    it('never lets the body override doctorId — only user.sub is trusted', async () => {
      const { controller, sendUC } = makeController();
      sendUC.execute.mockResolvedValue(makeQuote('sent'));

      const dto: SendQuoteDto = {};
      await controller.send(QUOTE_ID, dto, makeUser('attacker-sub'));

      const callArg = (sendUC.execute as jest.Mock).mock.calls[0][0] as Parameters<
        SendQuoteUseCase['execute']
      >[0];
      expect(callArg.doctorId).toBe('attacker-sub');
    });
  });

  // ─── status ────────────────────────────────────────────────────────────────
  describe('PUT /:id/status (updateQuoteStatus)', () => {
    it('delegates to UpdateQuoteStatusUseCase', async () => {
      const { controller, statusUC } = makeController();
      const quote = makeQuote('sent');
      statusUC.execute.mockResolvedValue(quote);

      const dto: UpdateQuoteStatusDto = { status: 'accepted' };
      const result = await controller.updateQuoteStatus(QUOTE_ID, dto, makeUser());

      expect(statusUC.execute).toHaveBeenCalledWith(QUOTE_ID, DOCTOR_ID, dto);
      expect(result.success).toBe(true);
    });
  });
});
