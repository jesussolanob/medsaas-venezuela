import { CreateSellerUseCase } from './create-seller.use-case';
import type { ISellerRepository, SellerProfile } from '../../domain/repositories/seller.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';
import type { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeller(overrides: Partial<SellerProfile> = {}): SellerProfile {
  return {
    id: 'seller-uuid-001',
    fullName: 'María González',
    email: 'maria@delta.app',
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
    findByCedula: jest.fn(),
  };
}

function makeMailerMock(): jest.Mocked<Pick<MailerService, 'sendTemplate'>> {
  return { sendTemplate: jest.fn().mockResolvedValue({ id: 'msg-001' }) };
}

function makeConfigMock(
  frontendUrl = 'https://app.deltasalud.app',
): jest.Mocked<Pick<ConfigService, 'get'>> {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'APP_BASE_URL') return frontendUrl;
      return undefined;
    }),
  };
}

function makeUseCase(
  repo: jest.Mocked<ISellerRepository>,
  mailer?: jest.Mocked<Pick<MailerService, 'sendTemplate'>>,
  config?: jest.Mocked<Pick<ConfigService, 'get'>>,
): CreateSellerUseCase {
  return new CreateSellerUseCase(
    repo,
    (mailer ?? makeMailerMock()) as unknown as MailerService,
    (config ?? makeConfigMock()) as unknown as ConfigService,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateSellerUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let mailerMock: jest.Mocked<Pick<MailerService, 'sendTemplate'>>;
  let useCase: CreateSellerUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    mailerMock = makeMailerMock();
    useCase = makeUseCase(repoMock, mailerMock);
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
    expect(result.seller.sellerCode).toBe('ABCDEF');
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
    repoMock.createSeller.mockResolvedValue(makeSeller({ email: 'ana.ruiz@delta.app' }));

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

  // ---------------------------------------------------------------------------
  // Welcome email tests
  // ---------------------------------------------------------------------------

  it('sends the welcome email after creating the seller', async () => {
    repoMock.codeExists.mockResolvedValue(false);
    repoMock.createSeller.mockResolvedValue(makeSeller());

    const result = await useCase.execute({ fullName: 'María González', email: 'maria@delta.app' });

    expect(mailerMock.sendTemplate).toHaveBeenCalledTimes(1);
    const [templateName, , data, recipient] = mailerMock.sendTemplate.mock.calls[0]!;
    expect(templateName).toBe('seller_welcome');
    expect(data).toMatchObject({
      sellerName: 'María González',
      sellerEmail: 'maria@delta.app',
      sellerCode: 'ABCDEF',
    });
    expect((data as Record<string, string>).referralUrl).toContain('/r/ABCDEF');
    expect((data as Record<string, string>).loginUrl).toContain('/login');
    expect(recipient).toEqual({ type: 'seller', id: 'seller-uuid-001' });
    expect(result.welcomeEmailSent).toBe(true);
  });

  it('returns welcomeEmailSent: false when mailer throws, but still returns the seller', async () => {
    repoMock.codeExists.mockResolvedValue(false);
    repoMock.createSeller.mockResolvedValue(makeSeller());
    mailerMock.sendTemplate.mockRejectedValue(new Error('SMTP timeout'));

    const result = await useCase.execute({ fullName: 'María González', email: 'maria@delta.app' });

    expect(result.seller.sellerCode).toBe('ABCDEF');
    expect(result.welcomeEmailSent).toBe(false);
  });

  it('does not roll back seller creation when email fails', async () => {
    repoMock.codeExists.mockResolvedValue(false);
    repoMock.createSeller.mockResolvedValue(makeSeller());
    mailerMock.sendTemplate.mockRejectedValue(new Error('provider down'));

    // Should resolve (not reject) even though email failed
    await expect(
      useCase.execute({ fullName: 'Ana Ruiz', email: 'ana@delta.app' }),
    ).resolves.toMatchObject({ welcomeEmailSent: false });

    expect(repoMock.createSeller).toHaveBeenCalledTimes(1);
  });
});
