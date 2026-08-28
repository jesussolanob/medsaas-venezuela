import { parseHtmlToRichBlocks } from './html-to-rich-text';
import type { RichTextBlock } from './html-to-rich-text';

describe('parseHtmlToRichBlocks', () => {
  // ─── Edge cases ─────────────────────────────────────────────────────────────

  it('returns empty array for empty string', () => {
    expect(parseHtmlToRichBlocks('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseHtmlToRichBlocks('   \n  ')).toEqual([]);
  });

  it('returns empty array for non-string input (guard)', () => {
    expect(parseHtmlToRichBlocks(null as unknown as string)).toEqual([]);
    expect(parseHtmlToRichBlocks(undefined as unknown as string)).toEqual([]);
  });

  it('returns empty array for HTML with only empty tags', () => {
    expect(parseHtmlToRichBlocks('<p></p><p> </p>')).toEqual([]);
  });

  // ─── Plain text (no HTML) ───────────────────────────────────────────────────

  it('wraps plain text in a paragraph block', () => {
    const result = parseHtmlToRichBlocks('hello world');
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('paragraph');
    expect(result[0]!.runs[0]!.text).toBe('hello world');
  });

  // ─── Paragraphs ─────────────────────────────────────────────────────────────

  it('parses a simple paragraph', () => {
    const result = parseHtmlToRichBlocks('<p>Normal text</p>');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<RichTextBlock>({
      type: 'paragraph',
      runs: [{ text: 'Normal text' }],
    });
  });

  it('parses multiple paragraphs as separate blocks', () => {
    const result = parseHtmlToRichBlocks('<p>First</p><p>Second</p>');
    expect(result).toHaveLength(2);
    expect(result[0]!.runs[0]!.text).toBe('First');
    expect(result[1]!.runs[0]!.text).toBe('Second');
  });

  // ─── Inline formatting ───────────────────────────────────────────────────────

  it('marks <strong> text as bold', () => {
    const result = parseHtmlToRichBlocks('<p><strong>Bold</strong></p>');
    expect(result[0]!.runs).toEqual([{ text: 'Bold', bold: true }]);
  });

  it('marks <b> text as bold (alias)', () => {
    const result = parseHtmlToRichBlocks('<p><b>Bold</b></p>');
    expect(result[0]!.runs).toEqual([{ text: 'Bold', bold: true }]);
  });

  it('marks <em> text as italic', () => {
    const result = parseHtmlToRichBlocks('<p><em>Italic</em></p>');
    expect(result[0]!.runs).toEqual([{ text: 'Italic', italic: true }]);
  });

  it('marks <i> text as italic (alias)', () => {
    const result = parseHtmlToRichBlocks('<p><i>Italic</i></p>');
    expect(result[0]!.runs).toEqual([{ text: 'Italic', italic: true }]);
  });

  it('marks <u> text as underline', () => {
    const result = parseHtmlToRichBlocks('<p><u>Underline</u></p>');
    expect(result[0]!.runs).toEqual([{ text: 'Underline', underline: true }]);
  });

  it('handles mixed formatting within a paragraph', () => {
    const result = parseHtmlToRichBlocks(
      '<p>Normal <strong>bold</strong> and <em>italic</em> text</p>',
    );
    expect(result).toHaveLength(1);
    const runs = result[0]!.runs;
    expect(runs.some((r) => r.text === 'Normal ' && !r.bold && !r.italic)).toBe(true);
    expect(runs.some((r) => r.text === 'bold' && r.bold === true)).toBe(true);
    expect(runs.some((r) => r.text === 'italic' && r.italic === true)).toBe(true);
  });

  it('handles nested bold+italic (<strong><em>)', () => {
    const result = parseHtmlToRichBlocks('<p><strong><em>Bold italic</em></strong></p>');
    const runs = result[0]!.runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.bold).toBe(true);
    expect(runs[0]!.italic).toBe(true);
    expect(runs[0]!.text).toBe('Bold italic');
  });

  it('handles bold within a list item', () => {
    const result = parseHtmlToRichBlocks('<ul><li><p><strong>Bold bullet</strong></p></li></ul>');
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('listItem');
    expect(result[0]!.runs[0]!.bold).toBe(true);
    expect(result[0]!.runs[0]!.text).toBe('Bold bullet');
  });

  it('handles underline within a list item', () => {
    const result = parseHtmlToRichBlocks('<ul><li><p><u>Underlined bullet</u></p></li></ul>');
    expect(result[0]!.type).toBe('listItem');
    expect(result[0]!.runs[0]!.underline).toBe(true);
  });

  // ─── List items ──────────────────────────────────────────────────────────────

  it('parses a simple unordered list', () => {
    const result = parseHtmlToRichBlocks(
      '<ul><li><p>Item one</p></li><li><p>Item two</p></li></ul>',
    );
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('listItem');
    expect(result[0]!.runs[0]!.text).toBe('Item one');
    expect(result[1]!.type).toBe('listItem');
    expect(result[1]!.runs[0]!.text).toBe('Item two');
  });

  it('parses a list without inner <p> (plain li content)', () => {
    const result = parseHtmlToRichBlocks('<ul><li>Direct text</li></ul>');
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('listItem');
    expect(result[0]!.runs[0]!.text).toBe('Direct text');
  });

  it('parses mixed paragraphs and lists correctly', () => {
    const html = '<p>Intro</p><ul><li><p>Bullet</p></li></ul><p>Outro</p>';
    const result = parseHtmlToRichBlocks(html);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('paragraph');
    expect(result[1]!.type).toBe('listItem');
    expect(result[2]!.type).toBe('paragraph');
  });

  // ─── TipTap-style rich-text block (representative example) ──────────────────

  it('parses a full TipTap-style block: bold heading + list items', () => {
    const html =
      '<p><strong>Cefalea persistente</strong></p><ul><li><p>Inicio hace 3 días</p></li><li><p>Intensidad 8/10</p></li></ul>';
    const result = parseHtmlToRichBlocks(html);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('paragraph');
    expect(result[0]!.runs[0]!.bold).toBe(true);
    expect(result[0]!.runs[0]!.text).toBe('Cefalea persistente');
    expect(result[1]!.type).toBe('listItem');
    expect(result[1]!.runs[0]!.text).toBe('Inicio hace 3 días');
    expect(result[2]!.type).toBe('listItem');
    expect(result[2]!.runs[0]!.text).toBe('Intensidad 8/10');
  });

  // ─── Unknown tags ────────────────────────────────────────────────────────────

  it('strips unknown tags but preserves their text content', () => {
    const result = parseHtmlToRichBlocks('<p><span>text in span</span></p>');
    expect(result).toHaveLength(1);
    expect(result[0]!.runs[0]!.text).toBe('text in span');
  });

  it('does not throw on completely unknown tags', () => {
    expect(() =>
      parseHtmlToRichBlocks('<p><customtag attr="x">content</customtag></p>'),
    ).not.toThrow();
  });

  // ─── HTML entities ───────────────────────────────────────────────────────────

  it('decodes &amp; entity', () => {
    const result = parseHtmlToRichBlocks('<p>Cats &amp; Dogs</p>');
    expect(result[0]!.runs[0]!.text).toBe('Cats & Dogs');
  });

  it('decodes &nbsp; entity to a space', () => {
    const result = parseHtmlToRichBlocks('<p>word1&nbsp;word2</p>');
    expect(result[0]!.runs[0]!.text).toBe('word1 word2');
  });

  it('decodes numeric entity &#160; (non-breaking space)', () => {
    const result = parseHtmlToRichBlocks('<p>a&#160;b</p>');
    // Decode to some whitespace; normalize for comparison
    expect(result[0]!.runs[0]!.text.replace(/\s/g, ' ')).toBe('a b');
  });

  it('decodes &mdash; entity', () => {
    const result = parseHtmlToRichBlocks('<p>before&mdash;after</p>');
    expect(result[0]!.runs[0]!.text).toBe('before—after');
  });

  it('strips unknown named entities without crashing', () => {
    const result = parseHtmlToRichBlocks('<p>Copyright &copy; 2025</p>');
    expect(result[0]!.runs[0]!.text).not.toContain('&copy;');
    expect(result[0]!.runs[0]!.text).toContain('Copyright');
  });

  // ─── Malformed HTML ──────────────────────────────────────────────────────────

  it('handles unclosed tags gracefully (does not throw)', () => {
    expect(() => parseHtmlToRichBlocks('<p>text without closing tag')).not.toThrow();
    const result = parseHtmlToRichBlocks('<p>text without closing tag');
    expect(result[0]!.runs[0]!.text).toBe('text without closing tag');
  });

  it('handles deeply nested formatting without throwing', () => {
    expect(() =>
      parseHtmlToRichBlocks('<p><strong><em><u>triple</u></em></strong></p>'),
    ).not.toThrow();
    const result = parseHtmlToRichBlocks('<p><strong><em><u>triple</u></em></strong></p>');
    expect(result[0]!.runs[0]!.bold).toBe(true);
    expect(result[0]!.runs[0]!.italic).toBe(true);
    expect(result[0]!.runs[0]!.underline).toBe(true);
  });

  it('handles an empty list item without crashing', () => {
    expect(() => parseHtmlToRichBlocks('<ul><li></li></ul>')).not.toThrow();
    // Empty li produces no visible block
    expect(parseHtmlToRichBlocks('<ul><li></li></ul>')).toHaveLength(0);
  });

  it('handles mismatched closing tags gracefully', () => {
    expect(() => parseHtmlToRichBlocks('<p><strong>text</em></p>')).not.toThrow();
  });

  // ─── Adjacent same-style runs are merged ─────────────────────────────────────

  it('merges adjacent same-style runs into one', () => {
    // Two bold tags back-to-back should produce one merged bold run
    const result = parseHtmlToRichBlocks('<p><strong>A</strong><strong>B</strong></p>');
    const boldRuns = result[0]!.runs.filter((r) => r.bold);
    // Should be merged into a single run "AB"
    expect(boldRuns.map((r) => r.text).join('')).toBe('AB');
  });

  // ─── Line breaks ─────────────────────────────────────────────────────────────

  it('converts <br> into a newline character within the current block', () => {
    const result = parseHtmlToRichBlocks('<p>line one<br>line two</p>');
    const text = result[0]!.runs.map((r) => r.text).join('');
    expect(text).toContain('line one');
    expect(text).toContain('line two');
    expect(text).toContain('\n');
  });

  it('converts self-closing <br/> into a newline', () => {
    const result = parseHtmlToRichBlocks('<p>a<br/>b</p>');
    const text = result[0]!.runs.map((r) => r.text).join('');
    expect(text).toContain('\n');
  });

  // ─── Block-level tags as headings ────────────────────────────────────────────

  it('treats <h1>–<h6> as paragraph blocks (no special heading style in PDF)', () => {
    const result = parseHtmlToRichBlocks('<h2>Heading text</h2>');
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('paragraph');
    expect(result[0]!.runs[0]!.text).toBe('Heading text');
  });
});
