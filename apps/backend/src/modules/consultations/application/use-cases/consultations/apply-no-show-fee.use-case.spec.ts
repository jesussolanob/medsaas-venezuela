import { ApplyNoShowFeeUseCase } from './apply-no-show-fee.use-case';
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

describe('ApplyNoShowFeeUseCase', () => {
  let useCase: ApplyNoShowFeeUseCase;
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
    useCase = new ApplyNoShowFeeUseCase(mockRepo);
  });

  it('delegates to repo.applyNoShowFee with correct args when consultation is found and owned', async () => {
    const consultation = makeConsultation({ amount: 30, paymentStatus: 'approved' });
    const updated = makeConsultation({ amount: 80, paymentStatus: 'pending' });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.applyNoShowFee.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      newAmount: 80,
    });

    expect(mockRepo.applyNoShowFee).toHaveBeenCalledTimes(1);
    expect(mockRepo.applyNoShowFee).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, 80);
    expect(result.amount).toBe(80);
    expect(result.paymentStatus).toBe('pending');
  });

  it('works for a direct-create consultation (no appointment_id) — repo handles no-op', async () => {
    // Consultation created manually by the doctor — no appointment_id.
    // The repo's applyNoShowFee skips the payment sync silently.
    const consultation = makeConsultation({
      amount: 25,
      paymentStatus: 'pending',
      appointmentId: undefined,
    });
    const updated = makeConsultation({
      amount: 75,
      paymentStatus: 'pending',
      appointmentId: undefined,
    });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.applyNoShowFee.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      newAmount: 75,
    });

    expect(mockRepo.applyNoShowFee).toHaveBeenCalledTimes(1);
    expect(result.amount).toBe(75);
    // updatePaymentDetails must never be called — this path only uses applyNoShowFee.
    expect(mockRepo.updatePaymentDetails).not.toHaveBeenCalled();
  });

  it('throws ConsultationNotFoundError when consultation does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        newAmount: 60,
      }),
    ).rejects.toThrow(ConsultationNotFoundError);

    expect(mockRepo.applyNoShowFee).not.toHaveBeenCalled();
  });

  it('throws ConsultationNotOwnedError when doctor does not own the consultation', async () => {
    // Repo returns entity belonging to DOCTOR_ID; caller uses OTHER_DOCTOR_ID.
    const consultation = makeConsultation({ doctorId: DOCTOR_ID });
    mockRepo.findById.mockResolvedValue(consultation);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: OTHER_DOCTOR_ID,
        newAmount: 60,
      }),
    ).rejects.toThrow(ConsultationNotOwnedError);

    expect(mockRepo.applyNoShowFee).not.toHaveBeenCalled();
  });
});
