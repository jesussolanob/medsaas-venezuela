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
  async handleWebhook(@Req() req: Request, @Body() body: unknown): Promise<{ success: true }> {
    // Verify webhook signature before processing
    this.verifySignature(req);

    // Zernio nests the data (message.text, message.conversationId, metadata.
    // interactiveId for button taps). Log only the key structure — never values,
    // they carry phones and message text.
    this.logger.log(`[webhook] shape=${describeShape(body)}`);
    const result = await this.handleWebhookUseCase.execute(normalizeZernioPayload(body));
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
      throw new UnauthorizedException('Error de configuración del servidor.');
    }

    const rawSignature = req.headers['x-zernio-signature'];
    if (!rawSignature || typeof rawSignature !== 'string') {
      throw new UnauthorizedException('Firma del webhook no presente.');
    }

    // Raw body is captured by the verify callback in main.ts useBodyParser.
    // Fail-closed: if rawBody is absent (middleware misconfiguration) reject the
    // request rather than falling back to a re-serialised body, which would
    // silently compute the wrong HMAC and accept spoofed payloads.
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('No fue posible verificar la firma del webhook.');
    }

    const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');

    const receivedHex = rawSignature.replace(/^sha256=/, '');

    const expected = Buffer.from(expectedHex, 'utf8');
    const received = Buffer.from(receivedHex, 'utf8');

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException('Firma del webhook inválida.');
    }
  }
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined;
const asStr = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Maps Zernio's message.received event to the flat shape the use case expects.
 *
 * Real payload shape (confirmed in staging):
 *   - metadata lives at the ROOT level (not inside message)
 *   - metadata.buttonPayload  → the button label the patient tapped
 *   - metadata.quotedMessageId → wamid of the original outbound reminder
 *   - account.accountId → identifies the Zernio account
 *
 * Accepts both the confirmed nested shape and a flat one (backward compat).
 */
export function normalizeZernioPayload(body: unknown): ZernioWebhookPayload {
  const root = asObj(body) ?? {};
  const message = asObj(root['message']) ?? {};
  const rootMetadata = asObj(root['metadata']) ?? {};
  const msgMetadata = asObj(message['metadata']) ?? {};
  const sender = asObj(message['sender']) ?? {};
  const account = asObj(root['account']) ?? {};

  // quotedMessageId: root metadata has priority per spec; fall back to message.metadata.
  const quotedMessageId =
    asStr(rootMetadata['quotedMessageId']) ?? asStr(msgMetadata['quotedMessageId']);

  // buttonPayload: the button label text ("Confirmar", "Reagendar", "Cancelar").
  // Root metadata first, then message.metadata, then root flat field for backward compat.
  const buttonPayload =
    asStr(rootMetadata['buttonPayload']) ??
    asStr(msgMetadata['buttonPayload']) ??
    asStr(rootMetadata['interactiveId']) ??
    asStr(msgMetadata['interactiveId']) ??
    asStr(root['buttonPayload']);

  return {
    event: asStr(root['event']) ?? asStr(root['type']),
    conversationId: asStr(message['conversationId']) ?? asStr(root['conversationId']),
    messageId: asStr(message['id']) ?? asStr(message['messageId']) ?? asStr(root['messageId']),
    participantId: asStr(sender['phoneNumber']) ?? asStr(root['participantId']),
    accountId: asStr(account['accountId']) ?? asStr(root['accountId']),
    quotedMessageId,
    buttonPayload,
    messageBody: asStr(message['text']) ?? asStr(root['messageBody']),
  };
}

/** Key paths of a payload (no values) — safe to log for diagnosing the shape. */
function describeShape(v: unknown, prefix = '', depth = 0): string {
  const o = asObj(v);
  if (!o || depth > 3) return prefix ? prefix : '';
  return Object.keys(o)
    .map((k) => {
      const path = prefix ? `${prefix}.${k}` : k;
      const child = asObj(o[k]);
      return child ? describeShape(child, path, depth + 1) : path;
    })
    .join(',');
}
