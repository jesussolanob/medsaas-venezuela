import { ZernioWhatsAppSenderAdapter } from './zernio-whatsapp-sender.adapter';
import { ConfigService } from '@nestjs/config';

function makeAdapter(overrides: Record<string, string> = {}): ZernioWhatsAppSenderAdapter {
  const defaults: Record<string, string> = {
    ZERNIO_API_KEY: 'test-api-key',
    ZERNIO_WHATSAPP_ACCOUNT_ID: '6afc5b492728c5ed0bbdb5f7',
    WHATSAPP_ENABLED: 'true',
    WHATSAPP_ALLOWLIST: '',
    ...overrides,
  };
  const config = { get: (k: string) => defaults[k] ?? null } as unknown as ConfigService;
  return new ZernioWhatsAppSenderAdapter(config);
}

global.fetch = jest.fn();

describe('ZernioWhatsAppSenderAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('allowlist gating', () => {
    it('returns null when WHATSAPP_ENABLED=false', async () => {
      const adapter = makeAdapter({ WHATSAPP_ENABLED: 'false' });
      const result = await adapter.sendTemplate({
        participantId: '+584141234567',
        templateName: 'recordatorio_cita_24h',
        templateLanguage: 'es',
        templateParams: ['Juan', 'Dr. García', '10:00 a. m.', 'Clínica Centro'],
      });
      expect(result).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns null when number is not in allowlist', async () => {
      const adapter = makeAdapter({ WHATSAPP_ALLOWLIST: '584141234571' });
      const result = await adapter.sendTemplate({
        participantId: '+584141234567',
        templateName: 'recordatorio_cita_24h',
        templateLanguage: 'es',
        templateParams: ['Juan', 'Dr. García', '10:00 a. m.', 'Clínica Centro'],
      });
      expect(result).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('sends when number IS in allowlist', async () => {
      const adapter = makeAdapter({ WHATSAPP_ALLOWLIST: '584141234567' });
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { messageId: 'msg1', conversationId: 'conv1', participantId: '+584141234567' },
        }),
        status: 200,
      });
      const result = await adapter.sendTemplate({
        participantId: '+584141234567',
        templateName: 'recordatorio_cita_24h',
        templateLanguage: 'es',
        templateParams: ['Juan', 'Dr. García', '10:00 a. m.', 'Clínica Centro'],
      });
      expect(result?.messageId).toBe('msg1');
    });

    it('sends to any number when allowlist is empty', async () => {
      const adapter = makeAdapter({ WHATSAPP_ALLOWLIST: '' });
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { messageId: 'msg2', conversationId: 'conv2', participantId: '+584151234567' },
        }),
        status: 200,
      });
      const result = await adapter.sendTemplate({
        participantId: '+584151234567',
        templateName: 'recordatorio_cita_24h',
        templateLanguage: 'es',
        templateParams: ['Pedro', 'Dra. López', '2:00 p. m.', 'Consultorio Norte'],
      });
      expect(result?.conversationId).toBe('conv2');
    });
  });

  describe('request shape', () => {
    it('sends correct request body for sendTemplate', async () => {
      const adapter = makeAdapter();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { messageId: 'm1', conversationId: 'c1', participantId: '+584141234567' },
        }),
        status: 200,
      });

      await adapter.sendTemplate({
        participantId: '584141234567', // without +
        templateName: 'recordatorio_cita_24h',
        templateLanguage: 'es',
        templateParams: ['Juan', 'Dr. García', '10:00 a. m.', 'Clínica'],
        templateButtonParams: [
          {
            index: 0,
            subType: 'quick_reply',
            parameters: [{ type: 'payload', payload: 'confirm:token' }],
          },
        ],
      });

      const [url, opts] = (fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.zernio.com/v1/inbox/conversations');
      expect(opts.method).toBe('POST');
      const bodyParsed = JSON.parse(opts.body as string);
      expect(bodyParsed.accountId).toBe('6afc5b492728c5ed0bbdb5f7');
      expect(bodyParsed.participantId).toBe('+584141234567'); // normalized
      expect(bodyParsed.templateName).toBe('recordatorio_cita_24h');
      expect(bodyParsed.templateButtonParams).toHaveLength(1);
    });
  });

  describe('retry logic', () => {
    it('retries once on 5xx and succeeds', async () => {
      const adapter = makeAdapter();
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Error' })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: { messageId: 'm1', conversationId: 'c1', participantId: '+584141234567' },
          }),
          status: 200,
        });

      const result = await adapter.sendTemplate({
        participantId: '+584141234567',
        templateName: 'recordatorio_cita_24h',
        templateLanguage: 'es',
        templateParams: ['a', 'b', 'c', 'd'],
      });
      expect(result?.messageId).toBe('m1');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('throws WhatsAppSendFailedError when both attempts fail with 4xx', async () => {
      const adapter = makeAdapter();
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'INVALID_TEMPLATE_PARAMS',
      });

      await expect(
        adapter.sendTemplate({
          participantId: '+584141234567',
          templateName: 'bad_template',
          templateLanguage: 'es',
          templateParams: [],
        }),
      ).rejects.toThrow('HTTP 400');
    });
  });

  describe('sendText', () => {
    it('sends a free-text reply to an existing conversation', async () => {
      const adapter = makeAdapter();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
        status: 200,
      });

      const result = await adapter.sendText({
        conversationId: 'conv123',
        text: 'Este número solo envía recordatorios.',
      });
      expect(result).toBe(true);
      const [url] = (fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v1/inbox/conversations/conv123/messages');
    });

    it('returns false when WHATSAPP_ENABLED=false', async () => {
      const adapter = makeAdapter({ WHATSAPP_ENABLED: 'false' });
      const result = await adapter.sendText({ conversationId: 'c1', text: 'hi' });
      expect(result).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
