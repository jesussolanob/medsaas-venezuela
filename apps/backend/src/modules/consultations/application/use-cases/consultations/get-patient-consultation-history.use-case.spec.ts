import { GetPatientConsultationHistoryUseCase } from './get-patient-consultation-history.use-case';
import type {
  IConsultationRepository,
  ConsultationListResult,
} from '../../../domain/repositories/consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeConsultation(code: string): Consultation {
  return Consultation.create({
    id: `cccccccc-0000-0000-0000-${code.replace(/-/g, '').slice(-12)}`,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: code,
    consultationDate: now,
    paymentStatus: 'pending',
    chiefComplaint: 'Test complaint',
    createdAt: now,
    updatedAt: now,
  });
}

describe('GetPatientConsultationHistoryUseCase', () => {
  let useCase: GetPatientConsultationHistoryUseCase;
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
    useCase = new GetPatientConsultationHistoryUseCase(mockRepo);
  });

  it('returns consultation history for a patient scoped to the doctor', async () => {
    const consultations = [
      makeConsultation('DLT-202606-0002'),
      makeConsultation('DLT-202606-0001'),
    ];
    const listResult: ConsultationListResult = {
      items: consultations,
      total: 2,
      page: 1,
      limit: 20,
    };
    mockRepo.findByPatient.mockResolvedValue(listResult);

    const result = await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(mockRepo.findByPatient).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID, 1, 20);
  });

  it('returns plaintext clinical data', async () => {
    const consultation = makeConsultation('DLT-202606-0001');
    mockRepo.findByPatient.mockResolvedValue({
      items: [consultation],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 20,
    });

    // chiefComplaint should be plaintext (decrypted by repo before reaching use case)
    const firstItem = result.items[0];
    expect(firstItem?.chiefComplaint).toBe('Test complaint');
  });

  it('paginates results correctly', async () => {
    const listResult: ConsultationListResult = {
      items: [makeConsultation('DLT-202606-0005')],
      total: 10,
      page: 2,
      limit: 5,
    };
    mockRepo.findByPatient.mockResolvedValue(listResult);

    const result = await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      page: 2,
      limit: 5,
    });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.total).toBe(10);
    expect(mockRepo.findByPatient).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID, 2, 5);
  });

  it('returns empty list when patient has no consultations with this doctor', async () => {
    mockRepo.findByPatient.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const result = await useCase.execute({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
