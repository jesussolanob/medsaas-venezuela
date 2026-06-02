import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PatientController } from './patient.controller';
import { GetPatientDashboardUseCase } from '../../application/use-cases/patient-portal/get-patient-dashboard.use-case';
import { GetPatientAppointmentsUseCase } from '../../application/use-cases/patient-portal/get-patient-appointments.use-case';
import { GetPatientPackagesUseCase } from '../../application/use-cases/patient-portal/get-patient-packages.use-case';
import { GetPatientPrescriptionsUseCase } from '../../application/use-cases/patient-portal/get-patient-prescriptions.use-case';
import { GetPatientMessagesUseCase } from '../../application/use-cases/patient-portal/get-patient-messages.use-case';
import { SendPatientMessageUseCase } from '../../application/use-cases/patient-portal/send-patient-message.use-case';
import { GetPatientProfileUseCase } from '../../application/use-cases/patient-portal/get-patient-profile.use-case';
import { UpdatePatientProfileUseCase } from '../../application/use-cases/patient-portal/update-patient-profile.use-case';
import { PatientDashboard } from '../../domain/entities/patient-dashboard.entity';
import { PatientPortalAccessDeniedError } from '../../domain/errors/patient-portal-access-denied.error';
import { PatientMessageNotAllowedError } from '../../domain/errors/patient-message-not-allowed.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { Patient } from '../../../patients/domain/entities/patient.entity';
import { Prescription } from '../../../prescriptions/domain/entities/prescription.entity';

const PATIENT_AUTH_ID = 'patient-auth-uuid-1';
const mockUser: CurrentUserPayload = {
  sub: PATIENT_AUTH_ID,
  role: 'patient',
  email: 'patient@dev.local',
};

