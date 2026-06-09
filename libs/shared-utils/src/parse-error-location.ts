export interface ErrorLocation {
  file: string;
  method: string;
}

/**
 * Extracts { file, method } from the first application frame in an Error stack.
 *
 * Matches frames of the form:
 *   at SomeClass.method (/absolute/path/to/some.service.ts:42:10)
 *   at someFunction (/absolute/path/to/some.util.ts:7:3)
 *
 * Returns { file: 'unknown', method: 'unknown' } when parsing fails or the
 * error has no stack.
 */
export function parseErrorLocation(error: Error): ErrorLocation {
  const { stack } = error;
  if (!stack) {
    return { file: 'unknown', method: 'unknown' };
  }

  const lines = stack.split('\n');
  // Skip the first line (it is the error message itself).
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();

    // Match: "at <method> (<path>:<line>:<col>)" or "at async <method> (<path>:<line>:<col>)"
    const withMethod =
      /^at\s+(?:async\s+)?([\w$.[\]<>]+(?:\s+\[as\s+\w+\])?)\s+\((.+\.ts):\d+:\d+\)$/.exec(
        trimmed,
      );
    if (withMethod) {
      const method = withMethod[1] ?? 'unknown';
      const fullPath = withMethod[2] ?? '';
      return { file: extractFileName(fullPath), method };
    }

    const withoutMethod = /^at\s+(.+\.ts):\d+:\d+$/.exec(trimmed);
    if (withoutMethod) {
      const fullPath = withoutMethod[1] ?? '';
      return { file: extractFileName(fullPath), method: 'anonymous' };
    }
  }

  return { file: 'unknown', method: 'unknown' };
}

function extractFileName(fullPath: string): string {
  const segments = fullPath.replace(/\\/g, '/').split('/');
  return segments[segments.length - 1] ?? 'unknown';
}
