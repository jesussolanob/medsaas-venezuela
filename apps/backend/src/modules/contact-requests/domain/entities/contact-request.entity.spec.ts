import { ContactRequest, type ContactRequestParams } from './contact-request.entity';

const base: ContactRequestParams = {
  id: 'uuid-1',
  doctorId: 'doctor-1',
  channel: 'whatsapp',
  message: null,
  status: 'pending',
  handledBy: null,
  handledAt: null,
  notes: null,
  notificationCount: 0,
  lastNotifiedAt: null,
  createdAt: new Date('2026-10-30T10:00:00Z'),
  updatedAt: new Date('2026-10-30T10:00:00Z'),
};

describe('ContactRequest entity', () => {
  describe('create', () => {
    it('creates a contact request with all fields', () => {
      const req = ContactRequest.create(base);
      expect(req.id).toBe('uuid-1');
      expect(req.doctorId).toBe('doctor-1');
      expect(req.channel).toBe('whatsapp');
      expect(req.status).toBe('pending');
      expect(req.message).toBeNull();
    });
  });

  describe('isPending', () => {
    it('returns true when status is pending', () => {
      const req = ContactRequest.create({ ...base, status: 'pending' });
      expect(req.isPending()).toBe(true);
    });

    it('returns false when status is contacted', () => {
      const req = ContactRequest.create({ ...base, status: 'contacted' });
      expect(req.isPending()).toBe(false);
    });

    it('returns false when status is resolved', () => {
      const req = ContactRequest.create({ ...base, status: 'resolved' });
      expect(req.isPending()).toBe(false);
    });
  });

  describe('isValidMessage', () => {
    it('accepts null message', () => {
      expect(ContactRequest.isValidMessage(null)).toBe(true);
    });

    it('accepts undefined message', () => {
      expect(ContactRequest.isValidMessage(undefined)).toBe(true);
    });

    it('accepts empty string', () => {
      expect(ContactRequest.isValidMessage('')).toBe(true);
    });

    it('accepts message of exactly 500 chars', () => {
      expect(ContactRequest.isValidMessage('a'.repeat(500))).toBe(true);
    });

    it('rejects message of 501 chars', () => {
      expect(ContactRequest.isValidMessage('a'.repeat(501))).toBe(false);
    });
  });

  describe('canTransitionTo', () => {
    it('pending → contacted is valid', () => {
      const req = ContactRequest.create({ ...base, status: 'pending' });
      expect(req.canTransitionTo('contacted')).toBe(true);
    });

    it('pending → resolved is valid', () => {
      const req = ContactRequest.create({ ...base, status: 'pending' });
      expect(req.canTransitionTo('resolved')).toBe(true);
    });

    it('pending → pending is invalid', () => {
      const req = ContactRequest.create({ ...base, status: 'pending' });
      expect(req.canTransitionTo('pending')).toBe(false);
    });

    it('contacted → resolved is valid', () => {
      const req = ContactRequest.create({ ...base, status: 'contacted' });
      expect(req.canTransitionTo('resolved')).toBe(true);
    });

    it('contacted → pending is invalid', () => {
      const req = ContactRequest.create({ ...base, status: 'contacted' });
      expect(req.canTransitionTo('pending')).toBe(false);
    });

    it('contacted → contacted is invalid', () => {
      const req = ContactRequest.create({ ...base, status: 'contacted' });
      expect(req.canTransitionTo('contacted')).toBe(false);
    });

    it('resolved → contacted is invalid', () => {
      const req = ContactRequest.create({ ...base, status: 'resolved' });
      expect(req.canTransitionTo('contacted')).toBe(false);
    });

    it('resolved → pending is invalid', () => {
      const req = ContactRequest.create({ ...base, status: 'resolved' });
      expect(req.canTransitionTo('pending')).toBe(false);
    });

    it('resolved → resolved is invalid', () => {
      const req = ContactRequest.create({ ...base, status: 'resolved' });
      expect(req.canTransitionTo('resolved')).toBe(false);
    });
  });
});
