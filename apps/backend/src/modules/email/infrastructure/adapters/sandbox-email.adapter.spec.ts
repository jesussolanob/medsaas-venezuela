import { SandboxEmailPort } from './sandbox-email.adapter';
import type { IEmailPort, EmailSendInput } from '../../application/ports/email.port';

function makeInner(): jest.Mocked<IEmailPort> {
  return { send: jest.fn().mockResolvedValue({ id: 'real-msg-id' }) };
}

const baseInput: EmailSendInput = {
  to: 'patient@example.com',
  subject: 'Appointment reminder',
  html: '<p>Your appointment is tomorrow.</p>',
};

describe('SandboxEmailPort', () => {
  // ---------------------------------------------------------------------------
  // Case 1: SANDBOX=true — suppress delivery
  // ---------------------------------------------------------------------------

  describe('when SANDBOX=true', () => {
    it('returns { id: null } without calling the inner adapter', async () => {
      const inner = makeInner();
      const sandbox = new SandboxEmailPort(inner, 'true', undefined);

      const result = await sandbox.send(baseInput);

      expect(result).toEqual({ id: null });
      expect(inner.send).not.toHaveBeenCalled();
    });

    it('suppresses even when SANDBOX_EMAIL is also set', async () => {
      const inner = makeInner();
      const sandbox = new SandboxEmailPort(inner, 'true', 'dev@example.com');

      const result = await sandbox.send(baseInput);

      expect(result).toEqual({ id: null });
      expect(inner.send).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Case 2: SANDBOX=false + SANDBOX_EMAIL set — redirect
  // ---------------------------------------------------------------------------

  describe('when SANDBOX=false and SANDBOX_EMAIL is set', () => {
    it('calls inner.send with the sandbox address as the recipient', async () => {
      const inner = makeInner();
      const sandbox = new SandboxEmailPort(inner, 'false', 'dev@example.com');

      const result = await sandbox.send(baseInput);

      expect(inner.send).toHaveBeenCalledTimes(1);
      const calledWith = inner.send.mock.calls[0]![0]!;
      expect(calledWith.to).toBe('dev@example.com');
      // Other fields unchanged
      expect(calledWith.subject).toBe(baseInput.subject);
      expect(calledWith.html).toBe(baseInput.html);
      expect(result).toEqual({ id: 'real-msg-id' });
    });

    it('redirects even when original to is an array', async () => {
      const inner = makeInner();
      const sandbox = new SandboxEmailPort(inner, 'false', 'dev@example.com');

      await sandbox.send({ ...baseInput, to: ['a@b.com', 'c@d.com'] });

      const calledWith = inner.send.mock.calls[0]![0]!;
      expect(calledWith.to).toBe('dev@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // Case 3: SANDBOX=false + SANDBOX_EMAIL absent — pass through
  // ---------------------------------------------------------------------------

  describe('when SANDBOX=false and SANDBOX_EMAIL is absent', () => {
    it('calls inner.send with the original recipient', async () => {
      const inner = makeInner();
      const sandbox = new SandboxEmailPort(inner, 'false', undefined);

      const result = await sandbox.send(baseInput);

      expect(inner.send).toHaveBeenCalledTimes(1);
      const calledWith = inner.send.mock.calls[0]![0]!;
      expect(calledWith.to).toBe('patient@example.com');
      expect(result).toEqual({ id: 'real-msg-id' });
    });

    it('passes through when SANDBOX_EMAIL is an empty string', async () => {
      const inner = makeInner();
      const sandbox = new SandboxEmailPort(inner, 'false', '');

      const result = await sandbox.send(baseInput);

      expect(inner.send).toHaveBeenCalledTimes(1);
      const calledWith = inner.send.mock.calls[0]![0]!;
      expect(calledWith.to).toBe('patient@example.com');
      expect(result).toEqual({ id: 'real-msg-id' });
    });

    it('passes through when SANDBOX_EMAIL is whitespace only', async () => {
      const inner = makeInner();
      const sandbox = new SandboxEmailPort(inner, 'false', '   ');

      await sandbox.send(baseInput);

      const calledWith = inner.send.mock.calls[0]![0]!;
      expect(calledWith.to).toBe('patient@example.com');
    });

    it('defaults to pass-through when sandboxEnv is undefined', async () => {
      const inner = makeInner();
      const sandbox = new SandboxEmailPort(inner, undefined, undefined);

      await sandbox.send(baseInput);

      expect(inner.send).toHaveBeenCalledTimes(1);
      const calledWith = inner.send.mock.calls[0]![0]!;
      expect(calledWith.to).toBe('patient@example.com');
    });
  });
});
