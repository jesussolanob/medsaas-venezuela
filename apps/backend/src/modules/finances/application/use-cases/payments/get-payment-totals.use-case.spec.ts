import { GetPaymentTotalsUseCase } from './get-payment-totals.use-case';
import type {
  IPaymentRepository,
  PaymentTotals,
} from '../../../domain/repositories/payment.repository';

const makeTotals = (overrides: Partial<PaymentTotals> = {}): PaymentTotals => ({
  approvedUsd: 100,
  pendingUsd: 50,
  approvedCount: 3,
  pendingCount: 2,
  ...overrides,
});

describe('GetPaymentTotalsUseCase', () => {
  let useCase: GetPaymentTotalsUseCase;
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
    useCase = new GetPaymentTotalsUseCase(mockRepo);
  });

  it('returns totals from the repository', async () => {
    mockRepo.totalsForDoctor.mockResolvedValue(makeTotals());

    const result = await useCase.execute({ doctorId: 'doc-001' });

    expect(result.approvedUsd).toBe(100);
    expect(result.pendingUsd).toBe(50);
    expect(result.approvedCount).toBe(3);
    expect(result.pendingCount).toBe(2);
  });

  it('passes date range filters to the repository', async () => {
    mockRepo.totalsForDoctor.mockResolvedValue(makeTotals());

    await useCase.execute({
      doctorId: 'doc-001',
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });

    expect(mockRepo.totalsForDoctor).toHaveBeenCalledWith({
      doctorId: 'doc-001',
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });
  });

  it('returns zeros when no payments exist', async () => {
    mockRepo.totalsForDoctor.mockResolvedValue(
      makeTotals({ approvedUsd: 0, pendingUsd: 0, approvedCount: 0, pendingCount: 0 }),
    );

    const result = await useCase.execute({ doctorId: 'doc-999' });

    expect(result.approvedUsd).toBe(0);
    expect(result.pendingUsd).toBe(0);
  });
});
