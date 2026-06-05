import { ReminderSettings, REMINDERS_SETTINGS_DEFAULTS } from './reminders-settings.entity';
import type { ReminderSettingsCreateParams } from './reminders-settings.entity';

const baseParams: ReminderSettingsCreateParams = {
  id: 'settings-id-1',
  doctorId: 'doctor-id-1',
  enabled: true,
  channel: 'both',
  reminder7dEnabled: true,
  reminder24hEnabled: true,
  reminder3hEnabled: true,
  reminder1hEnabled: false,
  template7dWhatsapp: 'Template 7d',
  template24hWhatsapp: 'Template 24h',
  template3hWhatsapp: 'Template 3h',
  quietHoursStart: '21:00:00',
  quietHoursEnd: '08:00:00',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

describe('ReminderSettings entity', () => {
  describe('constructor / create', () => {
    it('creates entity with provided params', () => {
      const settings = ReminderSettings.create(baseParams);
      expect(settings.id).toBe('settings-id-1');
      expect(settings.doctorId).toBe('doctor-id-1');
      expect(settings.enabled).toBe(true);
      expect(settings.channel).toBe('both');
      expect(settings.reminder7dEnabled).toBe(true);
      expect(settings.reminder24hEnabled).toBe(true);
      expect(settings.reminder3hEnabled).toBe(true);
      expect(settings.reminder1hEnabled).toBe(false);
      expect(settings.template7dWhatsapp).toBe('Template 7d');
      expect(settings.template24hWhatsapp).toBe('Template 24h');
      expect(settings.template3hWhatsapp).toBe('Template 3h');
      expect(settings.quietHoursStart).toBe('21:00:00');
      expect(settings.quietHoursEnd).toBe('08:00:00');
    });
  });

  describe('isOwnedBy', () => {
    it('returns true when doctorId matches', () => {
      const settings = ReminderSettings.create(baseParams);
      expect(settings.isOwnedBy('doctor-id-1')).toBe(true);
    });

    it('returns false when doctorId differs', () => {
      const settings = ReminderSettings.create(baseParams);
      expect(settings.isOwnedBy('doctor-id-2')).toBe(false);
    });
  });

  describe('withUpdates', () => {
    it('returns a new entity with updated fields', () => {
      const settings = ReminderSettings.create(baseParams);
      const updated = settings.withUpdates({ enabled: false, channel: 'email' });

      expect(updated.enabled).toBe(false);
      expect(updated.channel).toBe('email');
      // unchanged fields preserved
      expect(updated.id).toBe(settings.id);
      expect(updated.doctorId).toBe(settings.doctorId);
      expect(updated.reminder7dEnabled).toBe(settings.reminder7dEnabled);
    });

    it('does not mutate the original entity', () => {
      const settings = ReminderSettings.create(baseParams);
      settings.withUpdates({ enabled: false });
      expect(settings.enabled).toBe(true);
    });

    it('updates quietHoursStart', () => {
      const settings = ReminderSettings.create(baseParams);
      const updated = settings.withUpdates({ quietHoursStart: '22:00:00' });
      expect(updated.quietHoursStart).toBe('22:00:00');
      expect(updated.quietHoursEnd).toBe(settings.quietHoursEnd);
    });

    it('sets updatedAt to a new date when not provided', () => {
      const settings = ReminderSettings.create(baseParams);
      const before = Date.now();
      const updated = settings.withUpdates({ enabled: false });
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('uses provided updatedAt when given', () => {
      const settings = ReminderSettings.create(baseParams);
      const ts = new Date('2025-01-01T00:00:00Z');
      const updated = settings.withUpdates({ enabled: false, updatedAt: ts });
      expect(updated.updatedAt).toEqual(ts);
    });
  });

  describe('defaults', () => {
    it('returns entity with default values for a doctorId', () => {
      const def = ReminderSettings.defaults('doctor-xyz');
      expect(def.doctorId).toBe('doctor-xyz');
      expect(def.id).toBe('');
      expect(def.enabled).toBe(REMINDERS_SETTINGS_DEFAULTS.enabled);
      expect(def.channel).toBe(REMINDERS_SETTINGS_DEFAULTS.channel);
      expect(def.reminder7dEnabled).toBe(REMINDERS_SETTINGS_DEFAULTS.reminder7dEnabled);
      expect(def.reminder1hEnabled).toBe(REMINDERS_SETTINGS_DEFAULTS.reminder1hEnabled);
      expect(def.template7dWhatsapp).toBe(REMINDERS_SETTINGS_DEFAULTS.template7dWhatsapp);
      expect(def.quietHoursStart).toBe(REMINDERS_SETTINGS_DEFAULTS.quietHoursStart);
      expect(def.quietHoursEnd).toBe(REMINDERS_SETTINGS_DEFAULTS.quietHoursEnd);
    });

    it('returns a new instance per call', () => {
      const a = ReminderSettings.defaults('d1');
      const b = ReminderSettings.defaults('d1');
      expect(a).not.toBe(b);
    });
  });
});
