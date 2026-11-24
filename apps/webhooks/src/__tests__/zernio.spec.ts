/**
 * Unit tests for the Zernio webhook handler.
 *
 * All external I/O (fetch, IAM token) is injected and mocked — no network.
 * Sentry is not initialized (SENTRY_DSN absent) so its functions are no-ops.
 */

import { createHmac } from 'node:crypto';
import { handleZernioWebhook, type ZernioHandlerDeps } from '../handlers/zernio';

const SECRET = 'test-secret';
const BACKEND_URL = 'https://backend.example.com';

function sign(body: Buffer, secret = SECRET, prefix = ''): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `${prefix}${hex}`;
}

const mockGetToken = jest.fn<Promise<string>, [string]>().mockResolvedValue('mock-iam-token');
const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function deps(overrides?: Partial<ZernioHandlerDeps>): ZernioHandlerDeps {
  return {
    secret: SECRET,
    backendUrl: BACKEND_URL,
    getToken: mockGetToken,
    doFetch: mockFetch as typeof fetch,
    ...overrides,
  };
}

function okResponse(): Response {
  return { ok: true, status: 200 } as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleZernioWebhook — authentication', () => {
  const body = Buffer.from('{"id":"evt-1","event":"message.received"}');

  it('returns 401 when the signature header is missing', async () => {
    const result = await handleZernioWebhook(body, undefined, deps());
    expect(result.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 401 when the signature is invalid', async () => {
    const result = await handleZernioWebhook(body, 'bad-sig', deps());
    expect(result.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 401 when signed with the wrong secret', async () => {
    const badSig = sign(body, 'wrong-secret');
    const result = await handleZernioWebhook(body, badSig, deps());
    expect(result.status).toBe(401);
  });
});

describe('handleZernioWebhook — successful forwarding', () => {
  const body = Buffer.from('{"id":"evt-2","event":"message.received"}');

  it('returns 200 {received:true} when backend responds 2xx', async () => {
    const sig = sign(body);
    mockFetch.mockResolvedValueOnce(okResponse());

    const result = await handleZernioWebhook(body, sig, deps());

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true });
  });

  it('calls the backend with the correct URL and headers', async () => {
    const sig = sign(body);
    mockFetch.mockResolvedValueOnce(okResponse());

    await handleZernioWebhook(body, sig, deps());

    expect(mockFetch).toHaveBeenCalledWith(
      `${BACKEND_URL}/api/webhooks/zernio`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-zernio-signature': sig,
          Authorization: 'Bearer mock-iam-token',
        }),
        body,
      }),
    );
  });

  it('passes sha256= prefixed signature through to the backend unchanged', async () => {
    const sig = sign(body, SECRET, 'sha256=');
    mockFetch.mockResolvedValueOnce(okResponse());

    await handleZernioWebhook(body, sig, deps());

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs?.[1]?.headers as Record<string, string>;
    expect(headers['x-zernio-signature']).toBe(sig);
  });

  it('obtains the IAM token for the backend URL as audience', async () => {
    const sig = sign(body);
    mockFetch.mockResolvedValueOnce(okResponse());

    await handleZernioWebhook(body, sig, deps());

    expect(mockGetToken).toHaveBeenCalledWith(BACKEND_URL);
  });
});

describe('handleZernioWebhook — backend error responses', () => {
  const body = Buffer.from('{"id":"evt-3"}');

  it('returns 502 when backend returns 500', async () => {
    const sig = sign(body);
    mockFetch.mockResolvedValueOnce(errorResponse(500));

    const result = await handleZernioWebhook(body, sig, deps());
    expect(result.status).toBe(502);
  });

  it('returns 502 when backend returns 503', async () => {
    const sig = sign(body);
    mockFetch.mockResolvedValueOnce(errorResponse(503));

    const result = await handleZernioWebhook(body, sig, deps());
    expect(result.status).toBe(502);
  });

  it('returns 502 when backend returns 408 (retryable)', async () => {
    const sig = sign(body);
    mockFetch.mockResolvedValueOnce(errorResponse(408));

    const result = await handleZernioWebhook(body, sig, deps());
    expect(result.status).toBe(502);
  });

  it('returns 502 when backend returns 429 (retryable)', async () => {
    const sig = sign(body);
    mockFetch.mockResolvedValueOnce(errorResponse(429));

    const result = await handleZernioWebhook(body, sig, deps());
    expect(result.status).toBe(502);
  });

  it('returns 200 when backend returns 400 (non-retryable 4xx)', async () => {
    const sig = sign(body);
    mockFetch.mockResolvedValueOnce(errorResponse(400));

    const result = await handleZernioWebhook(body, sig, deps());
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true });
  });

  it('returns 200 when backend returns 422 (non-retryable 4xx)', async () => {
    const sig = sign(body);
    mockFetch.mockResolvedValueOnce(errorResponse(422));

    const result = await handleZernioWebhook(body, sig, deps());
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true });
  });
});

describe('handleZernioWebhook — network failures', () => {
  const body = Buffer.from('{"id":"evt-4"}');

  it('returns 502 on a timeout (TimeoutError)', async () => {
    const sig = sign(body);
    const timeoutErr = Object.assign(new Error('The operation timed out.'), {
      name: 'TimeoutError',
    });
    mockFetch.mockRejectedValueOnce(timeoutErr);

    const result = await handleZernioWebhook(body, sig, deps());
    expect(result.status).toBe(502);
  });

  it('returns 502 on a timeout (AbortError)', async () => {
    const sig = sign(body);
    const abortErr = Object.assign(new Error('This operation was aborted.'), {
      name: 'AbortError',
    });
    mockFetch.mockRejectedValueOnce(abortErr);

    const result = await handleZernioWebhook(body, sig, deps());
    expect(result.status).toBe(502);
  });

  it('returns 502 on a generic network error', async () => {
    const sig = sign(body);
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await handleZernioWebhook(body, sig, deps());
    expect(result.status).toBe(502);
  });

  it('returns 502 when the IAM token fetch fails', async () => {
    const sig = sign(body);
    const failToken = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValueOnce(new Error('metadata server unreachable'));

    const result = await handleZernioWebhook(body, sig, deps({ getToken: failToken }));
    expect(result.status).toBe(502);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
