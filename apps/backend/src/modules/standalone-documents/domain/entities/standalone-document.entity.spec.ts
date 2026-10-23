import { StandaloneDocument } from './standalone-document.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'eeeeeeee-0000-0000-0000-000000000002';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';

function makeDraft(): StandaloneDocument {
  return StandaloneDocument.create({
    id: 'dddddddd-0000-0000-0000-000000000010',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    type: 'recipe',
    code: null,
    status: 'draft',
    content: { medications: [], notes: '' },
    voidReason: null,
    issuedAt: null,
    voidedAt: null,
    createdAt: new Date('2026-10-22T00:00:00Z'),
    updatedAt: new Date('2026-10-22T00:00:00Z'),
  });
}

describe('StandaloneDocument', () => {
  describe('canBeModifiedBy', () => {
    it('returns true for the owning doctor', () => {
      expect(makeDraft().canBeModifiedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false for a different doctor (anti-IDOR)', () => {
      expect(makeDraft().canBeModifiedBy(OTHER_DOCTOR)).toBe(false);
    });
  });

  describe('isInDraft / isIssued', () => {
    it('draft document reports isInDraft=true, isIssued=false', () => {
      const doc = makeDraft();
      expect(doc.isInDraft()).toBe(true);
      expect(doc.isIssued()).toBe(false);
    });

    it('issued document reports isInDraft=false, isIssued=true', () => {
      const issued = makeDraft().issue('REC-202610-0001', new Date('2026-10-22T10:00:00Z'));
      expect(issued.isInDraft()).toBe(false);
      expect(issued.isIssued()).toBe(true);
    });

    it('voided document reports isInDraft=false, isIssued=false', () => {
      const voided = makeDraft()
        .issue('REC-202610-0001', new Date('2026-10-22T10:00:00Z'))
        .void(new Date('2026-10-22T11:00:00Z'), 'Error');
      expect(voided.isInDraft()).toBe(false);
      expect(voided.isIssued()).toBe(false);
    });
  });

  describe('issue()', () => {
    it('transitions draft to issued with code and issuedAt', () => {
      const issuedAt = new Date('2026-10-22T10:00:00Z');
      const issued = makeDraft().issue('REC-202610-0001', issuedAt);

      expect(issued.status).toBe('issued');
      expect(issued.code).toBe('REC-202610-0001');
      expect(issued.issuedAt).toEqual(issuedAt);
    });

    it('does NOT mutate the original entity (immutability)', () => {
      const draft = makeDraft();
      const issued = draft.issue('REC-202610-0001', new Date());

      expect(draft.status).toBe('draft');
      expect(draft.code).toBeNull();
      expect(issued.status).toBe('issued');
    });
  });

  describe('void()', () => {
    it('transitions issued to voided with voidedAt', () => {
      const voidedAt = new Date('2026-10-22T11:00:00Z');
      const issued = makeDraft().issue('REC-202610-0001', new Date('2026-10-22T10:00:00Z'));
      const voided = issued.void(voidedAt, 'Error en receta');

      expect(voided.status).toBe('voided');
      expect(voided.voidedAt).toEqual(voidedAt);
      expect(voided.voidReason).toBe('Error en receta');
    });

    it('does NOT mutate the original entity (immutability)', () => {
      const issued = makeDraft().issue('REC-202610-0001', new Date());
      const voided = issued.void(new Date());

      expect(issued.status).toBe('issued');
      expect(voided.status).toBe('voided');
    });

    it('accepts null reason', () => {
      const issued = makeDraft().issue('REC-202610-0001', new Date());
      const voided = issued.void(new Date(), null);

      expect(voided.voidReason).toBeNull();
    });
  });
});
