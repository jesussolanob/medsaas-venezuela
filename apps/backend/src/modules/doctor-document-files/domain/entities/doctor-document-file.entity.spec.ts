import { DoctorDocumentFile } from './doctor-document-file.entity';

const makeFile = (overrides: Partial<ConstructorParameters<typeof DoctorDocumentFile>[0]> = {}) =>
  new DoctorDocumentFile({
    id: 'file-1',
    doctorId: 'doctor-1',
    name: 'Hoja de tareas.pdf',
    storagePath: 'document/doctor-1/ts-hoja.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 204800,
    createdAt: new Date('2026-11-19'),
    updatedAt: new Date('2026-11-19'),
    deletedAt: null,
    ...overrides,
  });

describe('DoctorDocumentFile', () => {
  describe('isOwnedBy()', () => {
    it('returns true when the doctor id matches', () => {
      const file = makeFile({ doctorId: 'doctor-abc' });
      expect(file.isOwnedBy('doctor-abc')).toBe(true);
    });

    it('returns false when the doctor id differs', () => {
      const file = makeFile({ doctorId: 'doctor-abc' });
      expect(file.isOwnedBy('doctor-xyz')).toBe(false);
    });
  });

  describe('isDeleted()', () => {
    it('returns false when deletedAt is null', () => {
      const file = makeFile({ deletedAt: null });
      expect(file.isDeleted()).toBe(false);
    });

    it('returns true when deletedAt is set', () => {
      const file = makeFile({ deletedAt: new Date() });
      expect(file.isDeleted()).toBe(true);
    });
  });

  describe('static create()', () => {
    it('constructs a DoctorDocumentFile from params', () => {
      const file = DoctorDocumentFile.create({
        id: 'file-2',
        doctorId: 'doctor-2',
        name: 'Lab results',
        storagePath: 'document/doctor-2/ts-lab.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 51200,
        createdAt: new Date('2026-11-19'),
        updatedAt: new Date('2026-11-19'),
        deletedAt: null,
      });

      expect(file.id).toBe('file-2');
      expect(file.doctorId).toBe('doctor-2');
      expect(file.name).toBe('Lab results');
      expect(file.isDeleted()).toBe(false);
    });
  });

  describe('constants', () => {
    it('MAX_FILES_PER_DOCTOR is 50', () => {
      expect(DoctorDocumentFile.MAX_FILES_PER_DOCTOR).toBe(50);
    });

    it('ALLOWED_MIME_TYPES contains pdf, jpeg, png, webp', () => {
      expect(DoctorDocumentFile.ALLOWED_MIME_TYPES).toContain('application/pdf');
      expect(DoctorDocumentFile.ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(DoctorDocumentFile.ALLOWED_MIME_TYPES).toContain('image/png');
      expect(DoctorDocumentFile.ALLOWED_MIME_TYPES).toContain('image/webp');
    });
  });
});
