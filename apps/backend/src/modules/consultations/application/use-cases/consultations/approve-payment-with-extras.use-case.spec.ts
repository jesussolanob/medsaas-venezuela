import { ApprovePaymentWithExtrasUseCase } from './approve-payment-with-extras.use-case';
import type { IConsultationRepository } from '../../../domain/repositories/consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import { PaymentMethodRequiredError } from '../../../domain/errors/payment-method-required.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'eeeeeeee-0000-0000-0000-000000000002';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const now = new Date('2026-07-12T00:00:00Z');

function makeConsultation(
  overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {},
): Consultation {
  return Consultation.create({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202607-0001',
    consultationDate: now,
    paymentStatus: 'pending',
    amount: 30,
    baseAmount: null,
    createdAt: now,
    updatedAt: now,
    extraItems: [],
    ...overrides,
  });
}

describe('ApprovePaymentWithExtrasUseCase', () => {
  let useCase: ApprovePaymentWithExtrasUseCase;
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
    };
    useCase = new ApprovePaymentWithExtrasUseCase(mockRepo);
  });

  it('approves with no extras — delegates to approveWithExtras with empty array', async () => {
    const pending = makeConsultation({ paymentStatus: 'pending' });
    const approved = makeConsultation({
      paymentStatus: 'approved',
      amount: 30,
      baseAmount: 30,
      paymentMethod: 'zelle',
    });
    mockRepo.findById.mockResolvedValue(pending);
    mockRepo.approveWithExtras.mockResolvedValue(approved);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [],
      paymentMethod: 'zelle',
    });

    expect(result.paymentStatus).toBe('approved');
    expect(result.amount).toBe(30);
    expect(result.baseAmount).toBe(30);
    expect(mockRepo.approveWithExtras).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      [],
      'zelle',
    );
  });

  it('approves with extras — total = base + extras sum', async () => {
    const pending = makeConsultation({ paymentStatus: 'pending', amount: 30 });
    const approved = makeConsultation({
      paymentStatus: 'approved',
      amount: 50, // 30 + 20
      baseAmount: 30,
      paymentMethod: 'pago_movil',
    });
    mockRepo.findById.mockResolvedValue(pending);
    mockRepo.approveWithExtras.mockResolvedValue(approved);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [{ description: 'Limpieza', amountUsd: 20 }],
      paymentMethod: 'pago_movil',
    });

    expect(result.amount).toBe(50);
    expect(result.baseAmount).toBe(30);
    expect(mockRepo.approveWithExtras).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: 'Limpieza', amountUsd: 20 }],
      'pago_movil',
    );
  });

  it('allows re-approval (editing extras) reusing the already-stored method', async () => {
    // The already-approved consultation has baseAmount + method set from first approval.
    const alreadyApproved = makeConsultation({
      paymentStatus: 'approved',
      amount: 50,
      baseAmount: 30,
      paymentMethod: 'zelle',
    });
    const reApproved = makeConsultation({
      paymentStatus: 'approved',
      amount: 45, // base 30 + new extras 15
      baseAmount: 30,
      paymentMethod: 'zelle',
    });
    mockRepo.findById.mockResolvedValue(alreadyApproved);
    mockRepo.approveWithExtras.mockResolvedValue(reApproved);

    // No paymentMethod passed → falls back to the stored 'zelle'.
    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      extras: [{ description: 'ECG', amountUsd: 15 }],
    });

    expect(result.amount).toBe(45);
    expect(result.baseAmount).toBe(30);
    expect(mockRepo.approveWithExtras).toHaveBeenCalledWith(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: 'ECG', amountUsd: 15 }],
      'zelle',
    );
  });

  it('throws ConsultationNotFoundError when consultation does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        extras: [],
      }),
    ).rejects.toThrow(ConsultationNotFoundError);

    expect(mockRepo.approveWithExtras).not.toHaveBeenCalled();
  });

  it('throws ConsultationNotOwnedError when doctor does not own the consultation', async () => {
    const consultation = makeConsultation({ doctorId: DOCTOR_ID });
    mockRepo.findById.mockResolvedValue(consultation);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: OTHER_DOCTOR_ID,
        extras: [],
      }),
    ).rejects.toThrow(ConsultationNotOwnedError);

    expect(mockRepo.approveWithExtras).not.toHaveBeenCalled();
  });

  it('throws PaymentMethodRequiredError when no method is provided nor stored', async () => {
    const pending = makeConsultation({ paymentStatus: 'pending' }); // no paymentMethod
    mockRepo.findById.mockResolvedValue(pending);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        extras: [],
      }),
    ).rejects.toThrow(PaymentMethodRequiredError);

    expect(mockRepo.approveWithExtras).not.toHaveBeenCalled();
  });

  it('rejects a blank/whitespace payment method', async () => {
    const pending = makeConsultation({ paymentStatus: 'pending' });
    mockRepo.findById.mockResolvedValue(pending);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        extras: [],
        paymentMethod: '   ',
      }),
    ).rejects.toThrow(PaymentMethodRequiredError);

    expect(mockRepo.approveWithExtras).not.toHaveBeenCalled();
  });
});
