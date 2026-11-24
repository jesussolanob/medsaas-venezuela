import { normalizeZernioPayload } from './whatsapp-webhook.controller';

describe('normalizeZernioPayload', () => {
  it('maps the documented nested message.received shape (button tap)', () => {
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
      buttonPayload: 'confirm:tok',
      messageBody: 'Confirmar',
    });
  });

  it('reads metadata at the root when it is not inside message', () => {
    const out = normalizeZernioPayload({
      event: 'message.received',
      message: { conversationId: 'c', text: 'Cancelar' },
      metadata: { interactiveId: 'cancel:tok' },
    });
    expect(out.buttonPayload).toBe('cancel:tok');
  });

  it('keeps accepting the flat shape and ignores junk', () => {
    expect(normalizeZernioPayload({ conversationId: 'c', buttonPayload: 'x' }).buttonPayload).toBe(
      'x',
    );
    expect(normalizeZernioPayload(null)).toEqual({
      event: undefined,
      conversationId: undefined,
      messageId: undefined,
      participantId: undefined,
      buttonPayload: undefined,
      messageBody: undefined,
    });
  });
});
