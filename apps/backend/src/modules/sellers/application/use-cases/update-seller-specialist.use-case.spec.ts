import { UpdateSellerSpecialistUseCase } from './update-seller-specialist.use-case';
import { SpecialistNotInPortfolioError } from '../../domain/errors/specialist-not-in-portfolio.error';
import type {
  ISellerRepository,
  SellerSpecialistRow,
} from '../../domain/repositories/seller.repository';

const SELLER_ID = 'seller-uuid-001';
const SPECIALIST_ID = 'spec-uuid-001';

function makeSpecialist(overrides: Partial<SellerSpecialistRow> = {}): SellerSpecialistRow {
  return {
    id: SPECIALIST_ID,
    fullName: 'Dr. Ramírez',
    email: 'dr.ramirez@example.com',
    phone: null,
    cedula: null,
    sellerNotes: null,
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

function makeRepo(): jest.Mocked<ISellerRepository> {
  return {
    updateSoldSpecialistContact: jest.fn().mockResolvedValue(makeSpecialist()),
  } as unknown as jest.Mocked<ISellerRepository>;
}

describe('UpdateSellerSpecialistUseCase', () => {
  let repo: jest.Mocked<ISellerRepository>;
  let useCase: UpdateSellerSpecialistUseCase;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new UpdateSellerSpecialistUseCase(repo);
  });

  it('saves phone and notes for a specialist in the portfolio', async () => {
    await useCase.execute(SELLER_ID, SPECIALIST_ID, {
      phone: '584141234567',
      sellerNotes: 'Prefiere que lo llamen de tarde.',
    });

    expect(repo.updateSoldSpecialistContact).toHaveBeenCalledWith(SELLER_ID, SPECIALIST_ID, {
      phone: '584141234567',
      sellerNotes: 'Prefiere que lo llamen de tarde.',
    });
  });

  it('trims the values before saving', async () => {
    await useCase.execute(SELLER_ID, SPECIALIST_ID, {
      phone: '  584141234567  ',
      sellerNotes: '  una nota  ',
    });

    expect(repo.updateSoldSpecialistContact).toHaveBeenCalledWith(SELLER_ID, SPECIALIST_ID, {
      phone: '584141234567',
      sellerNotes: 'una nota',
    });
  });

  it('stores an empty field as null, not as an empty string', async () => {
    // "Sin teléfono" tiene que ser UN solo valor en la BD: '' y null se ven
    // igual en pantalla pero se comparan distinto.
    await useCase.execute(SELLER_ID, SPECIALIST_ID, { phone: '   ', sellerNotes: '' });

    expect(repo.updateSoldSpecialistContact).toHaveBeenCalledWith(SELLER_ID, SPECIALIST_ID, {
      phone: null,
      sellerNotes: null,
    });
  });

  it('leaves out a field that was not sent', async () => {
    // undefined = "no tocar". Mandar solo las notas no puede borrar el teléfono.
    await useCase.execute(SELLER_ID, SPECIALIST_ID, { sellerNotes: 'solo notas' });

    expect(repo.updateSoldSpecialistContact).toHaveBeenCalledWith(SELLER_ID, SPECIALIST_ID, {
      sellerNotes: 'solo notas',
    });
  });

  it('throws when the specialist belongs to another seller or does not exist', async () => {
    // Anti-IDOR: el repositorio devuelve null en ambos casos y no se distinguen.
    repo.updateSoldSpecialistContact.mockResolvedValue(null);

    await expect(
      useCase.execute(SELLER_ID, SPECIALIST_ID, { phone: '584141234567' }),
    ).rejects.toThrow(SpecialistNotInPortfolioError);
  });
});
