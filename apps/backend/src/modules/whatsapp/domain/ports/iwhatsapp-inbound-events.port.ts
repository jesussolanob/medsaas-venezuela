/**
 * Durable dedupe of inbound WhatsApp messages (Zernio retries deliveries).
 * `claim` returns true only the first time a message id is seen, across all
 * instances.
 */
export interface IWhatsAppInboundEvents {
  claim(messageId: string): Promise<boolean>;
}

export const WHATSAPP_INBOUND_EVENTS = Symbol('IWhatsAppInboundEvents');
