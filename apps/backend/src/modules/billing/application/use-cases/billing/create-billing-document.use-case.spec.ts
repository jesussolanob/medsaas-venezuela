import { CreateBillingDocumentUseCase } from './create-billing-document.use-case';
import { BillingDocument } from '../../../domain/entities/billing-document.entity';
import type { IBillingDocumentRepository } from '../../../domain/repositories/billing-document.repository';

function makeSavedDoc(docNumber: string): BillingDocument {
  return BillingDocument.create({
    id: 'bd-1',
    docNumber,
    docType: 'factura',
    doctorId: 'dr-1',
    consultationId: null,
    paymentId: null,
    patientId: null,
    items: [],
    subtotal: null,
    total: 100,
    ivaAmount: 16,
    igtfAmount: 0,
    bcvRate: null,
    totalBs: null,
    notes: null,
    currency: 'USD',
    status: 'issued',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('CreateBillingDocumentUseCase', () => {
  let mockRepo: jest.Mocked<IBillingDocumentRepository>;
  let useCase: CreateBillingDocumentUseCase;

  beforeEach(() => {
    mockRepo = {
      countByType: jest.fn(),
      listForDoctor: jest.fn(),
      save: jest.fn(),
    };
    useCase = new CreateBillingDocumentUseCase(mockRepo);
  });

  it('generates FACTURA-YYYYMMDD-0001 for the first factura', async () => {
    mockRepo.countByType.mockResolvedValue(0);
    mockRepo.save.mockImplementation(async (params) => makeSavedDoc(params.docNumber));

    await useCase.execute({
      docType: 'factura',
      doctorId: 'dr-1',
      consultationId: null,
      paymentId: null,
      patientId: null,
      items: [],
      subtotal: null,
      total: 100,
      ivaAmount: 0,
      igtfAmount: 0,
      bcvRate: null,
      totalBs: null,
      notes: null,
      currency: 'USD',
    });

    const call = mockRepo.save.mock.calls[0];
    expect(call).toBeDefined();
    const savedWith = call![0]!;
    // docType 'factura' is truncated to 6 chars → 'FACTUR'
    expect(savedWith.docNumber).toMatch(/^FACTUR-\d{8}-0001$/);
  });

  it('generates the correct sequence number for the Nth doc of a type', async () => {
    mockRepo.countByType.mockResolvedValue(9); // next = 10
    mockRepo.save.mockImplementation(async (params) => makeSavedDoc(params.docNumber));

    await useCase.execute({
      docType: 'recibo',
      doctorId: 'dr-1',
      consultationId: null,
      paymentId: null,
      patientId: null,
      items: [],
      subtotal: null,
      total: 50,
      ivaAmount: 0,
      igtfAmount: 0,
      bcvRate: null,
      totalBs: null,
      notes: null,
      currency: 'USD',
    });

    const call = mockRepo.save.mock.calls[0];
    expect(call).toBeDefined();
    const savedWith = call![0]!;
    expect(savedWith.docNumber).toMatch(/^RECIBO-\d{8}-0010$/);
  });

  it('passes status=issued to the repository', async () => {
    mockRepo.countByType.mockResolvedValue(0);
    mockRepo.save.mockImplementation(async (params) => makeSavedDoc(params.docNumber));

    await useCase.execute({
      docType: 'factura',
      doctorId: 'dr-1',
      consultationId: null,
      paymentId: null,
      patientId: null,
      items: [],
      subtotal: null,
      total: 100,
      ivaAmount: 16,
      igtfAmount: 3,
      bcvRate: 36.5,
      totalBs: 4307,
      notes: 'Test',
      currency: 'USD',
    });

    const call = mockRepo.save.mock.calls[0];
    expect(call).toBeDefined();
    const savedWith = call![0]!;
    expect(savedWith.status).toBe('issued');
    expect(savedWith.doctorId).toBe('dr-1');
    expect(savedWith.ivaAmount).toBe(16);
    expect(savedWith.igtfAmount).toBe(3);
    expect(savedWith.bcvRate).toBe(36.5);
    expect(savedWith.notes).toBe('Test');
  });

  it('uses countByType for the specific docType (not global count)', async () => {
    mockRepo.countByType.mockResolvedValue(5);
    mockRepo.save.mockImplementation(async (params) => makeSavedDoc(params.docNumber));

    await useCase.execute({
      docType: 'nota_debito',
      doctorId: 'dr-1',
      consultationId: null,
      paymentId: null,
      patientId: null,
      items: [],
      subtotal: null,
      total: 20,
      ivaAmount: 0,
      igtfAmount: 0,
      bcvRate: null,
      totalBs: null,
      notes: null,
      currency: 'USD',
    });

    expect(mockRepo.countByType).toHaveBeenCalledWith('nota_debito');
  });
});
