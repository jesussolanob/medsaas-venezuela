import { ListIncomeUseCase } from './list-income.use-case';
import type {
  IFinanceRepository,
  UnifiedIncomeItem,
} from '../../../domain/repositories/finance.repository';

const makeItem = (overrides: Partial<UnifiedIncomeItem> = {}): UnifiedIncomeItem => ({
  id: 'item-1',
  date: new Date('2026-06-15T10:00:00Z'),
  amount_usd: 100,
  source: 'consultation',
  status: 'approved',
  concept: null,
  patient_id: 'patient-uuid-1',
  patient_name: 'Ana López',
  reference: 'PAY-001',
  ...overrides,
});

describe('ListIncomeUseCase', () => {
  let useCase: ListIncomeUseCase;
  let mockRepo: jest.Mocked<Pick<IFinanceRepository, 'listIncomePaginated'>>;

  beforeEach(() => {
    mockRepo = { listIncomePaginated: jest.fn() };
    useCase = new ListIncomeUseCase(mockRepo as unknown as IFinanceRepository);
  });

  it('delegates to repository with correct filters', async () => {
    mockRepo.listIncomePaginated.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    await useCase.execute({ doctorId: 'doc-1', page: 1, limit: 20 });

    expect(mockRepo.listIncomePaginated).toHaveBeenCalledWith({
      doctorId: 'doc-1',
      month: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('passes month filter to repository when provided', async () => {
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await useCase.execute({ doctorId: 'doc-1', month: '2026-06', page: 1, limit: 20 });

    expect(mockRepo.listIncomePaginated).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-06' }),
    );
  });

  it('returns mapped items and meta from repository', async () => {
    const items = [
      makeItem(),
      makeItem({
        id: 'item-2',
        source: 'manual',
        status: null,
        concept: 'Honorarios',
        reference: null,
      }),
    ];
    mockRepo.listIncomePaginated.mockResolvedValue({ items, total: 2, page: 1, limit: 20 });

    const result = await useCase.execute({ doctorId: 'doc-1', page: 1, limit: 20 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.items[0]?.source).toBe('consultation');
    expect(result.items[1]?.source).toBe('manual');
  });

  it('clamps limit to 100 when caller exceeds ceiling', async () => {
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 });

    await useCase.execute({ doctorId: 'doc-1', page: 1, limit: 999 });

    expect(mockRepo.listIncomePaginated).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('uses minimum page of 1 when caller passes 0 or negative', async () => {
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await useCase.execute({ doctorId: 'doc-1', page: -5, limit: 20 });

    expect(mockRepo.listIncomePaginated).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('defaults limit to 20 when limit param is 0 or falsy', async () => {
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await useCase.execute({ doctorId: 'doc-1', page: 1, limit: 0 });

    expect(mockRepo.listIncomePaginated).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('returns empty items when no income exists for the month', async () => {
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    const result = await useCase.execute({
      doctorId: 'doc-1',
      month: '2020-01',
      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('always uses provided doctorId (anti-IDOR guard)', async () => {
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await useCase.execute({ doctorId: 'specific-doctor-id', page: 1, limit: 20 });

    const callArg = mockRepo.listIncomePaginated.mock.calls[0]?.[0];
    expect(callArg?.doctorId).toBe('specific-doctor-id');
  });

  it('returns correct pagination metadata from repository', async () => {
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [], total: 150, page: 3, limit: 10 });

    const result = await useCase.execute({ doctorId: 'doc-1', page: 3, limit: 10 });

    expect(result.total).toBe(150);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });

  it('exposes source field as "consultation" for payment rows', async () => {
    const item = makeItem({ source: 'consultation', status: 'pending' });
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [item], total: 1, page: 1, limit: 20 });

    const result = await useCase.execute({ doctorId: 'doc-1', page: 1, limit: 20 });

    expect(result.items[0]?.source).toBe('consultation');
    expect(result.items[0]?.status).toBe('pending');
  });

  it('exposes source field as "manual" for financial_transaction rows', async () => {
    const item = makeItem({
      source: 'manual',
      status: null,
      concept: 'Honorarios',
      reference: null,
    });
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [item], total: 1, page: 1, limit: 20 });

    const result = await useCase.execute({ doctorId: 'doc-1', page: 1, limit: 20 });

    expect(result.items[0]?.source).toBe('manual');
    expect(result.items[0]?.concept).toBe('Honorarios');
    expect(result.items[0]?.status).toBeNull();
  });

  it('forwards patient_name from repository (decrypted by repo layer)', async () => {
    const item = makeItem({ patient_name: 'Juan Pérez' });
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [item], total: 1, page: 1, limit: 20 });

    const result = await useCase.execute({ doctorId: 'doc-1', page: 1, limit: 20 });

    expect(result.items[0]?.patient_name).toBe('Juan Pérez');
  });

  it('forwards patient_name as null when patient is not linked', async () => {
    const item = makeItem({ patient_id: null, patient_name: null });
    mockRepo.listIncomePaginated.mockResolvedValue({ items: [item], total: 1, page: 1, limit: 20 });

    const result = await useCase.execute({ doctorId: 'doc-1', page: 1, limit: 20 });

    expect(result.items[0]?.patient_name).toBeNull();
  });
});
