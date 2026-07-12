import { Test, type TestingModule } from '@nestjs/testing';
import { ConsultationsController } from './consultations.controller';
import { CreateConsultationUseCase } from '../../application/use-cases/consultations/create-consultation.use-case';
import { UpdateConsultationUseCase } from '../../application/use-cases/consultations/update-consultation.use-case';
import { ApprovePaymentUseCase } from '../../application/use-cases/consultations/approve-payment.use-case';
import { UpdatePaymentDetailsUseCase } from '../../application/use-cases/consultations/update-payment-details.use-case';
import { GetConsultationByIdUseCase } from '../../application/use-cases/consultations/get-consultation-by-id.use-case';
import { GetPatientConsultationHistoryUseCase } from '../../application/use-cases/consultations/get-patient-consultation-history.use-case';
import { ListConsultationsUseCase } from '../../application/use-cases/consultations/list-consultations.use-case';
import { ListConsultationsWithPatientUseCase } from '../../application/use-cases/consultations/list-consultations-with-patient.use-case';
import { Consultation } from '../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../domain/errors/consultation-not-found.error';
import { PaymentAlreadyApprovedError } from '../../domain/errors/payment-already-approved.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makeConsultation(
  overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {},
): Consultation {
  return Consultation.create({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202606-0001',
    consultationDate: now,
    chiefComplaint: 'Headache',
    diagnosis: 'Migraine',
    treatment: 'Rest',
    paymentStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('ConsultationsController', () => {
  let controller: ConsultationsController;

  const mockCreate = { execute: jest.fn() };
  const mockUpdate = { execute: jest.fn() };
  const mockApprove = { execute: jest.fn() };
  const mockUpdatePaymentDetails = { execute: jest.fn() };
  const mockGetById = { execute: jest.fn() };
  const mockGetHistory = { execute: jest.fn() };
  const mockList = { execute: jest.fn() };
  const mockListWithPatient = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsultationsController],
      providers: [
        { provide: CreateConsultationUseCase, useValue: mockCreate },
        { provide: UpdateConsultationUseCase, useValue: mockUpdate },
        { provide: ApprovePaymentUseCase, useValue: mockApprove },
        { provide: UpdatePaymentDetailsUseCase, useValue: mockUpdatePaymentDetails },
        { provide: GetConsultationByIdUseCase, useValue: mockGetById },
        { provide: GetPatientConsultationHistoryUseCase, useValue: mockGetHistory },
        { provide: ListConsultationsUseCase, useValue: mockList },
        { provide: ListConsultationsWithPatientUseCase, useValue: mockListWithPatient },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<ConsultationsController>(ConsultationsController);
  });

  describe('listWithPatient', () => {
    it('returns the doctor consultations enriched with patient data', async () => {
      const items = [
        {
          id: CONSULTATION_ID,
          consultation_code: 'DLT-202606-0001',
          consultation_date: now.toISOString(),
          patient_id: PATIENT_ID,
          patient_name: 'Juan Pérez',
          patient_phone: '04141234567',
          patient_email: 'juan@example.com',
        },
      ];
      mockListWithPatient.execute.mockResolvedValue(items);

      const result = await controller.listWithPatient(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(items);
    });

    it('passes doctorId from the authenticated user and a bounded limit', async () => {
      mockListWithPatient.execute.mockResolvedValue([]);

      await controller.listWithPatient(mockUser, '999');

      expect(mockListWithPatient.execute).toHaveBeenCalledWith({ doctorId: DOCTOR_ID, limit: 200 });
    });
  });

  describe('list', () => {
    it('returns paginated consultations', async () => {
      const consultation = makeConsultation();
      mockList.execute.mockResolvedValue({
        items: [consultation],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
    });

    it('passes doctorId from authenticated user', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.list(mockUser);

      expect(mockList.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });

    it('throws BadRequestException for a malformed date_from', async () => {
      await expect(controller.list(mockUser, 'not-a-date', undefined)).rejects.toThrow('date_from');
    });

    it('throws BadRequestException for a malformed date_to', async () => {
      await expect(controller.list(mockUser, undefined, 'not-a-date')).rejects.toThrow('date_to');
    });

    it('accepts valid ISO date strings', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await expect(
        controller.list(mockUser, '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z'),
      ).resolves.not.toThrow();
    });

    it('passes sort=created_at to the use case when provided', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.list(mockUser, undefined, undefined, undefined, '1', '20', 'created_at');

      expect(mockList.execute).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'created_at' }),
      );
    });

    it('passes sort=consultation_status to the use case when provided', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.list(
        mockUser,
        undefined,
        undefined,
        undefined,
        '1',
        '20',
        'consultation_status',
      );

      expect(mockList.execute).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'consultation_status' }),
      );
    });

    it('passes sort=confirmation_status to the use case when provided', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.list(
        mockUser,
        undefined,
        undefined,
        undefined,
        '1',
        '20',
        'confirmation_status',
      );

      expect(mockList.execute).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'confirmation_status' }),
      );
    });

    it('passes sort=undefined when an unknown sort value is received', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.list(
        mockUser,
        undefined,
        undefined,
        undefined,
        '1',
        '20',
        'invalid_sort_key',
      );

      expect(mockList.execute).toHaveBeenCalledWith(expect.objectContaining({ sort: undefined }));
    });

    it('passes sort=undefined when sort is absent', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.list(mockUser);

      expect(mockList.execute).toHaveBeenCalledWith(expect.objectContaining({ sort: undefined }));
    });
  });

  describe('findOne', () => {
    it('returns a consultation by ID', async () => {
      const consultation = makeConsultation();
      mockGetById.execute.mockResolvedValue(consultation);

      const result = await controller.findOne(CONSULTATION_ID, mockUser);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).id).toBe(CONSULTATION_ID);
      expect((result.data as Record<string, unknown>).chief_complaint).toBe('Headache');
    });

    it('propagates ConsultationNotFoundError', async () => {
      mockGetById.execute.mockRejectedValue(new ConsultationNotFoundError());

      await expect(controller.findOne(CONSULTATION_ID, mockUser)).rejects.toThrow(
        ConsultationNotFoundError,
      );
    });
  });

  describe('create', () => {
    it('creates a consultation and returns it', async () => {
      const consultation = makeConsultation();
      mockCreate.execute.mockResolvedValue(consultation);

      const dto = {
        patient_id: PATIENT_ID,
        consultation_date: now.toISOString(),
      };

      const result = await controller.create(dto, mockUser);

      expect(result.success).toBe(true);
      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, patientId: PATIENT_ID }),
      );
    });

    it('uses authenticated user doctorId — not any body field', async () => {
      const consultation = makeConsultation();
      mockCreate.execute.mockResolvedValue(consultation);

      const dto = {
        patient_id: PATIENT_ID,
        consultation_date: now.toISOString(),
      };

      await controller.create(dto, mockUser);

      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });
  });

  describe('update', () => {
    it('updates clinical fields', async () => {
      const consultation = makeConsultation({ diagnosis: 'Updated diagnosis' });
      mockUpdate.execute.mockResolvedValue(consultation);

      const result = await controller.update(
        CONSULTATION_ID,
        { diagnosis: 'Updated diagnosis' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(mockUpdate.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          consultationId: CONSULTATION_ID,
          doctorId: DOCTOR_ID,
          diagnosis: 'Updated diagnosis',
        }),
      );
    });
  });

  describe('approvePaymentEndpoint', () => {
    it('approves payment successfully', async () => {
      const consultation = makeConsultation({
        paymentStatus: 'approved',
        amount: 50,
        paymentMethod: 'zelle',
      });
      mockApprove.execute.mockResolvedValue(consultation);

      const result = await controller.approvePaymentEndpoint(
        CONSULTATION_ID,
        { amount: 50, payment_method: 'zelle' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).payment_status).toBe('approved');
    });

    it('propagates PaymentAlreadyApprovedError', async () => {
      mockApprove.execute.mockRejectedValue(new PaymentAlreadyApprovedError());

      await expect(
        controller.approvePaymentEndpoint(
          CONSULTATION_ID,
          { amount: 50, payment_method: 'zelle' },
          mockUser,
        ),
      ).rejects.toThrow(PaymentAlreadyApprovedError);
    });
  });

  describe('getPatientHistory', () => {
    it('returns consultation history for a patient', async () => {
      const consultation = makeConsultation();
      mockGetHistory.execute.mockResolvedValue({
        items: [consultation],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.getPatientHistory(PATIENT_ID, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockGetHistory.execute).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: PATIENT_ID, doctorId: DOCTOR_ID }),
      );
    });
  });

  describe('updatePaymentDetailsEndpoint', () => {
    it('updates payment details and returns serialized consultation', async () => {
      const consultation = makeConsultation({
        paymentStatus: 'approved',
        paymentMethod: 'zelle',
        paymentReference: 'REF-001',
        paymentReceiptUrl: 'https://storage.example.com/receipts/001.pdf',
        amount: 75,
      });
      mockUpdatePaymentDetails.execute.mockResolvedValue(consultation);

      const result = await controller.updatePaymentDetailsEndpoint(
        CONSULTATION_ID,
        {
          payment_status: 'approved',
          payment_method: 'zelle',
          payment_reference: 'REF-001',
          payment_receipt_url: 'https://storage.example.com/receipts/001.pdf',
          amount: 75,
        },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).payment_status).toBe('approved');
      expect((result.data as Record<string, unknown>).payment_reference).toBe('REF-001');
      expect((result.data as Record<string, unknown>).payment_receipt_url).toBe(
        'https://storage.example.com/receipts/001.pdf',
      );
    });

    it('uses doctorId from authenticated user — not from body', async () => {
      const consultation = makeConsultation();
      mockUpdatePaymentDetails.execute.mockResolvedValue(consultation);

      await controller.updatePaymentDetailsEndpoint(
        CONSULTATION_ID,
        { payment_reference: 'REF-002' },
        mockUser,
      );

      expect(mockUpdatePaymentDetails.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, consultationId: CONSULTATION_ID }),
      );
    });

    it('propagates ConsultationNotFoundError', async () => {
      mockUpdatePaymentDetails.execute.mockRejectedValue(new ConsultationNotFoundError());

      await expect(
        controller.updatePaymentDetailsEndpoint(
          CONSULTATION_ID,
          { payment_reference: 'REF-003' },
          mockUser,
        ),
      ).rejects.toThrow(ConsultationNotFoundError);
    });

    it('is editable even when payment is already approved', async () => {
      const approvedConsultation = makeConsultation({
        paymentStatus: 'approved',
        paymentReference: 'REF-UPDATED',
      });
      mockUpdatePaymentDetails.execute.mockResolvedValue(approvedConsultation);

      const result = await controller.updatePaymentDetailsEndpoint(
        CONSULTATION_ID,
        { payment_reference: 'REF-UPDATED' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).payment_reference).toBe('REF-UPDATED');
    });
  });
});
