import { Inject, Injectable } from '@nestjs/common';
import {
  TEAM_MEETING_REPOSITORY,
  type ITeamMeetingRepository,
  type ListTeamMeetingsFilter,
  type ListTeamMeetingsResult,
} from '../../domain/repositories/iteam-meeting.repository';
import type { TeamMeetingStatus } from '../../domain/entities/team-meeting.entity';

export interface ListTeamMeetingsAdminInput {
  status?: TeamMeetingStatus;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

/**
 * ListTeamMeetingsAdminUseCase
 *
 * Returns a paginated list of team meetings with doctor information.
 * Admin-only.
 */
@Injectable()
export class ListTeamMeetingsAdminUseCase {
  constructor(
    @Inject(TEAM_MEETING_REPOSITORY)
    private readonly repo: ITeamMeetingRepository,
  ) {}

  async execute(input: ListTeamMeetingsAdminInput): Promise<ListTeamMeetingsResult> {
    const filter: ListTeamMeetingsFilter = {
      status: input.status,
      from: input.from,
      to: input.to,
      limit: input.limit,
      offset: input.offset,
    };

    return this.repo.listWithDoctor(filter);
  }
}
