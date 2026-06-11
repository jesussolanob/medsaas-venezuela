import { GetAppointment360UseCase, type Appointment360Input } from './get-appointment-360.use-case';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { Consultation } from '../../../../consultations/domain/entities/consultation.entity';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import { DoctorProfile } from '../../../../doctor-settings/domain/entities/doctor-profile.entity';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';
import type { IPaymentRepository } from '../../../../finances/domain/repositories/payment.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import type { IDoctorProfileRepository } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';

const DOCTOR_ID = 'doctor-uuid-1';
const OTHER_DOCTOR = 'other-doctor-uuid';
const APPT_ID = 'appt-uuid-1';
const PATIENT_ID = 'patient-uuid-1';
const PAYMENT_ID = 'payment-uuid-1';
const CONSULT_ID = 'consult-uuid-1';
const NOW = new Date('2026-06-05T10:00:00Z');

function makeAppointment(overrides: Record<string, unknown> = {}): Appointment {
  return Appointment.create({
    id: APPT_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    authUserId: null,
    consultationId: CONSULT_ID,
    patientName: 'Ana García',
    patientPhone: '+58412000000',
    patientEmail: 'ana@test.com',
    patientCedula: 'V-11111111',
    scheduledAt: NOW,
    status: 'completed',
    appointmentMode: 'presencial',
    source: null,
    planName: 'Consulta',
    planPrice: 30,
    paymentMethod: null,
    paymentReference: null,
    paymentReceiptUrl: null,
    insuranceName: null,
    bcvRate: null,
    amountBs: null,
    packageId: null,
    sessionNumber: null,
    chiefComplaint: null,
    appointmentCode: 'APT-001',
    paymentId: PAYMENT_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function makeConsultation(): Consultation {
  return Consultation.create({
    id: CONSULT_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    appointmentId: APPT_ID,
    consultationCode: 'DLT-202606-001',
    consultationDate: NOW,
    chiefComplaint: 'Dolor de cabeza',
    diagnosis: 'Cefalea tensional',
    treatment: 'Reposo',
    notes: null,
    paymentStatus: 'approved',
    paymentMethod: 'efectivo',
    amount: 30,
    paymentDate: NOW,
    blocksSnapshot: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function makePatient(): Patient {
  return Patient.create({
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'Ana García López',
    cedula: 'V-11111111',
    phone: '+58412000000',
    email: 'ana@test.com',
    source: 'manual',
    birthDate: '1990-03-15',
    age: 35,
    sex: 'female',
    bloodType: 'A+',
    allergies: null,
    chronicConditions: null,
    address: null,
    city: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function makeDoctorProfile(): DoctorProfile {
  return DoctorProfile.create({
    id: DOCTOR_ID,
    fullName: 'Dr. Juan Médico',
    email: 'doctor@test.com',
    specialty: 'Medicina General',
    professionalTitle: 'Dr.',
    clinicId: null,
    clinicRole: null,
    paymentMethods: [],
    paymentDetails: {},
    allowsOnline: false,
    officeAddress: 'Calle 1',
    city: 'Caracas',
    avatarUrl: null,
    plan: 'trial',
    subscriptionStatus: 'active',
    logoUrl: null,
    signatureUrl: null,
    licenseNumber: null,
    phone: null,
    currencyMode: null,
    customRate: null,
    customRateLabel: null,
  });
}

describe('GetAppointment360UseCase', () => {
  let useCase: GetAppointment360UseCase;
  let mockApptRepo: jest.Mocked<IAppointmentRepository>;
  let mockConsultRepo: jest.Mocked<IConsultationRepository>;
  let mockPaymentRepo: jest.Mocked<IPaymentRepository>;
  let mockPatientRepo: jest.Mocked<IPatientRepository>;
  let mockProfileRepo: jest.Mocked<IDoctorProfileRepository>;

  beforeEach(() => {
    mockApptRepo = {
      findById: jest.fn(),
      findByIdForDoctor: jest.fn(),
      list: jest.fn(),
      save: jest.fn(),
      updateStatus: jest.fn(),
      hasSlotConflict: jest.fn(),
      hasDuplicate: jest.fn(),
      findPackageById: jest.fn(),
      incrementPackageSessions: jest.fn(),
      logStatusChange: jest.fn(),
      findActiveByDoctorAndDateRange: jest.fn(),
      updateScheduledAt: jest.fn(),
      findRescheduleChain: jest.fn(),
      findChangeLogs: jest.fn(),
      updateMeetLink: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IAppointmentRepository>;

    mockConsultRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      countByDoctorAndMonth: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      updatePayment: jest.fn(),
      list: jest.fn(),
      findByPatient: jest.fn(),
      findByAppointmentId: jest.fn(),
    } as unknown as jest.Mocked<IConsultationRepository>;

    mockPaymentRepo = {
      findByIdForDoctor: jest.fn(),
      listForDoctor: jest.fn(),
      totalsForDoctor: jest.fn(),
      updateStatus: jest.fn(),
      addItem: jest.fn(),
      removeItem: jest.fn(),
      listItems: jest.fn(),
      attachReceiptUrl: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<IPaymentRepository>;

    mockPatientRepo = {
      findById: jest.fn(),
      findByCedulaHash: jest.fn(),
      findByEmailHash: jest.fn(),
      list: jest.fn(),
      findAllByDoctor: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      logReveal: jest.fn(),
    } as unknown as jest.Mocked<IPatientRepository>;

    mockProfileRepo = {
      findByDoctorId: jest.fn(),
      update: jest.fn(),
      updateExchangeRate: jest.fn(),
    } as unknown as jest.Mocked<IDoctorProfileRepository>;

    useCase = new GetAppointment360UseCase(
      mockApptRepo,
      mockConsultRepo,
      mockPaymentRepo,
      mockPatientRepo,
      mockProfileRepo,
    );
  });

  const baseInput: Appointment360Input = { appointmentId: APPT_ID, doctorId: DOCTOR_ID };

  describe('happy path', () => {
    it('returns full 360 aggregate when all data is present', async () => {
      const appt = makeAppointment();
      const consultation = makeConsultation();
      const patient = makePatient();
      const profile = makeDoctorProfile();
      const paymentItem = {
        id: 'item-1',
        paymentId: PAYMENT_ID,
        doctorId: DOCTOR_ID,
        name: 'Consulta',
        amountUsd: 30,
        sourceType: null,
        sourceId: null,
        createdAt: NOW,
        updatedAt: NOW,
      };

      mockApptRepo.findByIdForDoctor.mockResolvedValue(appt);
      mockConsultRepo.findByAppointmentId.mockResolvedValue(consultation);
      mockPaymentRepo.findByIdForDoctor.mockResolvedValue({
        id: PAYMENT_ID,
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        amountUsd: 30,
        amountBs: null,
        bcvRate: null,
        currency: 'USD',
        methodSnapshot: null,
        paymentReference: null,
        paymentReceiptUrl: null,
        paymentCode: null,
        status: 'approved',
        paidAt: NOW,
        packageId: null,
        createdAt: NOW,
        updatedAt: NOW,
      } as never);
      mockPaymentRepo.listItems.mockResolvedValue([paymentItem as never]);
      mockPatientRepo.findById.mockResolvedValue(patient);
      mockProfileRepo.findByDoctorId.mockResolvedValue(profile);
      mockApptRepo.findChangeLogs.mockResolvedValue([]);
      mockApptRepo.findRescheduleChain.mockResolvedValue([]);

      const result = await useCase.execute(baseInput);

      expect(result.appointment).toBe(appt);
      expect(result.consultation).toBe(consultation);
      expect(result.payment).toBeDefined();
      expect(result.paymentItems).toHaveLength(1);
      expect(result.patient).toMatchObject({
        id: PATIENT_ID,
        fullName: 'Ana García López',
        phone: '+58412000000',
        email: 'ana@test.com',
        cedula: 'V-11111111',
      });
      expect(result.doctor).toMatchObject({
        id: DOCTOR_ID,
        fullName: 'Dr. Juan Médico',
        specialty: 'Medicina General',
      });
      expect(result.changeLog).toEqual([]);
      expect(result.rescheduleChain).toEqual([]);
    });

    it('returns nulls and empty arrays when secondary data is absent', async () => {
      const appt = makeAppointment({ patientId: null, paymentId: null, consultationId: null });
      mockApptRepo.findByIdForDoctor.mockResolvedValue(appt);
      mockConsultRepo.findByAppointmentId.mockResolvedValue(null);
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeDoctorProfile());
      mockApptRepo.findChangeLogs.mockResolvedValue([]);

      const result = await useCase.execute(baseInput);

      expect(result.consultation).toBeNull();
      expect(result.payment).toBeNull();
      expect(result.paymentItems).toEqual([]);
      expect(result.patient).toBeNull();
      expect(result.rescheduleChain).toEqual([]);
    });

    it('returns reschedule chain when consultation links multiple appointments', async () => {
      const appt = makeAppointment();
      const consultation = makeConsultation();
      const chainAppt = makeAppointment({
        id: 'appt-uuid-prev',
        scheduledAt: new Date('2026-05-01'),
      });

      mockApptRepo.findByIdForDoctor.mockResolvedValue(appt);
      mockConsultRepo.findByAppointmentId.mockResolvedValue(consultation);
      mockPaymentRepo.findByIdForDoctor.mockResolvedValue({ id: PAYMENT_ID } as never);
      mockPaymentRepo.listItems.mockResolvedValue([]);
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeDoctorProfile());
      mockApptRepo.findChangeLogs.mockResolvedValue([]);
      mockApptRepo.findRescheduleChain.mockResolvedValue([chainAppt]);

      const result = await useCase.execute(baseInput);

      expect(result.rescheduleChain).toHaveLength(1);
      expect(result.rescheduleChain[0]?.id).toBe('appt-uuid-prev');
      expect(mockApptRepo.findRescheduleChain).toHaveBeenCalledWith(CONSULT_ID, APPT_ID, DOCTOR_ID);
    });

    it('returns change log entries', async () => {
      const appt = makeAppointment({ patientId: null, paymentId: null });
      const changeLog = [
        {
          id: 'log-1',
          appointmentId: APPT_ID,
          actorId: DOCTOR_ID,
          oldStatus: 'scheduled',
          newStatus: 'confirmed',
          createdAt: NOW,
        },
      ];

      mockApptRepo.findByIdForDoctor.mockResolvedValue(appt);
      mockConsultRepo.findByAppointmentId.mockResolvedValue(null);
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeDoctorProfile());
      mockApptRepo.findChangeLogs.mockResolvedValue(changeLog);

      const result = await useCase.execute(baseInput);

      expect(result.changeLog).toHaveLength(1);
      expect(result.changeLog[0]?.newStatus).toBe('confirmed');
    });
  });

  describe('error cases', () => {
    it('throws AppointmentNotFoundError when appointment does not exist', async () => {
      mockApptRepo.findByIdForDoctor.mockResolvedValue(null);

      await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(AppointmentNotFoundError);
    });

    it('throws UnauthorizedError when appointment belongs to another doctor', async () => {
      // findByIdForDoctor returns null for cross-doctor access in the real repo,
      // but if a stale entity somehow reaches the guard, UnauthorizedError is thrown.
      const foreignAppt = makeAppointment({ doctorId: OTHER_DOCTOR });
      mockApptRepo.findByIdForDoctor.mockResolvedValue(foreignAppt);

      await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('skips payment lookup when appointment has no paymentId', async () => {
      const appt = makeAppointment({ paymentId: null, patientId: null });
      mockApptRepo.findByIdForDoctor.mockResolvedValue(appt);
      mockConsultRepo.findByAppointmentId.mockResolvedValue(null);
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeDoctorProfile());
      mockApptRepo.findChangeLogs.mockResolvedValue([]);

      await useCase.execute(baseInput);

      expect(mockPaymentRepo.findByIdForDoctor).not.toHaveBeenCalled();
    });

    it('skips patient lookup when appointment has no patientId', async () => {
      const appt = makeAppointment({ patientId: null, paymentId: null });
      mockApptRepo.findByIdForDoctor.mockResolvedValue(appt);
      mockConsultRepo.findByAppointmentId.mockResolvedValue(null);
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeDoctorProfile());
      mockApptRepo.findChangeLogs.mockResolvedValue([]);

      await useCase.execute(baseInput);

      expect(mockPatientRepo.findById).not.toHaveBeenCalled();
    });

    it('does not expose doctor payment_details in the doctor view', async () => {
      const appt = makeAppointment({ patientId: null, paymentId: null });
      mockApptRepo.findByIdForDoctor.mockResolvedValue(appt);
      mockConsultRepo.findByAppointmentId.mockResolvedValue(null);
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeDoctorProfile());
      mockApptRepo.findChangeLogs.mockResolvedValue([]);

      const result = await useCase.execute(baseInput);

      // DoctorView must not contain payment_details (sensitive field)
      expect(result.doctor).not.toHaveProperty('paymentDetails');
      expect(result.doctor).not.toHaveProperty('paymentMethods');
    });
  });
});
