import { AddPaymentItemUseCase } from './add-payment-item.use-case';
import type { IPaymentRepository } from '../../../domain/repositories/payment.repository';
import { Payment } from '../../../domain/entities/payment.entity';
import { PaymentItem } from '../../../domain/entities/payment-item.entity';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';

const makePayment = (overrides: Partial<Parameters<typeof Payment.create>[0]> = {}) =>
  Payment.create({
    id: 'pay-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    amountUsd: 30,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

const makeItem = (overrides: Partial<Parameters<typeof PaymentItem.create>[0]> = {}) =>
  PaymentItem.create({
    id: 'item-001',
    paymentId: 'pay-001',
    doctorId: 'doc-001',
    name: 'Servicio adicional',
    amountUsd: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

describe('AddPaymentItemUseCase', () => {
  let useCase: AddPaymentItemUseCase;
  let mockRepo: jest.Mocked<IPaymentRepository>;

  beforeEach(() => {
    mockRepo = {
      listForDoctor: jest.fn(),
      totalsForDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      updateStatus: jest.fn(),
      addItem: jest.fn(),
      removeItem: jest.fn(),
      listItems: jest.fn(),
      create: jest.fn(),
    };
    useCase = new AddPaymentItemUseCase(mockRepo);
  });

  it('adds an item to an existing payment', async () => {
    const payment = makePayment();
    const item = makeItem();
    mockRepo.findByIdForDoctor.mockResolvedValue(payment);
    mockRepo.addItem.mockResolvedValue(item);

    const result = await useCase.execute({
      paymentId: 'pay-001',
      doctorId: 'doc-001',
      name: 'Servicio adicional',
      amountUsd: 20,
    });

    expect(result.name).toBe('Servicio adicional');
    expect(result.amountUsd).toBe(20);
    expect(mockRepo.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay-001',
        doctorId: 'doc-001',
        name: 'Servicio adicional',
        amountUsd: 20,
      }),
    );
  });

  it('throws PaymentNotFoundError when payment does not exist', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute({ paymentId: 'pay-999', doctorId: 'doc-001', name: 'X', amountUsd: 10 }),
    ).rejects.toThrow(PaymentNotFoundError);

    expect(mockRepo.addItem).not.toHaveBeenCalled();
  });

  it('passes optional source fields through', async () => {
    const payment = makePayment();
    const item = makeItem({ sourceType: 'plan', sourceId: 'plan-uuid' });
    mockRepo.findByIdForDoctor.mockResolvedValue(payment);
    mockRepo.addItem.mockResolvedValue(item);

    await useCase.execute({
      paymentId: 'pay-001',
      doctorId: 'doc-001',
      name: 'Servicio adicional',
      amountUsd: 20,
      sourceType: 'plan',
      sourceId: 'plan-uuid',
    });

    expect(mockRepo.addItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'plan', sourceId: 'plan-uuid' }),
    );
  });
});
