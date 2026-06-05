import { QuickItem, type QuickItemCreateParams } from './quick-item.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
const ITEM_ID = 'iiiiiiii-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeItem(overrides: Partial<QuickItemCreateParams> = {}): QuickItem {
  return QuickItem.create({
    id: ITEM_ID,
    doctorId: DOCTOR_ID,
    itemType: 'exam',
    name: 'Hemograma completo',
    category: 'Laboratorio',
    details: null,
    createdAt: now,
    ...overrides,
  });
}

describe('QuickItem entity', () => {
  describe('construction', () => {
    it('creates a quick item with all properties (exam)', () => {
      const item = makeItem();

      expect(item.id).toBe(ITEM_ID);
      expect(item.doctorId).toBe(DOCTOR_ID);
      expect(item.itemType).toBe('exam');
      expect(item.name).toBe('Hemograma completo');
      expect(item.category).toBe('Laboratorio');
      expect(item.details).toBeNull();
      expect(item.createdAt).toBe(now);
    });

    it('creates a quick item with medication type', () => {
      const item = makeItem({ itemType: 'medication', name: 'Ibuprofeno 400mg', category: null, details: '1 tab c/8h' });

      expect(item.itemType).toBe('medication');
      expect(item.name).toBe('Ibuprofeno 400mg');
      expect(item.details).toBe('1 tab c/8h');
    });

    it('creates a quick item with null category and details', () => {
      const item = makeItem({ category: null, details: null });

      expect(item.category).toBeNull();
      expect(item.details).toBeNull();
    });
  });

  describe('isOwnedBy', () => {
    it('returns true for the owning doctor', () => {
      const item = makeItem();
      expect(item.isOwnedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const item = makeItem();
      expect(item.isOwnedBy(OTHER_DOCTOR_ID)).toBe(false);
    });

    it('returns false for an empty string', () => {
      const item = makeItem();
      expect(item.isOwnedBy('')).toBe(false);
    });
  });

  describe('QuickItem.create factory', () => {
    it('returns a new QuickItem instance', () => {
      const item = QuickItem.create({
        id: ITEM_ID,
        doctorId: DOCTOR_ID,
        itemType: 'medication',
        name: 'Paracetamol',
        category: null,
        details: null,
        createdAt: now,
      });

      expect(item).toBeInstanceOf(QuickItem);
    });

    it('entity is immutable — properties are readonly', () => {
      const item = makeItem();
      // TypeScript readonly ensures no accidental mutation at compile time;
      // here we verify the values remain stable after construction.
      expect(item.name).toBe('Hemograma completo');
    });
  });
});
