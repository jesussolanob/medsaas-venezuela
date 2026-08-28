/**
 * html-to-rich-text.ts
 *
 * Parses an HTML string produced by a rich-text editor into a structured
 * RichTextBlock[] representation suitable for @react-pdf/renderer.
 *
 * IMPORTANT: This module accepts pre-sanitized HTML. The caller is responsible
 * for sanitizing with sanitizeHtml() before calling parseHtmlToRichBlocks().
 *
 * Designed for TipTap-style output (the editor used for consultation blocks):
 *   Block-level : <p>, <div>, <h1>–<h6>, <blockquote>, <ul>/<ol> wrappers, <li>
 *   Inline      : <strong>/<b> (bold), <em>/<i> (italic), <u> (underline)
 *   Line break  : <br>, <br/>
 *   Unknown tags: stripped, text content preserved — never throws.
 *
 * Empty blocks (no visible text) are omitted from the result.
 * No DOM dependency — pure regex and string processing for Node.js + browser.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

/** A run of text with optional inline formatting. */
export interface RichTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** A block-level unit of content (paragraph or list item). */
export type RichTextBlockType = 'paragraph' | 'listItem';

export interface RichTextBlock {
  type: RichTextBlockType;
  runs: RichTextRun[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Known void (self-closing) HTML elements. */
const VOID_TAGS = new Set([
  'br',
  'hr',
  'img',
  'input',
  'meta',
  'link',
  'wbr',
  'area',
  'col',
  'embed',
]);

/** Tags that create a paragraph-level block boundary. */
const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']);

/** Tags that wrap list containers (no block boundary on their own). */
const LIST_WRAPPER_TAGS = new Set(['ul', 'ol']);

const LIST_ITEM_TAG = 'li';

/** Named HTML entities commonly found in editor output. */
const ENTITIES: ReadonlyMap<string, string> = new Map([
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

const NUMERIC_ENTITY_RE = /&#x?([0-9a-f]+);/gi;
const REMAINING_ENTITY_RE = /&[a-z]+;/gi;

function decodeEntities(raw: string): string {
  let text = raw;
  for (const [entity, char] of ENTITIES) {
    if (text.includes(entity)) {
      text = text.split(entity).join(char);
    }
  }
  text = text.replace(NUMERIC_ENTITY_RE, (_m, code: string) => {
    const cp =
      code.startsWith('x') || code.startsWith('X')
        ? parseInt(code.slice(1), 16)
        : parseInt(code, 10);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
  });
  // Strip any remaining unknown entities
  text = text.replace(REMAINING_ENTITY_RE, '');
  return text;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TokenType = 'text' | 'open' | 'close' | 'selfclose';

interface HtmlToken {
  type: TokenType;
  tagName?: string; // lowercase for non-text tokens
  text?: string; // only for 'text' tokens
}

/**
 * TAG_RE captures: (leading slash)(tag name)(everything up to closing >)
 * We use it to split the HTML into tag tokens and text nodes.
 */
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\b[^>]*)>/g;

function tokenize(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  TAG_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = TAG_RE.exec(html)) !== null) {
    // Text content before this tag
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: html.slice(lastIndex, match.index) });
    }

    const isCloseTag = match[1] === '/';
    const tagName = (match[2] ?? '').toLowerCase();
    const trailingAttrs = match[3] ?? '';
    const hasSelfCloseSlash = trailingAttrs.trimEnd().endsWith('/');
    const isVoid = VOID_TAGS.has(tagName);

    if (isCloseTag) {
      tokens.push({ type: 'close', tagName });
    } else if (hasSelfCloseSlash || isVoid) {
      tokens.push({ type: 'selfclose', tagName });
    } else {
      tokens.push({ type: 'open', tagName });
    }

    lastIndex = match.index + match[0].length;
  }

  // Any remaining text after the last tag
  if (lastIndex < html.length) {
    tokens.push({ type: 'text', text: html.slice(lastIndex) });
  }

  return tokens;
}

// ─── Run merging ──────────────────────────────────────────────────────────────

