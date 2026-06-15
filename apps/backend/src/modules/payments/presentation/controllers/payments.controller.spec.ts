import { Test, type TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { ListConsultationPaymentsUseCase } from '../../application/use-cases/payments/list-consultation-payments.use-case';
import { RegisterConsultationPaymentUseCase } from '../../application/use-cases/payments/register-consultation-payment.use-case';
import { ApproveConsultationPaymentUseCase } from '../../application/use-cases/payments/approve-consultation-payment.use-case';
import { RejectConsultationPaymentUseCase } from '../../application/use-cases/payments/reject-consultation-payment.use-case';
import { ConsultationPayment } from '../../domain/entities/consultation-payment.entity';
import { ConsultationPaymentNotFoundError } from '../../domain/errors/consultation-payment-not-found.error';
import { PaymentAlreadyResolvedError } from '../../domain/errors/payment-already-resolved.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const PAYMENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-03T10:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makePayment(
  overrides: Partial<ConstructorParameters<typeof ConsultationPayment>[0]> = {},
): ConsultationPayment {
  return ConsultationPayment.create({
    id: PAYMENT_ID,
    consultationId: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    amount: 100,
    currency: 'USD',
    paymentMethod: 'zelle',
    referenceNumber: null,
    receiptUrl: null,
    notes: null,
    status: 'pending',
    approvedAt: null,
    approvedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('PaymentsController', () => {
  let controller: PaymentsController;

  const mockList = { execute: jest.fn() };
  const mockRegister = { execute: jest.fn() };
  const mockApprove = { execute: jest.fn() };
  const mockReject = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: ListConsultationPaymentsUseCase, useValue: mockList },
        { provide: RegisterConsultationPaymentUseCase, useValue: mockRegister },
        { provide: ApproveConsultationPaymentUseCase, useValue: mockApprove },
        { provide: RejectConsultationPaymentUseCase, useValue: mockReject },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  describe('list', () => {
    it('returns paginated payments', async () => {
      const payment = makePayment();
      mockList.execute.mockResolvedValue({ items: [payment], total: 1 });

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('always passes doctorId from authenticated user', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0 });

      await controller.list(mockUser);

      expect(mockList.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });

    it('passes consultationId filter when provided', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0 });

      await controller.list(mockUser, CONSULTATION_ID);

      expect(mockList.execute).toHaveBeenCalledWith(
        expect.objectContaining({ consultationId: CONSULTATION_ID }),
      );
    });

    it('throws BadRequestException for invalid status filter', async () => {
      await expect(controller.list(mockUser, undefined, 'invalid_status')).rejects.toThrow(
        'status',
      );
    });

    it('accepts valid status filters', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0 });

      await expect(controller.list(mockUser, undefined, 'approved')).resolves.not.toThrow();
      await expect(controller.list(mockUser, undefined, 'rejected')).resolves.not.toThrow();
      await expect(controller.list(mockUser, undefined, 'pending')).resolves.not.toThrow();
    });

    it('response data does not contain patient PII fields', async () => {
      const payment = makePayment();
      mockList.execute.mockResolvedValue({ items: [payment], total: 1 });

      const result = await controller.list(mockUser);
      const item = result.data[0] as Record<string, unknown>;

      expect(item).not.toHaveProperty('full_name');
      expect(item).not.toHaveProperty('phone');
      expect(item).not.toHaveProperty('email');
      expect(item).not.toHaveProperty('cedula');
      expect(item).toHaveProperty('patient_id');
    });
  });

  describe('register', () => {
    const validDto = {
      consultation_id: CONSULTATION_ID,
      patient_id: PATIENT_ID,
      amount: 100,
      currency: 'USD',
      payment_method: 'zelle',
    };

    it('registers a payment and returns it', async () => {
      const payment = makePayment();
      mockRegister.execute.mockResolvedValue(payment);

      const result = await controller.register(validDto, mockUser);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe('pending');
    });

    it('always uses doctorId from authenticated user — not from body', async () => {
      const payment = makePayment();
      mockRegister.execute.mockResolvedValue(payment);

      await controller.register(validDto, mockUser);

      expect(mockRegister.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });

    it('propagates ConsultationPaymentNotFoundError', async () => {
      mockRegister.execute.mockRejectedValue(new ConsultationPaymentNotFoundError());

      await expect(controller.register(validDto, mockUser)).rejects.toThrow(
        ConsultationPaymentNotFoundError,
      );
    });
  });

  describe('approve', () => {
    it('approves a payment and returns it', async () => {
      const payment = makePayment({ status: 'approved', approvedBy: DOCTOR_ID });
      mockApprove.execute.mockResolvedValue(payment);

      const result = await controller.approve(PAYMENT_ID, mockUser);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe('approved');
    });

    it('always uses doctorId from authenticated user', async () => {
      const payment = makePayment({ status: 'approved' });
      mockApprove.execute.mockResolvedValue(payment);

      await controller.approve(PAYMENT_ID, mockUser);

      expect(mockApprove.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, paymentId: PAYMENT_ID }),
      );
    });

    it('propagates PaymentAlreadyResolvedError', async () => {
      mockApprove.execute.mockRejectedValue(new PaymentAlreadyResolvedError('approved'));

      await expect(controller.approve(PAYMENT_ID, mockUser)).rejects.toThrow(
        PaymentAlreadyResolvedError,
      );
    });

    it('propagates ConsultationPaymentNotFoundError', async () => {
      mockApprove.execute.mockRejectedValue(new ConsultationPaymentNotFoundError());

      await expect(controller.approve(PAYMENT_ID, mockUser)).rejects.toThrow(
        ConsultationPaymentNotFoundError,
      );
    });
  });

  describe('reject', () => {
    it('rejects a payment and returns it', async () => {
      const payment = makePayment({ status: 'rejected' });
      mockReject.execute.mockResolvedValue(payment);

      const result = await controller.reject(PAYMENT_ID, {}, mockUser);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe('rejected');
    });

    it('always uses doctorId from authenticated user', async () => {
      const payment = makePayment({ status: 'rejected' });
      mockReject.execute.mockResolvedValue(payment);

      await controller.reject(PAYMENT_ID, {}, mockUser);

      expect(mockReject.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, paymentId: PAYMENT_ID }),
      );
    });

    it('passes notes from body to use case', async () => {
      const payment = makePayment({ status: 'rejected' });
      mockReject.execute.mockResolvedValue(payment);

      await controller.reject(PAYMENT_ID, { notes: 'Rechazado por error' }, mockUser);

      expect(mockReject.execute).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'Rechazado por error' }),
      );
    });

    it('propagates PaymentAlreadyResolvedError', async () => {
      mockReject.execute.mockRejectedValue(new PaymentAlreadyResolvedError('rejected'));

      await expect(controller.reject(PAYMENT_ID, {}, mockUser)).rejects.toThrow(
        PaymentAlreadyResolvedError,
      );
    });
  });
});
