import { CreateSellerUseCase } from './create-seller.use-case';
import type { ISellerRepository, SellerProfile } from '../../domain/repositories/seller.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeller(overrides: Partial<SellerProfile> = {}): SellerProfile {
  return {
    id: 'seller-uuid-001',
    fullName: 'María González',
    sellerCode: 'ABCDEF',
    createdAt: new Date('2026-08-16T10:00:00Z'),
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
    updateSoldSpecialistContact: jest.fn(),
    createSoldSpecialist: jest.fn(),
    linkSoldBy: jest.fn(),
    getSellerPaymentDetails: jest.fn(),
    updateSellerPaymentDetails: jest.fn(),
    getSpecialistSellerAssignment: jest.fn(),
    deactivateOwnAccount: jest.fn(),
  };
}

function makeUseCase(repo: jest.Mocked<ISellerRepository>): CreateSellerUseCase {
  const uc = new CreateSellerUseCase(repo);
  return uc;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateSellerUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let useCase: CreateSellerUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    useCase = makeUseCase(repoMock);
  });

  it('creates a seller with a generated code on the first try', async () => {
    repoMock.codeExists.mockResolvedValue(false);
    repoMock.createSeller.mockResolvedValue(makeSeller());

    const result = await useCase.execute({ fullName: 'María González', email: 'maria@delta.app' });

    expect(repoMock.codeExists).toHaveBeenCalledTimes(1);
    expect(repoMock.createSeller).toHaveBeenCalledTimes(1);
    const callArgs = repoMock.createSeller.mock.calls[0]![0];
    expect(callArgs.fullName).toBe('María González');
    expect(callArgs.email).toBe('maria@delta.app');
    // Code must be 6 uppercase alphanumeric chars with no ambiguous chars
    expect(callArgs.sellerCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(result.sellerCode).toBe('ABCDEF');
  });

  it('retries code generation on collision', async () => {
    // First two codes collide, third is free
    repoMock.codeExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    repoMock.createSeller.mockResolvedValue(makeSeller());

    await useCase.execute({ fullName: 'Pedro Rojas', email: 'pedro@delta.app' });

    expect(repoMock.codeExists).toHaveBeenCalledTimes(3);
    expect(repoMock.createSeller).toHaveBeenCalledTimes(1);
  });

  it('normalises email to lowercase', async () => {
    repoMock.codeExists.mockResolvedValue(false);
    repoMock.createSeller.mockResolvedValue(makeSeller());

    await useCase.execute({ fullName: 'Ana Ruiz', email: 'ANA.RUIZ@DELTA.APP' });

    expect(repoMock.createSeller.mock.calls[0]![0].email).toBe('ana.ruiz@delta.app');
  });

  it('generated code contains only safe characters (no 0, O, 1, l, I)', async () => {
    // Run many iterations and verify no ambiguous chars appear
    const FORBIDDEN = /[01OlI]/;
    repoMock.codeExists.mockResolvedValue(false);
    repoMock.createSeller.mockResolvedValue(makeSeller());

    for (let i = 0; i < 50; i++) {
      await useCase.execute({ fullName: 'Test', email: `test${i}@delta.app` });
    }

    const codes = repoMock.createSeller.mock.calls.map((c) => c[0]!.sellerCode);
    for (const code of codes) {
      expect(FORBIDDEN.test(code)).toBe(false);
    }
  });

  it('throws when all retry attempts are exhausted', async () => {
    // All codes collide
    repoMock.codeExists.mockResolvedValue(true);

    await expect(useCase.execute({ fullName: 'Fail', email: 'fail@delta.app' })).rejects.toThrow(
      'could not generate a unique seller_code',
    );
  });
});
