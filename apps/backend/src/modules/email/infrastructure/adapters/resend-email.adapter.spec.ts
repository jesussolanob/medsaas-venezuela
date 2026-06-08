import { ResendEmailAdapter } from './resend-email.adapter';
import { EmailSendError } from '../../domain/errors/email.error';
import type { ConfigService } from '@nestjs/config';

// Mock the Resend SDK so no real network calls are made during tests.
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    EMAIL_DRIVER: 'resend',
    RESEND_API_KEY: 'test-api-key',
    EMAIL_FROM: 'noreply@delta.test',
  };
  const values = { ...defaults, ...overrides };

  return {
    get: (key: string, defaultValue?: string): string =>
      values[key] ?? defaultValue ?? '',
  } as unknown as ConfigService;
}

describe('ResendEmailAdapter', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  describe('send — success path', () => {
    it('calls resend.emails.send with the correct payload and returns the id', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'msg_123' }, error: null });

      const adapter = new ResendEmailAdapter(makeConfig());
      const result = await adapter.send({
        to: 'recipient@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      });

      expect(result).toEqual({ id: 'msg_123' });
      expect(mockSend).toHaveBeenCalledWith({
        from: 'noreply@delta.test',
        to: ['recipient@example.com'],
        subject: 'Hello',
        html: '<p>Hello</p>',
      });
    });

    it('uses the override from address when provided', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'msg_456' }, error: null });

      const adapter = new ResendEmailAdapter(makeConfig());
      await adapter.send({
        to: 'recipient@example.com',
        subject: 'Override from',
        html: '<p>hi</p>',
        from: 'custom@domain.com',
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'custom@domain.com' }),
      );
    });

    it('includes the text field when provided', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'msg_789' }, error: null });

      const adapter = new ResendEmailAdapter(makeConfig());
      await adapter.send({
        to: 'recipient@example.com',
        subject: 'With text',
        html: '<p>hi</p>',
        text: 'hi',
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'hi' }),
      );
    });

    it('normalizes a string recipient to an array', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'msg_abc' }, error: null });

      const adapter = new ResendEmailAdapter(makeConfig());
      await adapter.send({
        to: 'single@example.com',
        subject: 'Single',
        html: '<p>Single</p>',
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: ['single@example.com'] }),
      );
    });

    it('passes an array of recipients through', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'msg_multi' }, error: null });

      const adapter = new ResendEmailAdapter(makeConfig());
      await adapter.send({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Multi',
        html: '<p>Multi</p>',
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: ['a@example.com', 'b@example.com'] }),
      );
    });
  });

  describe('send — error path', () => {
    it('throws EmailSendError when Resend returns an error', async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: {
          name: 'invalid_api_key',
          message: 'API key is invalid',
          statusCode: 401,
        },
      });

      const adapter = new ResendEmailAdapter(makeConfig());

      await expect(
        adapter.send({
          to: 'recipient@example.com',
          subject: 'Fail',
          html: '<p>Fail</p>',
        }),
      ).rejects.toBeInstanceOf(EmailSendError);
    });

    it('thrown EmailSendError has HTTP 502 status', async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: {
          name: 'application_error',
          message: 'Something went wrong',
          statusCode: 500,
        },
      });

      const adapter = new ResendEmailAdapter(makeConfig());

      await expect(
        adapter.send({
          to: 'recipient@example.com',
          subject: 'Fail',
          html: '<p>Fail</p>',
        }),
      ).rejects.toMatchObject({ httpStatus: 502 });
    });

    it('throws EmailSendError when API key is missing', async () => {
      const adapter = new ResendEmailAdapter(makeConfig({ RESEND_API_KEY: '' }));

      await expect(
        adapter.send({
          to: 'recipient@example.com',
          subject: 'No key',
          html: '<p>No key</p>',
        }),
      ).rejects.toBeInstanceOf(EmailSendError);

      // SDK should NOT be called when there is no client
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
