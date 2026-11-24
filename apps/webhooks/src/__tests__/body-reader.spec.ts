import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { readBody, MAX_BODY_BYTES } from '../lib/body-reader';

function makeReadable(chunks: Buffer[]): IncomingMessage {
  return Readable.from(chunks) as unknown as IncomingMessage;
}

describe('readBody', () => {
  it('reads and concatenates body chunks below the limit', async () => {
    const data = Buffer.from('{"hello":"world"}');
    const req = makeReadable([data]);
    const result = await readBody(req);
    expect(result).toEqual(data);
  });

  it('handles multi-chunk bodies', async () => {
    const a = Buffer.from('{"a":');
    const b = Buffer.from('"b"}');
    const req = makeReadable([a, b]);
    const result = await readBody(req);
    expect(result).toEqual(Buffer.concat([a, b]));
  });

  it('rejects when cumulative size exceeds MAX_BODY_BYTES', async () => {
    // Single chunk that is 1 byte over the limit.
    const over = Buffer.alloc(MAX_BODY_BYTES + 1, 0x41);
    const req = makeReadable([over]);
    await expect(readBody(req)).rejects.toThrow('body too large');
  });

  it('accepts a body exactly at the limit', async () => {
    const exact = Buffer.alloc(MAX_BODY_BYTES, 0x42);
    const req = makeReadable([exact]);
    const result = await readBody(req);
    expect(result.length).toBe(MAX_BODY_BYTES);
  });

  it('uses a custom maxBytes when provided', async () => {
    const data = Buffer.alloc(100, 0x43);
    const req = makeReadable([data]);
    await expect(readBody(req, 50)).rejects.toThrow('body too large');
  });
});
