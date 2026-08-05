/**
 * HTML-to-plain-text utilities.
 *
 * No DOM dependency — pure regex + string processing so they work in any
 * Node.js context (NestJS, scripts, tests) without jsdom or a real browser.
 *
 * Primary use case: stripping doctor-authored rich-text HTML from
 * blocks_snapshot values before feeding them into a PDF renderer that
 * expects plain text (no markup).
 */

/**
 * HTML entities commonly found in doctor-authored rich-text content.
 * Kept minimal — only entities that change the visible meaning of the text.
 */
const HTML_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#039;', "'"],
  ['&#39;', "'"],
  ['&apos;', "'"],
  ['&nbsp;', ' '],
  ['&mdash;', '—'],
  ['&ndash;', '–'],
  ['&laquo;', '«'],
  ['&raquo;', '»'],
]);

/** Tags that imply a block-level line break before their content. */
const BLOCK_TAG_PATTERN = /<\/?(p|div|h[1-6]|blockquote|pre|hr|tr|br)\b[^>]*>/gi;

/** List-item tags — rendered with a bullet prefix. */
const LIST_ITEM_PATTERN = /<\/?(li)\b[^>]*>/gi;

/** Any remaining HTML tag (stripped without adding whitespace). */
const ALL_TAGS_PATTERN = /<[^>]+>/g;

/** Numeric character references e.g. &#160; or &#x00A0; */
const NUMERIC_ENTITY_PATTERN = /&#x?([0-9a-f]+);/gi;

/** Named entity references (anything left after the explicit table lookup). */
const NAMED_ENTITY_PATTERN = /&[a-z]+;/gi;

/**
 * Converts an HTML string to plain text.
 *
 * Rules applied (in order):
 *  1. Block-level tags (p, div, h1–h6, blockquote, pre, hr, tr, br) → `\n`
 *  2. <li> tags → `\n• ` (bullet list prefix)
 *  3. All remaining tags stripped with no replacement.
 *  4. HTML entities decoded (named table, then numeric code points).
 *  5. Consecutive blank lines collapsed to a single blank line.
 *  6. Leading/trailing whitespace trimmed.
 *
 * @param input - Raw HTML string. Non-string input returns '' immediately.
 * @returns Plain text with no HTML markup.
 */
export function htmlToPlainText(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return '';

  let text = input;

  // 1. Block-level tags → newline
  text = text.replace(BLOCK_TAG_PATTERN, '\n');

  // 2. List-item opening tags → bullet; closing tags → nothing (already newlined by next li)
  text = text.replace(LIST_ITEM_PATTERN, (match) => {
    // Opening <li> gets the bullet; </li> is just stripped (blank replacement below handles it)
    return match.startsWith('</') ? '' : '\n• ';
  });

  // 3. Strip all remaining tags
  text = text.replace(ALL_TAGS_PATTERN, '');

  // 4. Decode named entities from the explicit table
  for (const [entity, char] of HTML_ENTITIES) {
    text = text.split(entity).join(char);
  }

  // 5. Decode numeric character references (&#160; or &#xA0; etc.)
  text = text.replace(NUMERIC_ENTITY_PATTERN, (_match, code: string) => {
    const codePoint =
      code.startsWith('x') || code.startsWith('X')
        ? parseInt(code.slice(1), 16)
        : parseInt(code, 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
  });

  // 6. Drop any remaining unknown named entities (e.g. &copy;) — replace with empty string
  text = text.replace(NAMED_ENTITY_PATTERN, '');

  // 7. Re-attach bullets to their text.
  //    Rich-text editors emit list items as <li><p>text</p></li>. Step 1 turns that
  //    inner <p> into a newline BEFORE step 2 adds the bullet, which left the bullet
  //    stranded on its own line ("• \ntext") in the PDF. Pull the text back up.
  text = text.replace(/•[ \t]*\n+[ \t]*/g, '• ');

  // 8. Collapse runs of 3+ newlines to two (preserve paragraph spacing)
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Heuristic: returns true when the input string is likely HTML.
 *
 * A string is considered "probably HTML" if it contains at least one
 * recognisable HTML tag (opening or closing, with or without attributes).
 * Common false-positive triggers (angle brackets in chemistry notation,
 * comparison operators) are intentionally tolerated — the consequence of
 * a false positive is just that we call htmlToPlainText() unnecessarily,
 * which is harmless.
 *
 * @param input - String to inspect.
 * @returns true if the string appears to contain HTML markup.
 */
export function isProbablyHtml(input: string): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;

  // Match an opening or closing HTML tag with a recognised tag name.
  // We anchor to known tag names to avoid matching "<3" or "<->" as HTML.
  const HTML_TAG_HEURISTIC =
    /<\/?(?:p|div|span|br|hr|ul|ol|li|h[1-6]|strong|b|em|i|u|s|a|img|pre|code|blockquote|table|tr|td|th|thead|tbody|script|style|form|input|button|select|textarea|iframe|svg|path|head|body|html)\b/i;

  return HTML_TAG_HEURISTIC.test(input);
}
