import { ApprovePaymentUseCase } from './approve-payment.use-case';
import type { IConsultationRepository } from '../../../domain/repositories/consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import { PaymentAlreadyApprovedError } from '../../../domain/errors/payment-already-approved.error';

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

describe('ApprovePaymentUseCase', () => {
  let useCase: ApprovePaymentUseCase;
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
    };
    useCase = new ApprovePaymentUseCase(mockRepo);
  });

  it('transitions pending → approved', async () => {
    const pendingConsultation = makeConsultation({ paymentStatus: 'pending' });
    const approvedConsultation = makeConsultation({
      paymentStatus: 'approved',
      amount: 50,
      paymentMethod: 'zelle',
      paymentDate: now,
    });
    mockRepo.findById.mockResolvedValue(pendingConsultation);
    mockRepo.updatePayment.mockResolvedValue(approvedConsultation);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      amount: 50,
      paymentMethod: 'zelle',
    });

    expect(result.paymentStatus).toBe('approved');
    expect(mockRepo.updatePayment).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      expect.objectContaining({
        paymentStatus: 'approved',
        paymentMethod: 'zelle',
        amount: 50,
      }),
    );
  });

  it('throws PaymentAlreadyApprovedError when already approved', async () => {
    const approvedConsultation = makeConsultation({ paymentStatus: 'approved' });
    mockRepo.findById.mockResolvedValue(approvedConsultation);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        amount: 50,
        paymentMethod: 'zelle',
      }),
    ).rejects.toThrow(PaymentAlreadyApprovedError);

    expect(mockRepo.updatePayment).not.toHaveBeenCalled();
  });

  it('records payment method and date', async () => {
    const pendingConsultation = makeConsultation({ paymentStatus: 'pending' });
    const paymentDate = new Date('2026-06-15T10:00:00Z');
    const approvedConsultation = makeConsultation({
      paymentStatus: 'approved',
      amount: 100,
      paymentMethod: 'pago_movil',
      paymentDate,
    });
    mockRepo.findById.mockResolvedValue(pendingConsultation);
    mockRepo.updatePayment.mockResolvedValue(approvedConsultation);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      amount: 100,
      paymentMethod: 'pago_movil',
      paymentDate,
    });

    expect(result.paymentMethod).toBe('pago_movil');
    expect(result.paymentDate).toEqual(paymentDate);
    expect(result.amount).toBe(100);
  });

  it('throws ConsultationNotFoundError when consultation does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        amount: 50,
        paymentMethod: 'zelle',
      }),
    ).rejects.toThrow(ConsultationNotFoundError);
  });

  it('throws ConsultationNotOwnedError when doctor does not own the consultation', async () => {
    const consultation = makeConsultation({ doctorId: DOCTOR_ID });
    mockRepo.findById.mockResolvedValue(consultation);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: OTHER_DOCTOR_ID,
        amount: 50,
        paymentMethod: 'zelle',
      }),
    ).rejects.toThrow(ConsultationNotOwnedError);
  });
});
