import { Inject, Injectable } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
} from '../../domain/repositories/iteam-meeting.repository';
import { TeamMeetingNotFoundError } from '../../domain/errors/team-meeting-not-found.error';
import type { TeamMeeting } from '../../domain/entities/team-meeting.entity';

export interface UpdateTeamMeetingAdminInput {
  meetingId: string;
  status?: 'done' | 'no_show' | 'cancelled';
  notes?: string | null;
}

/**
 * UpdateTeamMeetingAdminUseCase
 *
 * Allows an admin to update a team meeting's status (done, no_show, cancelled)
 * or internal notes. Does NOT perform the block/calendar cleanup that
 * CancelTeamMeetingUseCase does — this is an administrative override.
 */
@Injectable()
export class UpdateTeamMeetingAdminUseCase {
  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
  ) {}

  async execute(input: UpdateTeamMeetingAdminInput): Promise<TeamMeeting> {
    const meeting = await this.repo.findById(input.meetingId);
    if (!meeting) throw new TeamMeetingNotFoundError();

    return this.repo.update(meeting.id, {
      ...(input.status !== undefined && { status: input.status }),
      ...(input.notes !== undefined && { notes: input.notes }),
    });
  }
}
