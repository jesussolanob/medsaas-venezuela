import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { HandleWhatsAppWebhookUseCase } from '../../application/use-cases/handle-whatsapp-webhook.use-case';
import type { ZernioWebhookPayload } from '../../application/use-cases/handle-whatsapp-webhook.use-case';

/**
 * WhatsAppWebhookController
 *
 * Handles POST /api/webhooks/zernio — inbound events from the Zernio platform.
 *
 * Security:
 *   - Signature verification: Zernio signs the raw body with HMAC-SHA256
 *     (key = ZERNIO_WEBHOOK_SECRET). The signature is in the
 *     `x-zernio-signature` header as `sha256=<hex>`.
 *   - Fail-closed: when ZERNIO_WEBHOOK_SECRET is not configured the guard
 *     rejects ALL requests (prevents spoofed webhooks in production).
 *   - Timing-safe comparison to prevent timing-based enumeration.
 *   - Always returns HTTP 200 after signature verification to prevent
 *     Zernio from retrying legitimate events due to business-logic errors.
 *
 * PII policy:
 *   - Logger NEVER emits phone numbers, message bodies, or participant IDs.
 */
@Controller('webhooks')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly handleWebhookUseCase: HandleWhatsAppWebhookUseCase) {}

  @Post('zernio')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: Request,
    @Body() body: ZernioWebhookPayload,
  ): Promise<{ success: true }> {
    // Verify webhook signature before processing
    this.verifySignature(req);

    // Delegate to use case — always returns 200 (errors logged internally)
    const result = await this.handleWebhookUseCase.execute(body);
    this.logger.debug(`[webhook] action=${result.action}`);

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Signature verification
  // ---------------------------------------------------------------------------

  private verifySignature(req: Request): void {
    const secret = process.env.ZERNIO_WEBHOOK_SECRET;

    if (!secret) {
      // Fail-closed: if secret is not configured, reject all requests.
      throw new UnauthorizedException('Webhook secret is not configured');
    }

    const rawSignature = req.headers['x-zernio-signature'];
    if (!rawSignature || typeof rawSignature !== 'string') {
      throw new UnauthorizedException('Missing webhook signature');
    }

    // Raw body is captured by the verify callback in main.ts useBodyParser.
    // Fail-closed: if rawBody is absent (middleware misconfiguration) reject the
    // request rather than falling back to a re-serialised body, which would
    // silently compute the wrong HMAC and accept spoofed payloads.
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Raw body not available for signature verification');
    }

    const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');

    const receivedHex = rawSignature.replace(/^sha256=/, '');

    const expected = Buffer.from(expectedHex, 'utf8');
    const received = Buffer.from(receivedHex, 'utf8');

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
