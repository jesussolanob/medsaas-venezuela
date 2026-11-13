import { ReleaseNote, type ReleaseNoteParams } from './release-note.entity';

const baseParams: ReleaseNoteParams = {
  id: 'note-uuid-1',
  title: 'Nueva funcionalidad de presupuestos',
  body: 'Ahora puedes crear presupuestos desde el panel principal sin abrir una consulta.',
  imageUrl: null,
  audiencePlans: null,
  publishedAt: null,
  createdBy: 'admin-uuid-1',
  createdAt: new Date('2026-10-30T10:00:00Z'),
  updatedAt: new Date('2026-10-30T10:00:00Z'),
};

describe('ReleaseNote entity', () => {
  describe('create', () => {
    it('creates a release note with all fields', () => {
      const note = ReleaseNote.create(baseParams);
      expect(note.id).toBe('note-uuid-1');
      expect(note.title).toBe('Nueva funcionalidad de presupuestos');
      expect(note.imageUrl).toBeNull();
      expect(note.audiencePlans).toBeNull();
      expect(note.publishedAt).toBeNull();
    });

    it('creates with audience plans', () => {
      const note = ReleaseNote.create({ ...baseParams, audiencePlans: ['delta_plus'] });
      expect(note.audiencePlans).toEqual(['delta_plus']);
    });

    it('creates published note', () => {
      const publishedAt = new Date('2026-10-30T12:00:00Z');
      const note = ReleaseNote.create({ ...baseParams, publishedAt });
      expect(note.publishedAt).toEqual(publishedAt);
    });
  });

  describe('isDraft / isPublished', () => {
    it('isDraft returns true when publishedAt is null', () => {
      const note = ReleaseNote.create(baseParams);
      expect(note.isDraft()).toBe(true);
      expect(note.isPublished()).toBe(false);
    });

    it('isPublished returns true when publishedAt is set', () => {
      const note = ReleaseNote.create({
        ...baseParams,
        publishedAt: new Date('2026-10-30T12:00:00Z'),
      });
      expect(note.isPublished()).toBe(true);
      expect(note.isDraft()).toBe(false);
    });
  });

  describe('validateTitle', () => {
    it('accepts valid title', () => {
      const result = ReleaseNote.validateTitle('Nuevo módulo de inventario');
      expect(result.valid).toBe(true);
    });

    it('accepts title of exactly 1 character', () => {
      const result = ReleaseNote.validateTitle('A');
      expect(result.valid).toBe(true);
    });

    it('accepts title of exactly 80 characters', () => {
      const result = ReleaseNote.validateTitle('A'.repeat(80));
      expect(result.valid).toBe(true);
    });

    it('rejects empty string', () => {
      const result = ReleaseNote.validateTitle('');
      expect(result.valid).toBe(false);
    });

    it('rejects title exceeding 80 characters', () => {
      const result = ReleaseNote.validateTitle('A'.repeat(81));
      expect(result.valid).toBe(false);
    });

    it('rejects title with HTML open tag', () => {
      const result = ReleaseNote.validateTitle('Hola <b>mundo</b>');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toMatch(/HTML/);
      }
    });

    it('rejects title with closing HTML tag', () => {
      const result = ReleaseNote.validateTitle('</div>');
      expect(result.valid).toBe(false);
    });

    it('accepts title with < followed by a number (not HTML)', () => {
      const result = ReleaseNote.validateTitle('Precio < 100$');
      expect(result.valid).toBe(true);
    });

    it('trims whitespace before length check', () => {
      // 80 real chars + spaces = still valid
      const result = ReleaseNote.validateTitle('  ' + 'A'.repeat(80) + '  ');
      expect(result.valid).toBe(true);
    });

    it('rejects whitespace-only string', () => {
      const result = ReleaseNote.validateTitle('   ');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateBody', () => {
    it('accepts valid body', () => {
      const result = ReleaseNote.validateBody('Ahora puedes crear presupuestos.');
      expect(result.valid).toBe(true);
    });

    it('accepts body of exactly 1 character', () => {
      const result = ReleaseNote.validateBody('X');
      expect(result.valid).toBe(true);
    });

    it('accepts body of exactly 1500 characters', () => {
      const result = ReleaseNote.validateBody('A'.repeat(1500));
      expect(result.valid).toBe(true);
    });

    it('rejects empty body', () => {
      const result = ReleaseNote.validateBody('');
      expect(result.valid).toBe(false);
    });

    it('rejects body exceeding 1500 characters', () => {
      const result = ReleaseNote.validateBody('A'.repeat(1501));
      expect(result.valid).toBe(false);
    });

    it('rejects body with HTML', () => {
      const result = ReleaseNote.validateBody('<p>Texto con HTML</p>');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toMatch(/HTML/);
      }
    });

    it('rejects body with closing HTML tag', () => {
      const result = ReleaseNote.validateBody('texto </script> fin');
      expect(result.valid).toBe(false);
    });

    it('accepts body with dash lists (plain text markdown-like)', () => {
      const result = ReleaseNote.validateBody('Novedades:\n- Lista 1\n- Lista 2');
      expect(result.valid).toBe(true);
    });

    it('accepts body with < followed by space (not HTML)', () => {
      const result = ReleaseNote.validateBody('Precio < 100$');
      expect(result.valid).toBe(true);
    });
  });
});
