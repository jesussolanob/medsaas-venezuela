import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { GetMeetingSlotsUseCase } from '../../application/use-cases/get-meeting-slots.use-case';
import { CreateTeamMeetingUseCase } from '../../application/use-cases/create-team-meeting.use-case';
import { GetCurrentTeamMeetingUseCase } from '../../application/use-cases/get-current-team-meeting.use-case';
import { RescheduleTeamMeetingUseCase } from '../../application/use-cases/reschedule-team-meeting.use-case';
import { CancelTeamMeetingUseCase } from '../../application/use-cases/cancel-team-meeting.use-case';
import { GetMeetingSlotsQuerySchema, BookTeamMeetingDtoSchema } from '@delta/shared-types';

/**
 * DoctorTeamMeetingsController — doctor-facing team meeting endpoints.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard.
 *
 * ROUTES:
 *   GET    /api/doctor/team-meetings/slots           — available booking slots
 *   POST   /api/doctor/team-meetings                 — book a meeting
 *   GET    /api/doctor/team-meetings/current         — current scheduled meeting
 *   PATCH  /api/doctor/team-meetings/:id/reschedule  — move to a new slot
 *   DELETE /api/doctor/team-meetings/:id             — cancel the meeting
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub) — anti-IDOR.
 *   - NEVER log PII.
 */
@Controller('doctor/team-meetings')
@UseGuards(AppAuthGuard)
export class DoctorTeamMeetingsController {
  constructor(
    private readonly getSlots: GetMeetingSlotsUseCase,
    private readonly createMeeting: CreateTeamMeetingUseCase,
    private readonly getCurrentMeeting: GetCurrentTeamMeetingUseCase,
    private readonly rescheduleMeeting: RescheduleTeamMeetingUseCase,
    private readonly cancelMeeting: CancelTeamMeetingUseCase,
  ) {}

  /**
   * GET /api/doctor/team-meetings/slots?days=14
   */
  @Get('slots')
  async getAvailableSlots(@CurrentUser() user: CurrentUserPayload, @Query() query: unknown) {
    const { days } = GetMeetingSlotsQuerySchema.parse(query);
    const data = await this.getSlots.execute(user.sub, days);
    return { success: true, data };
  }

  /**
   * GET /api/doctor/team-meetings/current
   */
  @Get('current')
  async getCurrent(@CurrentUser() user: CurrentUserPayload) {
    const data = await this.getCurrentMeeting.execute(user.sub);
    return { success: true, data };
  }

  /**
   * POST /api/doctor/team-meetings
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown) {
    const dto = BookTeamMeetingDtoSchema.parse(body);
    const data = await this.createMeeting.execute({
      doctorId: user.sub,
      date: dto.date,
      time: dto.time,
      source: 'modal',
    });
    return { success: true, data };
  }

  /**
   * PATCH /api/doctor/team-meetings/:id/reschedule
   */
  @Patch(':id/reschedule')
  async reschedule(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) meetingId: string,
    @Body() body: unknown,
  ) {
    const dto = BookTeamMeetingDtoSchema.parse(body);
    const data = await this.rescheduleMeeting.execute({
      meetingId,
      actorId: user.sub,
      date: dto.date,
      time: dto.time,
    });
    return { success: true, data };
  }

  /**
   * DELETE /api/doctor/team-meetings/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) meetingId: string,
  ) {
    await this.cancelMeeting.execute({ meetingId, actorId: user.sub, isAdmin: false });
    return { success: true, data: null };
  }
}
