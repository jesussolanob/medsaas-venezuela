import { SharedDocumentLink } from './shared-document-link.entity';

const base = {
  id: 'link-1',
  consultationId: 'consult-1',
  doctorId: 'doctor-1',
  patientId: 'patient-1',
  token: 'random-long-token-abc123',
  sections: { report: true, prescriptions: false, ehr: false },
  status: 'active' as const,
  failedAttempts: 0,
  lastCodeRequestedAt: null,
  createdAt: new Date('2026-06-18T10:00:00Z'),
};

describe('SharedDocumentLink', () => {
  it('creates a link with factory method', () => {
    const link = SharedDocumentLink.create(base);
    expect(link.id).toBe('link-1');
    expect(link.status).toBe('active');
    expect(link.failedAttempts).toBe(0);
    expect(link.lastCodeRequestedAt).toBeNull();
  });

  describe('canBeRevokedBy', () => {
    it('returns true when actor is the owning doctor', () => {
      const link = SharedDocumentLink.create(base);
      expect(link.canBeRevokedBy('doctor-1')).toBe(true);
    });

    it('returns false when actor is a different doctor', () => {
      const link = SharedDocumentLink.create(base);
      expect(link.canBeRevokedBy('other-doctor')).toBe(false);
    });
  });

  describe('isActive', () => {
    it('returns true when status is active', () => {
      const link = SharedDocumentLink.create(base);
      expect(link.isActive()).toBe(true);
    });

    it('returns false when status is revoked', () => {
      const link = SharedDocumentLink.create({ ...base, status: 'revoked' });
      expect(link.isActive()).toBe(false);
    });
  });

  describe('atLeastOneSection', () => {
    it('returns true when at least one section is enabled', () => {
      const link = SharedDocumentLink.create(base);
      expect(link.atLeastOneSection()).toBe(true);
    });

    it('returns false when no sections are enabled', () => {
      const link = SharedDocumentLink.create({
        ...base,
        sections: { report: false, prescriptions: false, ehr: false },
      });
      expect(link.atLeastOneSection()).toBe(false);
    });

    it('returns true when all sections are enabled', () => {
      const link = SharedDocumentLink.create({
        ...base,
        sections: { report: true, prescriptions: true, ehr: true },
      });
      expect(link.atLeastOneSection()).toBe(true);
    });
  });

  describe('isLinkBruteforceBlocked', () => {
    it('returns false when failed attempts is below threshold', () => {
      const link = SharedDocumentLink.create({ ...base, failedAttempts: 9 });
      expect(link.isLinkBruteforceBlocked()).toBe(false);
    });

    it('returns true when failed attempts reaches threshold (10)', () => {
      const link = SharedDocumentLink.create({ ...base, failedAttempts: 10 });
      expect(link.isLinkBruteforceBlocked()).toBe(true);
    });

    it('returns true when failed attempts exceeds threshold', () => {
      const link = SharedDocumentLink.create({ ...base, failedAttempts: 15 });
      expect(link.isLinkBruteforceBlocked()).toBe(true);
    });

    it('returns false when failed attempts is 0', () => {
      const link = SharedDocumentLink.create({ ...base, failedAttempts: 0 });
      expect(link.isLinkBruteforceBlocked()).toBe(false);
    });
  });

  describe('isCodeRequestOnCooldown', () => {
    it('returns false when lastCodeRequestedAt is null', () => {
      const link = SharedDocumentLink.create({ ...base, lastCodeRequestedAt: null });
      expect(link.isCodeRequestOnCooldown(new Date())).toBe(false);
    });

    it('returns true when last request was within 60 seconds', () => {
      const recent = new Date(Date.now() - 30_000); // 30s ago
      const link = SharedDocumentLink.create({ ...base, lastCodeRequestedAt: recent });
      expect(link.isCodeRequestOnCooldown(new Date())).toBe(true);
    });

    it('returns false when last request was more than 60 seconds ago', () => {
      const old = new Date(Date.now() - 61_000); // 61s ago
      const link = SharedDocumentLink.create({ ...base, lastCodeRequestedAt: old });
      expect(link.isCodeRequestOnCooldown(new Date())).toBe(false);
    });

    it('returns true at exactly 59 seconds elapsed', () => {
      const recent = new Date(Date.now() - 59_000);
      const link = SharedDocumentLink.create({ ...base, lastCodeRequestedAt: recent });
      expect(link.isCodeRequestOnCooldown(new Date())).toBe(true);
    });

    it('returns false at exactly 60 seconds elapsed', () => {
      const exact = new Date(Date.now() - 60_000);
      const link = SharedDocumentLink.create({ ...base, lastCodeRequestedAt: exact });
      expect(link.isCodeRequestOnCooldown(new Date())).toBe(false);
    });
  });
});
