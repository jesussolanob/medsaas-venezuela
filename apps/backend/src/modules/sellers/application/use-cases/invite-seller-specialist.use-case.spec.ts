import {
  InviteSellerSpecialistUseCase,
  type InviteSellerSpecialistInput,
} from './invite-seller-specialist.use-case';
import type {
  ISellerRepository,
  SellerSpecialistRow,
} from '../../domain/repositories/seller.repository';
import { SpecialistCedulaConflictError } from '../../domain/errors/specialist-cedula-conflict.error';
import type { MailerService } from '../../../email/application/services/mailer.service';
import type { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SELLER_ID = 'seller-uuid-001';
const SPECIALIST_ID = 'spec-uuid-001';

function makeSpecialist(overrides: Partial<SellerSpecialistRow> = {}): SellerSpecialistRow {
  return {
    id: SPECIALIST_ID,
    fullName: 'Ana Martínez',
    email: 'ana.martinez@example.com',
    phone: '584141234567',
    cedula: 'V-12345678',
    sellerNotes: null,
    isActive: true,
    specialty: 'Medicina Interna',
    plan: 'free_trial',
    subscriptionStatus: 'trialing',
    createdAt: new Date('2026-11-14T10:00:00Z'),
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
    updateSoldSpecialistContact: jest.fn(),
    createSoldSpecialist: jest.fn(),
    findByCedula: jest.fn(),
    linkSoldBy: jest.fn(),
    getSellerPaymentDetails: jest.fn(),
    updateSellerPaymentDetails: jest.fn(),
    getSpecialistSellerAssignment: jest.fn(),
    deactivateOwnAccount: jest.fn(),
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
): InviteSellerSpecialistUseCase {
  return new InviteSellerSpecialistUseCase(
    repo,
    (mailer ?? makeMailerMock()) as unknown as MailerService,
    (config ?? makeConfigMock()) as unknown as ConfigService,
  );
}

function makeInput(
  overrides: Partial<Omit<InviteSellerSpecialistInput, 'email'> & { email?: string }> = {},
): InviteSellerSpecialistInput {
  return {
    sellerId: SELLER_ID,
    firstName: 'Ana',
    lastName: 'Martínez',
    cedula: 'V-12345678',
    phone: '584141234567',
    email: 'ana.martinez@example.com',
    specialty: 'Medicina Interna',
    ...overrides,
  } as InviteSellerSpecialistInput;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InviteSellerSpecialistUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let mailerMock: jest.Mocked<Pick<MailerService, 'sendTemplate'>>;
  let useCase: InviteSellerSpecialistUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    mailerMock = makeMailerMock();
    useCase = makeUseCase(repoMock, mailerMock);
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it('creates a specialist with sold_by from session (never body)', async () => {
    repoMock.findByCedula.mockResolvedValue(null);
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute(makeInput());

    const callArgs = repoMock.createSoldSpecialist.mock.calls[0]![0];
    expect(callArgs.soldBy).toBe(SELLER_ID);
  });

  it('always sets plan to free_trial — sellers cannot assign paid plans', async () => {
    repoMock.findByCedula.mockResolvedValue(null);
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute(makeInput());

    const callArgs = repoMock.createSoldSpecialist.mock.calls[0]![0];
    expect(callArgs.plan).toBe('free_trial');
  });

  it('sets onboardingLastStep to "profile" so wizard starts at office step', async () => {
    repoMock.findByCedula.mockResolvedValue(null);
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute(makeInput());

    const callArgs = repoMock.createSoldSpecialist.mock.calls[0]![0];
    expect(callArgs.onboardingLastStep).toBe('profile');
  });

  it('builds full_name from firstName + lastName', async () => {
    repoMock.findByCedula.mockResolvedValue(null);
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute(makeInput({ firstName: 'Ana', lastName: 'Martínez' }));

    const callArgs = repoMock.createSoldSpecialist.mock.calls[0]![0];
    expect(callArgs.fullName).toBe('Ana Martínez');
  });

  it('normalises email to lowercase', async () => {
    repoMock.findByCedula.mockResolvedValue(null);
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute(makeInput({ email: 'ANA.MARTINEZ@EXAMPLE.COM' }));

    const callArgs = repoMock.createSoldSpecialist.mock.calls[0]![0];
    expect(callArgs.email).toBe('ana.martinez@example.com');
  });

  it('passes cedula and phone through to the repository', async () => {
    repoMock.findByCedula.mockResolvedValue(null);
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute(makeInput({ cedula: 'E-98765432', phone: '+58 424 555 1234' }));

    const callArgs = repoMock.createSoldSpecialist.mock.calls[0]![0];
    expect(callArgs.cedula).toBe('E-98765432');
    expect(callArgs.phone).toBe('+58 424 555 1234');
  });

  it('sends the invitation email when email is provided', async () => {
    repoMock.findByCedula.mockResolvedValue(null);
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    const result = await useCase.execute(makeInput({ email: 'ana@example.com' }));

    expect(mailerMock.sendTemplate).toHaveBeenCalledTimes(1);
    const [templateName, to] = mailerMock.sendTemplate.mock.calls[0]!;
    expect(templateName).toBe('specialist_invitation');
    expect(to).toBe('ana@example.com');
    expect(result.invitationEmailSent).toBe(true);
  });

  it('invitation email failure does NOT fail specialist creation', async () => {
    repoMock.findByCedula.mockResolvedValue(null);
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());
    mailerMock.sendTemplate.mockRejectedValue(new Error('SMTP timeout'));

    const result = await useCase.execute(makeInput({ email: 'ana@example.com' }));

    // specialist is still created
    expect(result.specialist.id).toBe(SPECIALIST_ID);
    // email failure is surfaced as false (not thrown)
    expect(result.invitationEmailSent).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Duplicate cédula
  // ---------------------------------------------------------------------------

  it('throws SpecialistCedulaConflictError when cedula already exists', async () => {
    repoMock.findByCedula.mockResolvedValue({ id: 'other-uuid' });

    await expect(useCase.execute(makeInput())).rejects.toThrow(SpecialistCedulaConflictError);
  });

  it('does NOT call createSoldSpecialist when cedula conflict is detected', async () => {
    repoMock.findByCedula.mockResolvedValue({ id: 'other-uuid' });

    await expect(useCase.execute(makeInput())).rejects.toThrow(SpecialistCedulaConflictError);

    expect(repoMock.createSoldSpecialist).not.toHaveBeenCalled();
  });

  it('SpecialistCedulaConflictError has the correct HTTP status 409', async () => {
    repoMock.findByCedula.mockResolvedValue({ id: 'other-uuid' });

    try {
      await useCase.execute(makeInput());
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SpecialistCedulaConflictError);
      expect((err as SpecialistCedulaConflictError).httpStatus).toBe(409);
    }
  });

  // ---------------------------------------------------------------------------
  // Duplicate email (delegated to repository)
  // ---------------------------------------------------------------------------

  it('propagates SpecialistEmailConflictError from the repository', async () => {
    repoMock.findByCedula.mockResolvedValue(null);
    const emailError = new Error('email conflict');
    repoMock.createSoldSpecialist.mockRejectedValue(emailError);

    await expect(useCase.execute(makeInput())).rejects.toBe(emailError);
  });

  // ---------------------------------------------------------------------------
  // Attribution (sold_by written correctly)
  // ---------------------------------------------------------------------------

  it('writes the correct seller attribution on the specialist profile', async () => {
    const specificSellerId = 'my-seller-uuid';
    repoMock.findByCedula.mockResolvedValue(null);
    repoMock.createSoldSpecialist.mockResolvedValue(makeSpecialist());

    await useCase.execute(makeInput({ sellerId: specificSellerId }));

    expect(repoMock.createSoldSpecialist.mock.calls[0]![0].soldBy).toBe(specificSellerId);
  });
});
