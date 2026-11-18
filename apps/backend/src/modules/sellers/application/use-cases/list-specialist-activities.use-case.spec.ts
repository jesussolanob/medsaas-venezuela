import { ListSpecialistActivitiesUseCase } from './list-specialist-activities.use-case';
import type {
  ISellerRepository,
  SellerSpecialistRow,
  SpecialistActivityRow,
} from '../../domain/repositories/seller.repository';
import { SpecialistNotInPortfolioError } from '../../domain/errors/specialist-not-in-portfolio.error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SELLER_ID = 'seller-uuid-1';
const SPECIALIST_ID = 'specialist-uuid-1';

function makeSpecialistRow(overrides: Partial<SellerSpecialistRow> = {}): SellerSpecialistRow {
  return {
    id: SPECIALIST_ID,
    fullName: 'Dr. Pérez',
    email: 'dr.perez@example.com',
    phone: null,
    cedula: null,
    sellerNotes: null,
    isActive: true,
    specialty: 'Cardiología',
    plan: 'free_trial',
    subscriptionStatus: 'trialing',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastSignInAt: null,
    onboardingCompleted: false,
    ...overrides,
  };
}

function makeActivityRow(overrides: Partial<SpecialistActivityRow> = {}): SpecialistActivityRow {
  return {
    id: 'act-uuid-1',
    type: 'status_change',
    fromStatus: null,
    toStatus: 'primer_contacto',
    comment: null,
    createdAt: new Date('2026-11-18T10:00:00Z'),
    authorName: 'María Vendedora',
    ...overrides,
  };
}

function makeRepo(
  overrides: Partial<jest.Mocked<ISellerRepository>> = {},
): jest.Mocked<ISellerRepository> {
  return {
    createSeller: jest.fn(),
    findById: jest.fn(),
    listSellers: jest.fn(),
    findByCode: jest.fn(),
    codeExists: jest.fn(),
    listSoldSpecialists: jest.fn(),
    listSoldSpecialistsWithStats: jest.fn(),
    findSoldSpecialist: jest.fn().mockResolvedValue(makeSpecialistRow()),
    updateSoldSpecialistContact: jest.fn(),
    createSoldSpecialist: jest.fn(),
    linkSoldBy: jest.fn(),
    getSellerPaymentDetails: jest.fn(),
    updateSellerPaymentDetails: jest.fn(),
    getSpecialistSellerAssignment: jest.fn(),
    deactivateOwnAccount: jest.fn(),
    findByCedula: jest.fn(),
    getSpecialistCurrentStatus: jest.fn().mockResolvedValue('sin_contactar'),
    listSpecialistActivitiesRaw: jest.fn().mockResolvedValue([]),
    createSpecialistActivity: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ISellerRepository>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ListSpecialistActivitiesUseCase', () => {
  it('throws SpecialistNotInPortfolioError when specialist is not in portfolio', async () => {
    const repo = makeRepo({ findSoldSpecialist: jest.fn().mockResolvedValue(null) });
    const useCase = new ListSpecialistActivitiesUseCase(repo);

    await expect(useCase.execute(SELLER_ID, SPECIALIST_ID)).rejects.toBeInstanceOf(
      SpecialistNotInPortfolioError,
    );
  });

  it('throws same error whether specialist belongs to another seller or does not exist', async () => {
    const repo = makeRepo({ findSoldSpecialist: jest.fn().mockResolvedValue(null) });
    const useCase = new ListSpecialistActivitiesUseCase(repo);

    const err = await useCase.execute(SELLER_ID, SPECIALIST_ID).catch((e) => e);
    expect(err).toBeInstanceOf(SpecialistNotInPortfolioError);
    expect(err.code).toBe('SPECIALIST_NOT_IN_PORTFOLIO');
  });

  it('returns empty activities and sin_contactar when no history exists', async () => {
    const repo = makeRepo({
      listSpecialistActivitiesRaw: jest.fn().mockResolvedValue([]),
      getSpecialistCurrentStatus: jest.fn().mockResolvedValue('sin_contactar'),
    });
    const useCase = new ListSpecialistActivitiesUseCase(repo);

    const result = await useCase.execute(SELLER_ID, SPECIALIST_ID);

    expect(result.currentStatus).toBe('sin_contactar');
    expect(result.activities).toHaveLength(0);
  });

  it('returns activities newest first with current status', async () => {
    const activity1 = makeActivityRow({
      id: 'act-1',
      toStatus: 'induccion',
      createdAt: new Date('2026-11-18T12:00:00Z'),
    });
    const activity2 = makeActivityRow({
      id: 'act-2',
      toStatus: 'primer_contacto',
      createdAt: new Date('2026-11-18T10:00:00Z'),
    });
    const repo = makeRepo({
      listSpecialistActivitiesRaw: jest.fn().mockResolvedValue([activity1, activity2]),
      getSpecialistCurrentStatus: jest.fn().mockResolvedValue('induccion'),
    });
    const useCase = new ListSpecialistActivitiesUseCase(repo);

    const result = await useCase.execute(SELLER_ID, SPECIALIST_ID);

    expect(result.currentStatus).toBe('induccion');
    expect(result.activities).toHaveLength(2);
    expect(result.activities[0]!.id).toBe('act-1');
    expect(result.activities[1]!.id).toBe('act-2');
  });

  it('calls findSoldSpecialist with sellerId and specialistId for anti-IDOR check', async () => {
    const repo = makeRepo();
    const useCase = new ListSpecialistActivitiesUseCase(repo);

    await useCase.execute(SELLER_ID, SPECIALIST_ID);

    expect(repo.findSoldSpecialist).toHaveBeenCalledWith(SELLER_ID, SPECIALIST_ID);
  });

  it('returns comment-type activities in the list', async () => {
    const commentActivity = makeActivityRow({
      id: 'act-comment-1',
      type: 'comment',
      fromStatus: null,
      toStatus: null,
      comment: 'Llamé y no atendió el teléfono',
    });
    const repo = makeRepo({
      listSpecialistActivitiesRaw: jest.fn().mockResolvedValue([commentActivity]),
      getSpecialistCurrentStatus: jest.fn().mockResolvedValue('sin_contactar'),
    });
    const useCase = new ListSpecialistActivitiesUseCase(repo);

    const result = await useCase.execute(SELLER_ID, SPECIALIST_ID);

    expect(result.activities[0]!.type).toBe('comment');
    expect(result.activities[0]!.comment).toBe('Llamé y no atendió el teléfono');
  });

  it('returns null authorName when author is a placeholder', async () => {
    const activity = makeActivityRow({ authorName: null });
    const repo = makeRepo({
      listSpecialistActivitiesRaw: jest.fn().mockResolvedValue([activity]),
    });
    const useCase = new ListSpecialistActivitiesUseCase(repo);

    const result = await useCase.execute(SELLER_ID, SPECIALIST_ID);

    expect(result.activities[0]!.authorName).toBeNull();
  });
});
