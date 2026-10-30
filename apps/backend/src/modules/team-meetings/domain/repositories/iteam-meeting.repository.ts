import type { TeamMeeting, TeamMeetingStatus } from '../entities/team-meeting.entity';

export const TEAM_MEETING_REPOSITORY = Symbol('ITeamMeetingRepository');

export interface CreateTeamMeetingParams {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  status: TeamMeetingStatus;
  meetingUrl: string | null;
  externalEventId: string | null;
  availabilityBlockId: string | null;
  source: string;
  notes: string | null;
}

export interface UpdateTeamMeetingParams {
  status?: TeamMeetingStatus;
  meetingUrl?: string | null;
  externalEventId?: string | null;
  availabilityBlockId?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  notes?: string | null;
  reminder24hSentAt?: Date | null;
  reminder1hSentAt?: Date | null;
}

export interface TeamMeetingWithDoctor {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  doctorPhone: string | null;
  doctorPlan: string | null;
  doctorSpecialty: string | null;
  startsAt: Date;
  endsAt: Date;
  status: TeamMeetingStatus;
  meetingUrl: string | null;
  externalEventId: string | null;
  availabilityBlockId: string | null;
  source: string;
  notes: string | null;
  reminder24hSentAt: Date | null;
  reminder1hSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListTeamMeetingsFilter {
  status?: TeamMeetingStatus;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface ListTeamMeetingsResult {
  items: TeamMeetingWithDoctor[];
  total: number;
}

export interface AppSettingRow {
  key: string;
  value: string;
}

export interface SuperAdminRow {
  id: string;
  email: string;
  fullName: string | null;
}

export interface DoctorAppointmentRow {
  scheduledAt: Date;
  durationMinutes: number | null;
}

export interface OfficeScheduleRow {
  /** officeDay: 0=Monday … 6=Sunday */
  officeDay: number;
  /** HH:MM start time */
  startTime: string;
  /** HH:MM end time */
  endTime: string;
  /** slot duration in minutes */
  slotDuration: number;
  /** buffer between slots in minutes */
  bufferMinutes: number;
}

export interface AvailabilityBlockRow {
  startsAt: Date;
  endsAt: Date;
}

/** Row for team meetings needing a reminder check */
export interface MeetingReminderRow {
  id: string;
  doctorId: string;
  doctorEmail: string;
  doctorName: string | null;
  startsAt: Date;
  meetingUrl: string | null;
  reminder24hSentAt: Date | null;
  reminder1hSentAt: Date | null;
}

export interface ITeamMeetingRepository {
  /** Creates a new team meeting. */
  create(params: CreateTeamMeetingParams): Promise<TeamMeeting>;

  /** Finds the currently scheduled meeting for a doctor (status='scheduled'). */
  findScheduledByDoctor(doctorId: string): Promise<TeamMeeting | null>;

  /** Finds any meeting (any status) by its ID. */
  findById(id: string): Promise<TeamMeeting | null>;

  /** Updates a team meeting. */
  update(id: string, params: UpdateTeamMeetingParams): Promise<TeamMeeting>;

  /** Returns a paginated admin list with doctor data. */
  listWithDoctor(filter: ListTeamMeetingsFilter): Promise<ListTeamMeetingsResult>;

  /** Returns all super_admin profiles for notification dispatch. */
  findAllSuperAdmins(): Promise<SuperAdminRow[]>;

  /** Returns app_settings values for the given keys. */
  getSettings(keys: string[]): Promise<AppSettingRow[]>;

  /** Updates a single app_setting key. */
  updateSetting(key: string, value: string): Promise<void>;

  /** Returns the doctor's profile (name, email, phone, specialty). */
  getDoctorProfile(
    doctorId: string,
  ): Promise<{
    name: string | null;
    email: string;
    phone: string | null;
    specialty: string | null;
  } | null>;

  /** Returns active office schedules for the doctor. */
  getActiveOfficeSchedules(doctorId: string): Promise<OfficeScheduleRow[]>;

  /**
   * Returns the doctor's active appointments in a date range.
   * Only non-cancelled appointments are returned.
   */
  getAppointmentsInRange(doctorId: string, from: Date, to: Date): Promise<DoctorAppointmentRow[]>;

  /** Returns availability blocks overlapping the given range. */
  getAvailabilityBlocksInRange(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<AvailabilityBlockRow[]>;

  /**
   * Returns meetings that need a reminder in the 24h or 1h window,
   * capped at `cap` rows.
   */
  findMeetingsNeedingReminder(now: Date, cap: number): Promise<MeetingReminderRow[]>;

  /**
   * Marks the 24h reminder as sent for a meeting.
   * Idempotent — safe to call even if already sent.
   */
  markReminder24hSent(id: string, sentAt: Date): Promise<void>;

  /**
   * Marks the 1h reminder as sent for a meeting.
   * Idempotent — safe to call even if already sent.
   */
  markReminder1hSent(id: string, sentAt: Date): Promise<void>;
}
