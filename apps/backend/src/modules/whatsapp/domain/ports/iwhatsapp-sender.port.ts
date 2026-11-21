/**
 * IWhatsAppSender — domain port for outbound WhatsApp messages.
 *
 * Infrastructure adapters (e.g. ZernioWhatsAppSender) implement this interface.
 * Application use-cases depend only on this interface (D in SOLID).
 *
 * No NestJS or infrastructure imports allowed in this file.
 */

export const WHATSAPP_SENDER = Symbol('IWhatsAppSender');

/** Parameters for a quick-reply button in a template message. */
export interface TemplateButtonParam {
  /** Zero-based index matching the button position in the template definition. */
  index: number;
  subType: 'quick_reply';
  parameters: Array<{ type: 'payload'; payload: string }>;
}

/** Input for sending a WhatsApp template message. */
export interface SendTemplateInput {
  /** E.164 phone number, e.g. '+584141234567'. */
  participantId: string;
  templateName: string;
  templateLanguage: string;
  templateParams: string[];
  templateButtonParams?: TemplateButtonParam[];
}

/** Result returned when a template message is sent successfully. */
export interface SendTemplateResult {
  messageId: string;
  conversationId: string;
  participantId: string;
}

/** Input for sending a free-text message within an existing conversation. */
export interface SendTextInput {
  conversationId: string;
  text: string;
}

/**
 * IWhatsAppSender — contract for sending WhatsApp messages.
 *
 * Implementations must:
 *   - Apply the allowlist gate (never send to numbers not in the list when list is set).
 *   - Apply the global WHATSAPP_ENABLED gate.
 *   - Normalize participantId to E.164 format.
 *   - Retry once on 5xx/429 with backoff.
 *   - Never throw raw HTTP errors — wrap in typed domain errors.
 *   - Never log phone numbers, message bodies, or participant ids.
 */
export interface IWhatsAppSender {
  /**
   * Sends a WhatsApp template message, opening or reusing a conversation.
   * Returns null when the recipient is blocked by the allowlist or the feature
   * is disabled — callers should treat null as a no-op (no error).
   */
  sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult | null>;

  /**
   * Sends a free-text reply within an existing conversation (24h window).
   * Returns false when blocked by allowlist or feature disabled.
   */
  sendText(input: SendTextInput): Promise<boolean>;
}
