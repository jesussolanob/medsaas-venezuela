import { Inject, Injectable } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
} from '../../domain/repositories/iteam-meeting.repository';
import type { TeamMeeting } from '../../domain/entities/team-meeting.entity';

export type GetCurrentTeamMeetingOutput = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  meetingUrl: string | null;
  source: string;
} | null;

/**
 * GetCurrentTeamMeetingUseCase
 *
 * Returns the doctor's currently scheduled team meeting, or null if none exists.
 */
@Injectable()
export class GetCurrentTeamMeetingUseCase {
  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
  ) {}

  async execute(doctorId: string): Promise<GetCurrentTeamMeetingOutput> {
    const meeting: TeamMeeting | null = await this.repo.findScheduledByDoctor(doctorId);
    if (!meeting) return null;

    return {
      id: meeting.id,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      status: meeting.status,
      meetingUrl: meeting.meetingUrl,
      source: meeting.source,
    };
  }
}
