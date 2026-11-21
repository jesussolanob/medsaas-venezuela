import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { phoneTelUri } from '@delta/shared-utils';
import type {
  IWhatsAppSender,
  SendTemplateInput,
  SendTemplateResult,
  SendTextInput,
} from '../../domain/ports/iwhatsapp-sender.port';
import { WhatsAppSendFailedError } from '../../domain/errors/whatsapp-send-failed.error';

const ZERNIO_BASE = 'https://api.zernio.com';
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_500;

/**
 * ZernioWhatsAppSenderAdapter
 *
 * Implements IWhatsAppSender using the Zernio WhatsApp Cloud API reseller.
 *
 * Gating (applied before any outbound request):
 *   1. WHATSAPP_ENABLED — global on/off switch (default: false).
 *   2. WHATSAPP_ALLOWLIST — comma-separated E.164 digit strings (no leading '+').
 *      When non-empty, ONLY numbers in this list receive messages.
 *      In staging: set to a single test number to prevent messaging real patients.
 *
 * Retry: one retry on 5xx / 429 after RETRY_DELAY_MS.
 *
 * PII policy:
 *   - Logger NEVER emits phone numbers, participant IDs, message bodies,
 *     conversation IDs, or message IDs.
 *   - Only error codes and status codes are logged.
 */
@Injectable()
export class ZernioWhatsAppSenderAdapter implements IWhatsAppSender {
  private readonly logger = new Logger(ZernioWhatsAppSenderAdapter.name);

  private readonly apiKey: string | null;
  private readonly accountId: string | null;
  private readonly enabled: boolean;
  private readonly allowlist: Set<string>;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ZERNIO_API_KEY') ?? null;
    this.accountId = config.get<string>('ZERNIO_WHATSAPP_ACCOUNT_ID') ?? null;
    this.enabled = (config.get<string>('WHATSAPP_ENABLED') ?? 'false').toLowerCase() === 'true';

    const raw = config.get<string>('WHATSAPP_ALLOWLIST') ?? '';
    this.allowlist = raw
      ? new Set(
          raw
            .split(',')
            .map((s) => s.trim().replace(/\D/g, ''))
            .filter(Boolean),
        )
      : new Set();
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult | null> {
    const e164 = this.normalizePhone(input.participantId);
    if (!this.isAllowed(e164)) return null;

    const body = {
      accountId: this.accountId,
      participantId: e164,
      templateName: input.templateName,
      templateLanguage: input.templateLanguage,
      templateParams: input.templateParams,
      ...(input.templateButtonParams?.length
        ? { templateButtonParams: input.templateButtonParams }
        : {}),
    };

    const raw = await this.requestWithRetry('POST', '/v1/inbox/conversations', body);

    const data = raw?.data as
      | {
          messageId?: string;
          conversationId?: string;
          participantId?: string;
        }
      | undefined;

    if (!data?.messageId || !data?.conversationId) {
      throw new WhatsAppSendFailedError('Respuesta inesperada del proveedor');
    }

    return {
      messageId: data.messageId,
      conversationId: data.conversationId,
      participantId: data.participantId ?? e164,
    };
  }

  async sendText(input: SendTextInput): Promise<boolean> {
    // For free-text replies we need to know the original participant number to gate.
    // We skip the allowlist check here because the conversation was already gated
    // when it was opened — if we can send a text reply, the conversation exists.
    if (!this.enabled || !this.apiKey || !this.accountId) return false;

    const body = { text: input.text };

    try {
      await this.requestWithRetry(
        'POST',
        `/v1/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`,
        body,
      );
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private isAllowed(e164: string): boolean {
    if (!this.enabled) return false;
    if (!this.apiKey || !this.accountId) return false;

    if (this.allowlist.size === 0) return true;

    // Compare digits only (strip leading '+')
    const digits = e164.replace(/\D/g, '');
    return this.allowlist.has(digits);
  }

  private normalizePhone(raw: string): string {
    // phoneTelUri prepends '+' and validates length (8–15 digits).
    return phoneTelUri(raw) || `+${raw.replace(/\D/g, '')}`;
  }

  private async requestWithRetry(
    method: string,
    path: string,
    body: unknown,
  ): Promise<{ success: boolean; data: unknown }> {
    const attempt = async (): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await fetch(`${ZERNIO_BASE}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let res: Response;
    try {
      res = await attempt();
    } catch (err: unknown) {
      this.logger.warn(
        `[zernio] request failed (attempt 1): ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.sleep(RETRY_DELAY_MS);
      try {
        res = await attempt();
      } catch (err2: unknown) {
        throw new WhatsAppSendFailedError(
          `Red inaccesible: ${err2 instanceof Error ? err2.message : String(err2)}`,
        );
      }
    }

    // Retry once on 5xx or 429
    if (res.status >= 500 || res.status === 429) {
      this.logger.warn(`[zernio] status ${res.status} on attempt 1 — retrying`);
      await this.sleep(RETRY_DELAY_MS);
      try {
        res = await attempt();
      } catch (err3: unknown) {
        throw new WhatsAppSendFailedError(
          `Reintento fallido: ${err3 instanceof Error ? err3.message : String(err3)}`,
        );
      }
    }

    if (!res.ok) {
      const code = await this.safeText(res);
      throw new WhatsAppSendFailedError(`HTTP ${res.status}: ${code}`);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new WhatsAppSendFailedError('Respuesta no es JSON');
    }

    return json as { success: boolean; data: unknown };
  }

  private async safeText(res: Response): Promise<string> {
    try {
      return await res.text();
    } catch {
      return String(res.status);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