/** Merges adjacent RichTextRun objects that share identical formatting. */
function mergeRuns(runs: RichTextRun[]): RichTextRun[] {
  if (runs.length === 0) return [];

  const merged: RichTextRun[] = [];

  for (const curr of runs) {
    const prev = merged[merged.length - 1];
    if (
      prev !== undefined &&
      Boolean(prev.bold) === Boolean(curr.bold) &&
      Boolean(prev.italic) === Boolean(curr.italic) &&
      Boolean(prev.underline) === Boolean(curr.underline)
    ) {
      prev.text += curr.text;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses pre-sanitized HTML into RichTextBlock[].
 *
 * @param sanitizedHtml - HTML already stripped of dangerous tags/attributes.
 * @returns Structured rich-text blocks, empty array if no content.
 */
export function parseHtmlToRichBlocks(sanitizedHtml: string): RichTextBlock[] {
  if (typeof sanitizedHtml !== 'string' || sanitizedHtml.trim() === '') return [];

  const tokens = tokenize(sanitizedHtml);
  const result: RichTextBlock[] = [];

  let currentRuns: RichTextRun[] = [];
  let blockType: RichTextBlockType | null = null;
  /** Nesting depth counter for <li> — gracefully handles nested lists. */
  let liDepth = 0;

  // Inline formatting counters — handle nested <strong><strong>...</strong></strong>
  let bold = 0;
  let italic = 0;
  let underline = 0;

  function flushBlock(): void {
    if (currentRuns.length === 0 && blockType === null) return;

    const merged = mergeRuns(currentRuns);
    // A block is visible if at least one run has non-whitespace text
    const hasVisible = merged.some((r) => r.text.trim().length > 0);

    if (hasVisible) {
      result.push({ type: blockType ?? 'paragraph', runs: merged });
    }

    currentRuns = [];
    blockType = null;
  }

  function pushText(raw: string): void {
    const decoded = decodeEntities(raw);
    if (!decoded) return;
    // Bare text nodes that aren't inside any block implicitly start a paragraph
    if (blockType === null) blockType = 'paragraph';
    currentRuns.push({
      text: decoded,
      ...(bold > 0 ? { bold: true } : {}),
      ...(italic > 0 ? { italic: true } : {}),
      ...(underline > 0 ? { underline: true } : {}),
    });
  }

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        pushText(token.text ?? '');
        break;

      case 'open': {
        const tag = token.tagName!;

        if (BLOCK_TAGS.has(tag)) {
          if (liDepth === 0) {
            // Start a new paragraph block when outside a list item
            flushBlock();
            blockType = 'paragraph';
          }
          // Inside a <li>: <p> is transparent — TipTap wraps li content in <p>
        } else if (tag === LIST_ITEM_TAG) {
          flushBlock();
          liDepth++;
          blockType = 'listItem';
        } else if (LIST_WRAPPER_TAGS.has(tag)) {
          // <ul>/<ol> itself is just a container — flush any pending paragraph
          if (liDepth === 0 && (blockType !== null || currentRuns.length > 0)) {
            flushBlock();
          }
        } else if (tag === 'strong' || tag === 'b') {
          bold++;
        } else if (tag === 'em' || tag === 'i') {
          italic++;
        } else if (tag === 'u') {
          underline++;
        }
        // All other unknown tags: content will still be processed as text
        break;
      }

      case 'selfclose': {
        const tag = token.tagName!;
        if (tag === 'br' && blockType !== null) {
          // Newline within current block — use a plain run so it wraps naturally
          currentRuns.push({ text: '\n' });
        }
        // hr, img, etc.: no visible text in PDF — ignore
        break;
      }

      case 'close': {
        const tag = token.tagName!;

        if (BLOCK_TAGS.has(tag)) {
          if (liDepth === 0) {
            flushBlock();
          }
          // Inside <li>: closing </p> is transparent
        } else if (tag === LIST_ITEM_TAG) {
          flushBlock();
          liDepth = Math.max(0, liDepth - 1);
        } else if (LIST_WRAPPER_TAGS.has(tag)) {
          // </ul>/</ol>: no action needed; list items were already flushed
        } else if (tag === 'strong' || tag === 'b') {
          bold = Math.max(0, bold - 1);
        } else if (tag === 'em' || tag === 'i') {
          italic = Math.max(0, italic - 1);
        } else if (tag === 'u') {
          underline = Math.max(0, underline - 1);
        }
        break;
      }
    }
  }

  // Flush any remaining content at end of input
  flushBlock();

  return result;
}
