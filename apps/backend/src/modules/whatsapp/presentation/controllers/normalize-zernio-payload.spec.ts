import { normalizeZernioPayload } from './whatsapp-webhook.controller';

/**
 * Real Zernio message.received payload captured from staging delivery log (PII masked).
 * This is the canonical shape the normalization function must handle.
 */
const REAL_ZERNIO_PAYLOAD = {
  id: '6197ec5f-test',
  event: 'message.received',
  message: {
    id: '6b05c85d-test',
    conversationId: '6b05bd40-test',
    platform: 'whatsapp',
    platformMessageId: 'wamid.incoming',
    direction: 'incoming',
    text: 'Confirmar',
    attachments: [],
    sender: {
      id: '58424000000',
      name: 'Test Patient',
      phoneNumber: '+584240000000',
      businessScopedUserId: 'bsid',
      contactId: 'cid',
    },
    sentAt: '2026-11-24T10:00:00Z',
  },
  conversation: {
    id: '6b05bd40-test',
    platformConversationId: '58424000000',
    participantId: '58424000000',
  },
  account: {
    id: '6afc5b492728c5ed0bbdb5f7',
    accountId: '6afc5b492728c5ed0bbdb5f7',
    platform: 'whatsapp',
  },
  metadata: {
    buttonPayload: 'Confirmar',
    quotedMessageId: 'wamid.HBgMNTg0MjQyNTg4MzkxFQIAERgSMDM2MUETEST==',
    quotedMessage: {
      messageId: '6b05bd40-test-ef4',
      platformMessageId: 'wamid.HBgMNTg0MjQyNTg4MzkxFQIAERgSMDM2MUETEST==',
    },
  },
  timestamp: '2026-11-24T10:00:00Z',
};

describe('normalizeZernioPayload', () => {
  it('maps the REAL Zernio message.received payload correctly (button tap)', () => {
    const out = normalizeZernioPayload(REAL_ZERNIO_PAYLOAD);

    expect(out).toEqual({
      event: 'message.received',
      conversationId: '6b05bd40-test',
      messageId: '6b05c85d-test',
      participantId: '+584240000000',
      accountId: '6afc5b492728c5ed0bbdb5f7',
      quotedMessageId: 'wamid.HBgMNTg0MjQyNTg4MzkxFQIAERgSMDM2MUETEST==',
      buttonPayload: 'Confirmar',
      messageBody: 'Confirmar',
    });
  });

  it('extracts quotedMessageId from root metadata (priority over message.metadata)', () => {
    const out = normalizeZernioPayload({
      event: 'message.received',
      message: {
        id: 'msg-1',
        conversationId: 'conv-1',
        text: 'Reagendar',
        sender: { phoneNumber: '+584140000000' },
        metadata: { quotedMessageId: 'wamid.from-message-metadata' },
      },
      account: { accountId: 'acc-1' },
      // Root metadata has priority
      metadata: { buttonPayload: 'Reagendar', quotedMessageId: 'wamid.from-root-metadata' },
    });

    expect(out.quotedMessageId).toBe('wamid.from-root-metadata');
    expect(out.buttonPayload).toBe('Reagendar');
    expect(out.accountId).toBe('acc-1');
  });

  it('falls back to message.metadata when root metadata has no quotedMessageId', () => {
    const out = normalizeZernioPayload({
      event: 'message.received',
      message: {
        id: 'msg-1',
        conversationId: 'conv-1',
        text: 'Cancelar',
        sender: { phoneNumber: '+584140000000' },
        metadata: { quotedMessageId: 'wamid.from-message-metadata', buttonPayload: 'Cancelar' },
      },
      account: { accountId: 'acc-2' },
      metadata: {}, // no quotedMessageId here
    });

    expect(out.quotedMessageId).toBe('wamid.from-message-metadata');
    expect(out.buttonPayload).toBe('Cancelar');
  });

  it('extracts accountId from account.accountId', () => {
    const out = normalizeZernioPayload({
      event: 'message.received',
      message: { conversationId: 'c', text: 'x', sender: {} },
      account: { id: 'raw-id', accountId: 'account-xyz' },
      metadata: {},
    });
    expect(out.accountId).toBe('account-xyz');
  });

  it('keeps accepting the flat shape (backward compat)', () => {
    expect(normalizeZernioPayload({ conversationId: 'c', buttonPayload: 'x' }).buttonPayload).toBe(
      'x',
    );
  });

  it('returns all undefined fields for null input', () => {
    expect(normalizeZernioPayload(null)).toEqual({
      event: undefined,
      conversationId: undefined,
      messageId: undefined,
      participantId: undefined,
      accountId: undefined,
      quotedMessageId: undefined,
      buttonPayload: undefined,
      messageBody: undefined,
    });
  });

  it('maps the documented nested shape (interactiveId fallback)', () => {
    const out = normalizeZernioPayload({
      event: 'message.received',
      account: { accountId: 'acc-1' },
      message: {
        id: 'msg-1',
        conversationId: 'conv-1',
        text: 'Confirmar',
        sender: { phoneNumber: '+584140000000' },
        metadata: { interactiveType: 'button_reply', interactiveId: 'confirm:tok' },
      },
    });
    expect(out).toEqual({
      event: 'message.received',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      participantId: '+584140000000',
      accountId: 'acc-1',
      quotedMessageId: undefined,
      buttonPayload: 'confirm:tok', // falls back to interactiveId
      messageBody: 'Confirmar',
    });
  });
});
