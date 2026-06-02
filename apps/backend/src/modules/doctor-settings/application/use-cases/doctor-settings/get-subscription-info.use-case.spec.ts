import { GetSubscriptionInfoUseCase } from './get-subscription-info.use-case';
import type { ISubscriptionRepository } from '../../../domain/repositories/subscription.repository';
import { SubscriptionNotFoundError } from '../../../domain/errors/subscription-not-found.error';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

describe('GetSubscriptionInfoUseCase', () => {
  let useCase: GetSubscriptionInfoUseCase;
  let mockRepo: jest.Mocked<ISubscriptionRepository>;

  beforeEach(() => {
    mockRepo = {
      findByDoctorId: jest.fn(),
    };
    useCase = new GetSubscriptionInfoUseCase(mockRepo);
  });

  it('returns none banner level when expiry is far away', async () => {
    mockRepo.findByDoctorId.mockResolvedValue({
      status: 'active',
      plan: 'professional',
      expiresAt: daysFromNow(30),
    });

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.bannerLevel).toBe('none');
    expect(result.plan).toBe('professional');
    expect(result.status).toBe('active');
  });

  it('returns warning banner level when 5 days to expiry', async () => {
    mockRepo.findByDoctorId.mockResolvedValue({
      status: 'active',
      plan: 'basic',
      expiresAt: daysFromNow(5),
    });

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.bannerLevel).toBe('warning');
  });

  it('returns critical banner level when 2 days to expiry', async () => {
    mockRepo.findByDoctorId.mockResolvedValue({
      status: 'active',
      plan: 'basic',
      expiresAt: daysFromNow(2),
    });

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.bannerLevel).toBe('critical');
  });

  it('returns suspended banner level when status is suspended', async () => {
    mockRepo.findByDoctorId.mockResolvedValue({
      status: 'suspended',
      plan: 'basic',
      expiresAt: daysFromNow(30),
    });

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.bannerLevel).toBe('suspended');
  });

  it('throws SubscriptionNotFoundError when no subscription exists', async () => {
    mockRepo.findByDoctorId.mockResolvedValue(null);

    await expect(useCase.execute(DOCTOR_ID)).rejects.toBeInstanceOf(SubscriptionNotFoundError);
  });

  it('returns daysUntilExpiry in the output', async () => {
    mockRepo.findByDoctorId.mockResolvedValue({
      status: 'active',
      plan: 'professional',
      expiresAt: daysFromNow(10),
    });

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.daysUntilExpiry).toBeGreaterThanOrEqual(9);
    expect(result.daysUntilExpiry).toBeLessThanOrEqual(11);
  });
});
