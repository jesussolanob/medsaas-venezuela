/**
 * Raw body reader with a configurable byte limit.
 * Rejects with Error('body too large') when the limit is exceeded.
 */

import type { IncomingMessage } from 'node:http';

export const MAX_BODY_BYTES = 512 * 1024; // 512 KB

export function readBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
