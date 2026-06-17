import { IncomeConcept } from './income-concept.entity';

const makeParams = (overrides: Partial<Parameters<typeof IncomeConcept.create>[0]> = {}) => ({
  id: 'concept-id-1',
  doctorId: 'doctor-id-1',
  name: 'Consulta general',
  isActive: true,
  sortOrder: 0,
  createdAt: new Date('2026-06-17T10:00:00Z'),
  updatedAt: new Date('2026-06-17T10:00:00Z'),
  ...overrides,
});

describe('IncomeConcept entity', () => {
  describe('create()', () => {
    it('creates a concept with provided fields', () => {
      const concept = IncomeConcept.create(makeParams());
      expect(concept.id).toBe('concept-id-1');
      expect(concept.doctorId).toBe('doctor-id-1');
      expect(concept.name).toBe('Consulta general');
      expect(concept.isActive).toBe(true);
      expect(concept.sortOrder).toBe(0);
    });

    it('defaults isActive to true when omitted', () => {
      const params = makeParams();
      const { isActive: _ia, ...rest } = params;
      void _ia;
      const concept = IncomeConcept.create(rest);
      expect(concept.isActive).toBe(true);
    });

    it('defaults sortOrder to 0 when omitted', () => {
      const params = makeParams();
      const { sortOrder: _so, ...rest } = params;
      void _so;
      const concept = IncomeConcept.create(rest);
      expect(concept.sortOrder).toBe(0);
    });
  });

  describe('isOwnedBy()', () => {
    it('returns true when actorId matches doctorId', () => {
      const concept = IncomeConcept.create(makeParams());
      expect(concept.isOwnedBy('doctor-id-1')).toBe(true);
    });

    it('returns false when actorId differs', () => {
      const concept = IncomeConcept.create(makeParams());
      expect(concept.isOwnedBy('other-doctor')).toBe(false);
    });
  });

  describe('patch()', () => {
    it('returns a new entity with name updated, others unchanged', () => {
      const original = IncomeConcept.create(makeParams({ sortOrder: 3 }));
      const patched = original.patch({ name: 'Urgencia' });
      expect(patched.name).toBe('Urgencia');
      expect(patched.sortOrder).toBe(3);
      expect(patched.isActive).toBe(true);
      // Immutability: original is unchanged.
      expect(original.name).toBe('Consulta general');
    });

    it('returns a new entity with isActive set to false', () => {
      const original = IncomeConcept.create(makeParams());
      const patched = original.patch({ isActive: false });
      expect(patched.isActive).toBe(false);
      expect(patched.name).toBe('Consulta general');
    });

    it('returns a new entity with sortOrder updated', () => {
      const original = IncomeConcept.create(makeParams({ sortOrder: 1 }));
      const patched = original.patch({ sortOrder: 5 });
      expect(patched.sortOrder).toBe(5);
      expect(original.sortOrder).toBe(1);
    });

    it('sets updatedAt to current time (greater than createdAt)', () => {
      const concept = IncomeConcept.create(makeParams({ createdAt: new Date('2026-01-01') }));
      const patched = concept.patch({ name: 'Nuevo' });
      expect(patched.updatedAt.getTime()).toBeGreaterThan(concept.createdAt.getTime());
    });
  });
});
