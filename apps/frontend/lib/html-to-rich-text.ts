/**
 * lib/html-to-rich-text.ts
 *
 * Frontend wrapper around @delta/shared-utils's parseHtmlToRichBlocks.
 * ALWAYS sanitizes the HTML before parsing — this is the only entry point
 * that should be used within apps/frontend.
 *
 * Re-exports the RichTextBlock / RichTextRun types so callers don't need
 * to import directly from @delta/shared-utils.
 */

import { parseHtmlToRichBlocks as _parse } from '@delta/shared-utils';
import { sanitizeHtml } from './sanitize-html';

export type { RichTextRun, RichTextBlock, RichTextBlockType } from '@delta/shared-utils';

/**
 * Sanitizes `rawHtml` and parses it into rich-text blocks.
 *
 * Safe to call with untrusted HTML from the editor (sanitizeHtml strips
 * <script>, <iframe>, on* handlers and javascript: URLs first).
 *
 * @param rawHtml - Raw HTML string from the doctor's rich-text editor.
 * @returns Structured RichTextBlock[] ready for PDF rendering. Empty array
 *          when the input is empty, whitespace-only, or has no visible text.
 */
export function parseRichHtml(rawHtml: string): import('@delta/shared-utils').RichTextBlock[] {
  if (!rawHtml || typeof rawHtml !== 'string') return [];
  const sanitized = sanitizeHtml(rawHtml);
  return _parse(sanitized);
}
