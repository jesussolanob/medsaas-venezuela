import { ResendSellerWelcomeEmailUseCase } from './resend-seller-welcome-email.use-case';
import type { ISellerRepository, SellerProfile } from '../../domain/repositories/seller.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';
import type { ConfigService } from '@nestjs/config';
import { SellerNotFoundError } from '../../domain/errors/seller-not-found.error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SELLER_ID = 'seller-uuid-001';

function makeSeller(overrides: Partial<SellerProfile> = {}): SellerProfile {
  return {
    id: SELLER_ID,
    fullName: 'María González',
    email: 'maria@delta.app',
    sellerCode: 'ABCDEF',
    createdAt: new Date('2026-08-16T10:00:00Z'),
    ...overrides,
  };
}

function makeRepoMock(): jest.Mocked<Pick<ISellerRepository, 'findById'>> {
  return { findById: jest.fn() };
}

function makeMailerMock(): jest.Mocked<Pick<MailerService, 'sendTemplate'>> {
  return { sendTemplate: jest.fn().mockResolvedValue({ id: 'msg-002' }) };
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
  repo: jest.Mocked<Pick<ISellerRepository, 'findById'>>,
  mailer?: jest.Mocked<Pick<MailerService, 'sendTemplate'>>,
  config?: jest.Mocked<Pick<ConfigService, 'get'>>,
): ResendSellerWelcomeEmailUseCase {
  return new ResendSellerWelcomeEmailUseCase(
    repo as unknown as ISellerRepository,
    (mailer ?? makeMailerMock()) as unknown as MailerService,
    (config ?? makeConfigMock()) as unknown as ConfigService,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResendSellerWelcomeEmailUseCase', () => {
  let repoMock: jest.Mocked<Pick<ISellerRepository, 'findById'>>;
  let mailerMock: jest.Mocked<Pick<MailerService, 'sendTemplate'>>;
  let useCase: ResendSellerWelcomeEmailUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    mailerMock = makeMailerMock();
    useCase = makeUseCase(repoMock, mailerMock);
  });

  it('sends the welcome email and returns sent: true', async () => {
    repoMock.findById.mockResolvedValue(makeSeller());

    const result = await useCase.execute(SELLER_ID);

    expect(result).toEqual({ sent: true });
    expect(mailerMock.sendTemplate).toHaveBeenCalledTimes(1);
    const [templateName, toEmail, data, recipient] = mailerMock.sendTemplate.mock.calls[0]!;
    expect(templateName).toBe('seller_welcome');
    expect(toEmail).toBe('maria@delta.app');
    expect((data as Record<string, string>).sellerName).toBe('María González');
    expect((data as Record<string, string>).sellerCode).toBe('ABCDEF');
    expect((data as Record<string, string>).referralUrl).toContain('/r/ABCDEF');
    expect((data as Record<string, string>).loginUrl).toContain('/login');
    expect(recipient).toEqual({ type: 'seller', id: SELLER_ID });
  });

  it('throws SellerNotFoundError when no seller profile exists for the id', async () => {
    repoMock.findById.mockResolvedValue(null);

    await expect(useCase.execute(SELLER_ID)).rejects.toBeInstanceOf(SellerNotFoundError);
    expect(mailerMock.sendTemplate).not.toHaveBeenCalled();
  });

  it('returns sent: false when mailer throws (never propagates the error)', async () => {
    repoMock.findById.mockResolvedValue(makeSeller());
    mailerMock.sendTemplate.mockRejectedValue(new Error('provider error'));

    const result = await useCase.execute(SELLER_ID);

    expect(result).toEqual({ sent: false });
  });

  it('looks up the seller by the id argument — anti-IDOR', async () => {
    repoMock.findById.mockResolvedValue(makeSeller({ id: 'other-seller' }));

    await useCase.execute('other-seller');

    expect(repoMock.findById).toHaveBeenCalledWith('other-seller');
  });

  it('builds the referral URL from the seller code', async () => {
    const config = makeConfigMock('https://staging.deltasalud.app');
    const uc = makeUseCase(repoMock, mailerMock, config);
    repoMock.findById.mockResolvedValue(makeSeller({ sellerCode: 'XYZ123' }));

    await uc.execute(SELLER_ID);

    const data = mailerMock.sendTemplate.mock.calls[0]![2] as Record<string, string>;
    expect(data.referralUrl).toBe('https://staging.deltasalud.app/r/XYZ123');
    expect(data.loginUrl).toBe('https://staging.deltasalud.app/login');
  });
});
