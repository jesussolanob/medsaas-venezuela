import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { GetMeetingPromptStatusUseCase } from '../../application/use-cases/get-meeting-prompt-status.use-case';
import { RecordPromptShownUseCase } from '../../application/use-cases/record-prompt-shown.use-case';
import { SnoozePromptUseCase } from '../../application/use-cases/snooze-prompt.use-case';
import { DismissPromptUseCase } from '../../application/use-cases/dismiss-prompt.use-case';

/**
 * DoctorPromptsController — lifecycle management for doctor-facing prompts.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard (doctor role).
 *
 * ROUTES:
 *   GET  /api/doctor/prompts/meeting         — should show modal?
 *   POST /api/doctor/prompts/meeting/shown   — mark as shown
 *   POST /api/doctor/prompts/meeting/snooze  — snooze for N days
 *   POST /api/doctor/prompts/meeting/dismiss — permanently dismiss
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub) — anti-IDOR.
 *   - The :key param is hardcoded to 'meeting_modal' for the meeting routes.
 */
@Controller('doctor/prompts')
@UseGuards(AppAuthGuard)
export class DoctorPromptsController {
  constructor(
    private readonly getMeetingStatus: GetMeetingPromptStatusUseCase,
    private readonly recordShown: RecordPromptShownUseCase,
    private readonly snooze: SnoozePromptUseCase,
    private readonly dismiss: DismissPromptUseCase,
  ) {}

  /**
   * GET /api/doctor/prompts/meeting
   *
   * Evaluates all rules and returns whether to show the "Queremos conocerte" modal.
   */
  @Get('meeting')
  async meetingStatus(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: true; data: unknown }> {
    const data = await this.getMeetingStatus.execute(user.sub);
    return { success: true, data };
  }

  /**
   * POST /api/doctor/prompts/meeting/shown
   *
   * Called when the modal is rendered — increments shown_count.
   */
  @Post('meeting/shown')
  @HttpCode(HttpStatus.OK)
  async meetingShown(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: true; data: unknown }> {
    const data = await this.recordShown.execute(user.sub, 'meeting_modal');
    return { success: true, data: { id: data.id, shownCount: data.shownCount } };
  }

  /**
   * POST /api/doctor/prompts/meeting/snooze
   *
   * Called when doctor clicks "Ahora no" — snoozes for N days.
   */
  @Post('meeting/snooze')
  @HttpCode(HttpStatus.OK)
  async meetingSnooze(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: true; data: unknown }> {
    const data = await this.snooze.execute(user.sub, 'meeting_modal');
    return { success: true, data: { id: data.id, snoozedUntil: data.snoozedUntil } };
  }

  /**
   * POST /api/doctor/prompts/meeting/dismiss
   *
   * Called when doctor clicks "No me interesa" — permanently dismisses.
   */
  @Post('meeting/dismiss')
  @HttpCode(HttpStatus.OK)
  async meetingDismiss(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: true; data: unknown }> {
    const data = await this.dismiss.execute(user.sub, 'meeting_modal');
    return { success: true, data: { id: data.id, dismissedAt: data.dismissedAt } };
  }
}
