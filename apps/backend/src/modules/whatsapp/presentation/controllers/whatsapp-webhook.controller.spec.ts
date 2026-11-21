import { Test } from '@nestjs/testing';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { HandleWhatsAppWebhookUseCase } from '../../application/use-cases/handle-whatsapp-webhook.use-case';
import { createHmac } from 'crypto';
import type { Request } from 'express';

const WEBHOOK_SECRET = 'test-webhook-secret-key';

function makeReq(body: object, signature?: string): Partial<Request> & { rawBody?: Buffer } {
  const rawBody = Buffer.from(JSON.stringify(body));
  return {
    headers: {
      'x-zernio-signature':
        signature ?? `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')}`,
    },
    body,
    rawBody,
  };
}

describe('WhatsAppWebhookController', () => {
  let controller: WhatsAppWebhookController;
  let useCase: jest.Mocked<HandleWhatsAppWebhookUseCase>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [WhatsAppWebhookController],
      providers: [
        {
          provide: HandleWhatsAppWebhookUseCase,
          useValue: { execute: jest.fn().mockResolvedValue({ action: 'noop' }) },
        },
      ],
    }).compile();

    controller = module.get(WhatsAppWebhookController);
    useCase = module.get(HandleWhatsAppWebhookUseCase);

    process.env.ZERNIO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.ZERNIO_WEBHOOK_SECRET;
  });

  it('returns success true for a valid webhook', async () => {
    const body = { event: 'button_reply', buttonPayload: 'confirm:token' };
    const req = makeReq(body);

    const result = await controller.handleWebhook(req as Request, body);

    expect(result).toEqual({ success: true });
    expect(useCase.execute).toHaveBeenCalledWith(body);
  });

  it('throws 401 when ZERNIO_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.ZERNIO_WEBHOOK_SECRET;
    const body = {};
    const req = makeReq(body);

    await expect(controller.handleWebhook(req as Request, body)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws 401 when signature header is missing', async () => {
    const body = {};
    const req = { headers: {}, body, rawBody: Buffer.from('{}') } as Request & { rawBody: Buffer };

    await expect(controller.handleWebhook(req, body)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws 401 when signature is invalid', async () => {
    const body = { event: 'button_reply' };
    const req = makeReq(body, 'sha256=invalidhex');

    await expect(controller.handleWebhook(req as Request, body)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('always returns 200 (success: true) even when use case returns noop', async () => {
    useCase.execute.mockResolvedValue({ action: 'noop' });
    const body = { event: 'unknown' };
    const req = makeReq(body);

    const result = await controller.handleWebhook(req as Request, body);
    expect(result).toEqual({ success: true });
  });
});
