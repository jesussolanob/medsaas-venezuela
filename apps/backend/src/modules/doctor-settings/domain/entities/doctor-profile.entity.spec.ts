import { DoctorProfile } from './doctor-profile.entity';

const BASE_PARAMS = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  fullName: 'Dr. Juan Pérez',
  email: 'juan@example.com',
  specialty: 'Cardiología',
  professionalTitle: 'Dr.',
  clinicId: null,
  clinicRole: null,
  paymentMethods: ['pago_movil', 'zelle'],
  paymentDetails: { zelle: 'juan@zelle.com' },
  allowsOnline: true,
  officeAddress: 'Av. Principal 123',
  city: 'Caracas',
  avatarUrl: null,
  plan: 'professional',
  subscriptionStatus: 'active',
};

describe('DoctorProfile entity', () => {
  it('creates a profile with all properties', () => {
    const profile = DoctorProfile.create(BASE_PARAMS);

    expect(profile.id).toBe(BASE_PARAMS.id);
    expect(profile.fullName).toBe(BASE_PARAMS.fullName);
    expect(profile.email).toBe(BASE_PARAMS.email);
    expect(profile.specialty).toBe(BASE_PARAMS.specialty);
    expect(profile.professionalTitle).toBe(BASE_PARAMS.professionalTitle);
    expect(profile.paymentMethods).toEqual(BASE_PARAMS.paymentMethods);
    expect(profile.paymentDetails).toEqual(BASE_PARAMS.paymentDetails);
    expect(profile.allowsOnline).toBe(true);
    expect(profile.plan).toBe('professional');
  });

  it('computes bookingLink from id', () => {
    const profile = DoctorProfile.create(BASE_PARAMS);
    expect(profile.bookingLink).toBe(`/book/${BASE_PARAMS.id}`);
  });

  it('returns true for isOnlineEnabled when allowsOnline is true', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, allowsOnline: true });
    expect(profile.isOnlineEnabled()).toBe(true);
  });

  it('returns false for isOnlineEnabled when allowsOnline is false', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, allowsOnline: false });
    expect(profile.isOnlineEnabled()).toBe(false);
  });

  it('accepts null optional fields', () => {
    const profile = DoctorProfile.create({
      ...BASE_PARAMS,
      specialty: null,
      professionalTitle: null,
      clinicId: null,
      clinicRole: null,
      officeAddress: null,
      city: null,
      avatarUrl: null,
      plan: null,
      subscriptionStatus: null,
    });

    expect(profile.specialty).toBeNull();
    expect(profile.professionalTitle).toBeNull();
    expect(profile.plan).toBeNull();
  });

  it('stores paymentDetails as-is', () => {
    const details = { pago_movil: '04121234567', zelle: 'doc@zelle.com' };
    const profile = DoctorProfile.create({ ...BASE_PARAMS, paymentDetails: details });
    expect(profile.paymentDetails).toEqual(details);
  });
});
