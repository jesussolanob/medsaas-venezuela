import { CreateSellerSpecialistUseCase } from './create-seller-specialist.use-case';
import type {
  ISellerRepository,
  SellerSpecialistRow,
} from '../../domain/repositories/seller.repository';

const SELLER_ID = 'seller-uuid-001';

function makeSpecialist(overrides: Partial<SellerSpecialistRow> = {}): SellerSpecialistRow {
  return {
    id: 'spec-uuid-001',
    fullName: 'Dr. Ramírez',
    email: 'dr.ramirez@example.com',
    phone: '584141234567',
    cedula: 'V-12345678',
    isActive: true,
    specialty: 'Cardiología',
    plan: 'free_trial',
    subscriptionStatus: 'trialing',
    createdAt: new Date('2026-08-16T10:00:00Z'),
    lastSignInAt: null,
    onboardingCompleted: false,
    ...overrides,
  };
}

function makeRepoMock(): jest.Mocked<ISellerRepository> {
  return {
    createSeller: jest.fn(),
    findById: jest.fn(),
    listSellers: jest.fn(),
    findByCode: jest.fn(),
    codeExists: jest.fn(),
    listSoldSpecialists: jest.fn(),
    findSoldSpecialist: jest.fn(),
    createSoldSpecialist: jest.fn(),
    linkSoldBy: jest.fn(),
  };
}

describe('CreateSellerSpecialistUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let useCase: CreateSellerSpecialistUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    useCase = new CreateSellerSpecialistUseCase(repoMock);
  });

  it('creates a specialist with sold_by from sellerId (session), never the body', async () => {
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute({
      sellerId: SELLER_ID,
      fullName: 'Dr. Ramírez',
      email: 'ramírez@example.com',
      specialty: 'Cardiología',
    });

    const callArgs = repoMock.createSoldSpecialist.mock.calls[0]![0];
    expect(callArgs.soldBy).toBe(SELLER_ID);
  });

  it('always sets plan to free_trial — sellers cannot assign paid plans', async () => {
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute({
      sellerId: SELLER_ID,
      fullName: 'Dr. López',
      email: 'lopez@example.com',
    });

    const callArgs = repoMock.createSoldSpecialist.mock.calls[0]![0];
    expect(callArgs.plan).toBe('free_trial');
  });

  it('normalises email to lowercase', async () => {
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute({
      sellerId: SELLER_ID,
      fullName: 'Dr. Torres',
      email: 'TORRES@EXAMPLE.COM',
    });

    expect(repoMock.createSoldSpecialist.mock.calls[0]![0].email).toBe('torres@example.com');
  });

  it('passes optional fields through correctly', async () => {
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute({
      sellerId: SELLER_ID,
      fullName: 'Dr. Medina',
      email: 'medina@example.com',
      specialty: 'Pediatría',
      cedula: 'V-11223344',
      phone: '+58 424 555 0001',
    });

    const callArgs = repoMock.createSoldSpecialist.mock.calls[0]![0];
    expect(callArgs.specialty).toBe('Pediatría');
    expect(callArgs.cedula).toBe('V-11223344');
    expect(callArgs.phone).toBe('+58 424 555 0001');
  });

  it('propagates repository errors (e.g. email conflict)', async () => {
    const error = new Error('email conflict');
    repoMock.createSoldSpecialist.mockRejectedValue(error);

    await expect(
      useCase.execute({ sellerId: SELLER_ID, fullName: 'X', email: 'x@x.com' }),
    ).rejects.toBe(error);
  });

  describe('onboardingCompleted — distingue alta completa de incompleta', () => {
    it('devuelve onboardingCompleted=false para un especialista que no terminó el alta', async () => {
      repoMock.createSoldSpecialist.mockResolvedValue(
        makeSpecialist({ onboardingCompleted: false }),
      );

      const result = await useCase.execute({
        sellerId: SELLER_ID,
        fullName: 'Dr. Incompleto',
        email: 'incompleto@example.com',
      });

      expect(result.onboardingCompleted).toBe(false);
    });

    it('devuelve onboardingCompleted=true para un especialista que completó el alta', async () => {
      repoMock.createSoldSpecialist.mockResolvedValue(
        makeSpecialist({ onboardingCompleted: true }),
      );

      const result = await useCase.execute({
        sellerId: SELLER_ID,
        fullName: 'Dr. Completo',
        email: 'completo@example.com',
      });

      expect(result.onboardingCompleted).toBe(true);
    });
  });
});
