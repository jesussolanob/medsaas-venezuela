import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionPaymentsController } from './subscription-payments.controller';
import { RegisterManualPaymentUseCase } from '../../application/use-cases/billing/register-manual-payment.use-case';
import { ListSubscriptionPaymentsUseCase } from '../../application/use-cases/billing/list-subscription-payments.use-case';
import { ApproveSubscriptionPaymentUseCase } from '../../application/use-cases/billing/approve-subscription-payment.use-case';
import { RejectSubscriptionPaymentUseCase } from '../../application/use-cases/billing/reject-subscription-payment.use-case';
import { GetFinanceStatsUseCase } from '../../application/use-cases/billing/get-finance-stats.use-case';
import { GetPaymentReceiptUrlUseCase } from '../../application/use-cases/billing/get-payment-receipt-url.use-case';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { RegisterManualPaymentBodySchema } from '../../application/dtos/billing.dtos';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_USER: CurrentUserPayload = {
  sub: 'admin-uuid-1',
  role: 'super_admin',
  email: 'admin@delta.com',
};

const NOW = new Date('2026-06-23T10:00:00Z');

function makeSavedProps() {
  return {
    id: 'pay-uuid-99',
    doctorId: 'doc-uuid-1',
    amountUsd: 80,
    method: 'Zelle',
    referenceNumber: 'REF-999',
    durationMonths: 3,
    status: 'approved' as const,
    reviewedBy: ADMIN_USER.sub,
    reviewedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// Boundary validation helper (exercises ZodValidationPipe directly without
// the full NestJS HTTP pipeline — mirrors how other controller specs work).
// ---------------------------------------------------------------------------

function validateBody(raw: unknown) {
  const pipe = new ZodValidationPipe(RegisterManualPaymentBodySchema);
  return () => pipe.transform(raw);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionPaymentsController — registerManual', () => {
  let controller: SubscriptionPaymentsController;
  let registerManualMock: { execute: jest.Mock };
  let listMock: { execute: jest.Mock };
  let approveMock: { execute: jest.Mock };
  let rejectMock: { execute: jest.Mock };
  let financeStatsMock: { execute: jest.Mock };
  let getReceiptUrlMock: { execute: jest.Mock };

  beforeEach(async () => {
    registerManualMock = { execute: jest.fn() };
    listMock = { execute: jest.fn() };
    approveMock = { execute: jest.fn() };
    rejectMock = { execute: jest.fn() };
    financeStatsMock = { execute: jest.fn() };
    getReceiptUrlMock = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionPaymentsController],
      providers: [
        { provide: RegisterManualPaymentUseCase, useValue: registerManualMock },
        { provide: ListSubscriptionPaymentsUseCase, useValue: listMock },
        { provide: ApproveSubscriptionPaymentUseCase, useValue: approveMock },
        { provide: RejectSubscriptionPaymentUseCase, useValue: rejectMock },
        { provide: GetFinanceStatsUseCase, useValue: financeStatsMock },
        { provide: GetPaymentReceiptUrlUseCase, useValue: getReceiptUrlMock },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubscriptionPaymentsController>(SubscriptionPaymentsController);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('returns { success: true, data: payment } on valid input', async () => {
    registerManualMock.execute.mockResolvedValue(makeSavedProps());

    const body = {
      doctor_id: 'doc-uuid-1',
      amount_usd: 80,
      method: 'Zelle',
      duration_months: 3,
      reference_number: 'REF-999',
    };

    const response = await controller.registerManual(body, ADMIN_USER);

    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({
      id: 'pay-uuid-99',
      doctorId: 'doc-uuid-1',
      amountUsd: 80,
      status: 'approved',
    });
  });

  it('calls use case with mapped camelCase fields and reviewer from CurrentUser', async () => {
    registerManualMock.execute.mockResolvedValue(makeSavedProps());

    await controller.registerManual(
      {
        doctor_id: 'doc-uuid-1',
        amount_usd: 150,
        method: 'Transferencia',
        duration_months: 12,
        reference_number: 'WIRE-123',
      },
      ADMIN_USER,
    );

    expect(registerManualMock.execute).toHaveBeenCalledWith({
      doctorId: 'doc-uuid-1',
      amountUsd: 150,
      method: 'Transferencia',
      durationMonths: 12,
      referenceNumber: 'WIRE-123',
      reviewerId: ADMIN_USER.sub,
    });
  });

  it('handles optional reference_number (passes undefined through)', async () => {
    registerManualMock.execute.mockResolvedValue({ ...makeSavedProps(), referenceNumber: null });

    await controller.registerManual(
      {
        doctor_id: 'doc-uuid-1',
        amount_usd: 50,
        method: 'Efectivo',
        duration_months: 1,
      },
      ADMIN_USER,
    );

    expect(registerManualMock.execute).toHaveBeenCalledWith(
      expect.objectContaining({ referenceNumber: undefined }),
    );
  });

  // -------------------------------------------------------------------------
  // Boundary validation — ZodValidationPipe exercised directly
  // -------------------------------------------------------------------------

  it('rejects missing doctor_id', () => {
    expect(validateBody({ amount_usd: 50, method: 'Zelle', duration_months: 1 })).toThrow(
      BadRequestException,
    );
  });

  it('rejects non-uuid doctor_id', () => {
    expect(
      validateBody({
        doctor_id: 'not-a-uuid',
        amount_usd: 50,
        method: 'Zelle',
        duration_months: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects amount_usd <= 0', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: 0,
        method: 'Zelle',
        duration_months: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects negative amount_usd', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: -10,
        method: 'Zelle',
        duration_months: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects empty method string', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: 50,
        method: '',
        duration_months: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects duration_months = 0', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: 50,
        method: 'Zelle',
        duration_months: 0,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects duration_months = 37 (above max)', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: 50,
        method: 'Zelle',
        duration_months: 37,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects fractional duration_months', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: 50,
        method: 'Zelle',
        duration_months: 1.5,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing method', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: 50,
        duration_months: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts duration_months = 1 (boundary min)', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: 50,
        method: 'Zelle',
        duration_months: 1,
      }),
    ).not.toThrow();
  });

  it('accepts duration_months = 36 (boundary max)', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: 50,
        method: 'Zelle',
        duration_months: 36,
      }),
    ).not.toThrow();
  });

  it('accepts valid body without reference_number', () => {
    expect(
      validateBody({
        doctor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        amount_usd: 50,
        method: 'Zelle',
        duration_months: 6,
      }),
    ).not.toThrow();
  });
});
