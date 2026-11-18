import { AddSpecialistActivityUseCase } from './add-specialist-activity.use-case';
import type {
  ISellerRepository,
  SellerSpecialistRow,
  SpecialistActivityRow,
} from '../../domain/repositories/seller.repository';
import { SpecialistNotInPortfolioError } from '../../domain/errors/specialist-not-in-portfolio.error';
import { SpecialistAlreadySameStatusError } from '../../domain/errors/specialist-already-same-status.error';

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
    listSpecialistActivitiesRaw: jest.fn(),
    createSpecialistActivity: jest.fn().mockResolvedValue(makeActivityRow()),
    ...overrides,
  } as unknown as jest.Mocked<ISellerRepository>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AddSpecialistActivityUseCase', () => {
  // -------------------------------------------------------------------------
  // Anti-IDOR
  // -------------------------------------------------------------------------

  it('throws SpecialistNotInPortfolioError when specialist not in portfolio', async () => {
    const repo = makeRepo({ findSoldSpecialist: jest.fn().mockResolvedValue(null) });
    const useCase = new AddSpecialistActivityUseCase(repo);

    await expect(
      useCase.execute({
        sellerId: SELLER_ID,
        specialistId: SPECIALIST_ID,
        status: 'primer_contacto',
      }),
    ).rejects.toBeInstanceOf(SpecialistNotInPortfolioError);
  });

  it('throws same IDOR error whether specialist does not exist or belongs to another seller', async () => {
    const repo = makeRepo({ findSoldSpecialist: jest.fn().mockResolvedValue(null) });
    const useCase = new AddSpecialistActivityUseCase(repo);

    const err = await useCase
      .execute({ sellerId: SELLER_ID, specialistId: SPECIALIST_ID, comment: 'nota' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(SpecialistNotInPortfolioError);
  });

  // -------------------------------------------------------------------------
  // Same-status 422
  // -------------------------------------------------------------------------

  it('throws SpecialistAlreadySameStatusError when status equals current and no comment', async () => {
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest.fn().mockResolvedValue('primer_contacto'),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    await expect(
      useCase.execute({
        sellerId: SELLER_ID,
        specialistId: SPECIALIST_ID,
        status: 'primer_contacto',
      }),
    ).rejects.toBeInstanceOf(SpecialistAlreadySameStatusError);
  });

  it('same-status error code is SPECIALIST_ALREADY_SAME_STATUS', async () => {
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest.fn().mockResolvedValue('induccion'),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    const err = await useCase
      .execute({ sellerId: SELLER_ID, specialistId: SPECIALIST_ID, status: 'induccion' })
      .catch((e) => e);
    expect(err.code).toBe('SPECIALIST_ALREADY_SAME_STATUS');
  });

  // -------------------------------------------------------------------------
  // Status change (without comment)
  // -------------------------------------------------------------------------

  it('creates a status_change entry when status differs from current', async () => {
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest
        .fn()
        .mockResolvedValueOnce('sin_contactar') // before insert
        .mockResolvedValueOnce('primer_contacto'), // after insert
      createSpecialistActivity: jest
        .fn()
        .mockResolvedValue(makeActivityRow({ toStatus: 'primer_contacto', fromStatus: null })),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    const result = await useCase.execute({
      sellerId: SELLER_ID,
      specialistId: SPECIALIST_ID,
      status: 'primer_contacto',
    });

    expect(repo.createSpecialistActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status_change',
        toStatus: 'primer_contacto',
        fromStatus: null, // 'sin_contactar' maps to null in fromStatus
        comment: null,
      }),
    );
    expect(result.currentStatus).toBe('primer_contacto');
  });

  it('sets fromStatus to the current status when it is a real status (not sin_contactar)', async () => {
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest
        .fn()
        .mockResolvedValueOnce('primer_contacto')
        .mockResolvedValueOnce('induccion'),
      createSpecialistActivity: jest
        .fn()
        .mockResolvedValue(
          makeActivityRow({
            type: 'status_change',
            fromStatus: 'primer_contacto',
            toStatus: 'induccion',
          }),
        ),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    await useCase.execute({
      sellerId: SELLER_ID,
      specialistId: SPECIALIST_ID,
      status: 'induccion',
    });

    expect(repo.createSpecialistActivity).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'primer_contacto', toStatus: 'induccion' }),
    );
  });

  // -------------------------------------------------------------------------
  // Status change with comment
  // -------------------------------------------------------------------------

  it('creates a status_change entry with comment when both are provided', async () => {
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest
        .fn()
        .mockResolvedValueOnce('sin_contactar')
        .mockResolvedValueOnce('no_atendio'),
      createSpecialistActivity: jest
        .fn()
        .mockResolvedValue(
          makeActivityRow({
            type: 'status_change',
            toStatus: 'no_atendio',
            comment: 'No atendió el teléfono',
          }),
        ),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    await useCase.execute({
      sellerId: SELLER_ID,
      specialistId: SPECIALIST_ID,
      status: 'no_atendio',
      comment: 'No atendió el teléfono',
    });

    expect(repo.createSpecialistActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status_change', comment: 'No atendió el teléfono' }),
    );
  });

  // -------------------------------------------------------------------------
  // Comment only
  // -------------------------------------------------------------------------

  it('creates a comment entry when only comment is provided', async () => {
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest
        .fn()
        .mockResolvedValueOnce('primer_contacto')
        .mockResolvedValueOnce('primer_contacto'),
      createSpecialistActivity: jest
        .fn()
        .mockResolvedValue(
          makeActivityRow({
            type: 'comment',
            fromStatus: null,
            toStatus: null,
            comment: 'Nota libre',
          }),
        ),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    const result = await useCase.execute({
      sellerId: SELLER_ID,
      specialistId: SPECIALIST_ID,
      comment: 'Nota libre',
    });

    expect(repo.createSpecialistActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'comment',
        fromStatus: null,
        toStatus: null,
        comment: 'Nota libre',
      }),
    );
    expect(result.activity.type).toBe('comment');
  });

  it('trims whitespace from comment before persisting', async () => {
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest.fn().mockResolvedValue('sin_contactar'),
      createSpecialistActivity: jest
        .fn()
        .mockResolvedValue(makeActivityRow({ type: 'comment', comment: 'nota con espacios' })),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    await useCase.execute({
      sellerId: SELLER_ID,
      specialistId: SPECIALIST_ID,
      comment: '  nota con espacios  ',
    });

    expect(repo.createSpecialistActivity).toHaveBeenCalledWith(
      expect.objectContaining({ comment: 'nota con espacios' }),
    );
  });

  // -------------------------------------------------------------------------
  // Same status with comment → downgrade to comment entry
  // -------------------------------------------------------------------------

  it('creates a comment entry when status equals current but comment is present', async () => {
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest
        .fn()
        .mockResolvedValueOnce('induccion')
        .mockResolvedValueOnce('induccion'),
      createSpecialistActivity: jest
        .fn()
        .mockResolvedValue(
          makeActivityRow({
            type: 'comment',
            fromStatus: null,
            toStatus: null,
            comment: 'Seguimiento',
          }),
        ),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    await useCase.execute({
      sellerId: SELLER_ID,
      specialistId: SPECIALIST_ID,
      status: 'induccion', // same as current
      comment: 'Seguimiento',
    });

    // Should NOT be a status_change since status didn't change
    expect(repo.createSpecialistActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'comment', toStatus: null }),
    );
  });

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  it('returns the created activity and updated currentStatus', async () => {
    const createdActivity = makeActivityRow({ id: 'new-act', toStatus: 'reactivar' });
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest
        .fn()
        .mockResolvedValueOnce('desistido')
        .mockResolvedValueOnce('reactivar'),
      createSpecialistActivity: jest.fn().mockResolvedValue(createdActivity),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    const result = await useCase.execute({
      sellerId: SELLER_ID,
      specialistId: SPECIALIST_ID,
      status: 'reactivar',
    });

    expect(result.activity.id).toBe('new-act');
    expect(result.currentStatus).toBe('reactivar');
  });

  // -------------------------------------------------------------------------
  // sellerId/specialistId passed through to repo
  // -------------------------------------------------------------------------

  it('passes sellerId and specialistId to createSpecialistActivity', async () => {
    const repo = makeRepo({
      getSpecialistCurrentStatus: jest
        .fn()
        .mockResolvedValueOnce('sin_contactar')
        .mockResolvedValueOnce('completar_onboarding'),
    });
    const useCase = new AddSpecialistActivityUseCase(repo);

    await useCase.execute({
      sellerId: SELLER_ID,
      specialistId: SPECIALIST_ID,
      status: 'completar_onboarding',
    });

    expect(repo.createSpecialistActivity).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: SELLER_ID, specialistId: SPECIALIST_ID }),
    );
  });
});
