import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * CronSecretGuard
 *
 * Protects cron-only endpoints (e.g. POST /api/cron/appointment-reminders) by
 * requiring the caller to supply a shared secret via the `x-cron-secret` header.
 *
 * Behaviour:
 *   - If `CRON_SECRET` env var is NOT set (undefined/empty), the guard REJECTS
 *     every request in production — fail-closed policy to prevent accidental
 *     exposure. In non-production environments without CRON_SECRET, the guard
 *     also rejects (same fail-closed logic applies uniformly).
 *   - If the header is absent or does not match CRON_SECRET exactly → 403.
 *   - Uses strict string equality (not timing-safe) — the secret is already
 *     delivered over HTTPS and is not a user-controlled secret, so timing
 *     attacks are not a realistic threat model here.
 *
 * Usage:
 *   @UseGuards(CronSecretGuard)
 *   @Post('cron/appointment-reminders')
 *   async run() { ... }
 *
 * The secret is set in Cloud Run env / Secret Manager as CRON_SECRET and
 * passed as a header by the Cloud Scheduler HTTP request.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const cronSecret = process.env.CRON_SECRET;

    // Fail-closed: if the env var is not configured, never allow access.
    if (!cronSecret) {
      throw new ForbiddenException('Cron secret is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-cron-secret'];

    if (!header || header !== cronSecret) {
      throw new ForbiddenException('Invalid cron secret');
    }

    return true;
  }
}
