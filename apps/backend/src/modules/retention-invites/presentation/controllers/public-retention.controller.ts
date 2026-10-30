import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RecordInviteClickUseCase } from '../../application/use-cases/record-invite-click.use-case';
import { RecordInviteClickDtoSchema } from '@delta/shared-types';

/**
 * PublicRetentionController — no authentication required.
 *
 * Handles the invite link click-tracking step.
 * The frontend `/r/meeting` page calls this endpoint before redirecting
 * to the login screen.
 *
 * Security:
 *   - No auth guard — intentionally public.
 *   - The HMAC token is verified inside the use case (timing-safe).
 *   - Always returns 204 — even for invalid tokens (no oracle).
 *   - Rate-limiting: deliberately omitted in this phase — no ThrottlerModule
 *     exists in the project; the endpoint cannot modify data; Cloudflare fronts
 *     all requests and provides edge-level protection.
 *
 * ROUTES:
 *   POST /api/public/retention/click
 */
@Controller('public/retention')
export class PublicRetentionController {
  constructor(private readonly recordClick: RecordInviteClickUseCase) {}

  /**
   * POST /api/public/retention/click
   * Body: { t: string }
   */
  @Post('click')
  @HttpCode(HttpStatus.NO_CONTENT)
  async click(@Body() body: unknown): Promise<void> {
    const dto = RecordInviteClickDtoSchema.parse(body);
    await this.recordClick.execute({ token: dto.t });
  }
}