describe('PatientController', () => {
  let controller: PatientController;

  const mockGetDashboard = { execute: jest.fn() };
  const mockGetAppointments = { execute: jest.fn() };
  const mockGetPackages = { execute: jest.fn() };
  const mockGetPrescriptions = { execute: jest.fn() };
  const mockGetMessages = { execute: jest.fn() };
  const mockSendMessage = { execute: jest.fn() };
  const mockGetProfile = { execute: jest.fn() };
  const mockUpdateProfile = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientController],
      providers: [
        { provide: GetPatientDashboardUseCase, useValue: mockGetDashboard },
        { provide: GetPatientAppointmentsUseCase, useValue: mockGetAppointments },
        { provide: GetPatientPackagesUseCase, useValue: mockGetPackages },
        { provide: GetPatientPrescriptionsUseCase, useValue: mockGetPrescriptions },
        { provide: GetPatientMessagesUseCase, useValue: mockGetMessages },
        { provide: SendPatientMessageUseCase, useValue: mockSendMessage },
        { provide: GetPatientProfileUseCase, useValue: mockGetProfile },
        { provide: UpdatePatientProfileUseCase, useValue: mockUpdateProfile },
      ],
    }).compile();

    controller = module.get<PatientController>(PatientController);
  });

  // --------------------------------------------------------------------------
  // GET /api/patient/dashboard
  // --------------------------------------------------------------------------
  describe('GET /api/patient/dashboard', () => {
    it('returns dashboard scoped to authenticated user', async () => {
      const dashboard = new PatientDashboard(null, [], 0);
      mockGetDashboard.execute.mockResolvedValue(dashboard);

      const response = await controller.dashboard(mockUser);

      expect(response.success).toBe(true);
      expect(response.data).toBe(dashboard);
      expect(mockGetDashboard.execute).toHaveBeenCalledWith({ authUserId: PATIENT_AUTH_ID });
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/patient/appointments
  // --------------------------------------------------------------------------
  describe('GET /api/patient/appointments', () => {
    it('returns paginated appointments scoped to authenticated user', async () => {
      const result = { items: [], total: 0, page: 1, limit: 20 };
      mockGetAppointments.execute.mockResolvedValue(result);

      const response = await controller.appointments(mockUser, '1', '20');

      expect(response.success).toBe(true);
      expect(response.meta).toEqual({ total: 0, page: 1, limit: 20 });
      expect(mockGetAppointments.execute).toHaveBeenCalledWith({
        authUserId: PATIENT_AUTH_ID,
        page: 1,
        limit: 20,
      });
    });

    it('caps limit at 100 to prevent unbounded queries', async () => {
      mockGetAppointments.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 100 });

      await controller.appointments(mockUser, '1', '9999');

      expect(mockGetAppointments.execute).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/patient/packages
  // --------------------------------------------------------------------------
  describe('GET /api/patient/packages', () => {
    it('returns packages for authenticated patient', async () => {
      mockGetPackages.execute.mockResolvedValue([]);

      const response = await controller.packages(mockUser);

      expect(response.success).toBe(true);
      expect(mockGetPackages.execute).toHaveBeenCalledWith({
        authUserId: PATIENT_AUTH_ID,
        onlyActive: false,
      });
    });

    it('filters active packages when status=active is provided', async () => {
      mockGetPackages.execute.mockResolvedValue([]);

      await controller.packages(mockUser, 'active');

      expect(mockGetPackages.execute).toHaveBeenCalledWith({
        authUserId: PATIENT_AUTH_ID,
        onlyActive: true,
      });
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/patient/prescriptions
  // --------------------------------------------------------------------------
  describe('GET /api/patient/prescriptions', () => {
    it('returns decrypted prescriptions for authenticated patient', async () => {
      const rx = Prescription.create({
        id: 'rx-1',
        patientId: 'p-1',
        doctorId: 'doc-1',
        consultationId: null,
        medication: 'Ibuprofeno',
        dosage: '400mg',
        frequency: 'cada 8h',
        duration: '5 días',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockGetPrescriptions.execute.mockResolvedValue([rx]);

      const response = await controller.prescriptions(mockUser);

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
      expect(mockGetPrescriptions.execute).toHaveBeenCalledWith({ authUserId: PATIENT_AUTH_ID });
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/patient/messages
  // --------------------------------------------------------------------------
  describe('GET /api/patient/messages', () => {
    it('returns messages for authenticated patient', async () => {
      mockGetMessages.execute.mockResolvedValue([]);

      const response = await controller.messages(mockUser);

      expect(response.success).toBe(true);
      expect(mockGetMessages.execute).toHaveBeenCalledWith({
        authUserId: PATIENT_AUTH_ID,
        doctorId: undefined,
      });
    });

    it('passes doctorId filter when provided (valid UUID)', async () => {
      mockGetMessages.execute.mockResolvedValue([]);
      // Must be a valid RFC 4122 UUID — Zod v4 enforces strict UUID format.
      const validDoctorId = 'b0b57bce-87a4-4969-9e41-f4720f38511b';

      await controller.messages(mockUser, validDoctorId);

      expect(mockGetMessages.execute).toHaveBeenCalledWith({
        authUserId: PATIENT_AUTH_ID,
        doctorId: validDoctorId,
      });
    });

    it('throws BadRequestException when doctor_id query param is not a valid UUID', async () => {
      await expect(controller.messages(mockUser, 'not-a-uuid')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockGetMessages.execute).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/patient/messages
  // --------------------------------------------------------------------------
  describe('POST /api/patient/messages', () => {
    it('sends message using authenticated user as scope', async () => {
      const msgRow = {
        id: 'msg-1',
        patientId: 'p-1',
        doctorId: 'doc-1',
        body: 'Hola',
        direction: 'patient_to_doctor' as const,
        readAt: null,
        createdAt: new Date(),
      };
      mockSendMessage.execute.mockResolvedValue(msgRow);

      const dto = { doctor_id: 'doc-1', body: 'Hola' };
      const response = await controller.sendMsg(dto, mockUser);

      expect(response.success).toBe(true);
      expect(mockSendMessage.execute).toHaveBeenCalledWith({
        authUserId: PATIENT_AUTH_ID,
        doctorId: 'doc-1',
        body: 'Hola',
      });
    });

    it('propagates PatientMessageNotAllowedError', async () => {
      mockSendMessage.execute.mockRejectedValue(new PatientMessageNotAllowedError());

      await expect(
        controller.sendMsg({ doctor_id: 'unrelated-doc', body: 'Hola' }, mockUser),
      ).rejects.toBeInstanceOf(PatientMessageNotAllowedError);
    });
  });

  // --------------------------------------------------------------------------
  // GET /api/patient/profile
  // --------------------------------------------------------------------------
  describe('GET /api/patient/profile', () => {
    it('returns patient profile records for authenticated user', async () => {
      const patient = Patient.create({
        id: 'p-1',
        doctorId: 'doc-1',
        authUserId: PATIENT_AUTH_ID,
        fullName: 'Juan Pérez',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockGetProfile.execute.mockResolvedValue([patient]);

      const response = await controller.profile(mockUser);

      expect(response.success).toBe(true);
      expect(mockGetProfile.execute).toHaveBeenCalledWith({ authUserId: PATIENT_AUTH_ID });
    });
  });

  // --------------------------------------------------------------------------
  // PUT /api/patient/profile
  // --------------------------------------------------------------------------
  describe('PUT /api/patient/profile', () => {
    it('updates profile scoped to authenticated user', async () => {
      const updatedPatient = Patient.create({
        id: 'p-1',
        doctorId: 'doc-1',
        authUserId: PATIENT_AUTH_ID,
        fullName: 'Juan Pérez',
        address: 'Calle Nueva',
        city: 'Valencia',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockUpdateProfile.execute.mockResolvedValue(updatedPatient);

      const dto = { patient_id: 'p-1', address: 'Calle Nueva', city: 'Valencia' };
      const response = await controller.updateProfileEndpoint(dto, mockUser);

      expect(response.success).toBe(true);
      expect(mockUpdateProfile.execute).toHaveBeenCalledWith({
        authUserId: PATIENT_AUTH_ID,
        patientId: 'p-1',
        address: 'Calle Nueva',
        city: 'Valencia',
        notes: null,
      });
    });

    it('throws PatientPortalAccessDeniedError when patient does not belong to user', async () => {
      mockUpdateProfile.execute.mockRejectedValue(new PatientPortalAccessDeniedError());

      await expect(
        controller.updateProfileEndpoint(
          { patient_id: 'victim-id', address: 'hack' },
          { ...mockUser, sub: 'attacker-auth-id' },
        ),
      ).rejects.toBeInstanceOf(PatientPortalAccessDeniedError);
    });
  });
});
