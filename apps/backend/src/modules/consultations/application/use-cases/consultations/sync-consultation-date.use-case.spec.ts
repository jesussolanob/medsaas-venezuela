import { SyncConsultationDateUseCase } from './sync-consultation-date.use-case';
import type { IConsultationRepository } from '../../../domain/repositories/consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const APPOINTMENT_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

const originalDate = new Date('2026-08-17T18:00:00Z'); // 14:00 Caracas
const newDate = new Date('2026-08-17T20:00:00Z'); // 16:00 Caracas

function makeConsultation(): Consultation {
  return Consultation.create({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202608-0007',
    consultationDate: originalDate,
    paymentStatus: 'pending',
    createdAt: originalDate,
    updatedAt: originalDate,
  });
}

describe('SyncConsultationDateUseCase', () => {
  let useCase: SyncConsultationDateUseCase;
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
    useCase = new SyncConsultationDateUseCase(mockRepo);
  });

  it('mueve consultation_date a la fecha nueva de la cita', async () => {
    mockRepo.findByAppointmentId.mockResolvedValue(makeConsultation());

    await useCase.execute({
      appointmentId: APPOINTMENT_ID,
      doctorId: DOCTOR_ID,
      newScheduledAt: newDate,
    });

    expect(mockRepo.findByAppointmentId).toHaveBeenCalledWith(APPOINTMENT_ID, DOCTOR_ID);
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      consultationDate: newDate,
    });
  });

  it('no hace nada cuando la cita no tiene consulta asociada', async () => {
    mockRepo.findByAppointmentId.mockResolvedValue(null);

    await useCase.execute({
      appointmentId: APPOINTMENT_ID,
      doctorId: DOCTOR_ID,
      newScheduledAt: newDate,
    });

    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('acota la búsqueda y el update al doctor autenticado (anti-IDOR)', async () => {
    mockRepo.findByAppointmentId.mockResolvedValue(makeConsultation());

    await useCase.execute({
      appointmentId: APPOINTMENT_ID,
      doctorId: DOCTOR_ID,
      newScheduledAt: newDate,
    });

    expect(mockRepo.findByAppointmentId).toHaveBeenCalledWith(APPOINTMENT_ID, DOCTOR_ID);
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, expect.anything());
  });
});
