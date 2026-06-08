import { NoopEmailAdapter } from './noop-email.adapter';

describe('NoopEmailAdapter', () => {
  let adapter: NoopEmailAdapter;

  beforeEach(() => {
    adapter = new NoopEmailAdapter();
  });

  it('returns id: null without making any network call', async () => {
    const result = await adapter.send({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
    });

    expect(result).toEqual({ id: null });
  });

  it('accepts an array of recipients', async () => {
    const result = await adapter.send({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Batch',
      html: '<p>Batch</p>',
    });

    expect(result).toEqual({ id: null });
  });

  it('accepts optional text and from fields', async () => {
    const result = await adapter.send({
      to: 'user@example.com',
      subject: 'Plain text',
      html: '<p>Hi</p>',
      text: 'Hi',
      from: 'sender@example.com',
    });

    expect(result).toEqual({ id: null });
  });
});
