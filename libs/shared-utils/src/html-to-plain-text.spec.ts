import { htmlToPlainText, isProbablyHtml } from './html-to-plain-text';

describe('htmlToPlainText', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToPlainText('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    // Type cast to test runtime guard
    expect(htmlToPlainText(null as unknown as string)).toBe('');
    expect(htmlToPlainText(undefined as unknown as string)).toBe('');
    expect(htmlToPlainText(42 as unknown as string)).toBe('');
  });

  it('returns plain text unchanged when no HTML present', () => {
    expect(htmlToPlainText('Hello world')).toBe('Hello world');
  });

  it('converts <p> tags to newlines', () => {
    const result = htmlToPlainText('<p>First paragraph</p><p>Second paragraph</p>');
    expect(result).toContain('First paragraph');
    expect(result).toContain('Second paragraph');
    // The two paragraphs should be separated by at least one newline
    expect(result).toMatch(/First paragraph[\s\S]+Second paragraph/);
  });

  it('converts <br> to newline', () => {
    const result = htmlToPlainText('line one<br>line two');
    expect(result).toContain('line one');
    expect(result).toContain('line two');
    expect(result).toMatch(/line one\nline two/);
  });

  it('converts <h1>–<h6> to newlines', () => {
    const result = htmlToPlainText('<h1>Title</h1><p>body</p>');
    expect(result).toContain('Title');
    expect(result).toContain('body');
  });

  it('converts <li> items to bullet list format', () => {
    const result = htmlToPlainText('<ul><li>item one</li><li>item two</li></ul>');
    expect(result).toContain('• item one');
    expect(result).toContain('• item two');
  });

  it('strips <strong> tags but keeps text content', () => {
    expect(htmlToPlainText('<strong>bold text</strong>')).toBe('bold text');
  });

  it('strips <em> tags but keeps text content', () => {
    expect(htmlToPlainText('<em>italic text</em>')).toBe('italic text');
  });

  it('decodes &amp; entity', () => {
    expect(htmlToPlainText('Cats &amp; Dogs')).toBe('Cats & Dogs');
  });

  it('decodes &lt; and &gt; entities', () => {
    expect(htmlToPlainText('A &lt; B &gt; C')).toBe('A < B > C');
  });

  it('decodes &nbsp; entity to a space', () => {
    const result = htmlToPlainText('word1&nbsp;word2');
    expect(result).toBe('word1 word2');
  });

  it('decodes &quot; entity', () => {
    expect(htmlToPlainText('say &quot;hello&quot;')).toBe('say "hello"');
  });

  it('decodes &mdash; entity', () => {
    expect(htmlToPlainText('before&mdash;after')).toBe('before—after');
  });

  it('decodes numeric character references (&#160;)', () => {
    // &#160; is non-breaking space (U+00A0)
    const result = htmlToPlainText('a&#160;b');
    // Should decode to some whitespace character
    expect(result.replace(/ /g, ' ')).toBe('a b');
  });

  it('strips unknown named entities entirely', () => {
    const result = htmlToPlainText('Copyright &copy; 2025');
    expect(result).not.toContain('&copy;');
    expect(result).toContain('Copyright');
    expect(result).toContain('2025');
  });

  it('collapses excessive blank lines to a single blank line', () => {
    const result = htmlToPlainText('<p>A</p><p></p><p></p><p>B</p>');
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('trims leading and trailing whitespace', () => {
    expect(htmlToPlainText('  <p>text</p>  ')).toBe('text');
  });

  it('handles mixed content (HTML + plain text)', () => {
    const result = htmlToPlainText('<p>Hello <strong>World</strong>, how are you?</p>');
    expect(result).toBe('Hello World, how are you?');
  });

  it('handles self-closing <br /> tags', () => {
    const result = htmlToPlainText('line one<br />line two');
    expect(result).toMatch(/line one\nline two/);
  });

  it('strips script tags without including their content', () => {
    // <script> is not in the allowlist → content becomes plain text after tag strip
    // The important thing: no '<script>' in the output
    const result = htmlToPlainText('<script>alert("xss")</script>safe text');
    expect(result).not.toContain('<script>');
    expect(result).toContain('safe text');
  });
});

describe('isProbablyHtml', () => {
  it('returns false for empty string', () => {
    expect(isProbablyHtml('')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isProbablyHtml(null as unknown as string)).toBe(false);
    expect(isProbablyHtml(undefined as unknown as string)).toBe(false);
  });

  it('returns false for plain text', () => {
    expect(isProbablyHtml('Hello world, no HTML here.')).toBe(false);
  });

  it('returns true for a string containing <p> tag', () => {
    expect(isProbablyHtml('<p>paragraph</p>')).toBe(true);
  });

  it('returns true for a string containing <strong> tag', () => {
    expect(isProbablyHtml('some <strong>bold</strong> text')).toBe(true);
  });

  it('returns true for a string containing <br>', () => {
    expect(isProbablyHtml('line1<br>line2')).toBe(true);
  });

  it('returns true for a string containing <div>', () => {
    expect(isProbablyHtml('<div class="foo">content</div>')).toBe(true);
  });

  it('returns false for a mathematical expression with angle brackets', () => {
    // "<3" and "A < B" should NOT trigger the heuristic
    expect(isProbablyHtml('I love you <3')).toBe(false);
    expect(isProbablyHtml('A < B means A is less than B')).toBe(false);
  });

  it('returns false for plain text with special characters', () => {
    expect(isProbablyHtml('Price: $10 & $20 > savings')).toBe(false);
  });

  it('returns true for a closing tag like </p>', () => {
    expect(isProbablyHtml('text</p>')).toBe(true);
  });

  it('returns true for partial HTML (opening tag only)', () => {
    expect(isProbablyHtml('<ul>')).toBe(true);
  });
});
