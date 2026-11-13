/**
 * ReleaseNote domain entity.
 *
 * Represents a product release note that is either a draft or published.
 *
 * Invariants:
 *   - title: 1..80 characters, trimmed, no leading/trailing whitespace.
 *   - body:  1..1500 characters, trimmed, plain text (no HTML tags).
 *   - publish() is only valid on a draft (published_at is null).
 *   - unpublish() is only valid on a published note.
 *   - Plain text invariant: strings must not contain '<' immediately followed
 *     by a letter or '/' (HTML tag pattern). Blocks storage of HTML content.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

const TITLE_MIN = 1;
const TITLE_MAX = 80;
const BODY_MIN = 1;
const BODY_MAX = 1500;

/** Regex that detects an HTML tag opening like <div or </div. */
const HTML_TAG_PATTERN = /<[a-zA-Z/]/;

export interface ReleaseNoteParams {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  audiencePlans: string[] | null;
  publishedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ReleaseNote {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly imageUrl: string | null;
  readonly audiencePlans: string[] | null;
  readonly publishedAt: Date | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: ReleaseNoteParams) {
    this.id = params.id;
    this.title = params.title;
    this.body = params.body;
    this.imageUrl = params.imageUrl;
    this.audiencePlans = params.audiencePlans;
    this.publishedAt = params.publishedAt;
    this.createdBy = params.createdBy;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true if this note has been published. */
  isPublished(): boolean {
    return this.publishedAt !== null;
  }

  /** Returns true if this note is still a draft. */
  isDraft(): boolean {
    return this.publishedAt === null;
  }

  /**
   * Validates a title string.
   * - Length between 1 and 80 after trimming.
   * - No HTML tags (rejects strings with < followed by a letter or /).
   */
  static validateTitle(title: string): { valid: true } | { valid: false; reason: string } {
    const trimmed = title.trim();
    if (trimmed.length < TITLE_MIN || trimmed.length > TITLE_MAX) {
      return {
        valid: false,
        reason: `El título debe tener entre ${TITLE_MIN} y ${TITLE_MAX} caracteres.`,
      };
    }
    if (HTML_TAG_PATTERN.test(trimmed)) {
      return {
        valid: false,
        reason: 'El título no puede contener HTML. Solo se permite texto plano.',
      };
    }
    return { valid: true };
  }

  /**
   * Validates a body string.
   * - Length between 1 and 1500 after trimming.
   * - No HTML tags (rejects strings with < followed by a letter or /).
   */
  static validateBody(body: string): { valid: true } | { valid: false; reason: string } {
    const trimmed = body.trim();
    if (trimmed.length < BODY_MIN || trimmed.length > BODY_MAX) {
      return {
        valid: false,
        reason: `El cuerpo debe tener entre ${BODY_MIN} y ${BODY_MAX} caracteres.`,
      };
    }
    if (HTML_TAG_PATTERN.test(trimmed)) {
      return {
        valid: false,
        reason: 'El cuerpo no puede contener HTML. Solo se permite texto plano.',
      };
    }
    return { valid: true };
  }

  /** Factory — constructs from raw params. Does not persist. */
  static create(params: ReleaseNoteParams): ReleaseNote {
    return new ReleaseNote(params);
  }
}
