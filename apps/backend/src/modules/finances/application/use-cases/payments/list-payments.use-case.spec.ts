import { ListPaymentsUseCase } from './list-payments.use-case';
import type {
  IPaymentRepository,
  PaymentWithRelations,
} from '../../../domain/repositories/payment.repository';

const makeRelationsRow = (overrides: Partial<PaymentWithRelations> = {}): PaymentWithRelations => ({
  id: 'pay-001',
  paymentCode: 'BK-001',
  amountUsd: 30,
  amountBs: null,
  status: 'pending',
  paidAt: null,
  methodSnapshot: 'pago_movil',
  createdAt: new Date('2026-06-01'),
  appointment: {
    id: 'appt-001',
    appointmentCode: 'BK-20260601-001',
    scheduledAt: new Date('2026-06-01T10:00:00Z'),
    patientName: 'María López',
    patientPhone: '+58412345678',
    planName: 'Consulta General',
    paymentReceiptUrl: null,
    consultationId: null,
  },
  consultation: null,
  ...overrides,
});

describe('ListPaymentsUseCase', () => {
  let useCase: ListPaymentsUseCase;
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
      attachReceiptUrl: jest.fn(),
    };
    useCase = new ListPaymentsUseCase(mockRepo);
  });

  it('returns payments from the repository', async () => {
    const rows = [makeRelationsRow(), makeRelationsRow({ id: 'pay-002', status: 'approved' })];
    mockRepo.listForDoctor.mockResolvedValue(rows);

    const result = await useCase.execute({ doctorId: 'doc-001' });

    expect(result).toHaveLength(2);
    expect(mockRepo.listForDoctor).toHaveBeenCalledWith({
      doctorId: 'doc-001',
      status: undefined,
      fromDate: undefined,
      toDate: undefined,
    });
  });

  it('passes status filter to the repository', async () => {
    mockRepo.listForDoctor.mockResolvedValue([makeRelationsRow({ status: 'approved' })]);

    await useCase.execute({ doctorId: 'doc-001', status: 'approved' });

    expect(mockRepo.listForDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('passes date range filters to the repository', async () => {
    mockRepo.listForDoctor.mockResolvedValue([]);

    await useCase.execute({
      doctorId: 'doc-001',
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });

    expect(mockRepo.listForDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: '2026-06-01', toDate: '2026-06-30' }),
    );
  });

  it('returns an empty array when no payments exist', async () => {
    mockRepo.listForDoctor.mockResolvedValue([]);
    const result = await useCase.execute({ doctorId: 'doc-999' });
    expect(result).toEqual([]);
  });
});
