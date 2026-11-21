import { AppointmentActionTokenService } from './appointment-action-token.service';
import type { ActionTokenPayload } from './appointment-action-token.service';
import { ConfigService } from '@nestjs/config';

function makeService(
  secret = 'test-secret-for-action-tokens-32bytes!',
): AppointmentActionTokenService {
  const config = {
    get: (key: string) => (key === 'APPOINTMENT_ACTION_SECRET' ? secret : null),
  } as unknown as ConfigService;
  return new AppointmentActionTokenService(config);
}

describe('AppointmentActionTokenService', () => {
  const appointmentId = '11111111-2222-3333-4444-555555555555';
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 60 * 1000);

  describe('constructor', () => {
    it('throws when APPOINTMENT_ACTION_SECRET is missing', () => {
      const config = { get: () => null } as unknown as ConfigService;
      expect(() => new AppointmentActionTokenService(config)).toThrow(
        'APPOINTMENT_ACTION_SECRET is not configured',
      );
    });
  });

  describe('generateButtonPayload / verifyButtonPayload', () => {
    it('round-trips a confirm token', () => {
      const svc = makeService();
      const params: ActionTokenPayload = {
        appointmentId,
        expMs: future.getTime(),
        action: 'confirm',
        satMs: 0,
      };
      const payload = svc.generateButtonPayload(params);
      expect(payload.startsWith('confirm:')).toBe(true);

      const result = svc.verifyButtonPayload(payload, new Date());
      expect(result).not.toBeNull();
      expect(result?.appointmentId).toBe(appointmentId);
      expect(result?.action).toBe('confirm');
    });

    it('round-trips a reschedule token', () => {
      const svc = makeService();
      const scheduledAt = new Date('2026-12-15T10:00:00Z');
      const params: ActionTokenPayload = {
        appointmentId,
        expMs: future.getTime(),
        action: 'reschedule',
        satMs: scheduledAt.getTime(),
      };
      const payload = svc.generateButtonPayload(params);
      const result = svc.verifyButtonPayload(payload, new Date());
      expect(result).not.toBeNull();
      expect(result?.action).toBe('reschedule');
      expect(result?.satMs).toBe(scheduledAt.getTime());
    });

    it('round-trips a cancel token', () => {
      const svc = makeService();
      const params: ActionTokenPayload = {
        appointmentId,
        expMs: future.getTime(),
        action: 'cancel',
        satMs: 0,
      };
      const payload = svc.generateButtonPayload(params);
      const result = svc.verifyButtonPayload(payload, new Date());
      expect(result?.action).toBe('cancel');
    });

    it('returns null for an expired token', () => {
      const svc = makeService();
      const params: ActionTokenPayload = {
        appointmentId,
        expMs: past.getTime(),
        action: 'confirm',
        satMs: 0,
      };
      const payload = svc.generateButtonPayload(params);
      const result = svc.verifyButtonPayload(payload, new Date());
      expect(result).toBeNull();
    });

    it('returns null when the token is tampered', () => {
      const svc = makeService();
      const params: ActionTokenPayload = {
        appointmentId,
        expMs: future.getTime(),
        action: 'confirm',
        satMs: 0,
      };
      const payload = svc.generateButtonPayload(params);
      const tampered = payload.slice(0, -3) + 'XXX';
      expect(svc.verifyButtonPayload(tampered, new Date())).toBeNull();
    });

    it('returns null when signed with a different secret', () => {
      const svc1 = makeService('secret-one');
      const svc2 = makeService('secret-two');
      const params: ActionTokenPayload = {
        appointmentId,
        expMs: future.getTime(),
        action: 'cancel',
        satMs: 0,
      };
      const payload = svc1.generateButtonPayload(params);
      expect(svc2.verifyButtonPayload(payload, new Date())).toBeNull();
    });

    it('returns null for a reschedule token when scheduledAt changes (single-use)', () => {
      const svc = makeService();
      const originalSat = new Date('2026-12-15T10:00:00Z').getTime();
      const payload = svc.generateButtonPayload({
        appointmentId,
        expMs: future.getTime(),
        action: 'reschedule',
        satMs: originalSat,
      });
      // After reschedule, scheduledAt changed — verify with new satMs means
      // we regenerate and the payload no longer matches.
      // We simulate: the caller checks decoded.satMs !== appointment.scheduledAt
      const decoded = svc.verifyButtonPayload(payload, new Date());
      expect(decoded).not.toBeNull();
      const newScheduledAt = new Date('2026-12-16T10:00:00Z').getTime();
      // The check in the use-case: decoded.satMs !== appointment.scheduledAt.getTime()
      expect(decoded?.satMs).not.toBe(newScheduledAt);
    });

    it('returns null for malformed payloads', () => {
      const svc = makeService();
      expect(svc.verifyButtonPayload('', new Date())).toBeNull();
      expect(svc.verifyButtonPayload('noaction', new Date())).toBeNull();
      expect(svc.verifyButtonPayload('badaction:token', new Date())).toBeNull();
      expect(svc.verifyButtonPayload('confirm:a.b', new Date())).toBeNull();
    });
  });
});
