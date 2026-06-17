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
  logoUrl: null,
  signatureUrl: null,
  licenseNumber: null,
  phone: null,
  currencyMode: 'usd_bcv',
  customRate: null,
  customRateLabel: null,
  cedula: null,
  birthDate: null,
  onboardingCompleted: false,
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

  it('stores logo, signature, and license number', () => {
    const profile = DoctorProfile.create({
      ...BASE_PARAMS,
      logoUrl: 'https://cdn.example.com/logo.png',
      signatureUrl: 'https://cdn.example.com/sig.png',
      licenseNumber: 'MED-123456',
    });

    expect(profile.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(profile.signatureUrl).toBe('https://cdn.example.com/sig.png');
    expect(profile.licenseNumber).toBe('MED-123456');
  });

  it('stores phone when provided', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, phone: '04141234567' });
    expect(profile.phone).toBe('04141234567');
  });

  it('stores null phone when not provided', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, phone: null });
    expect(profile.phone).toBeNull();
  });

  it('stores exchange-rate settings', () => {
    const profile = DoctorProfile.create({
      ...BASE_PARAMS,
      currencyMode: 'custom',
      customRate: 48.75,
      customRateLabel: 'Clínica Delta',
    });

    expect(profile.currencyMode).toBe('custom');
    expect(profile.customRate).toBe(48.75);
    expect(profile.customRateLabel).toBe('Clínica Delta');
  });

  it('stores cedula when provided (read-only field)', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, cedula: 'V-12345678' });
    expect(profile.cedula).toBe('V-12345678');
  });

  it('stores null cedula when not provided', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, cedula: null });
    expect(profile.cedula).toBeNull();
  });

  it('stores birthDate in YYYY-MM-DD format when provided', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, birthDate: '1985-03-15' });
    expect(profile.birthDate).toBe('1985-03-15');
  });

  it('stores null birthDate when not provided', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, birthDate: null });
    expect(profile.birthDate).toBeNull();
  });

  it('stores onboardingCompleted = false by default', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, onboardingCompleted: false });
    expect(profile.onboardingCompleted).toBe(false);
  });

  it('stores onboardingCompleted = true when doctor has completed onboarding', () => {
    const profile = DoctorProfile.create({ ...BASE_PARAMS, onboardingCompleted: true });
    expect(profile.onboardingCompleted).toBe(true);
  });
});
