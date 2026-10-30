/**
 * TeamMeeting domain entity.
 *
 * Represents a scheduled 30-minute video call between the Delta team and a
 * specialist as part of the retention plan.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export type TeamMeetingStatus = 'scheduled' | 'done' | 'no_show' | 'cancelled';
export type TeamMeetingSource = 'email' | 'modal';

export const TEAM_MEETING_STATUSES: TeamMeetingStatus[] = [
  'scheduled',
  'done',
  'no_show',
  'cancelled',
];

export const TEAM_MEETING_SOURCES: TeamMeetingSource[] = ['email', 'modal'];

/** How many hours before a meeting the doctor can still reschedule or cancel. */
export const MEETING_MODIFY_CUTOFF_HOURS = 2;

export interface TeamMeetingProps {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  status: TeamMeetingStatus;
  meetingUrl: string | null;
  externalEventId: string | null;
  availabilityBlockId: string | null;
  source: TeamMeetingSource;
  notes: string | null;
  reminder24hSentAt: Date | null;
  reminder1hSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TeamMeeting {
  readonly id: string;
  readonly doctorId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: TeamMeetingStatus;
  readonly meetingUrl: string | null;
  readonly externalEventId: string | null;
  readonly availabilityBlockId: string | null;
  readonly source: TeamMeetingSource;
  readonly notes: string | null;
  readonly reminder24hSentAt: Date | null;
  readonly reminder1hSentAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: TeamMeetingProps) {
    this.id = props.id;
    this.doctorId = props.doctorId;
    this.startsAt = props.startsAt;
    this.endsAt = props.endsAt;
    this.status = props.status;
    this.meetingUrl = props.meetingUrl;
    this.externalEventId = props.externalEventId;
    this.availabilityBlockId = props.availabilityBlockId;
    this.source = props.source;
    this.notes = props.notes;
    this.reminder24hSentAt = props.reminder24hSentAt;
    this.reminder1hSentAt = props.reminder1hSentAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Returns true when the meeting is in a scheduled state (future). */
  isScheduled(): boolean {
    return this.status === 'scheduled';
  }

  /** Returns true when the meeting has been completed. */
  isDone(): boolean {
    return this.status === 'done';
  }

  /** Returns true when the meeting was cancelled. */
  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  /**
   * Returns true when the doctor can still modify this meeting.
   * The cutoff is MEETING_MODIFY_CUTOFF_HOURS before the meeting starts.
   */
  isModifiable(now: Date): boolean {
    if (!this.isScheduled()) return false;
    const cutoffMs = MEETING_MODIFY_CUTOFF_HOURS * 60 * 60 * 1000;
    return now.getTime() < this.startsAt.getTime() - cutoffMs;
  }

  /**
   * Anti-IDOR: returns true when the given actorId owns this meeting.
   */
  isOwnedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }

  static create(props: TeamMeetingProps): TeamMeeting {
    return new TeamMeeting(props);
  }
}
