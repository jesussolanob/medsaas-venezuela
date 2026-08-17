import { UpdatePaymentDetailsUseCase } from './update-payment-details.use-case';
import type { IConsultationRepository } from '../../../domain/repositories/consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'eeeeeeee-0000-0000-0000-000000000002';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeConsultation(
  overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {},
): Consultation {
  return Consultation.create({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202606-0001',
    consultationDate: now,
    paymentStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('UpdatePaymentDetailsUseCase', () => {
  let useCase: UpdatePaymentDetailsUseCase;
  let mockRepo: jest.Mocked<IConsultationRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      countByDoctorAndMonth: jest.fn(),
      getMaxSequenceForMonth: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      updatePayment: jest.fn(),
      updatePaymentDetails: jest.fn(),
      approveWithExtras: jest.fn(),
      findExtraItems: jest.fn(),
      list: jest.fn(),
      findByPatient: jest.fn(),
      findByAppointmentId: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
      listWithAppointment: jest.fn(),
      applyNoShowFee: jest.fn(),
    };
    useCase = new UpdatePaymentDetailsUseCase(mockRepo);
  });

  it('updates only the provided fields — leaves others unchanged', async () => {
    const existing = makeConsultation({
      paymentMethod: 'zelle',
      paymentReference: 'OLD-REF',
      paymentReceiptUrl: 'https://example.com/old.pdf',
      amount: 50,
    });
    const updated = makeConsultation({ paymentReference: 'NEW-REF' });
    mockRepo.findById.mockResolvedValue(existing);
    mockRepo.updatePaymentDetails.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      paymentReference: 'NEW-REF',
      // paymentMethod, paymentReceiptUrl, amount not provided → should not be in patch
    });

    expect(result.paymentReference).toBe('NEW-REF');
    expect(mockRepo.updatePaymentDetails).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      expect.objectContaining({ paymentReference: 'NEW-REF' }),
    );
    // paymentMethod was not in input — should be passed as undefined
    const patch = mockRepo.updatePaymentDetails.mock.calls[0]?.[2];
    expect(patch?.paymentMethod).toBeUndefined();
    expect(patch?.paymentReceiptUrl).toBeUndefined();
    expect(patch?.amount).toBeUndefined();
  });

  it('passes null values through to clear a field', async () => {
    const existing = makeConsultation({
      paymentReference: 'REF-001',
      paymentReceiptUrl: 'https://example.com/receipt.pdf',
    });
    const updated = makeConsultation({ paymentReference: null, paymentReceiptUrl: null });
    mockRepo.findById.mockResolvedValue(existing);
    mockRepo.updatePaymentDetails.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      paymentReference: null,
      paymentReceiptUrl: null,
    });

    expect(result.paymentReference).toBeNull();
    expect(result.paymentReceiptUrl).toBeNull();

    const patch = mockRepo.updatePaymentDetails.mock.calls[0]?.[2];
    expect(patch?.paymentReference).toBeNull();
    expect(patch?.paymentReceiptUrl).toBeNull();
  });

  it('is editable even when payment status is already approved', async () => {
    // This is the key difference from ApprovePaymentUseCase — no PaymentAlreadyApprovedError.
    const approvedConsultation = makeConsultation({ paymentStatus: 'approved' });
    const updated = makeConsultation({
      paymentStatus: 'approved',
      paymentReference: 'LATE-REF',
    });
    mockRepo.findById.mockResolvedValue(approvedConsultation);
    mockRepo.updatePaymentDetails.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      paymentReference: 'LATE-REF',
    });

    expect(result.paymentStatus).toBe('approved');
    expect(result.paymentReference).toBe('LATE-REF');
    expect(mockRepo.updatePaymentDetails).toHaveBeenCalledTimes(1);
  });

  it('sets paymentStatus when provided', async () => {
    const pending = makeConsultation({ paymentStatus: 'pending' });
    const approved = makeConsultation({ paymentStatus: 'approved' });
    mockRepo.findById.mockResolvedValue(pending);
    mockRepo.updatePaymentDetails.mockResolvedValue(approved);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      paymentStatus: 'approved',
    });

    expect(result.paymentStatus).toBe('approved');
    const patch = mockRepo.updatePaymentDetails.mock.calls[0]?.[2];
    expect(patch?.paymentStatus).toBe('approved');
  });

  it('throws ConsultationNotFoundError when consultation does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        paymentReference: 'REF-X',
      }),
    ).rejects.toThrow(ConsultationNotFoundError);

    expect(mockRepo.updatePaymentDetails).not.toHaveBeenCalled();
  });

  it('throws ConsultationNotOwnedError when doctor does not own the consultation (defense-in-depth)', async () => {
    // The repo findById is scoped to doctorId, but simulate the defense-in-depth guard:
    // entity is found with DOCTOR_ID but execute is called with OTHER_DOCTOR_ID.
    const consultation = makeConsultation({ doctorId: DOCTOR_ID });
    mockRepo.findById.mockResolvedValue(consultation);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: OTHER_DOCTOR_ID,
        paymentReference: 'REF-X',
      }),
    ).rejects.toThrow(ConsultationNotOwnedError);

    expect(mockRepo.updatePaymentDetails).not.toHaveBeenCalled();
  });
});
