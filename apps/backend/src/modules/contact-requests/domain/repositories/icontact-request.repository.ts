import type { ContactRequest, ContactRequestStatus } from '../entities/contact-request.entity';

export const CONTACT_REQUEST_REPOSITORY = Symbol('IContactRequestRepository');

export interface SaveContactRequestParams {
  id: string;
  doctorId: string;
  channel: string;
  message: string | null;
  status: string;
  handledBy: string | null;
  handledAt: Date | null;
  notes: string | null;
  notificationCount: number;
  lastNotifiedAt: Date | null;
}

export interface UpdateContactRequestParams {
  status?: ContactRequestStatus;
  handledBy?: string;
  handledAt?: Date;
  notes?: string | null;
}

export interface ContactRequestWithDoctor {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  doctorPhone: string | null;
  doctorPlan: string;
  doctorSpecialty: string | null;
  channel: string;
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

export interface ListContactRequestsFilter {
  status?: ContactRequestStatus;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface ListContactRequestsResult {
  items: ContactRequestWithDoctor[];
  total: number;
}

export interface SuperAdminRow {
  id: string;
  email: string;
  fullName: string;
}

export interface AppSettingRow {
  key: string;
  value: string;
}

export interface IContactRequestRepository {
  /** Persists a new contact request (insert). */
  save(params: SaveContactRequestParams): Promise<ContactRequest>;

  /**
   * Updates the pending request for a doctor in place (channel, message, updatedAt).
   * Used when the doctor submits a second request while one is already pending.
   */
  updatePendingForDoctor(
    doctorId: string,
    params: { channel: string; message: string | null },
  ): Promise<ContactRequest | null>;

  /** Returns the pending contact request for a doctor, or null if none. */
  findPendingByDoctorId(doctorId: string): Promise<ContactRequest | null>;

  /** Returns a contact request by ID, or null if not found. */
  findById(id: string): Promise<ContactRequest | null>;

  /** Updates a contact request (status, notes, handledBy, handledAt). */
  update(id: string, params: UpdateContactRequestParams): Promise<ContactRequest>;

  /**
   * Returns the number of notification sends for a doctor in the last 24 hours.
   * Reads from notification_count / last_notified_at on the pending request.
   * @deprecated Use reserveNotificationSlot for atomic check+increment.
   */
  getNotificationCountSince(doctorId: string, since: Date): Promise<number>;

  /**
   * Increments notification_count and sets last_notified_at on the pending request.
   * @deprecated Use reserveNotificationSlot for atomic check+increment.
   */
  incrementNotificationCount(doctorId: string, at: Date): Promise<void>;

  /**
   * Atomically reserves a notification slot for a doctor.
   *
   * Counts ALL notifications sent to this doctor in the 24-hour window
   * (across all their requests, not just the current pending row), so
   * resolving a request does not reset the daily limit.
   *
   * If the count is below `max`, increments `notification_count` and sets
   * `last_notified_at = now` on the pending row, then returns true.
   * If the count is already at `max` (or no pending row exists), returns false.
   *
   * This single UPDATE replaces the separate getNotificationCountSince +
   * incrementNotificationCount pair, eliminating the TOCTOU race where N
   * concurrent POSTs all pass the read check before any write lands.
   */
  reserveNotificationSlot(doctorId: string, since: Date, now: Date, max: number): Promise<boolean>;

  /** Returns a paginated list of contact requests with doctor profile data. */
  listWithDoctor(filter: ListContactRequestsFilter): Promise<ListContactRequestsResult>;

  /**
   * Returns a single contact request with its doctor profile data joined in.
   * Returns null when the request does not exist.
   * Used by notification dispatch to reliably get the correct doctor's data
   * regardless of other concurrent requests.
   */
  findByIdWithDoctor(id: string): Promise<ContactRequestWithDoctor | null>;

  /** Returns count of requests with status = 'pending'. */
  countPending(): Promise<number>;

  /** Returns all super_admin profiles for notification dispatch. */
  findAllSuperAdmins(): Promise<SuperAdminRow[]>;

  /** Returns app_settings values for the given keys. */
  getSettings(keys: string[]): Promise<AppSettingRow[]>;
}
