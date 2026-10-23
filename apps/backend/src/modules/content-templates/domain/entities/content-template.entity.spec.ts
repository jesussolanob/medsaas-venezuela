import { ContentTemplate } from './content-template.entity';

describe('ContentTemplate', () => {
  const params = {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    doctorId: 'dddddddd-0000-0000-0000-000000000001',
    type: 'recipe' as const,
    name: 'Plantilla de antibióticos',
    content: { medications: [], notes: '' },
    createdAt: new Date('2026-10-22T00:00:00Z'),
    updatedAt: new Date('2026-10-22T00:00:00Z'),
  };

  it('creates a content template with correct fields', () => {
    const template = ContentTemplate.create(params);
    expect(template.id).toBe(params.id);
    expect(template.doctorId).toBe(params.doctorId);
    expect(template.type).toBe('recipe');
    expect(template.name).toBe('Plantilla de antibióticos');
    expect(template.content).toEqual({ medications: [], notes: '' });
  });

  describe('canBeModifiedBy', () => {
    it('returns true for the owning doctor', () => {
      const template = ContentTemplate.create(params);
      expect(template.canBeModifiedBy(params.doctorId)).toBe(true);
    });

    it('returns false for a different doctor (anti-IDOR)', () => {
      const template = ContentTemplate.create(params);
      expect(template.canBeModifiedBy('eeeeeeee-0000-0000-0000-000000000002')).toBe(false);
    });
  });
});
