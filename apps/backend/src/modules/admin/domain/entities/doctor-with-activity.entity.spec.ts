import { DoctorWithActivity } from './doctor-with-activity.entity';

const makeDoctor = (lastSignInAt: Date | null): DoctorWithActivity =>
  new DoctorWithActivity(
    'uuid-1',
    'Dr. John Doe',
    'john@example.com',
    'Cardiología',
    'active',
    'basic',
    new Date('2026-12-31'),
    lastSignInAt,
  );

const daysAgo = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

describe('DoctorWithActivity.activityStatus', () => {
  it('returns active when last login was 5 days ago', () => {
    const doctor = makeDoctor(daysAgo(5));
    expect(doctor.activityStatus).toBe('active');
  });

  it('returns active when last login was exactly 7 days ago', () => {
    const doctor = makeDoctor(daysAgo(7));
    expect(doctor.activityStatus).toBe('active');
  });

  it('returns cold when last login was 15 days ago', () => {
    const doctor = makeDoctor(daysAgo(15));
    expect(doctor.activityStatus).toBe('cold');
  });

  it('returns cold when last login was exactly 30 days ago', () => {
    const doctor = makeDoctor(daysAgo(30));
    expect(doctor.activityStatus).toBe('cold');
  });

  it('returns inactive when last login was 45 days ago', () => {
    const doctor = makeDoctor(daysAgo(45));
    expect(doctor.activityStatus).toBe('inactive');
  });

  it('returns inactive when lastSignInAt is null', () => {
    const doctor = makeDoctor(null);
    expect(doctor.activityStatus).toBe('inactive');
  });

  it('exposes all constructor properties as readonly fields', () => {
    const expiresAt = new Date('2026-12-31');
    const doctor = new DoctorWithActivity(
      'uuid-2',
      'Dr. Jane',
      'jane@test.com',
      'Pediatría',
      'trial',
      'trial',
      expiresAt,
      null,
    );

    expect(doctor.id).toBe('uuid-2');
    expect(doctor.fullName).toBe('Dr. Jane');
    expect(doctor.email).toBe('jane@test.com');
    expect(doctor.specialty).toBe('Pediatría');
    expect(doctor.subscriptionStatus).toBe('trial');
    expect(doctor.subscriptionPlan).toBe('trial');
    expect(doctor.subscriptionExpiresAt).toBe(expiresAt);
    expect(doctor.lastSignInAt).toBeNull();
  });
});
