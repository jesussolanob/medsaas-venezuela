import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { GetUnseenReleaseNotesUseCase } from '../../application/use-cases/get-unseen-release-notes.use-case';
import { MarkReleaseNotesSeenUseCase } from '../../application/use-cases/mark-release-notes-seen.use-case';
import { GetReleaseNotesHistoryUseCase } from '../../application/use-cases/get-release-notes-history.use-case';

/**
 * DoctorReleaseNotesController — doctor-facing release notes endpoints.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard (doctor or any authenticated role).
 *
 * ROUTES:
 *   GET  /api/doctor/release-notes/unseen  — unseen notes for the modal (max 5)
 *   POST /api/doctor/release-notes/seen    — mark all notes as seen
 *   GET  /api/doctor/release-notes         — history: all published notes (limit 50)
 *
 * SECURITY:
 *   - doctorId and plan are ALWAYS taken from the authenticated user — anti-IDOR.
 *   - NEVER log PII.
 */
@Controller('doctor/release-notes')
@UseGuards(AppAuthGuard)
export class DoctorReleaseNotesController {
  constructor(
    private readonly getUnseenUseCase: GetUnseenReleaseNotesUseCase,
    private readonly markSeenUseCase: MarkReleaseNotesSeenUseCase,
    private readonly getHistoryUseCase: GetReleaseNotesHistoryUseCase,
  ) {}

  /**
   * GET /api/doctor/release-notes/unseen
   *
   * Returns up to 5 published notes the doctor has not yet seen.
   * Used to populate the "Novedades" modal on /doctor (Inicio).
   *
   * NOTE: This route must be registered BEFORE the base @Get() to avoid
   * 'unseen' being treated as an id param in a route like /:id.
   */
  @Get('unseen')
  async unseen(@CurrentUser() user: CurrentUserPayload): Promise<{ success: true; data: unknown }> {
    const data = await this.getUnseenUseCase.execute(user.sub);
    return { success: true, data: data.items };
  }

  /**
   * POST /api/doctor/release-notes/seen
   *
   * Sets profiles.release_notes_seen_at = now() (server time).
   * Called when the doctor closes the "Novedades" modal with "Entendido".
   */
  @Post('seen')
  @HttpCode(HttpStatus.OK)
  async markSeen(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: true; data: { seenAt: string } }> {
    const data = await this.markSeenUseCase.execute(user.sub);
    return { success: true, data };
  }

  /**
   * GET /api/doctor/release-notes
   *
   * Returns the history of all published notes for the doctor's plan.
   * Ordered newest first, limit 50.
   * Used in Ayuda → "Novedades".
   */
  @Get()
  async history(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ success: true; data: unknown }> {
    const data = await this.getHistoryUseCase.execute(user.sub);
    return { success: true, data: data.items };
  }
}
