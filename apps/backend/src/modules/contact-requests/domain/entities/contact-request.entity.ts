/**
 * ContactRequest domain entity.
 *
 * Represents a specialist's request to be contacted by the support team.
 *
 * Invariants:
 *   - message must be ≤ 500 characters when provided.
 *   - Status transitions: pending → contacted → resolved, or pending → resolved.
 *   - canTransitionTo() enforces allowed transitions.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export type ContactChannel = 'call_now' | 'whatsapp' | 'call' | 'email';
export type ContactRequestStatus = 'pending' | 'contacted' | 'resolved';

export const CONTACT_CHANNELS: ContactChannel[] = ['call_now', 'whatsapp', 'call', 'email'];
export const CONTACT_REQUEST_STATUSES: ContactRequestStatus[] = [
  'pending',
  'contacted',
  'resolved',
];

const MESSAGE_MAX_LENGTH = 500;

export interface ContactRequestParams {
  id: string;
  doctorId: string;
  channel: ContactChannel;
  message: string | null;
  status: ContactRequestStatus;
  handledBy: string | null;
  handledAt: Date | null;
  notes: string | null;
  notificationCount: number;
  lastNotifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ContactRequest {
  readonly id: string;
  readonly doctorId: string;
  readonly channel: ContactChannel;
  readonly message: string | null;
  readonly status: ContactRequestStatus;
  readonly handledBy: string | null;
  readonly handledAt: Date | null;
  readonly notes: string | null;
  readonly notificationCount: number;
  readonly lastNotifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: ContactRequestParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.channel = params.channel;
    this.message = params.message;
    this.status = params.status;
    this.handledBy = params.handledBy;
    this.handledAt = params.handledAt;
    this.notes = params.notes;
    this.notificationCount = params.notificationCount;
    this.lastNotifiedAt = params.lastNotifiedAt;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true when the given actorId is a valid super_admin handler. */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /** Returns true when the message length is within bounds. */
  static isValidMessage(message: string | null | undefined): boolean {
    if (message === null || message === undefined) return true;
    return message.length <= MESSAGE_MAX_LENGTH;
  }

  /**
   * Returns whether a transition from the current status to the given status is valid.
   *
   * Allowed transitions:
   *   pending    → contacted | resolved
   *   contacted  → resolved
   *   resolved   → (no further transitions)
   */
  canTransitionTo(newStatus: ContactRequestStatus): boolean {
    if (this.status === 'pending') {
      return newStatus === 'contacted' || newStatus === 'resolved';
    }
    if (this.status === 'contacted') {
      return newStatus === 'resolved';
    }
    return false;
  }

  /** Factory — constructs from raw params. Does not persist. */
  static create(params: ContactRequestParams): ContactRequest {
    return new ContactRequest(params);
  }
}
