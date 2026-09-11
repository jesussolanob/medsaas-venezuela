/**
 * Helpers to show rich-text block content as plain text.
 *
 * Consultation blocks are saved as HTML (the editor is rich text), but several
 * surfaces render that value as a plain string — so the specialist reads the
 * literal markup: "<p>Dolor de cabeza</p>". Worse, the tags inflate the string
 * and push the surrounding layout around, which is how a one-line summary ended
 * up squeezing the date and time out of shape in the consultation list.
 *
 * These helpers are intentionally string-based: they run on the server too
 * (no DOM), and the output is rendered as TEXT, never injected as HTML — so
 * there is no sanitization contract to uphold here.
 */

/** Named entities that actually show up in content typed by specialists. */
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/** Tags that imply a visual line break when flattened to text. */
const BLOCK_LEVEL_TAGS = /<\/(p|div|h[1-6]|li|tr|blockquote)>|<br\s*\/?>/gi;

/**
 * Converts HTML to readable plain text.
 *
 * Returns '' for empty/nullish input so callers can use a simple truthy check.
 */
export function htmlToPlainText(value: string | null | undefined): string {
  if (!value) return '';

  const withBreaks = value.replace(BLOCK_LEVEL_TAGS, '\n');
  const withoutTags = withBreaks.replace(/<[^>]*>/g, '');
  const decoded = withoutTags.replace(
    /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/gi,
    (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
  );

  // Numeric entities (&#233;) are rare but do appear in pasted content.
  const withNumeric = decoded.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCharCode(Number(code)),
  );

  return withNumeric.replace(/\s+/g, ' ').trim();
}

/**
 * Plain-text preview for a one-line summary.
 *
 * Truncation happens AFTER stripping, so the visible length is the length the
 * reader actually sees — clamping the raw HTML instead would count invisible
 * markup and could even cut a tag in half.
 */
export function htmlToPreview(value: string | null | undefined, maxLength = 90): string {
  const text = htmlToPlainText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
