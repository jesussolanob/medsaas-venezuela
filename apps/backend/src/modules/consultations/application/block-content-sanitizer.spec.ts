/**
 * Unit tests for BlockContentSanitizer.
 *
 * `sanitize-html` depends on `htmlparser2@12` which is ESM-only. Jest runs in
 * CJS mode, so we provide a CJS-compatible mock that reproduces the key
 * behaviors needed for these tests. The real XSS stripping is exercised by
 * sanitize-html's own test suite; here we test our wrapper's orchestration:
 *   - string values go through the sanitizer
 *   - non-string values pass through untouched
 *   - size cap is enforced (BlocksSnapshotTooLargeError)
 *   - the result is always a NEW object (immutable)
 *
 * Integration tests that invoke the real sanitize-html (no mock) would require
 * a Jest ESM transform setup and are out of scope for this unit-test suite.
 */
import { BlocksSnapshotTooLargeError } from '../domain/errors/blocks-snapshot-too-large.error';
import { BlocksSnapshotTooDeepError } from '../domain/errors/blocks-snapshot-too-deep.error';

// Provide a CJS-compatible mock for sanitize-html before any import of the SUT.
// The mock strips <script>, removes tag attributes (onclick, style, href), and
// strips disallowed tags while keeping their text content — a simplified but
// representative subset of the real library's behaviour.
jest.mock('sanitize-html', () => {
  // Simple tag stripper: keeps text inside allowed tags, removes everything else.
  const ALLOWED_TAGS = new Set([
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'pre',
    'code',
    'hr',
    'span',
  ]);

  const mockSanitize = (input: string): string => {
    if (typeof input !== 'string') return input as unknown as string;
    let result = input;
    // Strip disallowed tags (script, img, a, div, etc.) including their content for script.
    result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    // Remove tag attributes (simplistic — strips everything after the tag name up to '>').
    result = result.replace(/<([a-z][a-z0-9]*)\b[^>]*>/gi, (_m: string, tag: string) => {
      const lc = tag.toLowerCase();
      return ALLOWED_TAGS.has(lc) ? `<${lc}>` : '';
    });
    // Strip remaining closing tags for disallowed elements.
    result = result.replace(/<\/([a-z][a-z0-9]*)>/gi, (_m: string, tag: string) => {
      const lc = tag.toLowerCase();
      return ALLOWED_TAGS.has(lc) ? `</${lc}>` : '';
    });
    return result;
  };

  // Default export mock.
  const fn = jest.fn(mockSanitize);
  // sanitize-html exports as default; Jest needs `__esModule` for interop.
  (fn as unknown as Record<string, unknown>)['default'] = fn;
  return fn;
});

// Import AFTER the mock is registered.
import { BlockContentSanitizer } from './block-content-sanitizer';
import sanitizeHtml from 'sanitize-html';

const mockSanitize = sanitizeHtml as jest.MockedFunction<typeof sanitizeHtml>;

