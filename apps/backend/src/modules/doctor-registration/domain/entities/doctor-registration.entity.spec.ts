import { DoctorRegistration, type DoctorRegistrationProps } from './doctor-registration.entity';

const baseProps: DoctorRegistrationProps = {
  id: 'doc-123',
  fullName: 'Carlos Martínez',
  email: 'carlos@example.com',
  cedula: 'V-12345678',
  mppsNumber: 'MP-001',
  colegiadoNumber: 'COL-002',
  specialty: 'Cardiología',
  verificationStatus: 'pending',
  verifiedAt: null,
  verifiedBy: null,
  createdAt: new Date('2026-01-01'),
};

describe('DoctorRegistration entity', () => {
  describe('create()', () => {
    it('creates entity with all props', () => {
      const entity = DoctorRegistration.create(baseProps);
      expect(entity.id).toBe('doc-123');
      expect(entity.fullName).toBe('Carlos Martínez');
      expect(entity.email).toBe('carlos@example.com');
      expect(entity.cedula).toBe('V-12345678');
      expect(entity.mppsNumber).toBe('MP-001');
      expect(entity.colegiadoNumber).toBe('COL-002');
      expect(entity.specialty).toBe('Cardiología');
      expect(entity.verificationStatus).toBe('pending');
      expect(entity.verifiedAt).toBeNull();
      expect(entity.verifiedBy).toBeNull();
    });

    it('creates entity with null optional fields', () => {
      const entity = DoctorRegistration.create({
        ...baseProps,
        mppsNumber: null,
        colegiadoNumber: null,
        cedula: null,
        specialty: null,
      });
      expect(entity.mppsNumber).toBeNull();
      expect(entity.colegiadoNumber).toBeNull();
      expect(entity.cedula).toBeNull();
      expect(entity.specialty).toBeNull();
    });
  });

  describe('status helpers', () => {
    it('isPending() returns true when status is pending', () => {
      const entity = DoctorRegistration.create(baseProps);
      expect(entity.isPending()).toBe(true);
      expect(entity.isVerified()).toBe(false);
      expect(entity.isRejected()).toBe(false);
    });

    it('isVerified() returns true when status is verified', () => {
      const entity = DoctorRegistration.create({
        ...baseProps,
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        verifiedBy: 'admin-1',
      });
      expect(entity.isVerified()).toBe(true);
      expect(entity.isPending()).toBe(false);
      expect(entity.isRejected()).toBe(false);
    });

    it('isRejected() returns true when status is rejected', () => {
      const entity = DoctorRegistration.create({
        ...baseProps,
        verificationStatus: 'rejected',
        verifiedAt: new Date(),
        verifiedBy: 'admin-1',
      });
      expect(entity.isRejected()).toBe(true);
      expect(entity.isPending()).toBe(false);
      expect(entity.isVerified()).toBe(false);
    });
  });

  describe('withVerification()', () => {
    it('returns new entity with verified status, leaves original unchanged', () => {
      const original = DoctorRegistration.create(baseProps);
      const verifiedAt = new Date('2026-06-01');
      const updated = original.withVerification('verified', 'admin-99', verifiedAt);

      expect(updated.verificationStatus).toBe('verified');
      expect(updated.verifiedBy).toBe('admin-99');
      expect(updated.verifiedAt).toBe(verifiedAt);

      // Original must not mutate
      expect(original.verificationStatus).toBe('pending');
      expect(original.verifiedBy).toBeNull();
    });

    it('returns new entity with rejected status', () => {
      const original = DoctorRegistration.create(baseProps);
      const updated = original.withVerification('rejected', 'admin-99', new Date());
      expect(updated.verificationStatus).toBe('rejected');
      expect(updated.id).toBe(original.id);
    });

    it('preserves identity fields on verification', () => {
      const original = DoctorRegistration.create(baseProps);
      const updated = original.withVerification('verified', 'admin-1', new Date());
      expect(updated.id).toBe(original.id);
      expect(updated.email).toBe(original.email);
      expect(updated.mppsNumber).toBe(original.mppsNumber);
      expect(updated.specialty).toBe(original.specialty);
    });
  });

  describe('withRegistrationUpdate()', () => {
    it('returns new entity with updated fields and resets status to pending', () => {
      const verified = DoctorRegistration.create({
        ...baseProps,
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        verifiedBy: 'admin-1',
      });

      const updated = verified.withRegistrationUpdate({
        fullName: 'Carlos R. Martínez',
        cedula: 'V-99999999',
        mppsNumber: 'MP-999',
        colegiadoNumber: null,
        specialty: 'Neurología',
      });

      expect(updated.fullName).toBe('Carlos R. Martínez');
      expect(updated.cedula).toBe('V-99999999');
      expect(updated.mppsNumber).toBe('MP-999');
      expect(updated.colegiadoNumber).toBeNull();
      expect(updated.specialty).toBe('Neurología');
      expect(updated.verificationStatus).toBe('pending');
      expect(updated.verifiedAt).toBeNull();
      expect(updated.verifiedBy).toBeNull();
      // Immutable — original unchanged
      expect(verified.verificationStatus).toBe('verified');
    });

    it('preserves id and email', () => {
      const original = DoctorRegistration.create(baseProps);
      const updated = original.withRegistrationUpdate({
        fullName: 'New Name',
        cedula: 'E-111',
        mppsNumber: null,
        colegiadoNumber: null,
        specialty: null,
      });
      expect(updated.id).toBe(original.id);
      expect(updated.email).toBe(original.email);
    });
  });
});
