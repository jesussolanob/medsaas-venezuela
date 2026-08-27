import sanitizeHtml from 'sanitize-html';
import { Injectable } from '@nestjs/common';
import { BlocksSnapshotTooLargeError } from '../domain/errors/blocks-snapshot-too-large.error';
import { BlocksSnapshotTooDeepError } from '../domain/errors/blocks-snapshot-too-deep.error';

/** Maximum allowed JSON length (chars) for a blocks_snapshot payload. */
const MAX_SNAPSHOT_CHARS = 300_000;

/**
 * Maximum recursion depth when walking nested arrays/objects inside a
 * blocks_snapshot value. Clinical block content is never more than a couple
 * of levels deep in practice (e.g. { items: [{ label: '<p>...</p>' }] });
 * this cap exists purely as a DoS guard against an adversarial payload.
 */
const MAX_RECURSION_DEPTH = 10;

/**
 * Strict allowlist for HTML sanitization of clinical block content.
 *
 * Allowed tags: semantic text elements (no block-layout tags like div/table,
 * no media or embed tags, no script/style).
 *
 * Zero attributes allowed on any tag — any event handler (onclick, onerror),
 * href (javascript:), or inline style is stripped before storage.
 *
 * Rationale: doctor-authored HTML from the rich-text editor must be safe to
 * render inside an <iframe> or in a PDF without XSS risk.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
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
  ],
  allowedAttributes: {},
  // Strip disallowed tags entirely (do not preserve their content in the case
  // of script/style — for all other tag drops we still keep the text content).
  disallowedTagsMode: 'discard',
};

/**
 * Application-layer service responsible for sanitizing HTML stored inside
 * clinical consultation blocks before persistence.
 *
 * Placed in application/ (not domain/) because it depends on the external
 * `sanitize-html` library, which violates the domain's no-external-deps rule.
 *
 * Usage: inject into UpdateConsultationUseCase and call sanitizeSnapshot()
 * before passing blocksSnapshot to the repository.
 */
@Injectable()
export class BlockContentSanitizer {
  /**
   * Iterates over every value in the snapshot and, for every string found —
   * whether at the top level or nested inside arrays/objects — runs it through
   * the strict HTML allowlist. Non-string leaf values (numbers, booleans, null)
   * are left untouched. Nested arrays and objects are walked recursively so
   * list items and nested block content cannot smuggle unsanitized HTML.
   *
   * The 300 KB size cap is checked ONCE, up front, against the full serialised
   * snapshot — not per string — so it cannot be bypassed by spreading a large
   * payload across many small nested strings.
   *
   * @param snapshot - The raw blocks_snapshot record from the request body.
   * @returns A new record with every string value (at any depth) sanitized.
   * @throws BlocksSnapshotTooLargeError when the JSON exceeds 300 000 chars.
   * @throws BlocksSnapshotTooDeepError when nesting exceeds the recursion cap.
   */
  sanitizeSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
    // Reject oversized payloads BEFORE running the sanitizer loop.
    // This prevents a DoS where a huge payload exhausts CPU inside sanitize-html
    // before we ever check the size. The 512 kb HTTP body limit in main.ts is a
    // network-layer guard; this check is a defense-in-depth at the use-case boundary.
    // Checked against the FULL snapshot (not per-value) so the cap cannot be
    // bypassed by spreading a large payload across many nested strings.
    const rawJson = JSON.stringify(snapshot);
    if (rawJson.length > MAX_SNAPSHOT_CHARS) {
      throw new BlocksSnapshotTooLargeError(rawJson.length);
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(snapshot)) {
      sanitized[key] = this.sanitizeValue(value, 0);
    }

    return sanitized;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Recursively sanitizes a single value:
   *   - string  → run through the HTML allowlist
   *   - array   → new array with each element sanitized (depth + 1)
   *   - object  → new object with each property sanitized (depth + 1)
   *   - other   → returned as-is (numbers, booleans, null, undefined)
   *
   * @throws BlocksSnapshotTooDeepError when `depth` exceeds MAX_RECURSION_DEPTH.
   */
  private sanitizeValue(value: unknown, depth: number): unknown {
    if (depth > MAX_RECURSION_DEPTH) {
      throw new BlocksSnapshotTooDeepError(MAX_RECURSION_DEPTH);
    }

    if (typeof value === 'string') {
      return sanitizeHtml(value, SANITIZE_OPTIONS);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, depth + 1));
    }

    if (value !== null && typeof value === 'object') {
      const sanitizedObject: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        sanitizedObject[key] = this.sanitizeValue(nestedValue, depth + 1);
      }
      return sanitizedObject;
    }

    // Numbers, booleans, null, and undefined pass through unchanged.
    return value;
  }
}
