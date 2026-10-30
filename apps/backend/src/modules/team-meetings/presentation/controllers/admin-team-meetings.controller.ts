import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ListTeamMeetingsAdminUseCase } from '../../application/use-cases/list-team-meetings-admin.use-case';
import { UpdateTeamMeetingAdminUseCase } from '../../application/use-cases/update-team-meeting-admin.use-case';
import { CancelTeamMeetingUseCase } from '../../application/use-cases/cancel-team-meeting.use-case';
import { GetTeamMeetingHostUseCase } from '../../application/use-cases/get-team-meeting-host.use-case';
import { UpdateTeamMeetingHostUseCase } from '../../application/use-cases/update-team-meeting-host.use-case';
import {
  AdminListTeamMeetingsQuerySchema,
  AdminUpdateTeamMeetingDtoSchema,
  AdminUpdateTeamMeetingHostDtoSchema,
} from '@delta/shared-types';

/**
 * AdminTeamMeetingsController — super_admin endpoints for team meetings.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard + RolesGuard('super_admin').
 *
 * ROUTES:
 *   GET  /api/admin/team-meetings                — list all meetings
 *   PATCH /api/admin/team-meetings/:id           — update status/notes
 *   GET  /api/admin/team-meetings/host           — get host configuration
 *   PUT  /api/admin/team-meetings/host           — update host configuration
 */
@Controller('admin/team-meetings')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminTeamMeetingsController {
  constructor(
    private readonly listMeetings: ListTeamMeetingsAdminUseCase,
    private readonly updateMeeting: UpdateTeamMeetingAdminUseCase,
    private readonly cancelMeeting: CancelTeamMeetingUseCase,
    private readonly getHost: GetTeamMeetingHostUseCase,
    private readonly updateHost: UpdateTeamMeetingHostUseCase,
  ) {}

  /**
   * GET /api/admin/team-meetings?status=&from=&to=&limit=50&offset=0
   */
  @Get()
  async list(@Query() query: unknown) {
    const parsed = AdminListTeamMeetingsQuerySchema.parse(query);
    const data = await this.listMeetings.execute({
      status: parsed.status,
      from: parsed.from ? new Date(parsed.from) : undefined,
      to: parsed.to ? new Date(parsed.to) : undefined,
      limit: parsed.limit,
      offset: parsed.offset,
    });
    return {
      success: true,
      data: data.items,
      meta: { total: data.total, limit: parsed.limit, offset: parsed.offset },
    };
  }

  /**
   * PATCH /api/admin/team-meetings/:id
   *
   * When status='cancelled', routes to CancelTeamMeetingUseCase (isAdmin=true)
   * so the availability block and Google event are cleaned up and all parties
   * are notified. Any other status/notes update uses UpdateTeamMeetingAdminUseCase.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) meetingId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const dto = AdminUpdateTeamMeetingDtoSchema.parse(body);

    if (dto.status === 'cancelled') {
      await this.cancelMeeting.execute({ meetingId, actorId: user.sub, isAdmin: true });
      return { success: true, data: null };
    }

    const data = await this.updateMeeting.execute({
      meetingId,
      status: dto.status,
      notes: dto.notes,
    });
    return { success: true, data };
  }

  /**
   * GET /api/admin/team-meetings/host
   */
  @Get('host')
  async host() {
    const data = await this.getHost.execute();
    return { success: true, data };
  }

  /**
   * PUT /api/admin/team-meetings/host
   */
  @Put('host')
  @HttpCode(HttpStatus.OK)
  async setHost(@Body() body: unknown) {
    const dto = AdminUpdateTeamMeetingHostDtoSchema.parse(body);
    await this.updateHost.execute(dto.profileId);
    return { success: true, data: null };
  }
}
