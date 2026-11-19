import { ListSellerSpecialistsUseCase } from './list-seller-specialists.use-case';
import type {
  ISellerRepository,
  SellerSpecialistWithStats,
} from '../../domain/repositories/seller.repository';

const SELLER_ID = 'seller-uuid-1';

function makeStats(overrides: Partial<SellerSpecialistWithStats> = {}): SellerSpecialistWithStats {
  return {
    id: 'spec-uuid-1',
    fullName: 'Dr. Test',
    email: 'test@example.com',
    phone: null,
    cedula: null,
    sellerNotes: null,
    isActive: true,
    specialty: 'Cardiología',
    plan: 'free_trial',
    subscriptionStatus: 'trialing',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    lastSignInAt: new Date('2026-06-01T00:00:00.000Z'),
    onboardingCompleted: true,
    officesCount: 2,
    consultationsCount: 10,
    onboardingStep: 'completed',
    paymentMethodsConfigured: true,
    consultationsByBooking: 6,
    consultationsByDoctor: 3,
    consultationsUnclassified: 1,
    followUpStatus: 'sin_contactar',
    lastActivityAt: null,
    ...overrides,
  };
}

function makeRepo(rows: SellerSpecialistWithStats[] = []): jest.Mocked<ISellerRepository> {
  return {
    listSoldSpecialistsWithStats: jest.fn().mockResolvedValue(rows),
  } as unknown as jest.Mocked<ISellerRepository>;
}

describe('ListSellerSpecialistsUseCase', () => {
  it('calls listSoldSpecialistsWithStats with the seller id from the session', async () => {
    const repo = makeRepo([]);
    const useCase = new ListSellerSpecialistsUseCase(repo);

    await useCase.execute(SELLER_ID);

    expect(repo.listSoldSpecialistsWithStats).toHaveBeenCalledWith(SELLER_ID);
  });

  it('returns an empty array when the seller has no specialists', async () => {
    const useCase = new ListSellerSpecialistsUseCase(makeRepo([]));
    const result = await useCase.execute(SELLER_ID);
    expect(result).toEqual([]);
  });

  it('passes through enriched specialist rows with stats', async () => {
    const row = makeStats({ id: 'spec-1', consultationsCount: 5 });
    const useCase = new ListSellerSpecialistsUseCase(makeRepo([row]));

    const result = await useCase.execute(SELLER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('spec-1');
    expect(result[0]!.consultationsCount).toBe(5);
  });

  it('propagates the full stats shape including origin counts', async () => {
    const row = makeStats({
      consultationsByBooking: 8,
      consultationsByDoctor: 2,
      consultationsUnclassified: 0,
      officesCount: 3,
      onboardingStep: 'completed',
      paymentMethodsConfigured: false,
    });
    const useCase = new ListSellerSpecialistsUseCase(makeRepo([row]));

    const result = await useCase.execute(SELLER_ID);

    expect(result[0]!.consultationsByBooking).toBe(8);
    expect(result[0]!.consultationsByDoctor).toBe(2);
    expect(result[0]!.consultationsUnclassified).toBe(0);
    expect(result[0]!.officesCount).toBe(3);
    expect(result[0]!.onboardingStep).toBe('completed');
    expect(result[0]!.paymentMethodsConfigured).toBe(false);
  });

  it('handles multiple specialists in order', async () => {
    const rows = [makeStats({ id: 'spec-1' }), makeStats({ id: 'spec-2' })];
    const useCase = new ListSellerSpecialistsUseCase(makeRepo(rows));

    const result = await useCase.execute(SELLER_ID);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('spec-1');
    expect(result[1]!.id).toBe('spec-2');
  });

  it('propagates followUpStatus and lastActivityAt from repository', async () => {
    const lastAct = new Date('2026-11-18T10:00:00Z');
    const row = makeStats({
      followUpStatus: 'induccion',
      lastActivityAt: lastAct,
    });
    const useCase = new ListSellerSpecialistsUseCase(makeRepo([row]));

    const result = await useCase.execute(SELLER_ID);

    expect(result[0]!.followUpStatus).toBe('induccion');
    expect(result[0]!.lastActivityAt).toEqual(lastAct);
  });

  it('defaults followUpStatus to sin_contactar when no activity recorded', async () => {
    const row = makeStats({ followUpStatus: 'sin_contactar', lastActivityAt: null });
    const useCase = new ListSellerSpecialistsUseCase(makeRepo([row]));

    const result = await useCase.execute(SELLER_ID);

    expect(result[0]!.followUpStatus).toBe('sin_contactar');
    expect(result[0]!.lastActivityAt).toBeNull();
  });
});
