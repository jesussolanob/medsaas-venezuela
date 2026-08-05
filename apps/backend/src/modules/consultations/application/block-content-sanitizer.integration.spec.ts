/**
 * Integration tests for BlockContentSanitizer — uses the real sanitize-html library
 * (no jest.mock). Node.js 22.12+ supports require() of ES modules, so
 * htmlparser2 v12 (ESM) loads correctly even in Jest's CJS mode.
 *
 * Run with:
 *   pnpm nx run backend:test-integration
 *
 * Excluded from the default jest run via testPathIgnorePatterns: ['.integration.spec.ts'].
 * These tests do NOT require a database connection.
 *
 * Validates that the real sanitize-html allowlist configuration rejects every
 * meaningful XSS vector and preserves all semantically safe markup.
 */
import { BlockContentSanitizer } from './block-content-sanitizer';
import { BlocksSnapshotTooLargeError } from '../domain/errors/blocks-snapshot-too-large.error';

describe('BlockContentSanitizer — integration (real sanitize-html)', () => {
  let sanitizer: BlockContentSanitizer;

  beforeEach(() => {
    sanitizer = new BlockContentSanitizer();
  });

  // ── XSS vectors ──────────────────────────────────────────────────────────

  it('strips a bare <script> tag and its payload', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<script>alert("xss")</script>safe text',
    });
    expect(result['notes']).not.toContain('<script');
    expect(result['notes']).not.toContain('alert');
    expect(result['notes']).toContain('safe text');
  });

  it('strips a <script> with nested-tag obfuscation (<scr<script>ipt>)', () => {
    // Browsers reconstruct the outer script tag after parsing the inner one.
    const result = sanitizer.sanitizeSnapshot({
      notes: '<scr<script></script>ipt>alert(1)</scr</script>ipt>',
    });
    expect(result['notes']).not.toContain('<script');
    expect(result['notes']).not.toContain('alert(1)');
  });

  it('strips an <img> with onerror event handler', () => {
    const result = sanitizer.sanitizeSnapshot({
      diagnosis: '<img src="x" onerror="stealCookies()">diagnosis text',
    });
    expect(result['diagnosis']).not.toContain('<img');
    expect(result['diagnosis']).not.toContain('onerror');
    expect(result['diagnosis']).toContain('diagnosis text');
  });

  it('strips a javascript: href on an <a> tag', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<a href="javascript:void(document.cookie)">click me</a>',
    });
    expect(result['notes']).not.toContain('<a');
    expect(result['notes']).not.toContain('javascript:');
    // Text content may or may not survive depending on disallowedTagsMode; we only
    // assert that the dangerous anchor is gone.
  });

  it('strips CSS expression / url(javascript:) in a style attribute', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<p style="background:url(javascript:alert(1))">text</p>',
    });
    // style attribute stripped because allowedAttributes is {}
    expect(result['notes']).not.toContain('javascript:');
    expect(result['notes']).not.toContain('style=');
  });

  it('strips an <svg> with onload handler', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<svg onload="alert(1)"><rect/></svg>',
    });
    expect(result['notes']).not.toContain('<svg');
    expect(result['notes']).not.toContain('onload');
  });

  it('strips a mXSS via <math><mtext><style> sequence', () => {
    // mXSS: parser mismatch causes </style> to end prematurely in some parsers.
    const payload = '<math><mtext></math><script>alert(1)</script></mtext></math>';
    const result = sanitizer.sanitizeSnapshot({ notes: payload });
    expect(result['notes']).not.toContain('<script');
    expect(result['notes']).not.toContain('alert(1)');
  });

  it('strips an <iframe> embed', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<iframe src="https://evil.com" onload="steal()"></iframe>notes here',
    });
    expect(result['notes']).not.toContain('<iframe');
    expect(result['notes']).not.toContain('evil.com');
    expect(result['notes']).toContain('notes here');
  });

  it('strips an onclick handler on an otherwise-allowed tag', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<p onclick="evil()">paragraph text</p>',
    });
    // <p> is allowed but onclick must be stripped (allowedAttributes is {})
    expect(result['notes']).not.toContain('onclick');
    expect(result['notes']).toContain('<p>');
    expect(result['notes']).toContain('paragraph text');
  });

  // ── Safe markup must survive ─────────────────────────────────────────────

  it('preserves <strong> and <em>', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<strong>bold</strong> and <em>italic</em>',
    });
    expect(result['notes']).toBe('<strong>bold</strong> and <em>italic</em>');
  });

  it('preserves <ul> / <li> list structure', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<ul><li>item one</li><li>item two</li></ul>',
    });
    expect(result['notes']).toBe('<ul><li>item one</li><li>item two</li></ul>');
  });

  it('preserves <blockquote> wrapping text', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<blockquote>doctor note here</blockquote>',
    });
    expect(result['notes']).toBe('<blockquote>doctor note here</blockquote>');
  });

  it('preserves heading tags h1 through h3', () => {
    const result = sanitizer.sanitizeSnapshot({
      notes: '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>',
    });
    expect(result['notes']).toContain('<h1>Title</h1>');
    expect(result['notes']).toContain('<h2>Subtitle</h2>');
    expect(result['notes']).toContain('<h3>Section</h3>');
  });

  // ── Size enforcement (redundant with unit test, kept for integration confidence) ──

  it('throws BlocksSnapshotTooLargeError on oversized payload', () => {
    const bigString = 'A'.repeat(300_000);
    expect(() => sanitizer.sanitizeSnapshot({ big: bigString })).toThrow(
      BlocksSnapshotTooLargeError,
    );
  });

  // ── Non-string pass-through ───────────────────────────────────────────────

  it('passes through numbers, booleans, and null without calling sanitize', () => {
    const result = sanitizer.sanitizeSnapshot({
      count: 42,
      flag: true,
      nothing: null,
    } as Record<string, unknown>);
    expect(result['count']).toBe(42);
    expect(result['flag']).toBe(true);
    expect(result['nothing']).toBeNull();
  });
});
