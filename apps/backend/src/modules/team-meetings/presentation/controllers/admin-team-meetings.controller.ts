import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { GrantGraceMonthUseCase } from '../../../retention-invites/application/use-cases/grant-grace-month.use-case';
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
 *   POST /api/admin/team-meetings/:id/grant-grace — grant grace month after meeting done
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
    /**
     * Injected @Optional so TeamMeetingsModule stays backward-compatible when
     * RetentionInvitesModule is not imported (e.g. isolated unit tests).
     */
    @Optional()
    @Inject(GrantGraceMonthUseCase)
    private readonly grantGraceMonth: GrantGraceMonthUseCase | null = null,
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
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id', ParseUUIDPipe) meetingId: string, @Body() body: unknown) {
    const dto = AdminUpdateTeamMeetingDtoSchema.parse(body);
    const data = await this.updateMeeting.execute({
      meetingId,
      status: dto.status,
      notes: dto.notes,
    });
    return { success: true, data };
  }

  /**
   * POST /api/admin/team-meetings/:id/grant-grace
   *
   * Grants one grace month to the doctor associated with the given team meeting.
   * Only callable when the meeting status is 'done'. Idempotent-safe: returns
   * 409 if a grace month was already granted for this doctor.
   */
  @Post(':id/grant-grace')
  @HttpCode(HttpStatus.OK)
  async grantGrace(
    @Param('id', ParseUUIDPipe) meetingId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!this.grantGraceMonth) {
      return {
        success: false,
        error: { code: 'NOT_AVAILABLE', message: 'Grace month feature not available' },
      };
    }
    const data = await this.grantGraceMonth.execute({ meetingId, actorId: user.sub });
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
