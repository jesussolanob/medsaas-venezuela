import { ReminderChannel, REMINDER_CHANNELS } from './reminder-channel.vo';

describe('ReminderChannel', () => {
  describe('create', () => {
    it.each(REMINDER_CHANNELS)('creates valid channel "%s"', (channel) => {
      const vo = ReminderChannel.create(channel);
      expect(vo.value).toBe(channel);
    });

    it('throws RangeError for invalid channel', () => {
      expect(() => ReminderChannel.create('sms')).toThrow(RangeError);
      expect(() => ReminderChannel.create('')).toThrow(RangeError);
      expect(() => ReminderChannel.create('WhatsApp')).toThrow(RangeError);
    });
  });

  describe('isValid', () => {
    it('returns true for valid channels', () => {
      expect(ReminderChannel.isValid('whatsapp')).toBe(true);
      expect(ReminderChannel.isValid('email')).toBe(true);
      expect(ReminderChannel.isValid('both')).toBe(true);
    });

    it('returns false for invalid channels', () => {
      expect(ReminderChannel.isValid('sms')).toBe(false);
      expect(ReminderChannel.isValid('')).toBe(false);
    });
  });

  describe('equals', () => {
    it('returns true when channels are the same', () => {
      const a = ReminderChannel.create('whatsapp');
      const b = ReminderChannel.create('whatsapp');
      expect(a.equals(b)).toBe(true);
    });

    it('returns false when channels differ', () => {
      const a = ReminderChannel.create('whatsapp');
      const b = ReminderChannel.create('email');
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('toString', () => {
    it('returns the string value', () => {
      const vo = ReminderChannel.create('both');
      expect(vo.toString()).toBe('both');
    });
  });
});