describe('BlockContentSanitizer', () => {
  let sanitizer: BlockContentSanitizer;

  beforeEach(() => {
    sanitizer = new BlockContentSanitizer();
    mockSanitize.mockClear();
  });

  describe('sanitizeSnapshot', () => {
    it('calls sanitize-html on string values', () => {
      sanitizer.sanitizeSnapshot({ notes: '<p>text</p>' });
      expect(mockSanitize).toHaveBeenCalledWith('<p>text</p>', expect.any(Object));
    });

    it('does NOT call sanitize-html on non-string values', () => {
      sanitizer.sanitizeSnapshot({ count: 3, flag: true, nothing: null });
      expect(mockSanitize).not.toHaveBeenCalled();
    });

    it('strips script tags via the sanitizer', () => {
      const result = sanitizer.sanitizeSnapshot({
        notes: '<script>alert("xss")</script>important note',
      });
      expect(result['notes']).not.toContain('<script>');
      expect(result['notes']).toContain('important note');
    });

    it('strips event handler attributes (onclick) from allowed tags', () => {
      const result = sanitizer.sanitizeSnapshot({
        notes: '<p onclick="evil()">paragraph</p>',
      });
      // After mock sanitization, the tag survives but the attribute is gone.
      expect(result['notes']).toContain('<p>');
      expect(result['notes']).not.toContain('onclick');
    });

    it('strips disallowed tags (img, a) but keeps text content', () => {
      const result = sanitizer.sanitizeSnapshot({
        diagnosis: '<img src="x" onerror="stealCookies()">diagnosis text',
      });
      expect(result['diagnosis']).not.toContain('<img');
      expect(result['diagnosis']).not.toContain('onerror');
    });

    it('preserves allowed tags (strong, ul, li)', () => {
      const result = sanitizer.sanitizeSnapshot({
        notes: '<strong>important</strong>',
      });
      expect(result['notes']).toContain('<strong>important</strong>');
    });

    it('leaves number values unchanged (no sanitize call)', () => {
      const result = sanitizer.sanitizeSnapshot({ count: 42 } as Record<string, unknown>);
      expect(result['count']).toBe(42);
      expect(mockSanitize).not.toHaveBeenCalled();
    });

    it('leaves boolean values unchanged', () => {
      const result = sanitizer.sanitizeSnapshot({ flag: false } as Record<string, unknown>);
      expect(result['flag']).toBe(false);
    });

    it('leaves null values unchanged', () => {
      const result = sanitizer.sanitizeSnapshot({ field: null } as Record<string, unknown>);
      expect(result['field']).toBeNull();
    });

    it('recursively sanitizes string values inside a nested object (not left unchanged)', () => {
      const obj = { nested: '<p>value</p>' };
      const result = sanitizer.sanitizeSnapshot({ data: obj } as Record<string, unknown>);
      // A NEW object is returned (immutable) — the nested string went through sanitize-html.
      expect(result['data']).not.toBe(obj);
      expect(mockSanitize).toHaveBeenCalledWith('<p>value</p>', expect.any(Object));
    });

    it('recursively sanitizes each string item inside an array', () => {
      const arr = ['<p>one</p>', '<p>two</p>'];
      const result = sanitizer.sanitizeSnapshot({ list: arr } as Record<string, unknown>);
      expect(result['list']).not.toBe(arr);
      expect(mockSanitize).toHaveBeenCalledWith('<p>one</p>', expect.any(Object));
      expect(mockSanitize).toHaveBeenCalledWith('<p>two</p>', expect.any(Object));
    });

    it('leaves an array of numbers unchanged in value (new array, same values)', () => {
      const arr = [1, 2, 3];
      const result = sanitizer.sanitizeSnapshot({ list: arr } as Record<string, unknown>);
      expect(result['list']).toEqual([1, 2, 3]);
      expect(mockSanitize).not.toHaveBeenCalled();
    });

    it('returns a new object (immutable — does not mutate input)', () => {
      const input = { notes: '<p>text</p>' };
      const result = sanitizer.sanitizeSnapshot(input);
      expect(result).not.toBe(input);
    });

    it('sanitizes multiple string keys independently', () => {
      sanitizer.sanitizeSnapshot({
        notes: '<p>note</p>',
        diagnosis: '<strong>dx</strong>',
        count: 3,
      } as Record<string, unknown>);
      expect(mockSanitize).toHaveBeenCalledTimes(2);
    });

    it('throws BlocksSnapshotTooLargeError when payload exceeds 300 000 chars', () => {
      // JSON.stringify({big: "A".repeat(N)}) ≈ 10 + N chars → need N > 299 990.
      const bigString = 'A'.repeat(300_000);
      expect(() => sanitizer.sanitizeSnapshot({ big: bigString })).toThrow(
        BlocksSnapshotTooLargeError,
      );
    });

    it('does NOT throw when payload is exactly at the 300 000 char limit', () => {
      // JSON.stringify({a: "X".repeat(N)}) = 8 + N chars
      // 8 + N = 300_000 → N = 299_992 — safe.
      const atLimit = 'X'.repeat(299_992);
      expect(() => sanitizer.sanitizeSnapshot({ a: atLimit })).not.toThrow();
    });

    it('handles an empty snapshot without throwing', () => {
      const result = sanitizer.sanitizeSnapshot({});
      expect(result).toEqual({});
      expect(mockSanitize).not.toHaveBeenCalled();
    });

    it('includes the actual length in BlocksSnapshotTooLargeError', () => {
      const bigString = 'A'.repeat(300_000);
      let caught: BlocksSnapshotTooLargeError | null = null;
      try {
        sanitizer.sanitizeSnapshot({ big: bigString });
      } catch (e) {
        caught = e as BlocksSnapshotTooLargeError;
      }
      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('BLOCKS_SNAPSHOT_TOO_LARGE');
      // The message should mention the actual char count.
      expect(caught!.message).toContain('300');
    });

    // -------------------------------------------------------------------------
    // Recursive sanitization — arrays, nested objects, and the depth cap
    // -------------------------------------------------------------------------

    it('sanitizes an array of strings containing malicious HTML', () => {
      const result = sanitizer.sanitizeSnapshot({
        items: ['<script>alert(1)</script>safe one', '<p onclick="evil()">safe two</p>'],
      });
      const items = result['items'] as string[];
      expect(items[0]).not.toContain('<script>');
      expect(items[0]).toContain('safe one');
      expect(items[1]).not.toContain('onclick');
      expect(items[1]).toContain('safe two');
    });

    it('sanitizes an array nested inside an object', () => {
      const result = sanitizer.sanitizeSnapshot({
        block: {
          label: 'title',
          options: ['<script>alert(1)</script>opt-a', '<strong>opt-b</strong>'],
        },
      });
      const block = result['block'] as { label: string; options: string[] };
      expect(block.label).toBe('title');
      expect(block.options[0]).not.toContain('<script>');
      expect(block.options[0]).toContain('opt-a');
      expect(block.options[1]).toContain('<strong>opt-b</strong>');
    });

    it('sanitizes an object nested inside an array', () => {
      const result = sanitizer.sanitizeSnapshot({
        rows: [{ note: '<script>alert(1)</script>row one' }, { note: '<em>row two</em>' }],
      });
      const rows = result['rows'] as Array<{ note: string }>;
      expect(rows[0]!.note).not.toContain('<script>');
      expect(rows[0]!.note).toContain('row one');
      expect(rows[1]!.note).toBe('<em>row two</em>');
    });

    it('leaves the top-level string behavior untouched when mixed with nested arrays/objects', () => {
      const result = sanitizer.sanitizeSnapshot({
        notes: '<strong>top level</strong>',
        items: ['<em>nested</em>'],
      });
      expect(result['notes']).toBe('<strong>top level</strong>');
      expect((result['items'] as string[])[0]).toBe('<em>nested</em>');
    });

    it('throws BlocksSnapshotTooDeepError when nesting exceeds the recursion cap', () => {
      // Build a structure nested deeper than MAX_RECURSION_DEPTH (10):
      // { level: { level: { level: ... 'x' } } } — 12 levels deep.
      let deepest: unknown = 'x';
      for (let i = 0; i < 12; i++) {
        deepest = { level: deepest };
      }
      const payload = { root: deepest } as Record<string, unknown>;

      expect(() => sanitizer.sanitizeSnapshot(payload)).toThrow(BlocksSnapshotTooDeepError);
    });

    it('includes the max depth in BlocksSnapshotTooDeepError', () => {
      let deepest: unknown = 'x';
      for (let i = 0; i < 12; i++) {
        deepest = { level: deepest };
      }
      const payload = { root: deepest } as Record<string, unknown>;

      let caught: BlocksSnapshotTooDeepError | null = null;
      try {
        sanitizer.sanitizeSnapshot(payload);
      } catch (e) {
        caught = e as BlocksSnapshotTooDeepError;
      }
      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('BLOCKS_SNAPSHOT_TOO_DEEP');
    });

    it('does NOT throw for a structure just under the recursion cap', () => {
      // 9 levels of object nesting keeps the deepest sanitizeValue() call at
      // depth 9 — safely under MAX_RECURSION_DEPTH (10).
      let deepest: unknown = 'x';
      for (let i = 0; i < 9; i++) {
        deepest = { level: deepest };
      }
      const payload = { root: deepest } as Record<string, unknown>;

      expect(() => sanitizer.sanitizeSnapshot(payload)).not.toThrow();
    });
  });
});
