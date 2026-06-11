import { Specialty } from './specialty.entity';

const makeProps = (overrides = {}) => ({
  id: 'aaaa0000-0000-0000-0000-000000000001',
  name: 'Cardiología',
  isActive: true,
  sortOrder: 20,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('Specialty entity', () => {
  describe('reconstitute', () => {
    it('sets all properties from props', () => {
      const props = makeProps();
      const specialty = Specialty.reconstitute(props);

      expect(specialty.id).toBe(props.id);
      expect(specialty.name).toBe('Cardiología');
      expect(specialty.isActive).toBe(true);
      expect(specialty.sortOrder).toBe(20);
      expect(specialty.createdAt).toBe(props.createdAt);
    });

    it('supports isActive = false', () => {
      const specialty = Specialty.reconstitute(makeProps({ isActive: false }));
      expect(specialty.isActive).toBe(false);
    });
  });

  describe('withUpdates', () => {
    it('returns a new instance with updated name', () => {
      const original = Specialty.reconstitute(makeProps());
      const updated = original.withUpdates({ name: 'Neurología' });

      expect(updated).not.toBe(original);
      expect(updated.name).toBe('Neurología');
      expect(updated.id).toBe(original.id);
      expect(updated.isActive).toBe(original.isActive);
      expect(updated.sortOrder).toBe(original.sortOrder);
    });

    it('returns a new instance with updated isActive', () => {
      const original = Specialty.reconstitute(makeProps({ isActive: true }));
      const updated = original.withUpdates({ isActive: false });

      expect(updated.isActive).toBe(false);
      expect(updated.name).toBe(original.name);
    });

    it('returns a new instance with updated sortOrder', () => {
      const original = Specialty.reconstitute(makeProps());
      const updated = original.withUpdates({ sortOrder: 999 });

      expect(updated.sortOrder).toBe(999);
    });

    it('sets updatedAt to a new Date', () => {
      const before = new Date('2026-01-01T00:00:00Z');
      const original = Specialty.reconstitute(makeProps({ updatedAt: before }));
      const updated = original.withUpdates({ name: 'New' });

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not mutate the original entity', () => {
      const original = Specialty.reconstitute(makeProps());
      original.withUpdates({ name: 'Changed', isActive: false });

      expect(original.name).toBe('Cardiología');
      expect(original.isActive).toBe(true);
    });

    it('applies no changes when empty object passed', () => {
      const original = Specialty.reconstitute(makeProps());
      const updated = original.withUpdates({});

      expect(updated.name).toBe(original.name);
      expect(updated.isActive).toBe(original.isActive);
      expect(updated.sortOrder).toBe(original.sortOrder);
    });
  });
});
