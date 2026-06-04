import { SuggestionInvalidStatusError } from '../errors/suggestion-invalid-status.error';

export type SuggestionStatus = 'pending' | 'reviewed' | 'planned' | 'done' | 'rejected';

export type SuggestionCategory = 'general' | string;

const VALID_STATUSES: readonly SuggestionStatus[] = [
  'pending',
  'reviewed',
  'planned',
  'done',
  'rejected',
];

export interface SuggestionCreateParams {
  id: string;
  doctorId: string;
  subject: string;
  message: string;
  category: string;
  status: SuggestionStatus;
  adminResponse: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Suggestion domain entity.
 *
 * Invariants enforced here:
 *   - respond() validates the target status is one of the 5 allowed values.
 *   - isOwnedBy() enforces doctor ownership — used for anti-IDOR checks.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */
export class Suggestion {
  readonly id: string;
  readonly doctorId: string;
  readonly subject: string;
  readonly message: string;
  readonly category: string;
  readonly status: SuggestionStatus;
  readonly adminResponse: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: SuggestionCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.subject = params.subject;
    this.message = params.message;
    this.category = params.category;
    this.status = params.status;
    this.adminResponse = params.adminResponse ?? null;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true when the given doctorId owns this suggestion. Anti-IDOR guard. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Validates that the target status is one of the 5 allowed values.
   * Returns a new Suggestion with the updated status and optional adminResponse (immutable pattern).
   * Throws SuggestionInvalidStatusError for unrecognised values.
   */
  respond(newStatus: string, adminResponse: string | null): Suggestion {
    if (!VALID_STATUSES.includes(newStatus as SuggestionStatus)) {
      throw new SuggestionInvalidStatusError(newStatus);
    }
    return Suggestion.create({
      ...this.toParams(),
      status: newStatus as SuggestionStatus,
      adminResponse: adminResponse ?? this.adminResponse,
      updatedAt: new Date(),
    });
  }

  /** Factory — creates a Suggestion from raw data. Does not persist. */
  static create(params: SuggestionCreateParams): Suggestion {
    return new Suggestion(params);
  }

  static isValidStatus(status: string): status is SuggestionStatus {
    return VALID_STATUSES.includes(status as SuggestionStatus);
  }

  private toParams(): SuggestionCreateParams {
    return {
      id: this.id,
      doctorId: this.doctorId,
      subject: this.subject,
      message: this.message,
      category: this.category,
      status: this.status,
      adminResponse: this.adminResponse,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
