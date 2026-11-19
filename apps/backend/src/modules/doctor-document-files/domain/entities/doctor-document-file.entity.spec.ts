import { DoctorDocumentFile } from './doctor-document-file.entity';
import { DoctorDocumentFileDataInvalidError } from '../errors/doctor-document-file-data-invalid.error';

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
    it('constructs a DoctorDocumentFile from valid params', () => {
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

    it('throws DoctorDocumentFileDataInvalidError when name is empty', () => {
      expect(() =>
        DoctorDocumentFile.create({
          id: 'x',
          doctorId: 'doctor-1',
          name: '   ',
          storagePath: 'document/doctor-1/x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }),
      ).toThrow(DoctorDocumentFileDataInvalidError);
    });

    it('throws DoctorDocumentFileDataInvalidError when name exceeds MAX_NAME_LENGTH', () => {
      const longName = 'a'.repeat(DoctorDocumentFile.MAX_NAME_LENGTH + 1);
      expect(() =>
        DoctorDocumentFile.create({
          id: 'x',
          doctorId: 'doctor-1',
          name: longName,
          storagePath: 'document/doctor-1/x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }),
      ).toThrow(DoctorDocumentFileDataInvalidError);
    });

    it('throws DoctorDocumentFileDataInvalidError when mimeType is not in allowed set', () => {
      expect(() =>
        DoctorDocumentFile.create({
          id: 'x',
          doctorId: 'doctor-1',
          name: 'Video',
          storagePath: 'document/doctor-1/video.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }),
      ).toThrow(DoctorDocumentFileDataInvalidError);
    });

    it('accepts all allowed MIME types without throwing', () => {
      for (const mime of DoctorDocumentFile.ALLOWED_MIME_TYPES) {
        expect(() =>
          DoctorDocumentFile.create({
            id: 'x',
            doctorId: 'doctor-1',
            name: 'File',
            storagePath: `document/doctor-1/file.${mime.split('/')[1]}`,
            mimeType: mime,
            sizeBytes: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          }),
        ).not.toThrow();
      }
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
